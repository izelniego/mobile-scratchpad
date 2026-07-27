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
    <dt>BODIES</dt><dd id="v-mass">12 / 16</dd>
    <dt>RENDER</dt><dd id="v-fps">60 &middot; MID</dd>
  </dl>

  <div id="hint" aria-live="polite"></div>

  <div class="footer">
    <div class="source">
      <span class="dot" id="source-dot"></span>
      <span id="v-source">CALIBRATING</span>
    </div>
    <div>CONTAINED</div>
  </div>
</div>

<div id="puck" role="slider" aria-label="Gravity direction"><div id="bead"></div></div>

<div id="intro">
  <p class="intro-mark">MERCURY</p>
  <p class="intro-sub">A LIQUID THAT KNOWS WHICH WAY IS DOWN</p>
  <p class="intro-lede">
    Tilt your phone and it pours. Drag it and it stretches. Pinch it and it
    changes state. Shake it and it breaks apart.
  </p>
  <button id="begin" type="button">TAP TO BEGIN</button>
  <p class="intro-note" id="intro-note" hidden></p>
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

  // Standalone document, for opening locally or serving anywhere.
  await writeFile(join(out, 'index.html'),
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n${head}\n${style}\n</head>\n` +
    `<body>\n${BODY}\n${script}\n</body>\n</html>\n`);

  // Body fragment, for publishing as an Artifact — the host supplies the
  // doctype, <html>, <head> and <body> wrapper itself.
  await writeFile(join(out, 'artifact.html'),
    `<title>MERCURY — a liquid that knows which way is down</title>\n${style}\n${BODY}\n${script}\n`);

  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
  console.log(`js ${kb(js)}  css ${kb(css)}  fonts ${kb(faces)}`);
  console.log(`dist/index.html    ${kb(await readFile(join(out, 'index.html'), 'utf8'))}`);
  console.log(`dist/artifact.html ${kb(await readFile(join(out, 'artifact.html'), 'utf8'))}`);
};

run().catch((e) => { console.error(e); process.exit(1); });
