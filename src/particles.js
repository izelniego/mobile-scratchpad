// ORA — particle universe. One TSL compute kernel drives every mood; moods are
// just uniform presets. Runs as WGSL on WebGPU and GLSL on the WebGL2 fallback.
import * as THREE from 'three/webgpu';
import {
  Fn, If, instancedArray, instanceIndex, uniform,
  float, vec2, vec3, vec4, uv,
  hash, mx_noise_vec3,
  mix, smoothstep, saturate, oneMinus,
  exp, sin, cos, sqrt, pow, min, max, cross, screenUV, PI2,
} from 'three/tsl';

export function createUniverse(renderer, scene, COUNT) {
  // ---- uniforms (the entire personality of the universe) ----
  const U = {
    time: uniform(0),
    dt: uniform(0.016),
    radius: uniform(6.0),

    // flow field
    curl: uniform(2.4),
    curlScale: uniform(0.16),
    flowDrift: uniform(0.15),
    damp: uniform(1.1),
    maxSpd: uniform(7.0),

    // pointer wells: xyz = world pos, w = strength 0..1
    p0: uniform(new THREE.Vector4(0, 0, 0, 0)),
    p0v: uniform(new THREE.Vector3()),
    p1: uniform(new THREE.Vector4(0, 0, 0, 0)),
    p1v: uniform(new THREE.Vector3()),
    attract: uniform(24),
    swirl: uniform(14),
    stroke: uniform(22),

    // shockwaves: xyz = origin, w = amplitude; t = birth time
    s0: uniform(new THREE.Vector4(0, 0, 0, 0)),
    s0t: uniform(-100),
    s1: uniform(new THREE.Vector4(0, 0, 0, 0)),
    s1t: uniform(-100),
    waveSpeed: uniform(9.0),

    // global gestures / senses
    pinch: uniform(0),        // 0..1 compression
    twist: uniform(0),        // signed angular impulse
    grav: uniform(new THREE.Vector3()), // tilt gravity
    breath: uniform(0.35),    // idle breathing amplitude
    energy: uniform(0),       // recent interaction energy 0..1

    // mood forces
    wave: uniform(0),         // pull toward ocean surface
    waveAmp: uniform(1.3),
    waveFreq: uniform(0.6),
    buoy: uniform(0),         // ember rise
    align: uniform(0),        // swarm velocity alignment
    swarmSpd: uniform(4.5),

    // look
    size: uniform(0.075),
    alpha: uniform(0.5),
    alphaScale: uniform(1), // density compensation across particle counts
    glow: uniform(1.0),
    speedColor: uniform(0.22),
    colA: uniform(new THREE.Color('#3b1d8f')),
    colB: uniform(new THREE.Color('#19d2ff')),
    colC: uniform(new THREE.Color('#ff5ad1')),
    bgA: uniform(new THREE.Color('#0b0620')),
    bgB: uniform(new THREE.Color('#010103')),
  };

  // ---- storage ----
  const positions = instancedArray(COUNT, 'vec3');
  const velocities = instancedArray(COUNT, 'vec3');
  const aux = instancedArray(COUNT, 'vec4'); // seed, sizeJitter, hueJitter, phase

  // ---- helpers ----
  const curlNoise = /*@__PURE__*/ Fn(([p]) => {
    const e = float(0.22);
    const dx = vec3(e, 0, 0);
    const dy = vec3(0, e, 0);
    const dz = vec3(0, 0, e);
    const px0 = mx_noise_vec3(p.sub(dx));
    const px1 = mx_noise_vec3(p.add(dx));
    const py0 = mx_noise_vec3(p.sub(dy));
    const py1 = mx_noise_vec3(p.add(dy));
    const pz0 = mx_noise_vec3(p.sub(dz));
    const pz1 = mx_noise_vec3(p.add(dz));
    const x = py1.z.sub(py0.z).sub(pz1.y).add(pz0.y);
    const y = pz1.x.sub(pz0.x).sub(px1.z).add(px0.z);
    const z = px1.y.sub(px0.y).sub(py1.x).add(py0.x);
    return vec3(x, y, z).div(e.mul(2));
  });

  const pointerForce = /*@__PURE__*/ Fn(([p, pp, pv]) => {
    const d = pp.xyz.sub(p);
    const dist = d.length().add(0.001);
    const dirN = d.div(dist);
    const fall = pp.w.div(dist.mul(dist).mul(0.28).add(0.55));
    const grav = dirN.mul(fall).mul(U.attract);
    const sw = cross(dirN, vec3(0, 0, 1)).mul(fall).mul(U.swirl);
    const push = pv.mul(exp(dist.mul(dist).negate().mul(0.10))).mul(U.stroke);
    return grav.add(sw).add(push);
  });

  const shockForce = /*@__PURE__*/ Fn(([p, sp, st]) => {
    const age = U.time.sub(st).max(0.0);
    const d = p.sub(sp.xyz);
    const dist = d.length().add(0.0001);
    const ring = dist.sub(age.mul(U.waveSpeed));
    const band = exp(ring.mul(ring).negate().mul(2.5)).mul(exp(age.mul(-1.6)));
    return d.div(dist).mul(band).mul(sp.w);
  });

  // ---- init kernel ----
  const initCompute = Fn(() => {
    const i = float(instanceIndex);
    const r = U.radius.mul(0.82).mul(pow(hash(i.add(2.0)), 1.0 / 3.0));
    const th = hash(i.add(3.0)).mul(PI2);
    const cph = hash(i.add(4.0)).mul(2.0).sub(1.0);
    const sph = sqrt(saturate(float(1.0).sub(cph.mul(cph))));
    positions.element(instanceIndex).assign(vec3(
      r.mul(sph).mul(cos(th)),
      r.mul(sph).mul(sin(th)),
      r.mul(cph).mul(0.6),
    ));
    velocities.element(instanceIndex).assign(vec3(
      hash(i.add(11.0)).sub(0.5),
      hash(i.add(12.0)).sub(0.5),
      hash(i.add(13.0)).sub(0.5),
    ).mul(0.6));
    aux.element(instanceIndex).assign(vec4(
      hash(i.add(7.7)),
      hash(i.add(21.0)).mul(1.0).add(0.6),   // size jitter 0.6..1.6
      hash(i.add(33.0)),                     // hue jitter
      hash(i.add(47.0)).mul(PI2),            // phase
    ));
  })().compute(COUNT);

  // ---- update kernel ----
  const updateCompute = Fn(() => {
    const p = positions.element(instanceIndex).toVar();
    const v = velocities.element(instanceIndex).toVar();
    const a = aux.element(instanceIndex);
    const dt = U.dt;
    const f = vec3(0).toVar();

    // curl-noise flow (the ink); domain drifts on two axes so the field's
    // large-scale bias wanders instead of pushing the whole cloud one way
    const cp = p.mul(U.curlScale).add(vec3(
      U.time.mul(0.043),
      U.time.mul(U.flowDrift).negate(),
      U.time.mul(0.023),
    ));
    f.addAssign(curlNoise(cp).mul(U.curl));

    // finger wells / strokes
    f.addAssign(pointerForce(p, U.p0, U.p0v));
    f.addAssign(pointerForce(p, U.p1, U.p1v));

    // tap shockwaves
    f.addAssign(shockForce(p, U.s0, U.s0t));
    f.addAssign(shockForce(p, U.s1, U.s1t));

    // pinch compression toward center
    f.addAssign(p.mul(U.pinch.mul(-6.0)));

    // twist vortex around view axis
    f.addAssign(cross(vec3(0, 0, 1), p).mul(U.twist));

    // tilt gravity (liquid in a glass)
    f.addAssign(U.grav);

    // idle breathing
    const pr0 = p.length().add(0.25);
    f.addAssign(p.div(pr0).mul(sin(U.time.mul(0.55).add(a.w.mul(0.4))).mul(U.breath)));

    // TIDE: pull toward a rolling ocean surface
    const waveY = sin(p.x.mul(U.waveFreq).add(U.time.mul(1.25)))
      .mul(U.waveAmp)
      .add(sin(p.z.mul(U.waveFreq).mul(1.7).add(U.time.mul(0.85))).mul(U.waveAmp.mul(0.45)));
    f.y.addAssign(waveY.sub(p.y).mul(U.wave));

    // EMBER: buoyant rise, per-particle variance
    f.y.addAssign(U.buoy.mul(a.x.mul(0.9).add(0.55)));

    // soft containment + gentle centering
    const pr = p.length().add(0.0001);
    f.addAssign(p.div(pr).mul(smoothstep(U.radius, U.radius.mul(1.5), pr).mul(-9.0)));
    f.addAssign(p.mul(-0.13));

    // integrate
    v.addAssign(f.mul(dt));

    // SWARM: align velocity to a coherent flying field + chase the finger
    const flow = mx_noise_vec3(p.mul(0.055).add(vec3(U.time.mul(0.07), 0, U.time.mul(0.05))));
    const chaseD = U.p0.xyz.sub(p);
    const chase = chaseD.div(chaseD.length().add(0.6)).mul(U.p0.w.mul(2.0));
    const dir = flow.mul(1.3).add(chase).add(p.mul(-0.13)); // homing keeps the flock on stage
    const target = dir.div(dir.length().add(0.0001)).mul(U.swarmSpd);
    v.assign(mix(v, target, saturate(U.align.mul(dt).mul(4.5))));

    // damping + speed limit
    v.mulAssign(exp(U.damp.negate().mul(dt)));
    const spd = v.length().max(0.00001);
    v.assign(v.div(spd).mul(min(spd, U.maxSpd)));

    p.addAssign(v.mul(dt));

    // never lose particles: hard shell at 2.2R
    const pr2 = p.length().max(0.0001);
    p.assign(p.div(pr2).mul(min(pr2, U.radius.mul(2.2))));

    // EMBER recycle: embers that float off the top are reborn below
    If(U.buoy.greaterThan(0.05).and(p.y.greaterThan(U.radius.mul(1.35))), () => {
      p.assign(vec3(
        hash(float(instanceIndex).add(U.time)).sub(0.5).mul(U.radius.mul(1.7)),
        U.radius.mul(-1.25),
        hash(float(instanceIndex).add(U.time).add(3.3)).sub(0.5).mul(U.radius.mul(1.2)),
      ));
      v.mulAssign(0.15);
    });

    positions.element(instanceIndex).assign(p);
    velocities.element(instanceIndex).assign(v);
  })().compute(COUNT);

  // ---- render: soft additive sprites ----
  const material = new THREE.SpriteNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const vAttr = velocities.toAttribute();
  const auxAttr = aux.toAttribute();

  material.positionNode = positions.toAttribute();

  material.scaleNode = auxAttr.y.mul(U.size)
    .mul(vAttr.length().mul(0.05).add(1.0))
    .mul(U.pinch.mul(0.7).add(1.0));

  material.colorNode = Fn(() => {
    const d = uv().sub(0.5).length().mul(2.0);
    const shape = pow(saturate(oneMinus(d)), 2.0);
    const core = pow(saturate(oneMinus(d)), 8.0).mul(1.6);
    const spd = vAttr.length();
    const t = saturate(spd.mul(U.speedColor).add(auxAttr.z.mul(0.35)));
    const col = mix(U.colA, U.colB, t).toVar();
    col.assign(mix(col, U.colC, pow(t, 2.6)));
    const twinkle = sin(U.time.mul(2.0).add(auxAttr.w.mul(40.0))).mul(0.15).add(0.85);
    const alpha = shape.mul(U.alpha).mul(U.alphaScale).mul(t.mul(0.9).add(0.35)).mul(twinkle)
      .mul(U.pinch.mul(1.3).add(1.0));
    return vec4(col.mul(core.add(shape)).mul(U.glow), alpha);
  })();

  const sprites = new THREE.Sprite(material);
  sprites.count = COUNT;
  sprites.frustumCulled = false;
  scene.add(sprites);

  // ---- living background: radial nebula gradient that feels the energy ----
  scene.backgroundNode = Fn(() => {
    const c = screenUV.sub(vec2(0.5, 0.42));
    const r = c.length().mul(1.55);
    const g = mix(U.bgA, U.bgB, smoothstep(0.12, 1.0, r));
    const pulse = U.energy.mul(0.10).mul(oneMinus(smoothstep(0.0, 0.95, r)));
    return vec4(g.add(U.colB.mul(pulse)), 1.0);
  })();

  return { U, initCompute, updateCompute, sprites, material };
}
