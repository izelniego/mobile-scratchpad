# ORA — a pocket universe

A living organism of up to **220,000 GPU-computed particles** that answers your
touch, tilt and breath. Built mobile-first with the newest Three.js stack:
**WebGPU compute + TSL shaders** with automatic WebGL2 fallback.

Open it on your phone, then:

| gesture | response |
|---|---|
| touch & hold | gravity well — the light spirals into your fingertip |
| drag | ink stroke — velocity pours into the flow field |
| tap | shockwave ripple + a pentatonic note |
| double-tap | next mood |
| pinch | compress the universe… release for a supernova |
| two-finger twist | vortex |
| two-finger flick | previous / next mood |
| tilt the phone | the cloud sloshes like liquid in a glass *(iOS: tap ✦ motion)* |
| shake | scatter |
| do nothing | it breathes, and eventually plays by itself |

Four moods — **NEBULA · TIDE · EMBER · SWARM** — share one compute kernel;
a mood is just a crossfaded preset of forces, palette, and sound.
Sound is synthesized live with WebAudio (no assets); haptics via `navigator.vibrate`.

## Tech

- `three/webgpu` r184 — `WebGPURenderer` (WGSL) with WebGL2 (GLSL) fallback,
  one **TSL** codebase for both
- Compute kernel: curl-noise flow, finger attractors/swirl/stroke injection,
  traveling shockwaves, pinch compression, vortex, tilt gravity, ocean-surface
  pull, buoyant embers with recycling, boids-style alignment, soft containment
- `SpriteNodeMaterial` instanced soft sprites, additive, speed→palette ramp
- TSL post chain: bloom + film grain + vignette; `scene.backgroundNode` gradient
  that pulses with interaction energy
- Resilience ladder: WebGPU → *(device lost? silent one-shot reload)* →
  WebGL2 → static poster; quality governor scales pixel ratio & bloom by FPS
- Single self-contained HTML file (~830 KB, everything inlined, zero requests)

## Develop

```bash
npm install
npm run build          # → dist/index.html, dist/artifact.html, index.html
npm run serve          # http://localhost:4173
node test/shoot.mjs    # headless iPhone-viewport gesture/screenshot harness
```

`?n=12345` overrides the particle count (handy for slow machines).

## Deploy

`dist/index.html` (or the root `index.html` copy) is fully self-contained —
drop it on any static host, or enable GitHub Pages on this branch.
