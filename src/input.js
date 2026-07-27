// Sensors and gestures.
//
// Gravity comes from `deviceorientation`, which has a well-defined frame,
// rather than `accelerationIncludingGravity`, whose sign conventions differ
// between vendors. Motion events are still used, but only for shake.

const DEG = Math.PI / 180;

export class Input {
  constructor(canvas, sim, opts) {
    this.canvas = canvas;
    this.sim = sim;
    this.toWorld = opts.toWorld;      // (clientX, clientY) -> {x, y}
    this.onFirstGesture = opts.onFirstGesture || (() => {});

    this.source = 'idle';             // 'sensor' | 'manual' | 'pointer' | 'idle'
    this.sensorSeen = false;
    this.permission = 'unknown';      // 'unknown' | 'granted' | 'denied' | 'unsupported'

    this.pointers = new Map();
    this.pinchStart = 0;
    this.pinchBase = 0;
    this.pinchValue = 0;
    this.dragged = false;
    this.downAt = 0;

    // Manual gravity, used when no sensor ever reports. Also the desktop path.
    this.manual = { x: 0, y: -1, z: 0 };

    this.shakeLast = { x: 0, y: 0, z: 0 };
    this.shakeEnergy = 0;
    this.shakeCooldown = 0;

    this.bindPointer();
  }

  // ------------------------------------------------------------------ sensors

  // Must be called from inside a user gesture — iOS rejects it otherwise.
  async requestSensors() {
    const DOE = window.DeviceOrientationEvent;
    const DME = window.DeviceMotionEvent;
    if (!DOE && !DME) {
      this.permission = 'unsupported';
      return false;
    }

    try {
      if (DOE && typeof DOE.requestPermission === 'function') {
        const state = await DOE.requestPermission();
        if (state !== 'granted') {
          this.permission = 'denied';
          return false;
        }
      }
      if (DME && typeof DME.requestPermission === 'function') {
        await DME.requestPermission().catch(() => {});
      }
    } catch (e) {
      // Thrown when the call is not tied to a gesture, or when the page is
      // framed without an allow= grant. Either way: fall back, do not fail.
      this.permission = 'denied';
      return false;
    }

    this.permission = 'granted';
    window.addEventListener('deviceorientation', this.onOrientation, true);
    window.addEventListener('devicemotion', this.onMotion, true);
    return true;
  }

  onOrientation = (e) => {
    if (e.beta === null || e.gamma === null) return;

    const beta = e.beta * DEG;
    const gamma = e.gamma * DEG;

    // World-down expressed in device axes for the ZXY convention the spec uses:
    //   g = (cos(beta)sin(gamma), -sin(beta), -cos(beta)cos(gamma))
    // Upright phone -> straight down the screen. Flat on a table -> into it.
    let gx = Math.cos(beta) * Math.sin(gamma);
    let gy = -Math.sin(beta);
    const gz = -Math.cos(beta) * Math.cos(gamma);

    // Undo the screen rotation so landscape still pours the right way.
    const angle = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * DEG;
    if (angle) {
      const c = Math.cos(-angle), s = Math.sin(-angle);
      const rx = gx * c - gy * s;
      const ry = gx * s + gy * c;
      gx = rx; gy = ry;
    }

    this.sensorSeen = true;
    this.source = 'sensor';
    this.sim.setGravity(gx, gy, gz);
  };

