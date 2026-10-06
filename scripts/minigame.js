import {ID} from './locks.js';
import {clamp, initialState, step} from './mechanics.js';
import {request} from './service.js';
import {LockAudio} from './audio.js';
import {renderLock} from './view.js';

/** Fixed-step simulation with independent, smooth visual interpolation. */
export class LockGame extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {classes: ['velvet-locksmith'], position: {width: 620, height: 'auto'}, window: {title: 'Velvet Locksmith', resizable: false}};
  constructor(session, {send = request} = {}) {
    super(); this.session = session; this.send = send; this.puzzleState = initialState(session.p);
    this.angle = 0; this.torque = false; this.trace = []; this.keys = new Set();
    this.audio = new LockAudio(); this.abort = new AbortController();
    this.ended = false; this.finished = false; this.submitted = false; this.disposed = false;
    this.started = 0; this.breakUntil = 0; this.displayAngle = 0; this.displayRotation = 0;
    this.statusText = 'Busca el ángulo. Gira con suavidad y suelta si se atasca.';
    this.visualPhase = 'playing'; this.lastFrame = 0;
  }
  async _renderHTML() {return renderLock(this.session, this.statusText);}
  _replaceHTML(result, content) {content.innerHTML = result;}
  _onRender(context, options) {
    super._onRender(context, options);
    this.stopLoops(); this.abort.abort(); this.abort = new AbortController(); this.release();
    const root = this.element, signal = this.abort.signal;
    this.nodes = Object.fromEntries(['angle', 'pick', 'cylinder', 'tension', 'wear', 'lock', 'status', 'time', 'turn', 'angle-value', 'picks-text', 'result', 'result-icon', 'result-title', 'result-subtitle'].map(name => [name, root.querySelector(`.vl-${name}`)]));
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.bindInput(signal); root.dataset.phase = this.visualPhase;
    if (this.ended) this.disableControls();
    if (this.resultText) this.showResult(this.visualPhase, this.resultText.title, this.resultText.subtitle);
    this.updateInstruments(); this.paint(performance.now(), true);
    root.querySelector('.vl-game').focus({preventScroll: true});
    if (!this.started) this.started = performance.now();
    if (!this.ended) this.timer = setInterval(() => this.tick(), 50);
    this.frame = requestAnimationFrame(time => this.animate(time));
  }
  bindInput(signal) {
    const root = this.element, n = this.nodes;
    n.angle.addEventListener('input', e => {if (!this.ended) {this.audio.unlock(); this.angle = Number(e.target.value);}}, {signal});
    n.turn.addEventListener('pointerdown', e => {
      if (this.ended || e.button !== 0) return;
      e.preventDefault(); n.turn.setPointerCapture(e.pointerId); this.audio.unlock(); this.torque = true;
    }, {signal});
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) n.turn.addEventListener(name, () => {this.torque = false;}, {signal});
    n.lock.addEventListener('pointerdown', e => {
      if (this.ended || e.button !== 0) return;
      e.preventDefault(); this.audio.unlock(); n.lock.setPointerCapture(e.pointerId); this.dragging = e.pointerId; this.movePick(e);
    }, {signal});
    n.lock.addEventListener('pointermove', e => {if (this.dragging === e.pointerId) this.movePick(e);}, {signal});
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) n.lock.addEventListener(name, () => {this.dragging = null;}, {signal});
    root.addEventListener('keydown', e => {
      if (this.ended || !['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) return;
      e.preventDefault(); e.stopPropagation(); this.audio.unlock(); this.keys.add(e.code);
    }, {signal});
    root.addEventListener('keyup', e => {
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {e.preventDefault(); e.stopPropagation(); this.keys.delete(e.code);}
    }, {signal});
    root.addEventListener('focusout', e => {if (!root.contains(e.relatedTarget)) this.release();}, {signal});
    window.addEventListener('blur', () => this.release(), {signal});
    document.addEventListener('visibilitychange', () => {if (document.hidden) this.release();}, {signal});
  }
  movePick(event) {
    if (this.ended) return;
    const rect = this.nodes.lock.getBoundingClientRect();
    const x = (event.clientX - rect.left) * 400 / rect.width - 200;
    const y = (event.clientY - rect.top) * 450 / rect.height - 232;
    this.angle = clamp(Math.atan2(x, -y) * 180 / Math.PI, -90, 90);
  }
  release() {this.torque = false; this.keys.clear(); this.dragging = null;}
  tick() {
    if (this.ended || this.disposed) return;
    if (this.started && performance.now() - this.started >= 120000) {this.expire(); return;}
    this.angle = clamp(this.angle + (this.keys.has('ArrowRight') ? 2 : 0) - (this.keys.has('ArrowLeft') ? 2 : 0), -90, 90);
    const torque = performance.now() >= this.breakUntil && (this.torque || this.keys.has('Space'));
    this.trace.push([this.angle, torque]);
    const previous = this.puzzleState;
    this.puzzleState = step(previous, this.angle, torque, this.session.sweet, this.session.p);
    this.straining = torque && this.puzzleState.wear > previous.wear;
    if (this.straining) this.audio.play('tick');
    else if (torque && Math.floor(previous.rotation / 15) !== Math.floor(this.puzzleState.rotation / 15)) this.audio.play('turn');
    if (previous.picks !== this.puzzleState.picks) this.breakPick();
    this.updateInstruments();
    if (this.puzzleState.status !== 'playing') void this.finish();
    else if (this.trace.length >= 2350) this.expire();
  }
  breakPick() {
    this.breakUntil = performance.now() + 650; this.release(); this.audio.play('break');
    this.status(`Ganzúa rota. Quedan ${this.puzzleState.picks}. Suelta y prueba otro ángulo.`);
    if (!this.reducedMotion && this.nodes) this.nodes.pick.querySelector('.vl-pick-fx').animate([
      {opacity: 1, transform: 'translateY(0)'}, {opacity: 0, transform: 'translateY(24px) rotate(8deg)', offset: .4},
      {opacity: 0, transform: 'translateY(-12px)', offset: .6}, {opacity: 1, transform: 'translateY(0)'}
    ], {duration: 650, easing: 'ease-out'});
  }
  animate(time) {
    if (this.disposed) return;
    this.paint(time);
    if (this.ended && Math.abs(this.displayRotation - this.puzzleState.rotation) < .01) {this.frame = null; return;}
    this.frame = requestAnimationFrame(next => this.animate(next));
  }
  paint(time = performance.now(), immediate = false) {
    if (!this.nodes || this.disposed) return;
    const dt = Math.min(64, Math.max(0, time - (this.lastFrame || time))); this.lastFrame = time;
    const blend = immediate || this.reducedMotion ? 1 : 1 - Math.exp(-dt / 55);
    this.displayAngle += (this.angle - this.displayAngle) * blend;
    this.displayRotation += (this.puzzleState.rotation - this.displayRotation) * blend;
    const tremor = this.straining && !this.reducedMotion && !this.ended ? Math.sin(time * .08) * (.4 + this.puzzleState.wear * 1.5) : 0;
    this.nodes.pick.setAttribute('transform', `rotate(${this.displayAngle + tremor} 200 232)`);
    this.nodes.cylinder.setAttribute('transform', `rotate(${this.displayRotation} 200 232)`);
    this.nodes.tension.setAttribute('transform', `rotate(${this.displayRotation + tremor * .4} 200 232)`);
    this.nodes.lock.classList.toggle('vl-strain', Boolean(this.straining && !this.ended));
    this.nodes.turn.classList.toggle('vl-held', !this.ended && (this.torque || this.keys.has('Space')));
    this.nodes.angle.value = this.angle; this.nodes['angle-value'].textContent = `${Math.round(this.angle)}°`;
    if (this.started && !this.ended) {
      const remaining = Math.max(0, Math.ceil((120000 - (time - this.started)) / 1000));
      this.nodes.time.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
      this.nodes.time.classList.toggle('vl-time-low', remaining <= 20);
    }
  }
  updateInstruments() {
    if (!this.nodes) return;
    this.nodes.wear.value = this.puzzleState.status === 'failure' ? 0 : 1 - this.puzzleState.wear;
    this.nodes.wear.classList.toggle('vl-worn', this.puzzleState.wear > .6);
    this.nodes['picks-text'].textContent = `${this.puzzleState.picks}/${this.session.p.picks}`;
    this.element.querySelectorAll('.vl-pick-count').forEach((node, i) => node.classList.toggle('vl-spent', i >= this.puzzleState.picks));
  }
  status(text) {this.statusText = text; if (!this.disposed && this.nodes) this.nodes.status.textContent = text;}
  disableControls() {if (this.nodes) {this.nodes.turn.disabled = true; this.nodes.angle.disabled = true;}}
  showResult(phase, title, subtitle) {
    this.visualPhase = phase; this.resultText = {title, subtitle};
    if (this.disposed || !this.nodes) return;
    this.element.dataset.phase = phase; this.nodes.result.setAttribute('aria-hidden', 'false');
    this.nodes['result-icon'].textContent = phase === 'success' ? '✓' : phase === 'verifying' ? '⋯' : '×';
    this.nodes['result-title'].textContent = title; this.nodes['result-subtitle'].textContent = subtitle;
  }
  async finish() {
    if (this.submitted || this.disposed) return;
    this.submitted = true; this.ended = true; clearInterval(this.timer); this.release(); this.disableControls();
    this.showResult('verifying', 'Verificando', 'El GM está comprobando el intento'); this.status('Verificando el resultado…');
    try {
      const result = await this.send('finish', {sessionId: this.session.sessionId, trace: this.trace});
      this.finished = true; if (this.disposed) return;
      const success = result.status === 'success';
      if (success) this.audio.play('success');
      this.showResult(success ? 'success' : 'failure', success ? 'Cerradura abierta' : 'Intento fallido', success ? 'El mecanismo ha cedido' : 'No quedan ganzúas');
      this.status(success ? 'Puedes cerrar esta ventana y continuar.' : 'Cierra esta ventana para intentarlo de nuevo.');
    } catch (error) {this.showResult('error', 'Intento interrumpido', error.message); this.status(error.message);}
  }
  expire() {
    this.ended = true; clearInterval(this.timer); this.release(); this.disableControls();
    this.showResult('error', 'Tiempo agotado', 'Cierra la ventana e inicia otro intento'); this.status('El intento venció. No se ha abierto la cerradura.');
    void this.send('cancel', {sessionId: this.session.sessionId}).catch(() => {}); this.cancelled = true;
  }
  stopLoops() {clearInterval(this.timer); if (this.frame) cancelAnimationFrame(this.frame); this.frame = null;}
  async close(options) {
    if (this.disposed) return;
    this.disposed = true; this.stopLoops(); this.abort.abort(); this.release(); this.audio.close();
    if (!this.submitted && !this.cancelled) void this.send('cancel', {sessionId: this.session.sessionId}).catch(() => {});
    this.element?.getAnimations?.({subtree: true}).forEach(animation => animation.cancel());
    await super.close(options); Hooks.callAll(`${ID}Closed`, this);
  }
}
