/* THE DARKROOM — photochemical engine.
   Room atmosphere: three.js (grain field, safelight, enlarger beam, dust, window).
   Prints: per-print 2D "veil" canvases; development is time + agitation, never a spotlight. */

import * as THREE from 'three';

/* ── content ─────────────────────────────────────────── */

const SVG_DARKROOM = `
<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#b8b1a6" stroke-width="2.5">
  <rect x="88" y="8" width="24" height="14"/>
  <path d="M100 22 L64 86 H136 Z" stroke="none" fill="#b8b1a6" opacity="0.14"/>
  <line x1="100" y1="22" x2="64" y2="86"/><line x1="100" y1="22" x2="136" y2="86"/>
  <rect x="52" y="86" width="96" height="26"/>
  <rect x="66" y="94" width="68" height="12" fill="#b8b1a6" opacity="0.35" stroke="none"/>
  <line x1="30" y1="112" x2="170" y2="112"/>
</svg>`;

const SVG_REPO = `
<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#b8b1a6" stroke-width="2.5">
  <path d="M40 110 V38"/><path d="M40 62 C40 46 74 54 74 38"/>
  <circle cx="40" cy="26" r="7"/><circle cx="74" cy="26" r="7"/><circle cx="40" cy="110" r="7"/>
  <g fill="#b8b1a6" stroke="none" opacity="0.8">
    <rect x="104" y="24" width="12" height="12"/><rect x="122" y="24" width="12" height="12" opacity="0.35"/>
    <rect x="140" y="24" width="12" height="12" opacity="0.6"/><rect x="158" y="24" width="12" height="12"/>
    <rect x="104" y="42" width="12" height="12" opacity="0.45"/><rect x="122" y="42" width="12" height="12"/>
    <rect x="140" y="42" width="12" height="12" opacity="0.25"/><rect x="158" y="42" width="12" height="12" opacity="0.7"/>
  </g>
  <path d="M104 78 H170 M104 92 H154 M104 106 H166" opacity="0.6"/>
</svg>`;

const FRAMES = [
  { id: 'f01', num: '01', title: 'THE DARKROOM', sub: 'experiment 001 · this site', svg: SVG_DARKROOM,
    url: 'https://github.com/izelniego/mobile-scratchpad/tree/main/darkroom', pencil: 'KEEP' },
  { id: 'f02', num: '02', title: 'MOBILE-SCRATCHPAD', sub: 'the lab itself · all experiments', svg: SVG_REPO,
    url: 'https://github.com/izelniego/mobile-scratchpad' },
  { id: 'f03', num: '03', empty: true },
  { id: 'f04', num: '04', empty: true },
  { id: 'f05', num: '05', empty: true },
  { id: 'f06', num: '06', endroll: true },
];

/* ── environment ─────────────────────────────────────── */

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dpr = Math.min(devicePixelRatio || 1, 2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const store = {
  get: (k) => { try { return localStorage.getItem('darkroom.' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('darkroom.' + k, v); } catch {} },
};

let autoDevelop = reducedMotion;
let soundOn = false;
let fogLevel = 0, fogTarget = 0;
let flashLevel = 0;
let windowOpen = 0, windowTarget = 0;
let pointerPx = { x: -9999, y: -9999 }, pointerEnergy = 0;

/* ── audio ───────────────────────────────────────────── */

const audio = (() => {
  let ctx = null, master = null, hum = null;
  const ensure = () => {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 55;
    const og = ctx.createGain(); og.gain.value = 0.012;
    osc.connect(og).connect(master); osc.start();
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const ng = ctx.createGain(); ng.gain.value = 0.008;
    src.connect(lp).connect(ng).connect(master); src.start();
    hum = master;
  };
  const blip = (freq, dur, gain, type = 'sine') => {
    if (!ctx || !soundOn) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur);
  };
  let swishGain = null;
  const ensureSwish = () => {
    if (swishGain || !ctx) return;
    const len = ctx.sampleRate * 1.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
    swishGain = ctx.createGain(); swishGain.gain.value = 0;
    src.connect(bp).connect(swishGain).connect(master); src.start();
  };
  return {
    setSwish(level) {
      if (!ctx || !soundOn) return;
      ensureSwish();
      swishGain.gain.setTargetAtTime(Math.min(level, 1) * 0.06, ctx.currentTime, 0.08);
    },
    enable() { ensure(); ctx.resume(); master.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.4); },
    disable() { if (master) master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2); },
    tick() { blip(1150, 0.04, 0.025, 'square'); },
    chime() { blip(660, 0.12, 0.04); setTimeout(() => blip(880, 0.16, 0.04), 110); },
    stampThunk() { blip(180, 0.09, 0.06, 'triangle'); },
    fogThump() { blip(90, 0.4, 0.09, 'sawtooth'); },
  };
})();

