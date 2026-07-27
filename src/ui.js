// Instrument overlay: intro gate, one-time gesture teaching, live telemetry,
// and the manual gravity control used when no sensor reports.

const MATERIALS = ['CHROME', 'CHROME/GLASS', 'GLASS', 'GLASS/OBSIDIAN', 'OBSIDIAN'];

export class UI {
  constructor() {
    this.intro = document.getElementById('intro');
    this.begin = document.getElementById('begin');
    this.note = document.getElementById('intro-note');
    this.hud = document.getElementById('hud');
    this.hint = document.getElementById('hint');
    this.puck = document.getElementById('puck');
    this.bead = document.getElementById('bead');

    this.vMat = document.getElementById('v-mat');
    this.vTension = document.getElementById('v-tension');
    this.vMass = document.getElementById('v-mass');
    this.vFps = document.getElementById('v-fps');
    this.vSource = document.getElementById('v-source');
    this.sourceDot = document.getElementById('source-dot');

    this.hintQueue = [];
    this.hintTimer = 0;
    this.hintActive = false;
    this.firstGestureSeen = false;

    this.puckDrag = null;
    this.onManual = null;
  }

  // Framed pages cannot reach the motion sensors unless the embedder granted
  // it, so offer the top-level URL rather than silently losing the best part.
  showFramedNote() {
    if (window.self === window.top) return;
    this.note.innerHTML =
      'Open <a href="' + location.href + '" target="_blank" rel="noopener">full screen</a> ' +
      'for tilt control.';
    this.note.hidden = false;
  }

  onBegin(fn) {
    const go = (e) => {
      e.preventDefault();
      this.begin.removeEventListener('click', go);
      fn();
    };
    this.begin.addEventListener('click', go);
  }

  dismissIntro() {
    this.intro.classList.add('gone');
    this.hud.classList.add('live');
    setTimeout(() => { this.intro.hidden = true; }, 900);
  }

  queueHints(list) {
    this.hintQueue = list.slice();
  }

  // Hints advance on a timer but stop the moment the first gesture lands —
  // nobody needs to be told how to touch a screen twice.
  tickHints(dt) {
    if (this.firstGestureSeen || this.hintQueue.length === 0) return;
    this.hintTimer -= dt;
    if (this.hintTimer > 0) return;

    if (this.hintActive) {
      this.hint.classList.remove('show');
      this.hintActive = false;
      this.hintTimer = 0.45;
      return;
    }
    const next = this.hintQueue.shift();
    if (!next) { this.hint.classList.remove('show'); return; }
    this.hint.textContent = next;
    this.hint.classList.add('show');
    this.hintActive = true;
    this.hintTimer = 2.6;
  }

  markGesture() {
    if (this.firstGestureSeen) return;
    this.firstGestureSeen = true;
    this.hintQueue.length = 0;
    this.hint.classList.remove('show');
  }

  setSource(kind) {
    const labels = {
      sensor: 'MOTION SENSOR',
      manual: 'MANUAL VECTOR',
      pointer: 'POINTER VECTOR',
      idle: 'CALIBRATING',
    };
    this.vSource.textContent = labels[kind] || kind.toUpperCase();
    this.sourceDot.classList.toggle('on', kind === 'sensor');
  }

  enablePuck(onManual) {
    this.onManual = onManual;
    this.puck.classList.add('on');
    this.puck.tabIndex = 0;
    this.setBead(0, 1);

    const rectOf = () => this.puck.getBoundingClientRect();

    const apply = (cx, cy) => {
      const r = rectOf();
      const half = r.width / 2;
      let nx = (cx - (r.left + half)) / half;
      let ny = (cy - (r.top + half)) / half;
      const l = Math.hypot(nx, ny);
      if (l > 1) { nx /= l; ny /= l; }
      this.setBead(nx, ny);
      // Screen y grows downward; world y grows upward.
      this.onManual(nx, -ny);
    };

    this.puck.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.puck.setPointerCapture(e.pointerId);
      this.puckDrag = e.pointerId;
      apply(e.clientX, e.clientY);
    });
    this.puck.addEventListener('pointermove', (e) => {
      if (this.puckDrag !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      apply(e.clientX, e.clientY);
    });
    const end = (e) => {
      if (this.puckDrag !== e.pointerId) return;
      this.puckDrag = null;
    };
    this.puck.addEventListener('pointerup', end);
    this.puck.addEventListener('pointercancel', end);

    this.puck.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!step) return;
      e.preventDefault();
      this.setBead(step[0], step[1]);
      this.onManual(step[0], -step[1]);
    });
  }

  setBead(nx, ny) {
    const r = this.puck.getBoundingClientRect();
    const half = (r.width || 84) / 2;
    this.bead.style.transform =
      `translate(${half + nx * (half - 10)}px, ${half + ny * (half - 10)}px)`;
  }

  updateTelemetry(sim, fps, tier) {
    const m = sim.material;
    this.vMat.textContent = MATERIALS[Math.round(m * 2)] || MATERIALS[0];
    this.vTension.textContent = sim.tension.toFixed(3);
    let n = 0;
    for (const b of sim.balls) if (b.alive) n++;
    this.vMass.textContent = String(n).padStart(2, '0') + ' / 16';
    this.vFps.textContent = String(Math.round(fps)).padStart(2, '0') + ' · ' + tier;
  }

  fail(msg) {
    const el = document.getElementById('unsupported');
    el.querySelector('p').textContent = msg;
    el.classList.add('on');
    this.intro.hidden = true;
  }
}
