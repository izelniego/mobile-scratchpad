// Instrument overlay: intro gate, one-time gesture teaching, live telemetry,
// and the manual gravity control used when no sensor reports.

const MATERIALS = ['CHROME', 'CHROME/GLASS', 'GLASS', 'GLASS/OBSIDIAN', 'OBSIDIAN'];

// Real surface gravities, as multiples of Earth's. The dial snaps its label to
// whichever body it is near so the number means somewhere you could stand.
const BODIES = [
  [0.00, 'ZERO-G'],
  [0.17, 'MOON'],
  [0.38, 'MARS'],
  [0.91, 'VENUS'],
  [1.00, 'EARTH'],
  [2.53, 'JUPITER'],
];

function gravityLabel(g) {
  for (const [value, name] of BODIES) {
    if (Math.abs(g - value) < 0.035) {
      return value === 0 ? name : `${name} \u00b7 ${g.toFixed(2)} g`;
    }
  }
  return `${g.toFixed(2)} g`;
}

const TILT_COPY = {
  ok:      ['LIVE', ''],
  framed:  ['BLOCKED BY FRAME',
            'This page is embedded, and an embedded page is not granted the motion ' +
            'sensors. Open it full screen and tilt works immediately.'],
  denied:  ['PERMISSION DENIED',
            'Motion access was refused or the prompt was dismissed. Tap enable to ask again.'],
  nosignal:['NO SIGNAL',
            'Permission was granted but no motion events have arrived. Tap enable to retry.'],
  unsupported: ['NO SENSOR',
            'This device reports no motion sensors. Drag the bead to set gravity by hand.'],
  desktop: ['NO SENSOR \u00b7 DESKTOP',
            'Desktops have no accelerometer. Move the pointer to steer gravity instead, ' +
            'or open this on a phone to tilt it.'],
  pending: ['CHECKING', ''],
};

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

    this.controls = document.getElementById('controls');
    this.controlsToggle = document.getElementById('controls-toggle');
    this.controlsClose = document.getElementById('controls-close');
    this.sGravity = document.getElementById('s-gravity');
    this.vGravity = document.getElementById('v-gravity');
    this.sSpectrum = document.getElementById('s-spectrum');
    this.vSpectrum = document.getElementById('v-spectrum');
    this.vTilt = document.getElementById('v-tilt');
    this.tiltWhy = document.getElementById('tilt-why');
    this.enableTilt = document.getElementById('enable-tilt');
    this.fullscreenLink = document.getElementById('fullscreen-link');
    this.introEscape = document.getElementById('intro-escape');
    this.introActions = document.querySelector('.intro-actions');

    this.hintQueue = [];
    this.hintTimer = 0;
    this.hintActive = false;
    this.firstGestureSeen = false;

    this.puckDrag = null;
    this.onManual = null;
  }

  // A framed page cannot reach the motion sensors at all, so the escape becomes
  // the headline action rather than a footnote. Inside the frame location.href
  // is already this document's own URL, and the host only intercepts
  // cross-origin anchor clicks, so this link opens top-level untouched.
  setupEscape(framed) {
    const href = location.href;
    this.framed = framed;
    this.introEscape.href = href;
    this.fullscreenLink.href = href;
    if (!framed) return;

    this.introEscape.hidden = false;
    this.introActions.classList.add('framed');
    this.begin.textContent = 'CONTINUE WITHOUT TILT';
    this.note.textContent =
      'Embedded pages are not granted motion sensors. Full screen restores tilt.';
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

  setSource(kind, reason) {
    // Inside a frame the sensors are unreachable whatever else is also true,
    // and that is the fact worth reporting.
    if (this.framed && kind !== 'sensor') reason = 'framed';
    const labels = {
      sensor: 'MOTION SENSOR',
      manual: 'MANUAL VECTOR',
      pointer: 'POINTER VECTOR',
      idle: 'CALIBRATING',
    };
    const live = kind === 'sensor';
    this.vSource.textContent =
      live ? labels.sensor
           : (reason === 'framed' ? 'TILT BLOCKED \u00b7 FRAMED' : labels[kind] || kind.toUpperCase());
    this.sourceDot.classList.toggle('on', live);
    this.setTiltStatus(live ? 'ok' : (reason || 'pending'));
  }

  setTiltStatus(reason) {
    const [status, why] = TILT_COPY[reason] || TILT_COPY.pending;
    this.vTilt.textContent = status;
    this.tiltWhy.textContent = why;
    this.tiltWhy.hidden = !why;
    // Retry is only meaningful where a permission could still be granted.
    // Retry only where a permission could still be granted. Offering it on a
    // machine with no sensors would just be a button that does nothing.
    this.enableTilt.hidden = !(reason === 'denied' || reason === 'nosignal');
    // Going full screen fixes tilt for any framed failure, not just the one we
    // managed to identify as framing, so offer it whenever we are in a frame.
    this.fullscreenLink.hidden = !(this.framed || reason === 'framed');
  }

  // ------------------------------------------------------------------ drawer

  wireControls({ onGravity, onSpectrum, onEnableTilt }) {
    // Synchronous: the class is the single source of truth for open state, so
    // there is nothing to race and nothing that needs a frame to settle.
    const setOpen = (open) => {
      this.controls.classList.toggle('open', open);
      this.controlsToggle.setAttribute('aria-expanded', String(open));
      this.markGesture();
    };
    const isOpen = () => this.controls.classList.contains('open');

    this.controlsToggle.addEventListener('click', () => setOpen(!isOpen()));
    this.controlsClose.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) setOpen(false);
    });

    // The canvas listens for pointer drags anywhere; without this, sliding a
    // slider would also pull a tendril out of the specimen underneath.
    for (const ev of ['pointerdown', 'pointermove', 'pointerup']) {
      this.controls.addEventListener(ev, (e) => e.stopPropagation());
    }

    const gravity = () => {
      const g = parseFloat(this.sGravity.value);
      this.vGravity.textContent = gravityLabel(g);
      onGravity(g);
    };
    this.sGravity.addEventListener('input', gravity);

    const spectrum = () => {
      const v = parseFloat(this.sSpectrum.value);
      this.vSpectrum.textContent =
        v < 0.02 ? 'NEUTRAL' : `${Math.round(v * 360)}\u00b0`;
      onSpectrum(v);
    };
    this.sSpectrum.addEventListener('input', spectrum);

    this.enableTilt.addEventListener('click', onEnableTilt);

    this.applySettings = ({ gravity: g, spectrum: sp }) => {
      this.sGravity.value = String(g);
      this.sSpectrum.value = String(sp);
      gravity();
      spectrum();
    };
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