/* ── room renderer (three.js) ────────────────────────── */

const roomCanvas = document.getElementById('room');
const renderer = new THREE.WebGLRenderer({ canvas: roomCanvas, antialias: false });
renderer.setPixelRatio(dpr);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10); // px space, y down

const roomUniforms = {
  uTime: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uSafelight: { value: new THREE.Vector2(0, 0) },
  uEnlarger: { value: new THREE.Vector2(0, 0) },
  uTray: { value: new THREE.Vector4(0, 0, 0, 0) },
  uWindow: { value: new THREE.Vector4(0, 0, 0, 0) },
  uWindowOpen: { value: 0 },
  uFlash: { value: 0 },
  uFog: { value: 0 },
  uPointer: { value: new THREE.Vector2(-9999, -9999) },
  uPointerEnergy: { value: 0 },
  uAgit: { value: new THREE.Vector3(-9999, -9999, 0) }, // x, y, flow — live chemistry
};

const roomMat = new THREE.ShaderMaterial({
  uniforms: roomUniforms,
  depthTest: false,
  depthWrite: false,
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform float uTime, uWindowOpen, uFlash, uFog, uPointerEnergy;
    uniform vec2 uRes, uSafelight, uEnlarger, uPointer;
    uniform vec3 uAgit;
    uniform vec4 uTray, uWindow;

    float hash(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.23);
      return fract(p.x * p.y);
    }
    float noise2(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float rectMask(vec2 p, vec4 r, float soft) {
      vec2 d = min(p - r.xy, r.xy + r.zw - p);
      return smoothstep(0.0, soft, min(d.x, d.y));
    }

    void main() {
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;   // y down, matches DOM
      vec3 col = vec3(0.020, 0.012, 0.010);

      // film grain, quantized to a filmic cadence, excited near the pointer
      float cadence = floor(uTime * 12.0);
      float g = hash(floor(px * 0.5) + cadence * 7.31);
      float excite = exp(-distance(px, uPointer) / 190.0) * uPointerEnergy;
      col += vec3(0.085, 0.045, 0.036) * g * (1.0 + excite * 2.6);

      // safelight: local lamp glow + broad wash from above
      float dLamp = distance(px, uSafelight);
      col += vec3(1.0, 0.16, 0.09) * exp(-dLamp / 240.0) * 0.24;
      col += vec3(0.30, 0.045, 0.028) * exp(-px.y / (uRes.y * 0.9)) * 0.55;

      // enlarger beam: cone from lens to tray, plus pooled light on the paper
      vec2 trayC = vec2(uTray.x + uTray.z * 0.5, uTray.y);
      if (uTray.z > 1.0) {
        float t = clamp((px.y - uEnlarger.y) / max(trayC.y - uEnlarger.y, 1.0), 0.0, 1.0);
        float cx = mix(uEnlarger.x, trayC.x, t);
        float hw = mix(7.0, uTray.z * 0.46, pow(t, 0.85));
        float inCone = smoothstep(hw, hw * 0.25, abs(px.x - cx))
                     * step(uEnlarger.y, px.y) * step(px.y, trayC.y + uTray.w * 0.2);
        float beamGlow = inCone * (0.085 + 0.03 * noise2(vec2(px.y * 0.02, uTime * 0.7)));
        float pool = rectMask(px, uTray, 40.0) * 0.045;
        col += vec3(1.0, 0.42, 0.30) * (beamGlow + pool) * (1.0 + uFlash * 9.0);
      }

      // live chemistry: agitation rings spread through the room's light
      if (uAgit.z > 0.01) {
        float dAgit = distance(px, uAgit.xy);
        float ring = sin(dAgit * 0.055 - uTime * 6.5) * 0.5 + 0.5;
        col += vec3(1.0, 0.40, 0.28) * ring * exp(-dAgit / 260.0) * 0.05 * uAgit.z;
      }

      // the window at night (behind the blackout curtain)
      float inWin = rectMask(px, uWindow, 6.0) * uWindowOpen;
      if (inWin > 0.001) {
        vec2 wuv = (px - uWindow.xy) / max(uWindow.zw, vec2(1.0));
        vec3 night = vec3(0.012, 0.022, 0.05);
        float sp = hash(floor(px * 0.7) + floor(uTime * 9.0) * 3.17);
        night += vec3(0.35, 0.75, 0.95) * smoothstep(0.935, 1.0, sp) * 0.85;
        float cloud = noise2(vec2(wuv.x * 3.0 + uTime * 0.05, wuv.y * 4.0));
        night += vec3(0.55, 0.62, 0.72) * smoothstep(0.55, 0.9, cloud)
               * smoothstep(0.9, 0.55, wuv.y) * smoothstep(0.25, 0.6, wuv.y) * 0.30;
        // the treeline from the source clip, shivering in the static
        float ridge = 0.68 + 0.10 * noise2(vec2(wuv.x * 6.0, 3.7)) + 0.03 * noise2(vec2(wuv.x * 22.0, 8.1));
        float trees = smoothstep(ridge, ridge + 0.03, wuv.y);
        night = mix(night, night * 0.10 + vec3(0.004, 0.010, 0.016), trees);
        col = mix(col, night, inWin);
      }

      // vignette: the room falls away at its corners
      vec2 q = vUv * (1.0 - vUv);
      col *= 0.35 + 0.65 * pow(q.x * q.y * 15.0, 0.45);

      // fogging catastrophe
      col = mix(col, vec3(0.94, 0.91, 0.85), uFog);

      gl_FragColor = vec4(col, 1.0);
    }`,
});

const roomQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), roomMat);
roomQuad.frustumCulled = false;
scene.add(roomQuad);

/* dust motes in the enlarger beam */

const DUST_N = reducedMotion ? 0 : 240;
const dust = [];
let dustPoints = null;
if (DUST_N) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST_N * 3), 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  for (let i = 0; i < DUST_N; i++) {
    dust.push({ t: Math.random(), r: Math.random() * 2 - 1, ph: Math.random() * 6.28, sp: 0.3 + Math.random() * 0.9 });
  }
  dustPoints = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffb9a6, size: 2.2, sizeAttenuation: false,
    transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthTest: false,
  }));
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);
}

/* adaptive quality: grain is noise — it survives upscaling. When frames run
   long (software GL, weak GPUs) the room renders smaller and stretches. */
let quality = innerWidth * innerHeight > 1.05e6 ? 0.7 : 1;
function resizeRoom() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(dpr * quality);
  renderer.setSize(w, h, false);
  roomCanvas.style.width = '100%';
  roomCanvas.style.height = '100%';
  camera.right = w; camera.bottom = h; camera.top = 0; camera.left = 0;
  camera.updateProjectionMatrix();
  roomUniforms.uRes.value.set(w, h);
}
addEventListener('resize', resizeRoom);
resizeRoom();

let frameCount = 0, frameTimeAcc = 0, raiseStreak = 0;
function adaptQuality(dt) {
  frameCount++; frameTimeAcc += dt;
  if (frameCount < 40) return;
  const avgFps = frameCount / frameTimeAcc;
  frameCount = 0; frameTimeAcc = 0;
  if (avgFps < 54 && quality > 0.25) {
    raiseStreak = 0;
    quality = Math.max(quality * 0.65, 0.25); resizeRoom();
  } else if (avgFps > 59 && quality < 1 && ++raiseStreak >= 2) {
    raiseStreak = 0;
    quality = Math.min(quality * 1.15, 1); resizeRoom();
  }
}

/* ── veil grain tiles ────────────────────────────────── */

const grainTiles = [];
const grainPatterns = [];
{
  const pctx = document.createElement('canvas').getContext('2d');
  for (let t = 0; t < 4; t++) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      img.data[i] = v; img.data[i + 1] = v * 0.92; img.data[i + 2] = v * 0.88;
      img.data[i + 3] = Math.random() * 70;
    }
    g.putImageData(img, 0, 0);
    grainTiles.push(c);
    grainPatterns.push(pctx.createPattern(c, 'repeat'));
  }
}

/* ── the print: a develop-able surface ───────────────── */

const prints = [];
const developing = new Set();

class Print {
  constructor(el, opts = {}) {
    this.el = el;
    this.id = el.dataset.print;
    this.opts = opts;
    this.holding = false;
    this.autoRun = false;
    this.complete = false;
    this.fixed = store.get('fixed.' + this.id) === '1';
    this.fogged = false;
    this.solarized = false;
    this.overHold = 0;
    this.devTime = 0;
    this.agit = { x: 0.5, y: 0.5 };

    this.veil = document.createElement('canvas');
    this.veil.className = 'veil';
    this.veil.setAttribute('aria-hidden', 'true');
    el.appendChild(this.veil);
    this.ctx = this.veil.getContext('2d');

    this.resize();
    const gw = this.gw, gh = this.gh;
    this.dev = new Float32Array(gw * gh);
    this.weight = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const dx = x / gw - 0.5, dy = y / gh - 0.5;
      this.weight[y * gw + x] = clamp(0.62 + 0.55 * Math.exp(-(dx * dx + dy * dy) / 0.16)
        + (Math.random() - 0.5) * 0.28, 0.4, 1.3);
    }
    this.low = document.createElement('canvas');
    this.low.width = gw; this.low.height = gh;
    this.lowCtx = this.low.getContext('2d');
    this.img = this.lowCtx.createImageData(gw, gh);

    if (!opts.fixStampless) {
      this.stamp = document.createElement('button');
      this.stamp.className = 'fix-stamp';
      this.stamp.textContent = 'FIX';
      this.stamp.setAttribute('aria-label', 'Fix this print so it survives the light and future visits');
      el.appendChild(this.stamp);
      this.stamp.addEventListener('click', (e) => { e.stopPropagation(); this.fix(); });
    }

    this.bindPointer();
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === el) {
        e.preventDefault();
        if (!this.complete) this.quickDevelop();
      }
    });
    // keyboard-only accommodation: focus arriving via focus-visible develops the
    // print, but a mouse/touch press that happens to focus it must not shortcut
    // the hold mechanic
    el.addEventListener('focusin', () => {
      if (!this.complete && el.matches(':focus-visible, :has(:focus-visible)')) this.quickDevelop();
    });

    if (this.fixed || autoDevelop) this.instant(this.fixed);
    else this.render();
  }

  bindPointer() {
    const v = this.veil;
    v.addEventListener('pointerdown', (e) => {
      if (this.complete) return;
      v.setPointerCapture(e.pointerId);
      this.holding = true;
      this.setAgit(e);
      developing.add(this);
      audio.enable && soundOn && audio.tick();
    });
    v.addEventListener('pointermove', (e) => { if (this.holding) this.setAgit(e); });
    const stop = () => {
      this.holding = false;
      // only drop the veil's pointer shield after the hold ends, so the release
      // of a develop-hold can never click through to a link underneath
      if (this.complete && !this.veil.classList.contains('done')) {
        setTimeout(() => this.veil.classList.add('done'), 120);
      }
    };
    v.addEventListener('pointerup', stop);
    v.addEventListener('pointercancel', stop);
    v.addEventListener('lostpointercapture', stop);
    this.el.addEventListener('click', (e) => {
      if (performance.now() - (this.completedAt || -1e9) < 600) {
        e.preventDefault(); e.stopPropagation();
      }
    }, true);
  }

  setAgit(e) {
    const r = this.el.getBoundingClientRect();
    const nx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
    // agitation is chemistry: moving the developer feeds the reaction
    this.flow = Math.min((this.flow || 0) + Math.hypot(nx - this.agit.x, ny - this.agit.y) * 6, 2.2);
    this.agit.x = nx; this.agit.y = ny;
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    const scale = Math.min(dpr, 1.5);
    this.veil.width = Math.max(2, Math.round(r.width * scale));
    this.veil.height = Math.max(2, Math.round(r.height * scale));
    const gw = 32;
    this.gw = gw;
    this.gh = Math.max(6, Math.round(gw * (r.height / Math.max(r.width, 1))));
  }

  step(dt) {
    if (this.complete && this.holding && !this.solarized) {
      this.overHold += dt;
      if (this.overHold > 2.2) this.sabattier();
      return;
    }
    if (this.complete) return;
    const holding = this.holding || this.autoRun;
    if (!holding) { developing.delete(this); this.render(); return; }

    this.devTime += dt;
    this.flow = Math.max((this.flow || 0) - dt * 2.2, 0);
    const gw = this.gw, gh = this.gh;
    const ax = this.agit.x * gw, ay = this.agit.y * gh;
    const speed = this.opts.speed || 1;
    // swirling the developer feeds the whole sheet; a still hold barely simmers
    const agitBoost = 0.55 + Math.min(this.flow, 1.6);
    const base = (this.autoRun ? 1.4 : 0.30 * agitBoost) * speed;
    const mult = this.fogged ? 1.55 : 1.0;
    let sum = 0, wsum = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      const dx = (x - ax) / gw, dy = (y - ay) / gh;
      const gauss = this.autoRun ? 0 : Math.exp(-(dx * dx + dy * dy) / 0.045) * 1.5 * agitBoost * speed;
      this.dev[i] = Math.min(this.dev[i] + (base + gauss) * this.weight[i] * mult * dt, 1.8);
      sum += Math.min(this.dev[i], 1) * this.weight[i]; wsum += this.weight[i];
    }
    // coach the chemistry once: a long still hold earns a nudge, not a stall
    if (!this.autoRun && !this.coached && this.devTime > 2.4 && this.flow < 0.12 && this.opts.onStill) {
      this.coached = true;
      this.opts.onStill(this);
    }
    this.render();
    if (sum / wsum > 0.93) this.finish();
  }

  render() {
    const { gw, gh, img } = this;
    // rebuild the grain field at half cadence; the liquid shimmer keeps 60fps
    this.renderTick = (this.renderTick || 0) + 1;
    if (this.renderTick % 2 === 0 && this.holding) { this.compose(); return; }
    const d = img.data;
    const fog = this.fogged;
    for (let i = 0; i < gw * gh; i++) {
      const v = this.dev[i];
      const o = i * 4;
      if (v <= 1) {
        const n = (Math.random() - 0.5) * 10;
        d[o] = (fog ? 46 : 27) + n; d[o + 1] = (fog ? 42 : 12) + n * 0.8; d[o + 2] = (fog ? 39 : 9) + n * 0.7;
        // the exposure flash prints through: the veil thins and the latent image shows
        d[o + 3] = (1 - v) * 250 * (this.opts.latent ? 1 - flashLevel * 0.5 : 1);
      } else {
        d[o] = 0; d[o + 1] = 0; d[o + 2] = 0;
        d[o + 3] = Math.min((v - 1) * 0.95, 0.72) * 255;
      }
    }
    this.lowCtx.putImageData(img, 0, 0);
    this.compose();
  }

  compose() {
    const { gw, gh } = this;
    const c = this.ctx, W = this.veil.width, H = this.veil.height;
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = true;
    if (this.holding && !reducedMotion) {
      // developer liquid: the veil sloshes in horizontal bands while agitating
      const t = performance.now() / 1000;
      const amp = (1.5 + Math.min(this.flow || 0, 1.6) * 4) * (W / 900);
      const bands = 10, bh = Math.ceil(gh / bands);
      for (let b = 0; b < bands; b++) {
        const sy = b * bh, sh = Math.min(bh, gh - sy);
        if (sh <= 0) break;
        const off = Math.sin(t * 5 + b * 1.1) * amp;
        c.drawImage(this.low, 0, sy, gw, sh, off, sy / gh * H, W, sh / gh * H + 1);
      }
    } else {
      c.drawImage(this.low, 0, 0, W, H);
    }
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = 0.55;
    c.fillStyle = grainPatterns[(Math.random() * grainPatterns.length) | 0];
    c.save();
    c.translate((Math.random() * 64) | 0, (Math.random() * 64) | 0);
    c.fillRect(-64, -64, W + 128, H + 128);
    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  finish(silent = false) {
    this.complete = true;
    if (!silent) navigator.vibrate?.(18);
    this.completedAt = performance.now();
    this.autoRun = false;
    developing.delete(this);
    this.dev.fill(Math.max(1, this.dev[0]));
    this.ctx.clearRect(0, 0, this.veil.width, this.veil.height);
    if (!this.holding) this.veil.classList.add('done');
    if (this.stamp && !this.fixed) this.stamp.classList.add('show');
    if (!silent) audio.chime();
    this.opts.onDeveloped && this.opts.onDeveloped(this);
  }

  instant(fixed = false) {
    this.dev.fill(1);
    this.finish(true);
    if (fixed && this.stamp) {
      this.stamp.classList.add('show', 'fixed');
      this.stamp.textContent = 'FIXED';
      this.stamp.disabled = true;
    }
  }

  quickDevelop() {
    if (this.complete || this.autoRun) return;
    this.autoRun = true;
    developing.add(this);
  }

  fix() {
    if (this.fixed) return;
    this.fixed = true;
    store.set('fixed.' + this.id, '1');
    this.stamp.classList.add('fixed');
    this.stamp.textContent = 'FIXED';
    this.stamp.disabled = true;
    this.stamp.setAttribute('aria-label', 'Fixed. This print survives the light and future visits.');
    audio.stampThunk();
    this.opts.onFixed && this.opts.onFixed(this);
  }

  fog() {
    if (this.fixed || !this.complete) return;
    this.complete = false;
    this.solarized = false;
    this.overHold = 0;
    this.fogged = true;
    this.dev.fill(0);
    this.veil.classList.remove('done');
    if (this.stamp) this.stamp.classList.remove('show');
    this.render();
  }

  sabattier() {
    this.solarized = true;
    this.el.classList.add('solarized');
    setTimeout(() => this.el.classList.remove('solarized'), 1400);
    this.opts.onSabattier && this.opts.onSabattier(this);
  }
}

/* ── build the contact sheet ─────────────────────────── */

const sheet = document.getElementById('sheet');
for (const f of FRAMES) {
  const el = document.createElement('article');
  el.className = 'frame' + (f.empty ? ' empty' : '') + (f.endroll ? ' endroll' : '');
  el.dataset.print = f.id;

  if (f.endroll) {
    el.innerHTML = `<span>— END&nbsp;OF&nbsp;ROLL —</span>`;
    sheet.appendChild(el);
    continue;
  }

  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', f.empty
    ? `Frame ${f.num}: empty, awaiting exposure. Hold or press Enter to develop.`
    : `Frame ${f.num}: ${f.title}. Hold or press Enter to develop.`);

  el.innerHTML = f.empty
    ? `<span class="frame-num">${f.num}</span>
       <div class="frame-visual"><span class="await-stamp">AWAITING&nbsp;EXPOSURE</span></div>`
    : `<span class="frame-num">${f.num}</span>
       <div class="frame-visual">${f.svg}</div>
       <p class="frame-caption">${f.title}<small>${f.sub}</small></p>
       <a class="frame-link" href="${f.url}" aria-label="${f.title} — ${f.sub}"></a>`;

  if (f.pencil) {
    const circ = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    circ.setAttribute('class', 'pencil-circle');
    circ.setAttribute('viewBox', '0 0 220 150');
    circ.innerHTML = `
      <path d="M28 72 C 24 30, 96 12, 152 22 C 208 32, 206 96, 168 122 C 130 148, 44 140, 30 100 C 24 84 26 78 30 70"/>
      <text x="30" y="26" transform="rotate(-4 30 26)">${f.pencil}</text>`;
    el.appendChild(circ);
  }
  sheet.appendChild(el);
}

/* ── wire prints ─────────────────────────────────────── */

const heroHint = document.getElementById('heroHint');
const doorLog = document.getElementById('doorLog');

const heroPrint = new Print(document.getElementById('printHero'), {
  latent: true,
  onStill: () => { heroHint.textContent = 'SWIRL THE DEVELOPER OVER IT — AGITATION FEEDS THE IMAGE.'; },
  onDeveloped: (p) => {
    heroHint.textContent = p.fixed ? 'FIXED. IT SURVIVES THE LIGHT.' : 'GOOD. NOW FIX IT — OR IT WON’T SURVIVE THE LIGHT.';
  },
  onFixed: () => { heroHint.textContent = 'FIXED. IT SURVIVES THE LIGHT.'; },
  onSabattier: () => { heroHint.textContent = 'SABATTIER. YOU RE-EXPOSED IT — MAN RAY DID IT ON PURPOSE TOO.'; },
});
prints.push(heroPrint);

for (const f of FRAMES) {
  if (f.endroll) continue;
  const el = sheet.querySelector(`[data-print="${f.id}"]`);
  prints.push(new Print(el, {
    speed: 2.4,
    onDeveloped: () => {
      if (f.pencil) el.querySelector('.pencil-circle')?.classList.add('drawn');
    },
  }));
}

prints.push(new Print(document.getElementById('printVerso'), { speed: 1.7 }));

/* ── process timer (seven-segment, authored) ─────────── */

const SEG = { // segments a-g as [x,y,w,h,horizontal]
  a: [4, 0, 14, 4], b: [18, 3, 4, 14], c: [18, 21, 4, 14], d: [4, 34, 14, 4],
  e: [0, 21, 4, 14], f: [0, 3, 4, 14], g: [4, 17, 14, 4],
};
const DIGIT = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
  5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd',
};
const timerGroup = document.getElementById('timerDigits');
const digitEls = [];
if (timerGroup) {
  const xs = [0, 28, 66, 94];
  for (let d = 0; d < 4; d++) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${xs[d]},0)`);
    const segs = {};
    for (const [name, [x, y, w, h]] of Object.entries(SEG)) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y);
      r.setAttribute('width', w); r.setAttribute('height', h);
      r.setAttribute('fill', '#ff3b2a'); r.setAttribute('opacity', '0.12');
      g.appendChild(r); segs[name] = r;
    }
    timerGroup.appendChild(g); digitEls.push(segs);
  }
  for (const y of [12, 26]) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    dot.setAttribute('x', 57); dot.setAttribute('y', y);
    dot.setAttribute('width', 4); dot.setAttribute('height', 4);
    dot.setAttribute('fill', '#ff3b2a'); dot.setAttribute('opacity', '0.7');
    timerGroup.appendChild(dot);
  }
}
function setTimer(seconds) {
  const m = Math.floor(seconds / 60) % 100, s = Math.floor(seconds) % 60;
  const str = String(m).padStart(2, '0') + String(s).padStart(2, '0');
  for (let i = 0; i < 4; i++) {
    const lit = DIGIT[str[i]];
    for (const [name, r] of Object.entries(digitEls[i])) {
      r.setAttribute('opacity', lit.includes(name) ? '0.95' : '0.12');
    }
  }
}
setTimer(0);

