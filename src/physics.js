// The metaball sim. Up to sixteen soft bodies with cohesion, mutual repulsion
// and a container matched to the actual viewport, so the liquid pools against
// the edges of the phone you are holding rather than some abstract box.
//
// Each body is one drop, so the count is the volume: drops added by tapping
// stay, and drops that find the open port in the top wall leave for good.

export const MAX_BALLS = 16;

// Every ball is one drop of liquid, and the number alive IS the volume. There
// is deliberately no permanent "core": a mass that cannot be emptied is not a
// quantity you can manage.
const START_BALLS = 9;

// The aperture in the top wall, centred on x = 0.
export const PORT_RADIUS = 0.24;

const PARKED = 900; // unused uniform slots live far away so the shader's
                    // branch-free loop still ignores them

export class Sim {
  constructor() {
    this.balls = [];
    for (let i = 0; i < MAX_BALLS; i++) {
      this.balls.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        r: 0,
        alive: i < START_BALLS,
        born: 0,
      });
    }

    // Container half-extents, overwritten by resize() before the first step.
    this.hx = 0.9;
    this.hy = 1.5;
    this.hz = 0.5;

    this.gravity = { x: 0, y: -1, z: 0 };
    // 7.4 world units/s^2 is this piece's 1 g. Everything else is a multiple.
    this.gEarth = 7.4;
    this.gScale = 1;
    this.gStrength = this.gEarth;

    // Phone movement, as opposed to phone orientation. Liquid in a glass you
    // shove sideways piles up on the trailing wall; this is that force.
    this.inertia = { x: 0, y: 0, z: 0 };

    this.tension = 0.32;      // shader's uK
    this.tensionTarget = 0.32;
    this.material = 0;        // shader's uMat

    this.energy = 0;
    this.time = 0;

    this.touch = null;        // {x, y, z, vx, vy, strength}
    // Deliberately smaller than the radius of the mass. A finger that reaches
    // the whole body just magnets it around; a finger that reaches a pocket of
    // it pulls a tendril out and leaves the rest behind.
    this.touchReach = 0.60;
    this.touchForce = 30;
    this.shatterTimer = 0;

    this.boundC = { x: 0, y: 0, z: 0 };
    this.boundR = 1;

    this.events = [];         // drained by main for haptics

    this.portOpen = false;

    this.reset();
  }

  reset() {
    for (let i = 0; i < MAX_BALLS; i++) {
      const b = this.balls[i];
      b.alive = i < START_BALLS;
      if (!b.alive) continue;
      // Uniform inside a ball, not on its shell — seeding on a circle makes the
      // mass render as a torus with a hole through the middle.
      const a = Math.random() * Math.PI * 2;
      const e = Math.acos(2 * Math.random() - 1);
      const rad = 0.46 * Math.cbrt(Math.random());
      b.x = rad * Math.sin(e) * Math.cos(a);
      b.y = rad * Math.sin(e) * Math.sin(a);
      b.z = rad * Math.cos(e) * 0.55;
      b.vx = b.vy = b.vz = 0;
      // Wide radius spread is what keeps the mass lumpy rather than resolving
      // into one featureless sphere once it settles.
      b.r = 0.24 + 0.12 * Math.random();
    }
  }

  // Container tracks the visible frustum, so the liquid pools against the real
  // edges of whatever screen this is on. The margin is deliberately smaller
  // than the surface bleed: the mass should touch the sides of the screen the
  // way liquid touches the front pane of the vessel holding it.
  resize(halfW, halfH) {
    this.hx = Math.max(halfW - 0.26, 0.26);
    // Full height, so the top wall — and the port in it — sits near the top of
    // the screen. An earlier version capped this to keep the resting pool from
    // floating in dead space; that space now has a job, as the distance the
    // mercury travels when tilted and the route to the drain.
    // The margin also keeps the top wall — and the port control sitting on it —
    // clear of the readouts along the top of the screen.
    this.hy = Math.max(halfH - 0.48, 0.50);
    this.hz = 0.46;
  }

  // 0 = weightless, 1 = Earth, 2.53 = Jupiter.
  setGravityScale(g) {
    this.gScale = Math.max(0, Math.min(g, 3));
    this.gStrength = this.gEarth * this.gScale;
  }

  // Device linear acceleration, already gravity-excluded, in world axes.
  setInertia(x, y, z) {
    this.inertia.x = x;
    this.inertia.y = y;
    this.inertia.z = z;
  }

  setGravity(x, y, z) {
    const l = Math.hypot(x, y, z) || 1;
    this.gravity.x = x / l;
    this.gravity.y = y / l;
    this.gravity.z = z / l;
  }

  // Pinch drives one expressive axis: chrome and taut at one end, obsidian and
  // loose at the other. Latched, so it persists after the fingers lift.
  setPinch(t) {
    const k = Math.min(Math.max(t, 0), 1);
    this.material = k * 2;
    this.tensionTarget = 0.36 - k * 0.17;
  }

  setTouch(x, y, vx, vy, strength) {
    this.touch = { x, y, vx, vy, strength };
  }

  clearTouch() {
    this.touch = null;
  }

  volume() {
    let n = 0;
    for (const b of this.balls) if (b.alive) n++;
    return n;
  }

  isFull() { return this.volume() >= MAX_BALLS; }

  // A drop enters from in front of the mass and falls in along gravity. It then
  // stays: returns false only when the vessel is already full.
  addDrop(x, y) {
    let slot = -1;
    for (let i = 0; i < MAX_BALLS; i++) {
      if (!this.balls[i].alive) { slot = i; break; }
    }
    if (slot < 0) { this.events.push('full'); return false; }

    const b = this.balls[slot];
    b.alive = true;
    b.born = this.time;
    b.r = 0.26 + Math.random() * 0.08;
    const g = this.gravity;
    b.x = x - g.x * 0.75;
    b.y = y - g.y * 0.75;
    b.z = 0.42 - g.z * 0.4;
    b.vx = g.x * 3.4;
    b.vy = g.y * 3.4;
    b.vz = g.z * 3.4;
    this.events.push('drop');
    return true;
  }

  shatter() {
    this.shatterTimer = 1;
    for (let i = 0; i < MAX_BALLS; i++) {
      const b = this.balls[i];
      if (!b.alive) continue;
      const a = Math.random() * Math.PI * 2;
      const e = Math.acos(2 * Math.random() - 1);
      const s = 3.6 + Math.random() * 3.4;
      b.vx += Math.sin(e) * Math.cos(a) * s;
      b.vy += Math.sin(e) * Math.sin(a) * s;
      b.vz += Math.cos(e) * s * 0.5;
    }
    this.events.push('shatter');
  }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    this.time += dt;

    const balls = this.balls;
    const g = this.gravity;
    const gs = this.gStrength;
    const inert = this.inertia;

    // Shatter drops surface tension hard, then eases it back so the droplets
    // visibly separate before the mass reels them in again.
    if (this.shatterTimer > 0) {
      this.shatterTimer = Math.max(0, this.shatterTimer - dt / 1.35);
      const s = this.shatterTimer;
      this.tension = this.tensionTarget * (1 - s * 0.70);
    } else {
      this.tension += (this.tensionTarget - this.tension) * Math.min(1, dt * 5);
    }

    // Centroid drives cohesion — mass-weighted so big cores lead.
    let cx = 0, cy = 0, cz = 0, m = 0;
    for (let i = 0; i < MAX_BALLS; i++) {
      const b = balls[i];
      if (!b.alive) continue;
      const w = b.r * b.r;
      cx += b.x * w; cy += b.y * w; cz += b.z * w; m += w;
    }
    if (m > 0) { cx /= m; cy /= m; cz /= m; }

    // Mercury's defining trait is enormous surface tension — it beads instead
    // of spreading. Cohesion therefore outweighs gravity for shape, while
    // gravity still decides where the bead rolls to.
    const cohesion = 12.5;
    const restR = 0.42;

    for (let i = 0; i < MAX_BALLS; i++) {
      const b = balls[i];
      if (!b.alive) continue;

      b.vx += (g.x * gs + inert.x) * dt;
      b.vy += (g.y * gs + inert.y) * dt;
      b.vz += (g.z * gs + inert.z) * dt;

      const dx = cx - b.x, dy = cy - b.y, dz = cz - b.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > restR) {
        const f = cohesion * (d - restR) / d * dt;
        b.vx += dx * f; b.vy += dy * f; b.vz += dz * f;
      }

      // An open port draws in whatever comes near its mouth. Without this you
      // would have to aim the pour exactly, which is not what pouring is like.
      if (this.portOpen) {
        const mx = 0 - b.x, my = this.hy - b.y, mz = -b.z;
        const md = Math.hypot(mx, my, mz);
        if (md < 0.85 && md > 1e-4) {
          const pull = (1 - md / 0.85) * 5.5 * dt / md;
          b.vx += mx * pull; b.vy += my * pull; b.vz += mz * pull;
        }
      }

      if (this.touch) {
        const t = this.touch;
        const tx = t.x - b.x, ty = t.y - b.y, tz = 0.1 - b.z;
        const td = Math.hypot(tx, ty, tz);
        const reach = 1.15;
        if (td < reach && td > 1e-4) {
          // Falloff squared so the finger grabs a local pocket of the mass and
          // stretches it out, instead of dragging the whole body rigidly.
          const fall = 1 - td / reach;
          const f = t.strength * this.touchForce * fall * fall * dt / td;
          b.vx += tx * f; b.vy += ty * f; b.vz += tz * f;
          b.vx += t.vx * fall * 5.0 * dt;
          b.vy += t.vy * fall * 5.0 * dt;
        }
      }
    }

    // Mutual repulsion — 120 pairs, trivial at this count, and it is what stops
    // the cores collapsing into a single sphere under cohesion.
    for (let i = 0; i < MAX_BALLS; i++) {
      const a = balls[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < MAX_BALLS; j++) {
        const b = balls[j];
        if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        let d = Math.hypot(dx, dy, dz);
        const min = (a.r + b.r) * 0.82;
        if (d < min) {
          if (d < 1e-4) { d = 1e-4; }
          const push = (min - d) / d * 9.0 * dt;
          a.vx -= dx * push; a.vy -= dy * push; a.vz -= dz * push;
          b.vx += dx * push; b.vy += dy * push; b.vz += dz * push;
        }
      }
    }

    const damp = Math.exp(-1.35 * dt);
    const rest = 0.34;
    let ke = 0;

    for (let i = 0; i < MAX_BALLS; i++) {
      const b = balls[i];
      if (!b.alive) continue;

      b.vx *= damp; b.vy *= damp; b.vz *= damp;

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;

      const lx = this.hx - b.r * 0.55;
      const ly = this.hy - b.r * 0.55;
      const lz = this.hz - b.r * 0.4;

      if (b.x < -lx) { b.x = -lx; b.vx = Math.abs(b.vx) * rest; b.vy *= 0.9; }
      else if (b.x > lx) { b.x = lx; b.vx = -Math.abs(b.vx) * rest; b.vy *= 0.9; }
      if (b.y < -ly) { b.y = -ly; b.vy = Math.abs(b.vy) * rest; b.vx *= 0.9; }
      else if (b.y > ly) {
        // The top wall has a hole in it. Reaching it while the port is open is
        // the only way liquid leaves, which is what makes emptying a physical
        // act rather than a button.
        if (this.portOpen && Math.abs(b.x) < PORT_RADIUS) {
          b.alive = false;
          this.events.push('drain');
          continue;
        }
        b.y = ly; b.vy = -Math.abs(b.vy) * rest; b.vx *= 0.9;
      }
      if (b.z < -lz) { b.z = -lz; b.vz = Math.abs(b.vz) * rest; }
      else if (b.z > lz) { b.z = lz; b.vz = -Math.abs(b.vz) * rest; }

      ke += (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz) * b.r;
    }

    const target = Math.min(ke * 0.020, 1);
    this.energy += (target - this.energy) * Math.min(1, dt * (target > this.energy ? 9 : 2.2));

    this.updateBounds();
  }

  updateBounds() {
    // An empty vessel has no bounding sphere. A zero radius makes the shader's
    // ray/sphere test miss every ray, so the raymarch is skipped entirely and
    // the cell simply renders empty — no special case needed in GLSL.
    if (this.volume() === 0) {
      this.boundC.x = this.boundC.y = this.boundC.z = 0;
      this.boundR = 0;
      return;
    }

    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
    for (let i = 0; i < MAX_BALLS; i++) {
      const b = this.balls[i];
      if (!b.alive) continue;
      const e = b.r + this.tension;
      if (b.x - e < minX) minX = b.x - e;
      if (b.y - e < minY) minY = b.y - e;
      if (b.z - e < minZ) minZ = b.z - e;
      if (b.x + e > maxX) maxX = b.x + e;
      if (b.y + e > maxY) maxY = b.y + e;
      if (b.z + e > maxZ) maxZ = b.z + e;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    this.boundC.x = cx; this.boundC.y = cy; this.boundC.z = cz;
    this.boundR = Math.hypot(maxX - cx, maxY - cy, maxZ - cz) + 0.06;
  }

  // Pack into the shader's vec4 array. Dead slots are parked far enough out
  // that the smooth-min in the shader cannot reach them.
  writeUniform(arr) {
    for (let i = 0; i < MAX_BALLS; i++) {
      const b = this.balls[i];
      const o = i * 4;
      if (b.alive) {
        arr[o] = b.x; arr[o + 1] = b.y; arr[o + 2] = b.z; arr[o + 3] = b.r;
      } else {
        arr[o] = PARKED; arr[o + 1] = PARKED; arr[o + 2] = PARKED; arr[o + 3] = 0;
      }
    }
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
