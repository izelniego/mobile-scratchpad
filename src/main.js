import * as THREE from 'three';
import mercuryFrag from './shaders/mercury.frag.glsl';
import bloomFrag from './shaders/bloom.frag.glsl';
import compositeFrag from './shaders/composite.frag.glsl';
import { Sim, MAX_BALLS, PORT_RADIUS } from './physics.js';
import { Input } from './input.js';
import { UI } from './ui.js';

// The host page owns <head> when this runs as an embedded artifact, so the
// viewport is set from script instead of markup. Without this a phone lays the
// page out at 980px and the whole thing renders zoomed out.
(function viewport() {
  let m = document.querySelector('meta[name="viewport"]');
  if (!m) {
    m = document.createElement('meta');
    m.setAttribute('name', 'viewport');
    document.head.appendChild(m);
  }
  m.setAttribute('content',
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
})();

const TIERS = {
  high: { scale: 0.80, steps: 90, inside: 56, dispersion: true },
  mid:  { scale: 0.62, steps: 68, inside: 40, dispersion: false },
  low:  { scale: 0.46, steps: 48, inside: 26, dispersion: false },
};
const ORDER = ['low', 'mid', 'high'];

const FOCAL = 1.15;
const CAM_Z = 3.2;
const K = CAM_Z / FOCAL;          // world units per unit of normalised screen space

const VERT = `
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const ui = new UI();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('gl'),
    antialias: false,           // raymarched edges are shaded, not geometric
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: false,
  });
} catch (e) {
  renderer = null;
}

if (!renderer) {
  ui.fail('This piece needs WebGL, which this browser has turned off or does not support.');
} else {
  boot();
}

function boot() {
  renderer.setPixelRatio(1);      // resolution is managed explicitly below
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const quad = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(quad, null);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const sim = new Sim();
  const ballData = new Float32Array(MAX_BALLS * 4);

  // ---------------------------------------------------------------- materials

  const mercuryUniforms = {
    uRes:     { value: new THREE.Vector2(1, 1) },
    uTime:    { value: 0 },
    uBalls:   { value: ballData },
    uK:       { value: 0.32 },
    uMat:     { value: 0 },
    uBoundC:  { value: new THREE.Vector3() },
    uBoundR:  { value: 1 },
    uEnergy:  { value: 0 },
    uCamPos:  { value: new THREE.Vector3(0, 0, CAM_Z) },
    uFocal:   { value: FOCAL },
    uHue:     { value: 0 },
    uTint:    { value: 0 },
  };

  const mercuryCache = {};
  function mercuryMaterial(tier) {
    if (mercuryCache[tier]) return mercuryCache[tier];
    const t = TIERS[tier];
    const defines =
      `#define MAX_STEPS ${t.steps}\n` +
      `#define INSIDE_STEPS ${t.inside}\n` +
      (t.dispersion ? `#define DISPERSION 1\n` : '');
    mercuryCache[tier] = new THREE.RawShaderMaterial({
      vertexShader: VERT,
      fragmentShader: defines + mercuryFrag,
      uniforms: mercuryUniforms,
      depthTest: false,
      depthWrite: false,
    });
    return mercuryCache[tier];
  }

  const bloomMat = new THREE.RawShaderMaterial({
    vertexShader: VERT,
    fragmentShader: bloomFrag,
    uniforms: {
      uTex:       { value: null },
      uTexel:     { value: new THREE.Vector2() },
      uDir:       { value: new THREE.Vector2(1, 0) },
      uMode:      { value: 0 },
      uThreshold: { value: 0.62 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const compositeMat = new THREE.RawShaderMaterial({
    vertexShader: VERT,
    fragmentShader: compositeFrag,
    uniforms: {
      uScene:         { value: null },
      uBloom:         { value: null },
      uRes:           { value: new THREE.Vector2(1, 1) },
      uTime:          { value: 0 },
      uBloomStrength: { value: 0.6 },
      uAberration:    { value: 0.012 },
      uGrain:         { value: 0.022 },
      uFade:          { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });

  // ---------------------------------------------------------------- targets

  const rtOpts = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
  };
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  const bloomA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
  const bloomB = new THREE.WebGLRenderTarget(1, 1, rtOpts);

  // ---------------------------------------------------------------- sizing

  let tier = matchMedia('(pointer: coarse)').matches ? 'mid' : 'high';
  const forced = new URLSearchParams(location.search).get('q');
  let locked = false;
  if (forced && TIERS[forced]) { tier = forced; locked = true; }

  let cssW = 1, cssH = 1, rtW = 1, rtH = 1;

  function resize() {
    cssW = Math.max(window.innerWidth, 1);
    cssH = Math.max(window.innerHeight, 1);

    renderer.setSize(cssW, cssH, true);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = TIERS[tier].scale;
    rtW = Math.max(2, Math.round(cssW * dpr * s));
    rtH = Math.max(2, Math.round(cssH * dpr * s));

    sceneRT.setSize(rtW, rtH);
    const bw = Math.max(2, rtW >> 2);
    const bh = Math.max(2, rtH >> 2);
    bloomA.setSize(bw, bh);
    bloomB.setSize(bw, bh);

    mercuryUniforms.uRes.value.set(rtW, rtH);
    compositeMat.uniforms.uRes.value.set(cssW, cssH);

    // Container is derived from the visible frustum, so the liquid pools
    // against the real edges of whatever screen this is on.
    const halfH = K * 0.5;
    const halfW = halfH * (cssW / cssH);
    sim.resize(halfW, halfH);

    // Port sits on the top wall, and its on-screen size tracks the aperture.
    const mouth = worldToScreen(0, sim.hy);
    const edge = worldToScreen(PORT_RADIUS, sim.hy);
    ui.placePort(mouth.x, mouth.y, Math.abs(edge.x - mouth.x));
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 220));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- input

  function toWorld(clientX, clientY) {
    const ux = (clientX - cssW / 2) / cssH;
    const uy = -(clientY - cssH / 2) / cssH;
    return { x: ux * K, y: uy * K };
  }

  // The inverse, so the port control can sit exactly on the hole in the top
  // wall rather than approximately near it.
  function worldToScreen(x, y) {
    return {
      x: (x / K) * cssH + cssW / 2,
      y: cssH / 2 - (y / K) * cssH,
    };
  }

  const input = new Input(document.getElementById('gl'), sim, {
    toWorld,
    onFirstGesture: () => ui.markGesture(),
  });

  function haptic(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignored */ } }
  }

  // ---------------------------------------------------------------- settings

  const SETTINGS_KEY = 'mercury.settings.v1';
  const defaults = { gravity: 1, spectrum: 0.72 };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...defaults };
      const v = JSON.parse(raw);
      return {
        gravity: Number.isFinite(v.gravity) ? Math.min(Math.max(v.gravity, 0), 2.5) : defaults.gravity,
        spectrum: Number.isFinite(v.spectrum) ? Math.min(Math.max(v.spectrum, 0), 1) : defaults.spectrum,
      };
    } catch (e) {
      return { ...defaults };
    }
  }

  const settings = loadSettings();

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignored */ }
  }

  function applyGravity(g) {
    settings.gravity = g;
    sim.setGravityScale(g);
    saveSettings();
  }

  // One slider spans neutral through full colour: the first sliver of travel
  // ramps the tint in, and position doubles as hue from there on.
  function applySpectrum(v) {
    settings.spectrum = v;
    mercuryUniforms.uHue.value = v;
    mercuryUniforms.uTint.value = Math.min(Math.max((v - 0.02) / 0.05, 0), 1) * 0.85;
    saveSettings();
  }

  async function retrySensors() {
    const okNow = await input.requestSensors();
    ui.setTiltStatus(okNow ? 'nosignal' : input.reason);
    if (okNow) {
      input.startFallbackWatch((kind, why) => ui.setSource(kind, why));
      haptic(10);
    }
  }

  ui.wirePort((open) => {
    sim.portOpen = open;
    haptic(open ? 14 : 8);
  });

  ui.wireControls({
    onGravity: applyGravity,
    onSpectrum: applySpectrum,
    onEnableTilt: retrySensors,
  });
  ui.applySettings(settings);

  // The escape panel needs to exist before the first status update, since that
  // is what decides whether to show it.
  ui.setupEscape(input.framed);
  ui.setSource('idle', 'pending');

  ui.onBegin(async () => {
    ui.dismissIntro();
    await input.requestSensors();
    ui.setSource(input.permission === 'granted' ? 'sensor' : 'idle', input.reason);

    // Permission granted is not the same as events arriving — a framed page can
    // resolve granted and still never fire. Watch for silence, then hand over.
    input.startFallbackWatch((kind, why) => {
      ui.setSource(kind, why);
      if (kind === 'manual') {
        ui.enablePuck((x, y) => input.setManualGravity(x, y));
        ui.queueHints(['DRAG THE BEAD TO SET GRAVITY']);
      }
    });

    ui.queueHints([
      'TILT TO POUR',
      'DRAG TO STRETCH',
      'TAP TO ADD A DROP',
      'PINCH TO CHANGE STATE',
      'SHAKE TO SHATTER',
      'TAP TO ADD \u00b7 OPEN THE PORT TO POUR',
    ]);
    haptic(12);
  });

  // ---------------------------------------------------------------- loop

  let last = performance.now();
  let ema = 16.7;
  let hot = 0, cold = 0, cooldown = 0;
  let fade = 0;
  let fpsShown = 60;
  let running = true;

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });

  function setTier(next) {
    if (next === tier) return;
    tier = next;
    resize();
    cooldown = 90;
  }

  function adapt() {
    if (locked) return;
    if (cooldown > 0) { cooldown--; return; }

    if (ema > 21) { hot++; cold = 0; } else if (ema < 13) { cold++; hot = 0; } else { hot = 0; cold = 0; }

    if (hot > 45) {
      hot = 0;
      const i = ORDER.indexOf(tier);
      if (i > 0) setTier(ORDER[i - 1]);
    } else if (cold > 200) {
      cold = 0;
      const i = ORDER.indexOf(tier);
      if (i < ORDER.length - 1) setTier(ORDER[i + 1]);
    }
  }

  function blit(target, material) {
    mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);

    const raw = now - last;
    last = now;
    const dt = Math.min(raw / 1000, 1 / 20);
    ema += (raw - ema) * 0.08;
    fpsShown += (1000 / Math.max(raw, 1) - fpsShown) * 0.08;

    input.update(dt);
    sim.step(dt);
    sim.writeUniform(ballData);

    for (const ev of sim.drainEvents()) {
      if (ev === 'shatter') haptic([0, 26, 34, 52]);
      else if (ev === 'drain') haptic([0, 8, 26, 8]);   // two clicks: it left
      else if (ev === 'drop') haptic(9);
      else if (ev === 'full') ui.flashFull();           // refusal, no buzz
    }

    fade += (1 - fade) * Math.min(1, dt * 1.4);

    mercuryUniforms.uTime.value = sim.time;
    mercuryUniforms.uK.value = sim.tension;
    mercuryUniforms.uMat.value = sim.material;
    mercuryUniforms.uEnergy.value = sim.energy;
    mercuryUniforms.uBoundC.value.set(sim.boundC.x, sim.boundC.y, sim.boundC.z);
    mercuryUniforms.uBoundR.value = sim.boundR;

    blit(sceneRT, mercuryMaterial(tier));

    const bw = bloomA.width, bh = bloomA.height;
    bloomMat.uniforms.uMode.value = 0;
    bloomMat.uniforms.uTex.value = sceneRT.texture;
    bloomMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
    blit(bloomA, bloomMat);

    bloomMat.uniforms.uMode.value = 1;
    bloomMat.uniforms.uTex.value = bloomA.texture;
    bloomMat.uniforms.uDir.value.set(1, 0);
    blit(bloomB, bloomMat);

    bloomMat.uniforms.uTex.value = bloomB.texture;
    bloomMat.uniforms.uDir.value.set(0, 1);
    blit(bloomA, bloomMat);

    compositeMat.uniforms.uScene.value = sceneRT.texture;
    compositeMat.uniforms.uBloom.value = bloomA.texture;
    compositeMat.uniforms.uTime.value = sim.time;
    compositeMat.uniforms.uFade.value = fade;
    compositeMat.uniforms.uBloomStrength.value = 0.55 + sim.energy * 0.55;
    compositeMat.uniforms.uAberration.value = 0.010 + sim.energy * 0.030;

    mesh.material = compositeMat;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);

    ui.tickHints(dt);
    ui.updateTelemetry(sim, fpsShown, tier.toUpperCase(), dt);
    adapt();
  }

  requestAnimationFrame(frame);

  // Exposed so the verification pass can drive the sim without synthesising
  // hardware events it has no way to produce, and can sample the render target
  // directly rather than relying on a preserved drawing buffer.
  window.__mercury = {
    sim, input, ui, setTier,
    get tier() { return tier; },
    settings,
    applyGravity,
    applySpectrum,
    uniforms: mercuryUniforms,

    // Mean RGB of the raymarch pass, for asserting the colour dial actually
    // moves pixels rather than only moving a uniform.
    meanColor() {
      const w = sceneRT.width, h = sceneRT.height;
      const buf = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(sceneRT, 0, 0, w, h, buf);
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < buf.length; i += 4 * 17) {
        r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++;
      }
      return [r / n, g / n, b / n];
    },

    // Step the sim on a fixed clock, independent of animation-frame pacing,
    // so physics assertions do not depend on how fast the host can rasterise.
    advance(seconds, step = 1 / 60) {
      for (let t = 0; t < seconds; t += step) sim.step(step);
      sim.writeUniform(ballData);
    },

    // Fraction of the raymarch pass meaningfully brighter than the ground.
    lit() {
      const w = sceneRT.width, h = sceneRT.height;
      const buf = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(sceneRT, 0, 0, w, h, buf);
      let n = 0, hits = 0;
      for (let i = 0; i < buf.length; i += 4 * 31) {
        n++;
        if (buf[i] + buf[i + 1] + buf[i + 2] > 120) hits++;
      }
      return hits / n;
    },
  };
}