/* ── instruments ─────────────────────────────────────── */

const soundBtn = document.getElementById('soundToggle');
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.querySelector('.state').textContent = soundOn ? 'ON' : 'OFF';
  soundOn ? audio.enable() : audio.disable();
});

const autoBtn = document.getElementById('autoToggle');
if (autoDevelop) {
  autoBtn.setAttribute('aria-pressed', 'true');
  autoBtn.querySelector('.state').textContent = 'ON';
}
autoBtn.addEventListener('click', () => {
  autoDevelop = !autoDevelop;
  autoBtn.setAttribute('aria-pressed', String(autoDevelop));
  autoBtn.querySelector('.state').textContent = autoDevelop ? 'ON' : 'OFF';
  if (autoDevelop) for (const p of prints) { if (!p.complete) p.instant(); }
});

/* the pull cord: the one white light, and it is a catastrophe */

const cord = document.getElementById('cord');
const whitelight = document.getElementById('whitelight');
let cordBusy = false;
cord.addEventListener('click', () => {
  if (cordBusy) return;
  cordBusy = true;
  const tag = cord.querySelector('.cord-tag');

  if (reducedMotion || autoDevelop) {
    tag.textContent = 'LIGHTS STAY OFF.';
    setTimeout(() => { tag.innerHTML = 'DO&nbsp;NOT'; cordBusy = false; }, 3000);
    return;
  }

  audio.fogThump();
  navigator.vibrate?.([30, 40, 30]);
  document.title = 'FOGGED · DARKROOM';
  setTimeout(() => { document.title = 'IZEL · DARKROOM'; }, 8000);
  whitelight.style.transition = 'opacity 0.12s ease-in';
  whitelight.style.opacity = '1';
  fogTarget = 1;
  setTimeout(() => {
    const lost = prints.filter((p) => p.complete && !p.fixed).length;
    for (const p of prints) p.fog();
    whitelight.style.transition = 'opacity 1.1s ease-out';
    whitelight.style.opacity = '0';
    fogTarget = 0;
    tag.textContent = 'TOLD YOU.';
    heroHint.textContent = lost
      ? 'FOGGED. UNFIXED PRINTS DON’T SURVIVE THE LIGHT. DEVELOP THEM AGAIN.'
      : 'FOGGED THE BLANKS. FIXED PRINTS DON’T CARE.';
    doorLog.textContent = 'INCIDENT LOGGED · WHITE LIGHT AT ' +
      new Date().toTimeString().slice(0, 5) + ' · ' + lost + ' PRINT(S) LOST';
    setTimeout(() => { tag.innerHTML = 'DO&nbsp;NOT'; cordBusy = false; }, 6000);
  }, 650);
});

