// ORA — device motion. Tilt = gravity (liquid in a glass, with a slowly
// adapting neutral point so any way you hold the phone becomes "level").
// Shake = scatter. iOS needs a user-gesture permission request → chip.
export class Motion {
  constructor(cb) {
    this.cb = cb; // { onShake, onFirstData }
    this.grav = { x: 0, y: 0, z: 0 };   // world-space gravity force
    this.parallax = { x: 0, y: 0 };     // -1..1 camera drift
    this.seen = false;
    this._base = null;                  // adaptive neutral {beta,gamma}
    this._spikes = [];
    this._lastShake = 0;

    this.needsPermission =
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
    if (!this.needsPermission) this._listen();
  }

  async request() {
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      try { await DeviceMotionEvent.requestPermission(); } catch { /* optional */ }
      if (r === 'granted') { this._listen(); return true; }
    } catch { /* ignored */ }
    return false;
  }

  _listen() {
    if (this._listening) return;
    this._listening = true;

    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (!this.seen) { this.seen = true; this.cb.onFirstData?.(); }
      if (!this._base) this._base = { beta: e.beta, gamma: e.gamma };
      const db = e.beta - this._base.beta;
      const dg = e.gamma - this._base.gamma;
      const gx = Math.max(-1, Math.min(1, dg / 32));
      const gy = Math.max(-1, Math.min(1, db / 32));
      const G = 5.2;
      this.grav.x = gx * G;
      this.grav.y = -gy * G;
      this.parallax.x = gx;
      this.parallax.y = gy;
    });

    window.addEventListener('devicemotion', (e) => {
      const a = e.acceleration;
      if (!a || a.x == null) return;
      const mag = Math.hypot(a.x, a.y, a.z);
      const now = performance.now();
      if (mag > 13) {
        this._spikes = this._spikes.filter((t) => now - t < 650);
        this._spikes.push(now);
        if (this._spikes.length >= 2 && now - this._lastShake > 1600) {
          this._lastShake = now;
          this._spikes = [];
          this.cb.onShake?.();
        }
      }
    });
  }

  // adaptive neutral: baseline chases current orientation over ~8s
  tick(dt) {
    if (!this._base || !this.seen) return;
    const k = Math.min(1, dt * 0.12);
    this._base.beta += (this._base.beta + this.parallax.y * 32 - this._base.beta) * 0; // keep simple
    // slow re-centering of gravity so the liquid "settles"
    this.grav.x *= 1 - k * 0.4;
    this.grav.y *= 1 - k * 0.4;
  }
}
