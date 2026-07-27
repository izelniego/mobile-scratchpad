// ORA — a pocket universe. Boot, loop, and the nervous system that wires
// gestures / sensors / audio into the one particle organism.
import * as THREE from 'three/webgpu';
import { createUniverse } from './particles.js';
import { MOODS, MoodMixer } from './moods.js';
import { Gestures } from './gestures.js';
import { Motion } from './motion.js';
import { AudioEngine } from './audio.js';
import { createPost } from './post.js';
import { UI } from './ui.js';

const haptic = (p) => { try { navigator.vibrate?.(p); } catch { /* ok */ } };

async function boot() {
  const stage = document.getElementById('stage');

  // ---- renderer with graceful ladder: WebGPU → WebGL2 → poster ----
  // a lost WebGPU device (flaky drivers, GPU resets) self-heals by reloading
  // once into forced WebGL2 instead of leaving a dead black canvas
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ok */ } },
  };
  const fallbackReload = (why) => {
    console.warn('ORA: gpu fallback reload —', why);
    const n = +(store.get('ora.reloads') || 0);
    if (n < 2) {
      store.set('ora.reloads', String(n + 1));
      store.set('ora.forceWebGL', '1');
      location.reload();
    }
  };

  let renderer = null;
  let isWebGPU = false;
  let framesRendered = 0;
  try {
    renderer = new THREE.WebGPURenderer({
      antialias: false,
      powerPreference: 'high-performance',
      forceWebGL: store.get('ora.forceWebGL') === '1',
    });
    await renderer.init();
    isWebGPU = !!renderer.backend?.isWebGPUBackend;
  } catch (err) {
    console.warn('ORA: primary renderer failed, forcing WebGL2', err);
    try {
      renderer = new THREE.WebGPURenderer({ forceWebGL: true, antialias: false });
      await renderer.init();
    } catch (err2) {
      console.error('ORA: no GPU available', err2);
      document.getElementById('poster').classList.add('show');
      document.getElementById('splash').classList.add('hide');
      return;
    }
  }
  if (isWebGPU) {
    renderer.backend?.device?.lost?.then?.((info) => {
      if (info?.reason !== 'destroyed') fallbackReload(`device lost: ${info?.message || ''}`);
    });
    setTimeout(() => {
      if (framesRendered < 10 && document.visibilityState === 'visible') {
        fallbackReload('no frames rendered in 5s');
      }
    }, 5000);
  }

  const mem = navigator.deviceMemory || 6;
  let COUNT = isWebGPU ? 220_000 : 60_000;
  if (mem <= 3) COUNT = Math.floor(COUNT * 0.5);
  const nOverride = parseInt(new URLSearchParams(location.search).get('n') || '', 10);
  if (nOverride > 0) COUNT = nOverride;

  const maxPR = Math.min(window.devicePixelRatio || 1, isWebGPU ? 2 : 1.75);
  renderer.setPixelRatio(maxPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);

  const R = 6.0;
  function fitCamera() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const need = R * 1.12;
    camera.position.z = Math.max(need / (tan * camera.aspect), need / tan) + 2.5;
    camera.updateProjectionMatrix();
  }
  fitCamera();
  camera.lookAt(0, 0, 0);

  // ---- universe + post ----
  const { U, initCompute, updateCompute } = createUniverse(renderer, scene, COUNT);
  U.radius.value = R;
  U.alphaScale.value = THREE.MathUtils.clamp(Math.sqrt(60000 / COUNT), 0.5, 2.5);
  await renderer.computeAsync(initCompute);
  const postkit = createPost(renderer, scene, camera, U);

  // ---- subsystems ----
  const audio = new AudioEngine();
  const ui = new UI({
    onDot: (i) => { mixer.set(i); idleT = 0; ui.interaction(); },
    onSound: () => { audio.ensure(); audio.setMuted(!audio.muted); ui.soundState(audio.muted); },
    onMotion: async () => {
      const ok = await motion.request();
      if (ok) { ui.motionGranted(); haptic(8); }
    },
  });
  ui.buildDots(MOODS);
  ui.soundState(false);

  const mixer = new MoodMixer(U, (m, i, instant) => {
    ui.setMood(m, i, instant);
    audio.setMood(m.audio);
    if (!instant) {
      audio.moodChord();
      haptic([6, 40, 10]);
      U.energy.value = Math.min(1, U.energy.value + 0.45);
    }
  });

  const motion = new Motion({
    onShake: () => {
      U.s0.value.set(0, 0, 0, 34); U.s0t.value = U.time.value;
      U.energy.value = 1; haptic(24);
      ui.discovered('shake'); ui.interaction();
    },
    onFirstData: () => { ui.motionGranted(); },
  });
  if (motion.needsPermission) { ui.showMotionChip(true); ui.motionAvailable(true); }
  else if ('DeviceOrientationEvent' in window) ui.motionAvailable(true);

  // ---- gesture wiring ----
  const wellS = [0, 0];
  const wellV = [new THREE.Vector3(), new THREE.Vector3()];
  let idleT = 0;
  let tapAlt = 0;
  let interacted = false;

  const worldPerPx = () =>
    (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)
    / window.innerWidth;

  const _v = new THREE.Vector3();
  function screenToWorld(x, y, out) {
    _v.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5);
    _v.unproject(camera);
    const dir = _v.sub(camera.position).normalize();
    const t = -camera.position.z / dir.z;
    return out.copy(camera.position).addScaledVector(dir, t);
  }

  const firstTouch = () => {
    if (!interacted) {
      interacted = true;
      audio.ensure();
      ui.dismissSplash();
      try { navigator.wakeLock?.request('screen').catch(() => {}); } catch { /* ok */ }
    }
    idleT = 0;
    ui.interaction();
  };

  const gestures = new Gestures(stage, {
    onAny: firstTouch,
    onTap: (x, y) => {
      const slot = (tapAlt ^= 1) ? 's0' : 's1';
      const w = screenToWorld(x, y, new THREE.Vector3());
      U[slot].value.set(w.x, w.y, w.z, 24);
      U[slot + 't'].value = U.time.value;
      audio.tap(y / window.innerHeight);
      haptic(8);
      U.energy.value = Math.min(1, U.energy.value + 0.35);
      ui.discovered('tap');
    },
    onDoubleTap: () => { mixer.next(1); ui.discovered('double'); },
    onMoodSwipe: (dir) => { mixer.next(dir); ui.discovered('swipe'); },
    onPinchRelease: (level) => {
      U.s1.value.set(0, 0, 0, 18 + level * 30);
      U.s1t.value = U.time.value;
      audio.burst();
      haptic([10, 30, 18]);
      U.energy.value = 1;
      ui.discovered('pinch');
    },
  });

  // ---- pause when hidden ----
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : loop);
  });
  window.addEventListener('resize', () => {
    fitCamera();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- quality governor ----
  let prScale = 1, frames = 0, winT = 0, lastChange = 0, bloomOn = true;
  const fpsProbe = { fps: 60 };
  function govern(dt) {
    frames++; winT += dt; lastChange += dt;
    if (winT < 1.5) return;
    const fps = frames / winT;
    fpsProbe.fps = Math.round(fps);
    frames = 0; winT = 0;
    if (fps < 45 && lastChange > 3) {
      lastChange = 0;
      if (prScale > 0.55) {
        prScale = Math.max(0.55, prScale - 0.15);
        renderer.setPixelRatio(Math.max(1, maxPR * prScale));
        renderer.setSize(window.innerWidth, window.innerHeight);
      } else if (bloomOn) {
        bloomOn = false; postkit.setBloom(false);
      }
    } else if (fps > 57 && lastChange > 8 && prScale < 1) {
      lastChange = 0;
      prScale = Math.min(1, prScale + 0.15);
      renderer.setPixelRatio(Math.max(1, maxPR * prScale));
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  // ---- main loop ----
  const clock = new THREE.Clock();
  const camTarget = new THREE.Vector2();
  const wtmp = new THREE.Vector3();
  let phantomS = 0;
  let shown = false;

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.033);
    U.dt.value = dt;
    U.time.value += dt;
    idleT += dt;
    gestures.tick(dt);

    // wells (fingers) → uniforms
    let strokeSpeed = 0, holdLevel = 0;
    for (let s = 0; s < 2; s++) {
      const p = gestures.wells[s];
      const uP = s === 0 ? U.p0 : U.p1;
      const uV = s === 0 ? U.p0v : U.p1v;
      if (p) {
        idleT = 0;
        screenToWorld(p.x, p.y, wtmp);
        wellS[s] = Math.min(1, wellS[s] + dt * 4.5);
        const wpp = worldPerPx();
        wellV[s].set(p.vx * wpp, -p.vy * wpp, 0);
        const mag = wellV[s].length();
        if (mag > 16) wellV[s].multiplyScalar(16 / mag);
        uP.value.set(wtmp.x, wtmp.y, wtmp.z, wellS[s]);
        const sp01 = Math.min(1, Math.hypot(p.vx, p.vy) / 1500);
        strokeSpeed = Math.max(strokeSpeed, sp01);
        holdLevel = Math.max(holdLevel, wellS[s] * (1 - Math.min(1, sp01 * 2.5)));
        if (wellS[s] > 0.85 && sp01 < 0.05) ui.discovered('hold');
        if (sp01 > 0.5) ui.discovered('stroke');
      } else {
        wellS[s] = Math.max(0, wellS[s] - dt * 6);
        uP.value.w = wellS[s];
        wellV[s].multiplyScalar(Math.exp(-dt * 8));
      }
      uV.value.copy(wellV[s]);
    }

    // phantom finger keeps it alive when watched but untouched
    if (idleT > 16 && !gestures.wells[0] && !gestures.wells[1]) {
      phantomS = Math.min(0.15, phantomS + dt * 0.08);
      const t = U.time.value;
      U.p1.value.set(Math.sin(t * 0.19) * R * 0.42, Math.sin(t * 0.145 + 1.3) * R * 0.3, 0, phantomS);
      U.p1v.value.set(0, 0, 0);
    } else if (phantomS > 0 && !gestures.wells[1]) {
      phantomS = Math.max(0, phantomS - dt * 0.8);
      U.p1.value.w = Math.max(U.p1.value.w, phantomS);
    }

    // pinch / twist
    U.pinch.value += (gestures.pinch01 - U.pinch.value) * Math.min(1, dt * 10);
    U.twist.value = THREE.MathUtils.clamp(gestures.twistVel * 0.4, -7, 7);
    if (Math.abs(gestures.twistVel) > 2.5) ui.discovered('twist');
    if (U.pinch.value > 0.4) ui.discovered('pinch');

    // tilt gravity + camera parallax
    motion.tick(dt);
    U.grav.value.set(motion.grav.x, motion.grav.y, 0);
    if (Math.abs(motion.grav.x) + Math.abs(motion.grav.y) > 2.2) ui.discovered('tilt');
    camTarget.set(motion.parallax.x, motion.parallax.y);
    camera.position.x += (camTarget.x * 1.4 - camera.position.x) * Math.min(1, dt * 2.2);
    camera.position.y += (-camTarget.y * 1.0 - camera.position.y) * Math.min(1, dt * 2.2);
    camera.lookAt(0, 0, 0);

    // energy + audio follow the hands
    U.energy.value = Math.max(0, U.energy.value * Math.exp(-dt * 1.15)
      + (holdLevel * 0.45 + strokeSpeed * 0.9) * dt);
    audio.holdLevel(holdLevel);
    audio.strokeLevel(strokeSpeed);
    audio.pinchLevel(U.pinch.value);

    // idle breathing swells when it wants attention
    const m = mixer.mood;
    const breathTarget = m.nums.breath * (idleT > 8 ? 1.7 : 1);
    U.breath.value += (breathTarget - U.breath.value) * Math.min(1, dt * 1.5);

    mixer.update(dt);
    ui.tickHints(idleT, dt);
    govern(dt);

    renderer.compute(updateCompute);
    postkit.post.render();
    framesRendered++;

    if (!shown) {
      shown = true;
      ui.ready();
      window.__ORA = { backend: isWebGPU ? 'webgpu' : 'webgl2', count: COUNT, probe: fpsProbe, mixer };
    }
  }

  renderer.setAnimationLoop(loop);
}

boot().catch((err) => {
  console.error('ORA boot failed', err);
  document.getElementById('poster').classList.add('show');
  document.getElementById('splash')?.classList.add('hide');
});
