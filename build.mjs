// Bundles everything — Three.js, shaders, fonts, CSS — into a single file with
// no external requests. Artifact pages run under a CSP that blocks every other
// host, so inlining is not an optimisation here, it is the only way the page
// renders at all.

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'dist');
const docs = join(root, 'docs');

const FONTS = [
  ['400', 'node_modules/@fontsource/chivo-mono/files/chivo-mono-latin-400-normal.woff2'],
  ['500', 'node_modules/@fontsource/chivo-mono/files/chivo-mono-latin-500-normal.woff2'],
  ['700', 'node_modules/@fontsource/chivo-mono/files/chivo-mono-latin-700-normal.woff2'],
];

async function fontFaces() {
  const faces = [];
  for (const [weight, path] of FONTS) {
    const b64 = (await readFile(join(root, path))).toString('base64');
    faces.push(
      `@font-face{font-family:"Chivo Mono";font-style:normal;font-weight:${weight};` +
      `font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");}`
    );
  }
  return faces.join('\n');
}

// Every route out, shown together. The link may silently do nothing — a
// sandboxed frame blocks target="_blank" without a word — so the URL itself is
// always present as text that can be copied by hand.
const escapePanel = (id) => `
<div class="escape" id="${id}">
  <p class="escape-why">Tilt needs a full-screen tab. This copy is embedded, and an
     embedded page is not granted the motion sensors.</p>
  <div class="escape-actions">
    <a class="escape-open" target="_blank" rel="noopener">OPEN FULL SCREEN</a>
    <a class="escape-safari" hidden>OPEN IN SAFARI</a>
  </div>
  <div class="escape-copy">
    <code class="escape-url"></code>
    <button class="escape-copy-btn" type="button">COPY</button>
  </div>
  <p class="escape-failed" hidden>That didn't open. Copy the link and paste it into Safari.</p>
</div>`;

const BODY = `
<div id="stage"><canvas id="gl"></canvas></div>

<div id="hud">
  <div class="ident">
    <h1>MERCURY</h1>
    <p>Hg &middot; 80 &middot; SPECIMEN 001</p>
  </div>

  <dl class="telemetry">
    <dt>STATE</dt><dd id="v-mat">CHROME</dd>
    <dt>TENSION</dt><dd id="v-tension">0.320</dd>
    <dt>VOLUME</dt><dd id="v-mass">09 / 16</dd>
    <dt>RENDER</dt><dd id="v-fps">60 &middot; MID</dd>
  </dl>

  <div id="hint" aria-live="polite"></div>

  <div class="footer">
    <div class="source">
      <span class="dot" id="source-dot"></span>
      <span id="v-source">CALIBRATING</span>
    </div>
    <button id="controls-toggle" type="button" aria-expanded="false" aria-controls="controls">CONTROLS</button>
  </div>
</div>

<section id="controls" aria-label="Controls">
  <div class="controls-head">
    <span>CONTROLS</span>
    <button id="controls-close" type="button" aria-label="Close controls">CLOSE</button>
  </div>

  <div class="ctl">
    <div class="ctl-head">
      <label for="s-gravity">GRAVITY</label>
      <output id="v-gravity" for="s-gravity">EARTH &middot; 1.00 g</output>
    </div>
    <input id="s-gravity" type="range" min="0" max="2.5" step="0.01" value="1">
    <div class="ticks"><span>0</span><span>MOON</span><span>MARS</span><span>EARTH</span><span>JUPITER</span></div>
  </div>

  <div class="ctl">
    <div class="ctl-head">
      <label for="s-spectrum">SPECTRUM</label>
      <output id="v-spectrum" for="s-spectrum">NEUTRAL</output>
    </div>
    <input id="s-spectrum" class="hue" type="range" min="0" max="1" step="0.005" value="0">
    <div class="ticks"><span>NEUTRAL</span><span>FULL SPECTRUM</span></div>
  </div>

  <div class="ctl ctl-tilt">
    <div class="ctl-head">
      <label>TILT</label>
      <output id="v-tilt">CHECKING</output>
    </div>
    <p id="tilt-why"></p>
    <div class="ctl-actions">
      <button id="enable-tilt" type="button" hidden>ENABLE TILT</button>
    </div>
    ${escapePanel('escape-controls')}
  </div>
</section>

<button id="port" type="button" aria-pressed="false" aria-label="Drain port">
  <span class="port-iris"></span>
  <span class="port-label">SEALED</span>
</button>

<div id="puck" role="slider" aria-label="Gravity direction"><div id="bead"></div></div>

<div id="intro">
  <p class="intro-mark">MERCURY</p>
  <p class="intro-sub">A LIQUID THAT KNOWS WHICH WAY IS DOWN</p>
  <p class="intro-lede">
    Tilt your phone and it pours. Drag it and it stretches. Pinch it and it
    changes state. Shake it and it breaks apart.
  </p>
  <div class="intro-actions">
    <button id="begin" type="button">TAP TO BEGIN</button>
  </div>
  ${escapePanel('escape-intro')}
</div>

<div id="unsupported"><p></p></div>
`;

const run = async () => {
  const result = await build({
    entryPoints: [join(root, 'src/main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: ['es2020', 'safari15'],
    loader: { '.glsl': 'text' },
    write: false,
    legalComments: 'none',
  });

  const js = result.outputFiles[0].text;
  const css = await readFile(join(root, 'src/styles.css'), 'utf8');
  const faces = await fontFaces();

  const head = `<title>MERCURY — a liquid that knows which way is down</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#07080B">
<meta name="description" content="Tilt-driven liquid metal, raymarched in a single fragment shader.">`;

  const style = `<style>\n${faces}\n${css}</style>`;
  const script = `<script>\n${js}\n</script>`;

  await mkdir(out, { recursive: true });
  await mkdir(docs, { recursive: true });

  // Standalone document, for opening locally or serving anywhere.
  const standalone =
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n${head}\n${style}\n</head>\n` +
    `<body>\n${BODY}\n${script}\n</body>\n</html>\n`;
  await writeFile(join(out, 'index.html'), standalone);

  // The same document in both places GitHub Pages will look. Its branch
  // picker defaults to the default branch and only offers "/ (root)" or
  // "/docs", so writing both means every combination serves the piece and
  // there is no setting left to get wrong. That URL is top-level rather than
  // framed, which is the only place the motion sensors are reachable at all.
  await writeFile(join(docs, 'index.html'), standalone);
  await writeFile(join(docs, '.nojekyll'), '');
  await writeFile(join(root, 'index.html'), standalone);
  await writeFile(join(root, '.nojekyll'), '');

  // Body fragment, for publishing as an Artifact — the host supplies the
  // doctype, <html>, <head> and <body> wrapper itself.
  await writeFile(join(out, 'artifact.html'),
    `<title>MERCURY — a liquid that knows which way is down</title>\n${style}\n${BODY}\n${script}\n`);

  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
  console.log(`js ${kb(js)}  css ${kb(css)}  fonts ${kb(faces)}`);
  console.log(`dist/index.html    ${kb(await readFile(join(out, 'index.html'), 'utf8'))}`);
  console.log(`dist/artifact.html ${kb(await readFile(join(out, 'artifact.html'), 'utf8'))}`);
  console.log(`docs/index.html    ${kb(await readFile(join(docs, 'index.html'), 'utf8'))}`);
  console.log(`index.html         ${kb(await readFile(join(root, 'index.html'), 'utf8'))}`);
};

run().catch((e) => { console.error(e); process.exit(1); });
