// ORA — generative audio. Pure WebAudio synthesis, zero assets.
// Taps pluck pentatonic notes, holds hum a sub tone, strokes breathe
// filtered noise, pinches shimmer, bursts thump.
const PENTA = [0, 3, 5, 7, 10, 12, 15];
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.muted = false;
    this.mood = { root: 57, wave: 'triangle', cutoff: 2400 };
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.3;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 8;
      this.master.connect(comp).connect(c.destination);

      // shared looping noise for strokes / pinch shimmer
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf; src.loop = true;
      this.strokeFilter = c.createBiquadFilter();
      this.strokeFilter.type = 'bandpass'; this.strokeFilter.Q.value = 1.4;
      this.strokeFilter.frequency.value = 500;
      this.strokeGain = c.createGain(); this.strokeGain.gain.value = 0;
      src.connect(this.strokeFilter).connect(this.strokeGain).connect(this.master);
      src.start();

      // hold sub-oscillator
      this.holdOsc = c.createOscillator();
      this.holdOsc.type = 'sine';
      this.holdGain = c.createGain(); this.holdGain.gain.value = 0;
      this.holdOsc.connect(this.holdGain).connect(this.master);
      this.holdOsc.start();
      return true;
    } catch { return false; }
  }

  setMood(a) {
    this.mood = a;
    if (this.holdOsc) this.holdOsc.frequency.setTargetAtTime(midiHz(a.root - 24), this.ctx.currentTime, 0.4);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.3, this.ctx.currentTime, 0.05);
  }

  _pluck(midi, vel = 1, dur = 0.4) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = this.mood.wave;
    o.frequency.value = midiHz(midi);
    const o2 = c.createOscillator(); o2.type = 'sine';
    o2.frequency.value = midiHz(midi) * 2.01;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.value = this.mood.cutoff; f.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.35;
    o.connect(f).connect(g); o2.connect(g2).connect(g);
    g.connect(this.master);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  tap(y01 = 0.5) {
    const deg = PENTA[Math.floor((1 - y01) * (PENTA.length - 1) + Math.random() * 1.2) % PENTA.length];
    this._pluck(this.mood.root + 12 + deg, 1, 0.45);
  }

  moodChord() {
    this._pluck(this.mood.root, 0.8, 0.9);
    setTimeout(() => this._pluck(this.mood.root + 7, 0.6, 0.9), 90);
    setTimeout(() => this._pluck(this.mood.root + 12, 0.5, 1.1), 190);
  }

  holdLevel(l) {
    if (!this.ctx) return;
    this.holdGain.gain.setTargetAtTime(this.muted ? 0 : l * 0.12, this.ctx.currentTime, 0.12);
  }

  strokeLevel(s01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.strokeFilter.frequency.setTargetAtTime(320 + s01 * 2400, t, 0.08);
    this.strokeGain.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.09, s01 * 0.11), t, 0.09);
  }

  pinchLevel(p01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (p01 > 0.03) {
      this.strokeFilter.frequency.setTargetAtTime(600 + p01 * 2800, t, 0.1);
      this.strokeGain.gain.setTargetAtTime(this.muted ? 0 : p01 * 0.07, t, 0.1);
    }
  }

  burst() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.55);
    this._pluck(this.mood.root + 24, 0.5, 0.7);
  }
}
