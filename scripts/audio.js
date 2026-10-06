import {ID} from "./locks.js";

/** Local mechanical cues. Audio failures never interrupt gameplay. */
export class LockAudio {
  context = null;
  lastTick = 0;
  unlock() {
    if (!game.settings.get(ID, "sound")) return;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return;
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume().catch(() => {});
    } catch { /* Unsupported audio is optional. */ }
  }
  play(kind) {
    if (!this.context || this.context.state !== "running" || !game.settings.get(ID, "sound")) return;
    const now = this.context.currentTime;
    if (kind === "tick" && now - this.lastTick < .12) return;
    if (kind === "tick") this.lastTick = now;
    const volume = Math.max(0, Math.min(1, Number(game.settings.get(ID, "volume")) || 0));
    const notes = kind === "success" ? [[520, 0, .12], [780, .08, .18], [1040, .16, .28]]
      : kind === "break" ? [[170, 0, .1], [75, .07, .14]] : [[kind === "turn" ? 260 : 340, 0, .035]];
    for (const [frequency, delay, duration] of notes) {
      const tone = this.context.createOscillator(), gain = this.context.createGain();
      tone.type = kind === "break" ? "triangle" : "sine";
      tone.frequency.setValueAtTime(frequency, now + delay);
      tone.frequency.exponentialRampToValueAtTime(frequency * .6, now + delay + duration);
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(volume * .16, now + delay + .005);
      gain.gain.exponentialRampToValueAtTime(.0001, now + delay + duration);
      tone.connect(gain); gain.connect(this.context.destination);
      tone.onended = () => {tone.disconnect(); gain.disconnect();};
      tone.start(now + delay); tone.stop(now + delay + duration);
    }
  }
  close() {if (this.context) void this.context.close().catch(() => {}); this.context = null;}
}
