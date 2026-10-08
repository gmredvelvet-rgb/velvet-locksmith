import {ID, t} from './locks.js';
import {clamp, initialState, step} from './mechanics.js';
import {request} from './service.js';
import {LockAudio} from './audio.js';
import {renderLock} from './view.js';

const SVG = 'http://www.w3.org/2000/svg';
const LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'], KEYS = [...LEFT, ...RIGHT, 'Space'];
const buzz = pattern => {try {globalThis.navigator?.vibrate?.(pattern);} catch { /* Haptics are optional. */ }};

/** Fixed-step simulation with independent, smooth visual interpolation. */
export class LockGame extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {classes: ['velvet-locksmith'], position: {width: 620, height: 'auto'}, window: {title: 'Velvet Locksmith', resizable: false}};
  constructor(session, {send = request} = {}) {
    super(); this.session = session; this.send = send; this.puzzleState = initialState(session.p);
    this.angle = 0; this.torque = false; this.secondary = false; this.trace = []; this.keys = new Set();
    this.audio = new LockAudio(); this.abort = new AbortController();
    this.ended = false; this.finished = false; this.submitted = false; this.disposed = false;
    this.started = 0; this.breakUntil = 0; this.displayAngle = 0; this.displayRotation = 0;
    this.spin = 0; this.kick = 0; this.displayBend = 0; this.displayHeat = 0; this.endedAt = 0;
    this.keyRamp = .25; this.fine = false; this.lastAngle = 0; this.travel = 0; this.marks = new Map();
    this.statusText = t('Status.Start');
    this.visualPhase = 'playing'; this.lastFrame = 0;
  }
  async _renderHTML() {return renderLock(this.session, this.statusText);}
  _replaceHTML(result, content) {content.innerHTML = result;}
  _onRender(context, options) {
    super._onRender(context, options);
    this.stopLoops(); this.abort.abort(); this.abort = new AbortController(); this.release();
    const root = this.element, signal = this.abort.signal;
    this.nodes = Object.fromEntries(['angle', 'pick', 'cylinder', 'tension', 'wear', 'lock', 'status', 'time', 'turn', 'angle-value', 'picks-text', 'result', 'result-icon', 'result-title', 'result-subtitle',
      'assembly', 'shaft', 'heat', 'arc', 'marks', 'sparks', 'pulse', 'flash'].map(name => [name, root.querySelector(`.vl-${name}`)]));
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.bindInput(signal); root.dataset.phase = this.visualPhase;
    for (const [key, heat] of this.marks) this.drawMark(key, heat);
    this.nodes.lock.classList.toggle('vl-open', this.puzzleState.status === 'success' && this.visualPhase !== 'error');
    if (this.ended) this.disableControls();
    if (this.resultText) this.showResult(this.visualPhase, this.resultText.title, this.resultText.subtitle);
    if (this.ended) this.nodes.time.textContent = this.remainingText ?? '—';
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
    // On the lock itself: primary button or touch aims the pick, secondary mouse button applies torque.
    n.lock.addEventListener('pointerdown', e => {
      if (this.ended || (e.button !== 0 && e.button !== 2)) return;
      e.preventDefault(); this.audio.unlock(); n.lock.setPointerCapture(e.pointerId); this.grip = e.pointerId; this.aim(e);
    }, {signal});
    n.lock.addEventListener('pointermove', e => this.aim(e), {signal});
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) n.lock.addEventListener(name, e => {
      if (this.grip === e.pointerId) {this.grip = null; this.secondary = false;}
    }, {signal});
    n.lock.addEventListener('contextmenu', e => e.preventDefault(), {signal});
    n.lock.addEventListener('wheel', e => {
      if (this.ended) return;
      e.preventDefault(); this.angle = clamp(this.angle + Math.sign(e.deltaY) * (e.shiftKey ? .5 : 2), -90, 90);
    }, {signal, passive: false});
    root.addEventListener('keydown', e => {
      this.fine = e.shiftKey;
      if (this.ended || !KEYS.includes(e.code)) return;
      e.preventDefault(); e.stopPropagation(); this.audio.unlock(); this.keys.add(e.code);
    }, {signal});
    root.addEventListener('keyup', e => {
      this.fine = e.shiftKey;
      if (KEYS.includes(e.code)) {e.preventDefault(); e.stopPropagation(); this.keys.delete(e.code);}
    }, {signal});
    root.addEventListener('focusout', e => {if (!root.contains(e.relatedTarget)) this.release();}, {signal});
    window.addEventListener('blur', () => this.release(), {signal});
    document.addEventListener('visibilitychange', () => {if (document.hidden) this.release();}, {signal});
  }
  aim(event) {
    if (this.ended || this.grip !== event.pointerId) return;
    const mouse = event.pointerType === 'mouse';
    this.secondary = mouse && Boolean(event.buttons & 2);
    if (!mouse || event.buttons & 1) this.movePick(event);
  }
  movePick(event) {
    if (this.ended) return;
    const rect = this.nodes.lock.getBoundingClientRect();
    const x = (event.clientX - rect.left) * 400 / rect.width - 200;
    const y = (event.clientY - rect.top) * 450 / rect.height - 232;
    this.angle = clamp(Math.atan2(x, -y) * 180 / Math.PI, -90, 90);
  }
  release() {this.torque = false; this.secondary = false; this.keys.clear(); this.grip = null; this.fine = false;}
  get pressing() {return this.torque || this.secondary || this.keys.has('Space');}
  tick() {
    if (this.ended || this.disposed) return;
    if (this.started && performance.now() - this.started >= 120000) {this.expire(); return;}
    // Held keys start slow for precision and ramp up for sweeps; Shift keeps the slow speed.
    const direction = (RIGHT.some(k => this.keys.has(k)) ? 1 : 0) - (LEFT.some(k => this.keys.has(k)) ? 1 : 0);
    this.keyRamp = direction ? Math.min(3, this.keyRamp + .25) : .25;
    this.angle = clamp(this.angle + direction * (this.fine ? .5 : this.keyRamp), -90, 90);
    this.travel += Math.abs(this.angle - this.lastAngle); this.lastAngle = this.angle;
    if (this.travel >= 6) {this.travel = 0; this.audio.play('scrape');}
    const torque = performance.now() >= this.breakUntil && this.pressing;
    this.trace.push([this.angle, torque]);
    const previous = this.puzzleState;
    this.puzzleState = step(previous, this.angle, torque, this.session.sweet, this.session.p);
    const straining = torque && this.puzzleState.wear > previous.wear;
    if (straining && !this.straining) {this.kick = 2.5; this.audio.play('bind'); buzz(12);}
    this.straining = straining; this.audio.strain(straining, this.puzzleState.wear);
    if (straining) {
      this.mark(this.angle, this.puzzleState.rotation);
      if (Math.random() < .35 + this.puzzleState.wear * .5) this.spark();
    } else if (this.puzzleState.rotation > previous.rotation && Math.floor(previous.rotation / 15) !== Math.floor(this.puzzleState.rotation / 15)) this.audio.play('turn', this.puzzleState.rotation / 90);
    if (previous.picks !== this.puzzleState.picks) this.breakPick();
    this.updateInstruments();
    if (this.puzzleState.status !== 'playing') void this.finish();
    else if (this.trace.length >= 2350) this.expire();
  }
  /** Remembers how far the cylinder turned at each probed angle. */
  mark(angle, rotation) {
    const key = Math.round(angle / 4), heat = rotation / 90;
    if (this.marks.get(key) >= heat) return;
    this.marks.set(key, heat); this.drawMark(key, heat);
  }
  drawMark(key, heat) {
    const group = this.nodes?.marks;
    if (!group) return;
    let dot = group.querySelector(`[data-mark="${key}"]`);
    if (!dot) {
      dot = document.createElementNS(SVG, 'circle'); dot.dataset.mark = key;
      dot.setAttribute('cx', 200); dot.setAttribute('cy', 112); dot.setAttribute('transform', `rotate(${key * 4} 200 232)`);
      group.append(dot);
    }
    dot.setAttribute('r', (2 + heat * 2.2).toFixed(1)); dot.setAttribute('opacity', (.25 + heat * .75).toFixed(2));
  }
  spark(count = 1) {
    if (!this.nodes?.sparks || this.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const dot = document.createElementNS(SVG, 'circle'), direction = Math.random() * Math.PI * 2, reach = 18 + Math.random() * 36;
      dot.setAttribute('cx', 200); dot.setAttribute('cy', 232); dot.setAttribute('r', (1 + Math.random()).toFixed(1));
      this.nodes.sparks.append(dot);
      dot.animate([{opacity: 1, transform: 'translate(0,0)'}, {opacity: 0, transform: `translate(${Math.cos(direction) * reach}px,${Math.sin(direction) * reach + 14}px)`}],
        {duration: 240 + Math.random() * 240, easing: 'ease-out'}).onfinish = () => dot.remove();
    }
  }
  breakPick() {
    this.breakUntil = performance.now() + 650; this.release(); this.audio.play('break'); this.kick = 10; buzz(60);
    this.status(t('Status.Broken', {picks: this.puzzleState.picks}));
    if (this.reducedMotion || !this.nodes) return;
    this.spark(8);
    this.nodes.flash.animate([{opacity: .6}, {opacity: 0}], {duration: 420, easing: 'ease-out'});
    // The snapped pick drops away; a fresh one slides in unless that was the last.
    const fall = {opacity: 0, transform: 'translate(16px,64px) rotate(40deg)'}, fx = this.nodes.pick.querySelector('.vl-pick-fx');
    if (this.puzzleState.picks <= 0) fx.animate([{opacity: 1, transform: 'none'}, fall], {duration: 230, easing: 'ease-in', fill: 'forwards'});
    else fx.animate([{opacity: 1, transform: 'none'}, {...fall, offset: .35}, {opacity: 0, transform: 'translateY(-46px)', offset: .55}, {opacity: 1, transform: 'none'}], {duration: 650, easing: 'ease-out'});
  }
  /** Immediate local feedback for the latch giving way; the GM still confirms the result. */
  celebrate() {
    this.audio.play('latch'); this.kick = 5; buzz([25, 40, 70]);
    if (!this.nodes) return;
    this.nodes.lock.classList.add('vl-open');
    if (!this.reducedMotion) this.nodes.pulse.animate([{opacity: .9, transform: 'scale(1)'}, {opacity: 0, transform: 'scale(1.75)'}], {duration: 750, easing: 'ease-out'});
  }
  animate(time) {
    if (this.disposed) return;
    this.paint(time);
    if (this.ended && time > this.endedAt + 1500) {this.frame = null; return;}
    this.frame = requestAnimationFrame(next => this.animate(next));
  }
  paint(time = performance.now(), immediate = false) {
    if (!this.nodes || this.disposed) return;
    const n = this.nodes, dt = Math.min(50, Math.max(0, time - (this.lastFrame || time))); this.lastFrame = time;
    const snap = immediate || this.reducedMotion, blend = snap ? 1 : 1 - Math.exp(-dt / 45);
    const {rotation, wear} = this.puzzleState, live = Boolean(this.straining && !this.ended);
    this.displayAngle += (this.angle - this.displayAngle) * blend;
    if (snap) {this.displayRotation = rotation; this.spin = 0; this.kick = 0;}
    else {
      // Underdamped spring: the cylinder jolts as it binds and wobbles back when released.
      this.spin += ((rotation - this.displayRotation) * 420 - this.spin * 26) * dt / 1000;
      this.displayRotation += this.spin * dt / 1000; this.kick *= Math.exp(-dt / 110);
    }
    const amp = live && !snap ? .5 + wear * 1.8 : 0, tremor = amp * (Math.sin(time * .09) + Math.sin(time * .23) * .5);
    // The bend always bows the same way so it never hints at the direction of the sweet spot.
    this.displayBend += ((live ? 5 + wear * 15 : 0) - this.displayBend) * blend;
    this.displayHeat += (wear * (live ? 1 : .5) - this.displayHeat) * blend;
    const shaft = `M200 233Q${(200 + this.displayBend).toFixed(1)} 150 200 72`;
    n.assembly.setAttribute('transform', `translate(${(Math.sin(time * .11) * amp * .6 + Math.sin(time * .37) * this.kick).toFixed(2)} ${(Math.cos(time * .13) * amp * .6 + Math.cos(time * .29) * this.kick).toFixed(2)})`);
    n.pick.setAttribute('transform', `rotate(${this.displayAngle + tremor} 200 232)`);
    n.shaft.setAttribute('d', shaft); n.heat.setAttribute('d', shaft); n.heat.setAttribute('opacity', this.displayHeat.toFixed(2));
    n.cylinder.setAttribute('transform', `rotate(${this.displayRotation} 200 232)`);
    n.tension.setAttribute('transform', `rotate(${this.displayRotation + tremor * .4} 200 232)`);
    n.arc.setAttribute('stroke-dasharray', `${clamp(this.displayRotation, 0, 90).toFixed(1)} 90`);
    n.lock.classList.toggle('vl-strain', live);
    n.turn.classList.toggle('vl-held', !this.ended && this.pressing);
    n.angle.value = this.angle; n['angle-value'].textContent = `${Math.round(this.angle)}°`;
    if (this.started && !this.ended) {
      const remaining = Math.max(0, Math.ceil((120000 - (time - this.started)) / 1000));
      this.remainingText = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
      n.time.textContent = this.remainingText;
      n.time.classList.toggle('vl-time-low', remaining <= 20);
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
  end() {
    this.ended = true; this.endedAt = performance.now(); this.straining = false;
    clearInterval(this.timer); this.release(); this.disableControls(); this.audio.strain(false);
  }
  async finish() {
    if (this.submitted || this.disposed) return;
    this.submitted = true; this.end();
    if (this.puzzleState.status === 'success') this.celebrate(); else this.audio.play('fail');
    this.showResult('verifying', t('Result.VerifyingTitle'), t('Result.VerifyingText')); this.status(t('Status.Verifying'));
    try {
      const result = await this.send('finish', {sessionId: this.session.sessionId, trace: this.trace});
      this.finished = true; if (this.disposed) return;
      const success = result.status === 'success';
      if (success) {this.audio.play('success'); Hooks.callAll(`${ID}Opened`, this);}
      this.showResult(success ? 'success' : 'failure', t(success ? 'Result.OpenTitle' : 'Result.FailTitle'), t(success ? 'Result.OpenText' : 'Result.FailText'));
      this.status(t(success ? 'Status.Success' : 'Status.Failure'));
    } catch (error) {
      this.nodes?.lock.classList.remove('vl-open');
      this.showResult('error', t('Result.InterruptedTitle'), error.message); this.status(error.message);
    }
  }
  expire() {
    this.end();
    this.showResult('error', t('Result.TimeoutTitle'), t('Result.TimeoutText')); this.status(t('Status.Timeout'));
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
