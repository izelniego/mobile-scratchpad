// ORA — gesture engine. Raw pointer events → a physical vocabulary:
// one finger = gravity well + ink stroke, quick release = tap shockwave,
// two fingers = pinch / twist / horizontal flick (mood change).
export class Gestures {
  constructor(el, cb) {
    this.el = el;
    this.cb = cb; // { onTap, onDoubleTap, onPinchRelease, onMoodSwipe, onAny }
    this.pointers = new Map(); // id -> state
    this.wells = [null, null]; // slot -> pointer state (single-finger mode)
    this.pinch01 = 0;          // live compression (-0.5 expand .. 1 crush)
    this.twistVel = 0;         // rad/s, smoothed
    this._twoStart = null;
    this._lastTap = { t: 0, x: 0, y: 0 };

    const opts = { passive: false };
    el.addEventListener('pointerdown', (e) => this._down(e), opts);
    el.addEventListener('pointermove', (e) => this._move(e), opts);
    el.addEventListener('pointerup', (e) => this._up(e), opts);
    el.addEventListener('pointercancel', (e) => this._up(e), opts);
    // kill native zoom/scroll/callout inside the universe
    for (const t of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange']) {
      el.addEventListener(t, (e) => e.preventDefault(), opts);
    }
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _down(e) {
    e.preventDefault();
    this.cb.onAny?.();
    const p = {
      id: e.pointerId, x: e.clientX, y: e.clientY,
      x0: e.clientX, y0: e.clientY, t0: performance.now(),
      vx: 0, vy: 0, lt: performance.now(), travel: 0,
    };
    this.pointers.set(e.pointerId, p);
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ok */ }

    if (this.pointers.size === 1) {
      this.wells[0] = p;
    } else if (this.pointers.size === 2) {
      // enter two-finger mode: wells off, remember the framing
      this.wells[0] = this.wells[1] = null;
      const [a, b] = [...this.pointers.values()];
      this._twoStart = {
        a, b,
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        ang: Math.atan2(b.y - a.y, b.x - a.x),
        cx: (a.x + b.x) / 2, t0: performance.now(),
        netPinch: 0, netTwist: 0,
      };
    }
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const now = performance.now();
    const dt = Math.max(1, now - p.lt) / 1000;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.travel += Math.hypot(dx, dy);
    // exponentially smoothed velocity (px/s)
    const k = Math.min(1, dt * 18);
    p.vx += ((dx / dt) - p.vx) * k;
    p.vy += ((dy / dt) - p.vy) * k;
    p.x = e.clientX; p.y = e.clientY; p.lt = now;

    if (this.pointers.size === 2 && this._twoStart) {
      const s = this._twoStart;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const target = Math.max(-0.5, Math.min(1, (1 - dist / s.dist) * 1.6));
      this.pinch01 += (target - this.pinch01) * 0.35;
      s.netPinch = target;
      let dAng = ang - s.ang;
      if (dAng > Math.PI) dAng -= Math.PI * 2;
      if (dAng < -Math.PI) dAng += Math.PI * 2;
      s.ang = ang;
      s.netTwist += dAng;
      this.twistVel += ((dAng / dt) - this.twistVel) * 0.3;
    }
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    this.pointers.delete(e.pointerId);
    const now = performance.now();

    if (this._twoStart && this.pointers.size <= 1) {
      const s = this._twoStart;
      this._twoStart = null;
      const dtms = now - s.t0;
      const [ra, rb] = [s.a, s.b];
      const cx = (ra.x + rb.x) / 2;
      const dxTotal = cx - s.cx; // centroid displacement... use finger travel instead
      const flick = (Math.abs(ra.x - ra.x0) + Math.abs(rb.x - rb.x0)) / 2;
      const horiz = flick > 64 && dtms < 700 &&
        Math.abs(s.netPinch) < 0.28 && Math.abs(s.netTwist) < 0.55;
      if (horiz) {
        const dir = Math.sign((ra.x - ra.x0) + (rb.x - rb.x0)) || 1;
        this.cb.onMoodSwipe?.(-dir); // swipe left → next
      } else if (this.pinch01 > 0.45) {
        this.cb.onPinchRelease?.(this.pinch01);
      }
      // release compression either way
      this._pinchRelease = true;
    }

    // single-finger endings
    if (this.wells[0] === p) this.wells[0] = null;
    if (this.wells[1] === p) this.wells[1] = null;

    const dtms = now - p.t0;
    if (dtms < 320 && p.travel < 16 && this.pointers.size === 0 && !this._twoRecent(now)) {
      const isDouble = (now - this._lastTap.t) < 420 &&
        Math.hypot(p.x - this._lastTap.x, p.y - this._lastTap.y) < 64;
      this._lastTap = { t: now, x: p.x, y: p.y };
      this.cb.onTap?.(p.x, p.y);
      if (isDouble) { this._lastTap.t = 0; this.cb.onDoubleTap?.(p.x, p.y); }
    }
    if (this.pointers.size === 0) this._lastTwoEnd = this._twoStart ? now : this._lastTwoEnd;
  }

  _twoRecent(now) { return this._lastTwoEnd && (now - this._lastTwoEnd) < 250; }

  // called every frame by main — decays live values toward rest
  tick(dt) {
    if (this.pointers.size < 2) {
      this.pinch01 += (0 - this.pinch01) * Math.min(1, dt * 6);
      this.twistVel *= Math.exp(-dt * 3.2);
    }
  }
}
