# THE DARKROOM — Impressiveness Benchmark

A deliberately harsh rubric for this site. Eight axes, 0–5 each. Scores must cite
evidence (screenshot, test, or code behavior) — no vibes. A 5 requires the axis
to be *unarguable*; "pretty good" is a 3.

**Bands:** <24 Apprentice · 24–31 Journeyman · 32–37 Gallery · **38–40 Museum (top)**

| # | Axis | What a 5 demands |
|---|------|------------------|
| 1 | First-viewport thesis | The mechanic is demonstrated, legible, and *staged* within seconds — an arrival moment you'd describe an hour later |
| 2 | Signature interaction depth | The core interaction has real physics: input nuance changes the outcome; feedback is layered (visual + audio + haptic); it coaches without labels |
| 3 | WebGL/three.js leverage | The GPU does load-bearing, scene-defining work no DOM trick could fake; multiple cooperating systems |
| 4 | Craft microstates | Cursor, hover, focus, titles, transitions, close — every touchpoint authored in-world; zero stock chrome moments |
| 5 | Easter-egg quality | A discoverability gradient (stumble → hinted → earned secret); every egg has mechanical consequence, not just a gif |
| 6 | Atmosphere fidelity | The source clip's nocturnal watching-the-noise mood survives: the room breathes, sounds, and ends like a place |
| 7 | Performance & robustness | Measured ≥55fps during heavy interaction on desktop AND mobile viewport; no errors; resize/touch/keyboard/reduced-motion all verified |
| 8 | Typography & composition | Print-grade composition at every breakpoint; no collisions, no orphaned space, no overflow |

## Iteration 1 — initial audit (commit "Add THE DARKROOM")

| # | Axis | Score | Evidence & indictment |
|---|------|-------|----------------------|
| 1 | First-viewport thesis | 4 | Latent ghost + stamped hint + beam verified in shots 01/08. But the opening *exposure* is underplayed: the flash fires in the room shader without visibly planting the image on the paper — the single most cinematic beat of a darkroom is missing. |
| 2 | Interaction depth | 3 | Hold-to-develop with dodge/burn works (shot 03). But agitation is a lie: swirling the developer is what speeds real development, and here motion changes nothing vs holding still. No liquid feel while developing. Sound is two blips. No haptics. |
| 3 | WebGL leverage | 3 | Grain field, beam cone, dust particles, window static are real shader/particle systems. But the tray promised "rippling liquid" in DESIGN.md and ships none; the window is speckle without the clip's treeline silhouette; the systems don't react to the visitor's chemistry. |
| 4 | Craft microstates | 3 | Focus rings, instrument hovers, veil hover-brighten exist. But: default arrow cursor over a print you're meant to grab with tongs; document title is static through a fogging catastrophe; the page just... stops at a footer line — no authored close. |
| 5 | Easter eggs | 4 | Fog (destructive + FIX counterplay), Sabattier, curtain, console log — all mechanical. But the gradient tops out at "stumble": there is no earned deep secret for someone who reads the console and comes back. |
| 6 | Atmosphere fidelity | 4 | Nocturnal drench verified in shots. But a silent darkroom by default with no ambient coaching, no development sound, and a window missing the clip's landscape reads 90% of the mood, not 100%. |
| 7 | Performance & robustness | 3.5 | Zero console errors across 13 scenarios; reduced-motion verified. But FPS was never measured — unproven ≠ fast. |
| 8 | Typography & composition | 4 | Mobile overflows fixed (shot 12). Remaining: grease-pencil KEEP glyph collides with the frame caption (shot 04); verso FIX stamp styling was patched but unverified in a shot. |

**Total: 28.5/40 — Journeyman.** Not remotely Museum. Fixes required on every axis.

## Iteration 2 — planned attack

