import {ID} from "./locks.js";

/** Synthesised mechanical cues, no audio assets. Audio failures never interrupt gameplay. */
export class LockAudio {
  context = null;
  master = null;
  noise = null;
  creak = null;
  unlock() {
    if (!game.settings.get(ID, "sound")) return;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.context) this.build(new AudioContext());
      if (this.context.state === "suspended") void this.context.resume().catch(() => {});
    } catch { /* Unsupported audio is optional. */ }
  }
  build(context) {
    this.context = context;
    this.master = context.createGain(); this.master.connect(context.destination);
    // One second of white noise feeds every click, scrape and snap.
    this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // Metal creak: a sawtooth through a resonant band-pass, silent until the pick binds.
    const tone = context.createOscillator(), filter = context.createBiquadFilter(), gain = context.createGain();
    tone.type = "sawtooth"; tone.frequency.value = 60; filter.type = "bandpass"; filter.Q.value = 9; gain.gain.value = 0;
    tone.connect(filter); filter.connect(gain); gain.connect(this.master); tone.start();
    this.creak = {tone, filter, gain};
  }
  ready() {
    if (!this.context || this.context.state !== "running") return false;
    const on = game.settings.get(ID, "sound");
    this.master.gain.value = on ? Math.max(0, Math.min(1, Number(game.settings.get(ID, "volume")) || 0)) : 0;
    return on;
  }
  /** Routes a node to the output through a percussive gain envelope. */
  envelope(node, source, level, delay, duration) {
    const gain = this.context.createGain(), start = this.context.currentTime + delay;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    node.connect(gain); gain.connect(this.master);
    source.onended = () => {source.disconnect(); node.disconnect(); gain.disconnect();};
    return start;
  }
  /** Filtered noise burst: clicks, scrapes and snaps. */
  burst(frequency, q, duration, level, delay = 0, type = "bandpass") {
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter();
    source.buffer = this.noise; filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
    source.connect(filter);
    const start = this.envelope(filter, source, level, delay, duration);
    source.start(start, Math.random() * .5); source.stop(start + duration + .02);
  }
  /** Pitched body: thuds, pings and the opening chime. */
  ping(frequency, duration, level, delay = 0, type = "sine", glide = 1) {
    const tone = this.context.createOscillator(), start = this.envelope(tone, tone, level, delay, duration);
    tone.type = type; tone.frequency.setValueAtTime(frequency, start);
    if (glide !== 1) tone.frequency.exponentialRampToValueAtTime(frequency * glide, start + duration);
    tone.start(start); tone.stop(start + duration + .02);
  }
  play(kind, amount = 0) {
    if (!this.ready()) return;
    if (kind === "scrape") this.burst(2400 + Math.random() * 2200, 7, .03, .1);
    else if (kind === "turn") {this.burst(900 + amount * 900, 3, .035, .22); this.ping(130 + amount * 70, .05, .16, 0, "triangle");}
    else if (kind === "bind") {this.ping(92, .1, .3, 0, "triangle", .7); this.burst(420, 2, .05, .22);}
    else if (kind === "break") {this.burst(3200, .8, .13, .6, 0, "highpass"); this.ping(1900, .28, .2, 0, "triangle", .45); this.ping(120, .16, .4, .02, "sine", .5);}
    else if (kind === "latch") {this.ping(84, .24, .6, 0, "sine", .55); this.burst(700, 1.5, .07, .5); this.burst(1800, 4, .04, .3, .09);}
    else if (kind === "success") {this.ping(660, .6, .15); this.ping(990, .8, .11, .1);}
    else if (kind === "fail") {this.ping(110, .35, .4, 0, "triangle", .5); this.burst(300, 1, .2, .22);}
  }
  /** Continuous creak while the pick is being forced; pitch climbs as it wears. */
  strain(level, wear = 0) {
    if (!this.creak) return;
    const now = this.context.currentTime, on = level && this.ready();
    this.creak.gain.gain.setTargetAtTime(on ? .07 + wear * .16 : 0, now, .04);
    this.creak.tone.frequency.setTargetAtTime(58 + wear * 75 + Math.random() * 6, now, .05);
    this.creak.filter.frequency.setTargetAtTime(480 + wear * 1100, now, .05);
  }
  close() {if (this.context) void this.context.close().catch(() => {}); this.context = null; this.creak = null;}
}