/* the window: it's night out there */

const curtain = document.getElementById('curtain');
const windowNote = document.getElementById('windowNote');
curtain.addEventListener('click', () => {
  const open = curtain.getAttribute('aria-expanded') !== 'true';
  curtain.setAttribute('aria-expanded', String(open));
  windowTarget = open ? 1 : 0;
  windowNote.hidden = !open;
});

/* ── restore + log ───────────────────────────────────── */

document.getElementById('versoDate').textContent = String(new Date().getFullYear());
const survived = prints.filter((p) => p.fixed).length;
if (survived) doorLog.textContent = `WELCOME BACK · ${survived} FIXED PRINT(S) SURVIVED`;

console.log(
  '%cDARKROOM LOG',
  'color:#ff3b2a;background:#060403;font-weight:bold;padding:4px 8px;border:1px solid #ff3b2a;',
  '\n' + new Date().toTimeString().slice(0, 5) + ' — safelight on' +
  '\n' + new Date().toTimeString().slice(0, 5) + ' — paper exposed. develop it yourself.' +
  '\ntip: prints you FIX survive the white light.' +
  '\npsst: every print has a negative. press N, twice.'
);

/* the earned secret: the negative. the whole room inverts into the
   source clip's cyan night — red room, meet your complement. */
let lastN = 0;
addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(input|textarea|select)$/i.test(document.activeElement?.tagName || '')) return;
  const now = performance.now();
  if (now - lastN < 600) {
    lastN = 0;
    const on = document.documentElement.classList.toggle('negative');
    doorLog.textContent = on
      ? 'INVERTED · YOU ARE INSIDE THE NEGATIVE NOW'
      : 'POSITIVE RESTORED · ' + new Date().toTimeString().slice(0, 5);
    audio.stampThunk();
  } else {
    lastN = now;
  }
});