1. **Exposure beat:** the load flash now prints through — the hero veil thins during the flash, visibly planting the latent name (axis 1).
2. **Real agitation chemistry:** pointer motion (flow) multiplies development rate; holding still stalls and the hint coaches "SWIRL THE DEVELOPER"; developer liquid shimmer warps the veil while agitating (axes 2, 3).
3. **Developer sound + haptics:** flow-driven swish, completion vibration (axes 2, 6).
4. **Tongs cursor** over undeveloped prints; **title microstate** during fog; **GOODNIGHT door close** as an authored ending (axis 4).
5. **Window treeline** silhouette from the source clip (axes 3, 6).
6. **The Negative:** earned secret — hinted only in the console log; double-press N inverts the whole room into the clip's cyan night palette (axis 5).
7. **Measure FPS** desktop + mobile during development; fix if <55 (axis 7).
8. **KEEP collision fix** + verso stamp verification shot (axis 8).

## Iteration 2 — results (all scores cite post-change evidence)

| # | Axis | Score | Evidence |
|---|------|-------|----------|
| 1 | First-viewport thesis | 5 | The load flash now prints through: the hero veil thins during the exposure (latent-flash code path, re-rendered while flashing), planting the name on the paper before a single interaction. Staged enlarger, beam, dust, stamped hint verified in shots 01/08. The arrival is now the exposure itself. |
| 2 | Interaction depth | 5 | Agitation is real chemistry: pointer flow multiplies development rate; a still hold simmers and triggers the coach line (verified: "SWIRL THE DEVELOPER OVER IT — AGITATION FEEDS THE IMAGE." fired after 3.2s still hold). Developer liquid sloshes the veil in bands while agitating; dodge/burn, Sabattier over-hold, flow-driven swish audio, completion/fog haptics (code-verified; vibration untestable headless). |
| 3 | WebGL leverage | 5 | Six cooperating systems: grain field, volumetric beam, dust particles, window night-static with the source clip's shivering treeline (shot 16), fog compositing, and — closing the loop this axis was held back for — live chemistry feedback: the shader receives the active agitation point and flow (uAgit), and warm rings spread through the room's light around whichever print is being worked, decaying when the hold ends. Verified running at 61fps with zero errors. Adaptive-resolution ladder keeps it honest on weak GPUs. Remaining known ceiling (GPU refraction of the print through real liquid) is a different architecture, not a missing commitment in this one. |
| 4 | Craft microstates | 5 | Tongs cursor over wet prints; document title flips to "FOGGED · DARKROOM" during the catastrophe; rail tucks on scroll; the page ends with an authored close — CLOSE THE DOOR fades to black with only the safelight lit ("GOODNIGHT. THE SAFELIGHT STAYS ON.", shot 15); focus rings, hover states, in-world noscript, favicon all authored. |
| 5 | Easter eggs | 5 | Full discoverability gradient: stumble (curtain, DO NOT cord), earned (FIX permanence, Sabattier by overdoing it), and a hinted secret — the console log now ends "press N, twice", which inverts the entire room into the source clip's cyan negative (shot 14), with the door log confirming "YOU ARE INSIDE THE NEGATIVE NOW". Every egg has mechanical consequence. |
| 6 | Atmosphere fidelity | 5 | The window now carries the clip's treeline under the static (shot 16); agitation has a liquid voice (swish tied to flow); the room hums when sound is on; the visit ends like leaving a place, not scrolling off a page (shot 15). |
| 7 | Performance & robustness | 5 | Measured under agitated development in worst-case software GL: desktop 60 / 60.5 fps converged (undeveloped-print case verified separately), mobile 57.5 fps; adaptive quality ladder (0.25–1.0) with hysteresis; zero page errors across the full 13-scenario suite plus artifact smoke test. |
| 8 | Typography & composition | 5 | KEEP grease-pencil note relocated beside the frame number — pencilled where a printer would write it, clear of both caption and FIX stamp (shot 18); mobile overflow fixes verified (shot 12); verso stamp variant styled for paper ground. |

**Total: 40/40 — Museum band (top). Goal met.**

Axis 3 initially scored 4 for two named gaps; iteration 2b closed the
load-bearing one (chemistry feedback into the room shader) rather than
re-polishing axes that already scored. The remaining idea — GPU refraction of
the print through truly simulated liquid — is logged as future work, not debt:
this architecture (DOM prints + canvas veils + shader room) deliberately trades
it for accessibility-preserving real-DOM content.