  onMotion = (e) => {
    const a = e.acceleration || e.accelerationIncludingGravity;
    if (!a || a.x === null) return;

    // If orientation never arrives but motion does, derive gravity from the
    // accelerometer instead. At rest the reported vector opposes gravity.
    if (!this.sensorSeen && e.accelerationIncludingGravity) {
      const g = e.accelerationIncludingGravity;
      if (g.x !== null) {
        const l = Math.hypot(g.x, g.y, g.z);
        if (l > 4) {
          this.source = 'sensor';
          this.sim.setGravity(-g.x / l, -g.y / l, -g.z / l);
        }
      }
    }

    const dx = a.x - this.shakeLast.x;
    const dy = a.y - this.shakeLast.y;
    const dz = a.z - this.shakeLast.z;
    this.shakeLast = { x: a.x, y: a.y, z: a.z };

    const jerk = Math.hypot(dx, dy, dz);
    this.shakeEnergy = this.shakeEnergy * 0.85 + jerk * 0.15;

    if (this.shakeEnergy > 5.5 && this.shakeCooldown <= 0) {
      this.shakeCooldown = 1.1;
      this.shakeEnergy = 0;
      this.sim.shatter();
    }
  };

  // Called once the intro resolves. If nothing has reported by then the
  // manual control takes over as a first-class path, not an error state.
  startFallbackWatch(onFallback) {
    setTimeout(() => {
      if (!this.sensorSeen && this.source !== 'sensor') {
        this.source = matchMedia('(pointer: coarse)').matches ? 'manual' : 'pointer';
        onFallback(this.source);
      }
    }, 1600);
  }

  setManualGravity(x, y) {
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.manual.x = x;
    this.manual.y = y;
    this.manual.z = -Math.sqrt(Math.max(0, 1 - x * x - y * y)) * 0.35;
    this.sim.setGravity(this.manual.x, this.manual.y, this.manual.z);
  }

  // ------------------------------------------------------------------ pointer

  bindPointer() {
    const el = this.canvas;
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp, { passive: false });
    el.addEventListener('pointercancel', this.onUp, { passive: false });
    el.addEventListener('pointerleave', this.onUp, { passive: false });
  }

  onDown = (e) => {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY,
    });
    this.dragged = false;
    this.downAt = performance.now();
    this.onFirstGesture();

    if (this.pointers.size === 2) {
      this.pinchStart = this.pinchDistance();
      this.pinchBase = this.pinchValue;
      this.sim.clearTouch();
    }
  };

  onMove = (e) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      // Desktop hover steers gravity, which makes the piece testable and
      // legible without a phone in hand.
      if (this.source === 'pointer') {
        const nx = (e.clientX / innerWidth) * 2 - 1;
        const ny = (e.clientY / innerHeight) * 2 - 1;
        this.setManualGravity(nx * 0.9, -ny * 0.9 - 0.25);
      }
      return;
    }
    e.preventDefault();

    p.px = p.x; p.py = p.y;
    p.x = e.clientX; p.y = e.clientY;

    if (Math.hypot(p.x - p.px, p.y - p.py) > 1.2) this.dragged = true;

    if (this.pointers.size >= 2) {
      const d = this.pinchDistance();
      if (this.pinchStart > 1) {
        const ratio = d / this.pinchStart;
        // log2 so pinching in and spreading out travel symmetrically.
        const delta = Math.log2(ratio) * 0.55;
        this.pinchValue = Math.min(Math.max(this.pinchBase + delta, 0), 1);
        this.sim.setPinch(this.pinchValue);
      }
      return;
    }

    const w = this.toWorld(p.x, p.y);
    const wPrev = this.toWorld(p.px, p.py);
    this.sim.setTouch(w.x, w.y, (w.x - wPrev.x) * 60, (w.y - wPrev.y) * 60, 1);
  };

  onUp = (e) => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);

    if (this.pointers.size === 0) {
      const quick = performance.now() - this.downAt < 260;
      if (quick && !this.dragged) {
        const w = this.toWorld(p.x, p.y);
        this.sim.dropAt(w.x, w.y);
      }
      this.sim.clearTouch();
    } else if (this.pointers.size === 1) {
      this.pinchStart = 0;
    }
  };

  pinchDistance() {
    const ps = [...this.pointers.values()];
    if (ps.length < 2) return 0;
    return Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
  }

  update(dt) {
    if (this.shakeCooldown > 0) this.shakeCooldown -= dt;
  }
}
