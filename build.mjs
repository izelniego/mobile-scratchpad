// Build ORA into self-contained single-file HTML (no CDN, no external assets).
// Outputs: dist/index.html (standalone), dist/artifact.html (body-only for
// claude.ai Artifacts), index.html (root copy for GitHub Pages).
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2022', 'safari16'],
  write: false,
  logLevel: 'info',
});

let js = result.outputFiles[0].text;
js = js.replace(/<\/script/gi, '<\\/script'); // safe inline embedding

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="40%" cy="35%"><stop offset="0%" stop-color="#b28bff"/><stop offset="55%" stop-color="#4b2fd6"/><stop offset="100%" stop-color="#0b0620"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="url(#g)"/><ellipse cx="32" cy="34" rx="30" ry="9" fill="none" stroke="#19d2ff" stroke-opacity=".85" stroke-width="2.4" transform="rotate(-18 32 34)"/></svg>`,
)}`;

const CSS = /* css */ `
  :root { --accent: #a88bff; --safe-t: env(safe-area-inset-top, 0px); --safe-b: env(safe-area-inset-bottom, 0px); }
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; overscroll-behavior: none; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;
    color: #fff; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none;
    user-select: none; -webkit-user-select: none; cursor: default; touch-action: none;
  }
  #stage { position: fixed; inset: 0; touch-action: none; }
  #stage canvas { width: 100%; height: 100%; display: block; }

  /* splash — floats over the live universe */
  #splash {
    position: fixed; inset: 0; z-index: 10; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 18px; pointer-events: none;
    transition: opacity 1.1s ease; text-align: center;
  }
  #splash h1 {
    margin: 0; font-size: clamp(54px, 19vw, 96px); font-weight: 200;
    letter-spacing: .42em; margin-right: -.42em; color: rgba(255,255,255,.94);
    text-shadow: 0 0 34px rgba(150,120,255,.55);
  }
  #splash p {
    margin: 0; font-size: 11px; font-weight: 400; text-transform: uppercase;
    letter-spacing: .42em; margin-right: -.42em; color: rgba(255,255,255,.52);
  }
  #splash .touch {
    margin-top: 26px; font-size: 12px; letter-spacing: .3em; margin-right: -.3em;
    text-transform: uppercase; color: rgba(255,255,255,.85);
    opacity: 0; transition: opacity 1s ease;
  }
  #splash.ready .touch { opacity: 1; animation: pulse 2.6s ease-in-out infinite; }
  #splash.hide { opacity: 0; }
  @keyframes pulse { 0%,100% { opacity: .25 } 50% { opacity: .95 } }

  /* hud */
  #hud { opacity: 0; transition: opacity 1.4s ease .3s; }
  #hud.show { opacity: 1; }
  #wordmark {
    position: fixed; top: calc(16px + var(--safe-t)); left: 0; right: 0; z-index: 5;
    text-align: center; font-size: 12px; font-weight: 300; letter-spacing: .55em;
    margin-right: -.55em; color: rgba(255,255,255,.4); pointer-events: none;
  }
  #moodname {
    position: fixed; bottom: calc(104px + var(--safe-b)); left: 0; right: 0; z-index: 5;
    text-align: center; font-size: 11px; font-weight: 400; text-transform: uppercase;
    letter-spacing: .4em; margin-right: -.4em; color: var(--accent);
    opacity: 0; pointer-events: none; text-shadow: 0 0 18px currentColor;
  }
  #moodname.flash { animation: flash 2.2s ease forwards; }
  @keyframes flash { 0% { opacity: 0 } 18% { opacity: .95 } 70% { opacity: .8 } 100% { opacity: 0 } }
  #hint {
    position: fixed; bottom: calc(64px + var(--safe-b)); left: 0; right: 0; z-index: 5;
    text-align: center; font-size: 11px; letter-spacing: .22em; margin-right: -.22em;
    color: rgba(255,255,255,.48); opacity: 0; transition: opacity 1.2s ease; pointer-events: none;
  }
  #hint.show { opacity: 1; }
  #dots {
    position: fixed; bottom: calc(22px + var(--safe-b)); left: 0; right: 0; z-index: 6;
    display: flex; justify-content: center; gap: 6px;
  }
  .dot {
    width: 30px; height: 30px; background: none; border: 0; padding: 0; margin: 0;
    display: grid; place-items: center; cursor: pointer; touch-action: none;
  }
  .dot::after {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: rgba(255,255,255,.26); transition: all .45s ease;
  }
  .dot.on::after {
    background: var(--accent); box-shadow: 0 0 12px var(--accent);
    transform: scale(1.45);
  }
  .chip {
    position: fixed; bottom: calc(20px + var(--safe-b)); z-index: 6;
    height: 34px; padding: 0 15px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14);
    background: rgba(255,255,255,.06); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    color: rgba(255,255,255,.72); font-size: 10px; letter-spacing: .18em; text-transform: uppercase;
    display: flex; align-items: center; gap: 7px; touch-action: none; cursor: pointer;
    font-family: inherit; transition: opacity .6s ease, color .3s ease;
  }
  #chip-sound { right: 16px; }
  #chip-sound span { font-size: 9px; color: var(--accent); }
  #chip-sound.off span { color: rgba(255,255,255,.35); }
  #chip-motion { left: 16px; display: none; }
  #chip-motion.show { display: flex; }
  #chip-motion span { color: var(--accent); }

  /* no-GPU poster */
  #poster {
    position: fixed; inset: 0; z-index: 50; display: none; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px; text-align: center;
    background: radial-gradient(120% 90% at 50% 38%, #17102e 0%, #000 78%);
  }
  #poster.show { display: flex; }
  #poster h1 { margin: 0; font-weight: 200; letter-spacing: .42em; margin-right: -.42em; font-size: 54px; }
  #poster p { margin: 0; font-size: 12px; letter-spacing: .18em; color: rgba(255,255,255,.55); max-width: 240px; line-height: 1.8; }
`;

const BODY = /* html */ `
  <div id="stage"></div>
  <div id="splash">
    <h1>ORA</h1>
    <p>a pocket universe</p>
    <div class="touch">touch anywhere</div>
  </div>
  <div id="hud">
    <div id="wordmark">O&thinsp;R&thinsp;A</div>
    <div id="moodname"></div>
    <div id="hint"></div>
    <div id="dots"></div>
    <button id="chip-motion" class="chip"><span>&#10022;</span>motion</button>
    <button id="chip-sound" class="chip"><span>&#9679;</span>sound</button>
  </div>
  <div id="poster">
    <h1>ORA</h1>
    <p>this pocket universe needs a phone or browser with WebGL2 / WebGPU</p>
  </div>
`;

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="ORA">
<meta name="description" content="ORA — a pocket universe. A living particle organism that answers your touch, tilt and breath.">
<title>ORA — a pocket universe</title>
<link rel="icon" href="${FAVICON}">
<style>${CSS}</style>
</head>
<body>
${BODY}
<script type="module">${js}</script>
</body>
</html>
`;

// Artifact variant: page content only — the Artifact host supplies
// doctype/head/body. Keep <title> so the host picks up the name.
const artifact = `<title>ORA — a pocket universe</title>
<style>${CSS}</style>
${BODY}
<script type="module">${js}</script>
`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', standalone);
writeFileSync('dist/artifact.html', artifact);
writeFileSync('index.html', standalone);

console.log(`built: dist/index.html (${(standalone.length / 1024).toFixed(0)} KB), dist/artifact.html, index.html`);
