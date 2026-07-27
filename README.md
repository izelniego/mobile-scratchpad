# MERCURY

A liquid that knows which way is down.

A blob of liquid metal, raymarched in a single fragment shader, that responds to
the physical orientation of the phone you are holding it on. Tilt and it pours
toward the low edge. Drag and it stretches into a tendril. Tap and a droplet
falls in and merges under surface tension. Pinch and it changes state. Shake and
it shatters.

No 3D models, no textures, no HDRI — the geometry is a signed distance field and
the studio lighting it reflects is closed-form. The whole piece is one
self-contained HTML file.

## Gestures

| Gesture | Response |
|---|---|
| Tilt the phone | Gravity from the accelerometer drives the sim; the mass pours and piles against the low wall |
| Drag | A force field at the touch point pulls a tendril out while the rest stays anchored |
| Tap | A droplet falls in along gravity and merges into the mass |
| Pinch | Morphs state along one axis — chrome and taut, through dispersive glass, to loose obsidian |
| Shake | Surface tension collapses and the mass bursts apart, then reforms |
| Move the phone | Linear acceleration becomes inertia — shove it sideways and the liquid lags against the trailing wall |

Two controls sit behind `CONTROLS` in the footer:

- **GRAVITY** — 0 g to 2.53 g, marked with real bodies (zero-g, Moon, Mars, Earth, Jupiter). At zero-g the mass stops falling and holds itself together by cohesion alone.
- **SPECTRUM** — one dial from neutral through the full hue wheel. It tints the studio lights the metal reflects, not just the backdrop, so the specimen itself changes colour. The strip lights and key stay near-neutral at every setting, because that contrast is what makes the material read as polished metal at all.

Both persist to `localStorage`.

Merges, drops and shatters fire a haptic pulse where `navigator.vibrate` is
supported. iOS Safari ignores it; nothing else changes.

## Running it

```sh
npm install
npm run build     # -> dist/index.html and dist/artifact.html
npm run serve     # http://localhost:8080
node verify.mjs   # headless Chromium checks + screenshots into .verify/
```

`?q=low|mid|high` pins the quality tier instead of letting it adapt.

### Publishing to GitHub Pages

`npm run build` writes `docs/index.html` and a copy at the repository root.
Deployment goes through `.github/workflows/pages.yml`, which requires
**Settings → Pages → Source: GitHub Actions**.

Deploy-from-a-branch is deliberately not used. Its two dropdowns cannot be read
back through the API, so when the site 404s there is no way to tell whether the
branch, the folder, or the build is at fault — this repository spent a day in
exactly that state, with Pages quietly pointed at an unrelated branch whose
build was failing. A workflow run reports success or failure somewhere visible. The piece is then served at a normal top-level URL —
no frame, no sandbox, no Permissions Policy in the way — where the accelerometer
simply works. Set `PAGES_URL` in `src/config.js` to that address.

On iOS, open it in Safari proper. In-app browsers (a WKWebView inside another
app) frequently refuse the motion sensors even on an unframed page.

## How it works

**Rendering.** One fullscreen fragment shader sphere-traces a signed distance
field: sixteen spheres unioned with a polynomial smooth-min whose blend factor
is a live uniform — that factor *is* the surface tension the pinch controls.
A ray/bounding-sphere test runs first so pixels that miss the mass never enter
the march, which is what makes this affordable on a phone.

**Material.** Three states blended continuously. Chrome is reflection-dominated.
Glass refracts into the surface, marches the interior and refracts back out —
at the top tier along three slightly different IORs per channel, for real
chromatic dispersion — with thin-film interference on the Fresnel edge. Obsidian
is dark polished stone that only transmits where the mass is thin.

The environment is analytic: an ambient gradient kept deliberately dim, two hard
strip lights, a key, a cool rim and a warm kicker. The dimness is the point — a
mirror needs *contrast* to read as a mirror, not overall brightness.

**Physics.** Sixteen soft bodies with gravity, cohesion, mutual repulsion and a
container matched to the visible frustum, stepped on the CPU. Cohesion outweighs
gravity because that is mercury's defining trait: enormous surface tension, so
it beads rather than spreading. Gravity decides where the bead rolls.

**Performance.** A three-rung quality ladder (resolution scale, march steps,
dispersion) driven by a rolling frame-time average with hysteresis. Tier changes
recompile the shader with new `#define`s so every loop bound stays a
compile-time constant.

## Sensors

Two signals come off the phone. **Orientation** says which way is down and
drives gravity; it is read from `deviceorientation`, which has a well-defined
frame, rather than `accelerationIncludingGravity`, whose sign conventions vary
by vendor. **Linear acceleration** says how the phone is being moved and drives
inertia and shake detection. iOS 13+ requires `requestPermission()` inside a
user gesture, which is what the opening screen is for.

### Tilt does not work in an embedded frame

Two separate walls, and they stack.

**Wall one — Permissions Policy.** An embed host that ships

```
permissions-policy: accelerometer=self, gyroscope=self
```

has **not** delegated those sensors to a cross-origin child frame; `self` means
the host's own origin only. The browser blocks `deviceorientation` and
`devicemotion` inside such a frame and no JavaScript can work around it.

**Wall two — the sandbox.** The obvious response is a link out to the same page
at top level. That does not work either, because an embedded page is typically
sandboxed, and a sandbox without `allow-popups` blocks `target="_blank"` *with
no visible error*. Measured here against this very page:

| iframe sandbox | new tab opens? |
|---|---|
| none | yes |
| `allow-scripts allow-same-origin` | **no**, silently |

Hosts that provide their own escape channel — postMessaging the parent to
navigate — generally trigger it only for links that **leave their origin**. A
link back to the frame's own URL is precisely the one that cannot get out. So
the way out has to point at a different origin, which is what `PAGES_URL` in
`src/config.js` is for.

Because that link can still be swallowed, the escape panel never relies on it
alone. It offers the link, an iOS-only `x-safari-https:` jump for in-app
browsers, and the address itself as copyable text — and if the tap produces
nothing within 900 ms, it says so rather than leaving a dead button.

When tilt genuinely is not available — refused permission, a desktop browser, or
a frame — the piece names the specific reason in the HUD and hands over to a
draggable gravity control. That control is a real one, not a fallback notice:
everything stays playable without a single sensor reading.

## Layout

```
src/main.js                    renderer, render targets, loop, quality ladder
src/physics.js                 metaball sim
src/input.js                   sensors, gestures, fallbacks
src/ui.js                      intro, hints, telemetry, manual gravity control
src/shaders/mercury.frag.glsl  the raymarcher
src/shaders/bloom.frag.glsl    bright-pass and separable blur
src/shaders/composite.frag.glsl  bloom add, ACES, aberration, grain, vignette
build.mjs                      bundles and inlines everything into one file
verify.mjs                     45 headless checks + screenshots
```

`dist/index.html` is a standalone document. `dist/artifact.html` is the same
build as a body fragment, for hosts that supply their own document wrapper.
`docs/index.html` is the standalone document again, where GitHub Pages expects
it.