/* an authored ending: close the door */
const doorLine = document.querySelector('.door-line');
doorLine.setAttribute('role', 'button');
doorLine.setAttribute('tabindex', '0');
doorLine.setAttribute('aria-label', 'Close the darkroom door');
const goodnight = document.createElement('div');
goodnight.id = 'goodnight';
goodnight.innerHTML = '<span class="gn-lamp"></span><p>GOODNIGHT.</p><p class="gn-sub">THE SAFELIGHT STAYS ON.</p>';
document.body.appendChild(goodnight);
const closeDoor = () => {
  goodnight.classList.add('shut');
  audio.stampThunk();
  setTimeout(() => goodnight.classList.add('lit'), 900);
};
doorLine.addEventListener('click', closeDoor);
doorLine.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeDoor(); } });
goodnight.addEventListener('click', () => goodnight.classList.remove('shut', 'lit'));

/* ── main loop ───────────────────────────────────────── */

const enlargerEl = document.querySelector('.enlarger');
const heroEl = document.getElementById('printHero');
const windowHole = document.getElementById('windowHole');
const lampEl = document.querySelector('.lamp-glass');

addEventListener('pointermove', (e) => {
  pointerPx.x = e.clientX; pointerPx.y = e.clientY;
  pointerEnergy = Math.min(pointerEnergy + 0.15, 1);
}, { passive: true });

/* the instrument rail tucks away while walking down the bench */
const rail = document.querySelector('.rail');
let lastScrollY = scrollY;
addEventListener('scroll', () => {
  const down = scrollY > lastScrollY + 4;
  const up = scrollY < lastScrollY - 4;
  if (down && scrollY > 140) rail.classList.add('tucked');
  else if (up || scrollY <= 140) rail.classList.remove('tucked');
  lastScrollY = scrollY;
}, { passive: true });

let last = performance.now();
let tickAcc = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t = now / 1000;
  if (!reducedMotion) adaptQuality(dt);

  for (const p of [...developing]) p.step(dt);

  if (heroPrint.holding || heroPrint.autoRun) setTimer(heroPrint.devTime);
  if (developing.size && soundOn) {
    tickAcc += dt;
    if (tickAcc >= 1) { tickAcc = 0; audio.tick(); }
    let flow = 0;
    for (const p of developing) if (p.holding) flow = Math.max(flow, p.flow || 0);
    audio.setSwish(flow * 0.6);
  } else if (soundOn) {
    audio.setSwish(0);
  }

  // the exposure flash prints the latent image through the hero veil
  if (flashLevel > 0.02 && !heroPrint.complete && !developing.has(heroPrint)) heroPrint.render();

  fogLevel += (fogTarget - fogLevel) * Math.min(dt * 6, 1);
  windowOpen += (windowTarget - windowOpen) * Math.min(dt * 4, 1);
  pointerEnergy = Math.max(pointerEnergy - dt * 1.4, 0);
  flashLevel = Math.max(flashLevel - dt * 2.5, 0);

  const hr = heroEl.getBoundingClientRect();
  const er = enlargerEl.getBoundingClientRect();
  const wr = windowHole.getBoundingClientRect();
  const lr = lampEl.getBoundingClientRect();

  roomUniforms.uTime.value = reducedMotion ? 40 : t;
  roomUniforms.uTray.value.set(hr.left, hr.top, hr.width, hr.height);
  roomUniforms.uEnlarger.value.set(er.left + er.width / 2, er.top + er.height * 0.8);
  roomUniforms.uWindow.value.set(wr.left, wr.top, wr.width, wr.height);
  roomUniforms.uWindowOpen.value = windowOpen;
  roomUniforms.uSafelight.value.set(lr.left + lr.width / 2, lr.top + lr.height / 2);
  roomUniforms.uFlash.value = flashLevel;
  roomUniforms.uFog.value = fogLevel;
  roomUniforms.uPointer.value.set(pointerPx.x, pointerPx.y);
  roomUniforms.uPointerEnergy.value = pointerEnergy;

  // the room feels the developer being worked
  let agitPrint = null;
  for (const p of developing) if (p.holding) { agitPrint = p; break; }
  const agitV = roomUniforms.uAgit.value;
  if (agitPrint) {
    const pr = agitPrint.el.getBoundingClientRect();
    agitV.set(pr.left + agitPrint.agit.x * pr.width, pr.top + agitPrint.agit.y * pr.height,
      Math.min(agitV.z + dt * 4, 0.35 + Math.min(agitPrint.flow || 0, 1.6)));
  } else {
    agitV.z = Math.max(agitV.z - dt * 2.5, 0);
  }

  if (dustPoints) {
    const pos = dustPoints.geometry.attributes.position.array;
    const ex = er.left + er.width / 2, ey = er.top + er.height * 0.8;
    const tx = hr.left + hr.width / 2, ty = hr.top;
    for (let i = 0; i < DUST_N; i++) {
      const m = dust[i];
      m.t += dt * 0.05 * m.sp;
      if (m.t > 1) { m.t = 0; m.r = Math.random() * 2 - 1; }
      const hw = 7 + (hr.width * 0.46 - 7) * Math.pow(m.t, 0.85);
      pos[i * 3] = ex + (tx - ex) * m.t + m.r * hw * 0.9 + Math.sin(t * m.sp + m.ph) * 7;
      pos[i * 3 + 1] = ey + (ty - ey) * m.t;
      pos[i * 3 + 2] = 1;
    }
    dustPoints.geometry.attributes.position.needsUpdate = true;
    dustPoints.material.opacity = 0.10 + flashLevel * 0.5 +
      (hr.bottom > 0 && hr.top < innerHeight ? 0.16 : 0);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* opening beat: the exposure flash that plants the latent image */
if (!reducedMotion) setTimeout(() => { flashLevel = 1; }, 900);

addEventListener('resize', () => {
  for (const p of prints) { p.resize(); if (!p.complete) p.render(); else p.ctx.clearRect(0, 0, p.veil.width, p.veil.height); }
});

requestAnimationFrame(frame);
