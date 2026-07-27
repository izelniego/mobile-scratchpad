// Drives dist/index.html in headless Chromium at an iPhone viewport and asserts
// the thing actually renders and responds. Screenshots land in .verify/.

import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const shots = join(root, '.verify');
mkdirSync(shots, { recursive: true });

const html = readFileSync(join(root, 'dist/index.html'));
const server = createServer((_, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
}).listen(8199);

const PAGES_URL = 'https://izelniego.github.io/mobile-scratchpad/';

const fail = [];
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail.push(msg); };

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});

// Headless rAF pacing is erratic, so settle the sim on a fixed clock before
// capturing. Without this the screenshots catch the mass mid-fall.
async function settle(page, seconds = 3) {
  await page.evaluate((s) => window.__mercury.advance(s), seconds);
  await page.waitForTimeout(450);
}

async function session(tag, query = '', opts = {}) {
  const ctx = await browser.newContext({
    ...devices['iPhone 13'], isMobile: true, hasTouch: true, ...opts,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:8199/' + query, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  return { ctx, page, errors, tag };
}

// Sampled from the raymarch render target. The canvas itself has no preserved
// drawing buffer, so reading it back after compositing yields nothing.
async function litFraction(page) {
  return page.evaluate(() => window.__mercury.lit());
}

// --- 1. boots, renders, no errors -------------------------------------------
{
  const { ctx, page, errors } = await session('boot');
  await page.click('#begin');
  await page.waitForTimeout(2500);

  ok(errors.length === 0, `no console/page errors  ${errors.slice(0, 3).join(' | ')}`);
  ok(await page.evaluate(() => !!window.__mercury), 'app bootstrapped');
  ok(await page.evaluate(() => !document.getElementById('unsupported').classList.contains('on')),
     'WebGL context acquired');

  const lit = await litFraction(page);
  ok(lit > 0.02, `specimen is rendering (lit fraction ${lit.toFixed(3)})`);

  const vw = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
  ok(vw.includes('viewport-fit=cover'), 'viewport meta applied at runtime');

  const noScroll = await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(noScroll, 'no horizontal page scroll');

  await settle(page);
  await page.screenshot({ path: join(shots, '01-chrome.png') });
  await ctx.close();
}

// --- 2. gravity drives the sim ----------------------------------------------
{
  const { ctx, page } = await session('gravity');
  await page.click('#begin');
  await page.waitForTimeout(400);

  const moved = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    sim.setGravity(1, -0.2, 0);
    const sum = () => sim.balls.filter(b => b.alive).reduce((s, b) => s + b.x, 0);
    const before = sum();
    advance(1.5);
    return sum() - before;
  });
  ok(moved > 0.4, `mass pours toward gravity (drift +${moved.toFixed(2)})`);
  await settle(page, 1.5);
  await page.screenshot({ path: join(shots, '02-poured.png') });
  await ctx.close();
}

// --- 3. touch stretches, tap drops, pinch morphs, shake shatters -------------
{
  const { ctx, page } = await session('gestures');
  await page.click('#begin');
  await page.waitForTimeout(400);

  // drag — a tendril means the top follows the finger while the pooled bottom
  // stays put. Max pairwise distance is the wrong probe here: pulling a wide
  // flat pool into a vertical neck makes that number shrink.
  const stretch = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    sim.setGravity(0, -1, 0);
    advance(3);
    const alive = () => sim.balls.filter(b => b.alive);
    const top = () => Math.max(...alive().map(b => b.y));
    const bottom = () => Math.min(...alive().map(b => b.y));
    const t0 = top(), b0 = bottom();
    const cx = alive().reduce((s, b) => s + b.x, 0) / alive().length;
    const cy = alive().reduce((s, b) => s + b.y, 0) / alive().length;
    for (let i = 0; i < 75; i++) {
      sim.setTouch(cx, cy + Math.min(i * 0.014, 1.0), 0, 0.8, 1);
      sim.step(1 / 60);
    }
    const out = { rose: top() - t0, anchored: Math.abs(bottom() - b0) };
    sim.clearTouch();
    return out;
  });
  ok(stretch.rose > 0.5, `drag lifts a tendril (top +${stretch.rose.toFixed(2)})`);
  // Relative, not absolute: ball radii and start positions are seeded randomly
  // each load, so what matters is that the neck travels far further than the
  // base does — that differential is what makes it a tendril and not a tow.
  ok(stretch.rose > stretch.anchored * 3,
     `pool stays put while the neck stretches (${stretch.rose.toFixed(2)} vs ${stretch.anchored.toFixed(2)})`);
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(shots, '03-stretch.png') });

  // tap -> droplet
  const dropped = await page.evaluate(() => {
    const { sim } = window.__mercury;
    const before = sim.volume();
    sim.addDrop(0.2, 0.9);
    return sim.volume() - before;
  });
  ok(dropped === 1, 'tap spawns a droplet');

  // pinch -> material + tension
  const morph = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    sim.setPinch(1);
    advance(1.2);
    return { mat: sim.material, tension: sim.tension };
  });
  ok(morph.mat > 1.9 && morph.tension < 0.22,
     `pinch morphs state (uMat ${morph.mat.toFixed(2)}, tension ${morph.tension.toFixed(3)})`);
  await settle(page, 1.5);
  await page.screenshot({ path: join(shots, '04-obsidian.png') });

  await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    sim.setPinch(0.5);
    advance(1.5);
  });
  await settle(page, 0.5);
  await page.screenshot({ path: join(shots, '05-glass.png') });

  // shake -> shatter. The resting pool already spans the container width, so
  // scatter shows up as vertical spread and speed, not as a wider footprint.
  const shattered = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    sim.setPinch(0);
    advance(2.5);
    const alive = () => sim.balls.filter(b => b.alive);
    const ySpan = () => {
      const a = alive();
      return Math.max(...a.map(b => b.y)) - Math.min(...a.map(b => b.y));
    };
    const fastest = () => Math.max(...alive().map(b => Math.hypot(b.vx, b.vy, b.vz)));
    const restTension = sim.tension;
    const restSpan = ySpan();
    const restSpeed = fastest();
    sim.shatter();
    // Sampled early: in the smaller cell the droplets reach a wall within a
    // couple of hundred milliseconds and shed speed, which measures the
    // container, not the shake.
    advance(0.08);
    const peak = fastest();
    advance(0.14);
    return {
      speed: peak,
      grew: ySpan() - restSpan,
      restSpeed,
      tension: sim.tension,
      restTension,
    };
  });
  ok(shattered.grew > 0.15, `shake scatters the bodies vertically (+${shattered.grew.toFixed(2)})`);
  ok(shattered.speed > shattered.restSpeed + 2,
     `shake injects momentum (${shattered.restSpeed.toFixed(2)} -> ${shattered.speed.toFixed(2)} u/s)`);
  ok(shattered.tension < shattered.restTension * 0.75,
     `shake drops surface tension (${shattered.restTension.toFixed(3)} -> ${shattered.tension.toFixed(3)})`);
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(shots, '06-shatter.png') });

  await ctx.close();
}

// --- 4. every quality tier compiles and renders ------------------------------
for (const q of ['low', 'mid', 'high']) {
  const { ctx, page, errors } = await session('tier-' + q, '?q=' + q);
  await page.click('#begin');
  await page.waitForTimeout(1600);
  await settle(page);
  const lit = await litFraction(page);
  ok(errors.length === 0 && lit > 0.02, `tier ${q} renders (lit ${lit.toFixed(3)})`);
  await page.screenshot({ path: join(shots, `07-tier-${q}.png`) });
  await ctx.close();
}

// --- 5. sensor-denied path falls back to the manual control ------------------
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // Simulate an iOS-style gate that refuses.
  await page.addInitScript(() => {
    window.DeviceOrientationEvent = function () {};
    window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('denied');
    window.DeviceMotionEvent = function () {};
    window.DeviceMotionEvent.requestPermission = () => Promise.resolve('denied');
  });
  await page.goto('http://localhost:8199/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#begin');
  await page.waitForTimeout(2200);

  const puckOn = await page.evaluate(() => document.getElementById('puck').classList.contains('on'));
  ok(puckOn, 'sensor refusal reveals the manual gravity control');

  const src = await page.evaluate(() => document.getElementById('v-source').textContent);
  ok(src === 'MANUAL VECTOR', `source reads "${src}"`);

  const box = await page.locator('#puck').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const g = await page.evaluate(() => ({ ...window.__mercury.sim.gravity }));
  ok(g.x > 0.6, `manual control steers gravity (gx ${g.x.toFixed(2)})`);
  await settle(page, 2);
  await page.screenshot({ path: join(shots, '08-manual.png') });
  await ctx.close();
}

// --- 6. gravity dial ---------------------------------------------------------
{
  const { ctx, page } = await session('gravity-dial');
  await page.click('#begin');
  await page.waitForTimeout(300);

  const fall = await page.evaluate(() => {
    const { sim, advance, applyGravity } = window.__mercury;
    // Mean downward speed shortly after release. Displacement is the wrong
    // probe: at Jupiter the mass reaches the floor inside a second and the
    // number saturates against the container instead of tracking gravity.
    const drop = (g) => {
      applyGravity(g);
      sim.reset();
      sim.setGravity(0, -1, 0);
      advance(0.15);
      const a = sim.balls.filter(b => b.alive);
      return -a.reduce((s, b) => s + b.vy, 0) / a.length;
    };
    return { jupiter: drop(2.53), earth: drop(1), moon: drop(0.17), zero: drop(0) };
  });

  ok(fall.earth > fall.moon + 0.3,
     `Moon falls slower than Earth (${fall.moon.toFixed(2)} vs ${fall.earth.toFixed(2)} u/s)`);
  ok(fall.jupiter > fall.earth + 0.5,
     `Jupiter falls fastest (${fall.jupiter.toFixed(2)} u/s)`);
  ok(Math.abs(fall.zero) < 0.05, `zero-g does not fall (${fall.zero.toFixed(3)} u/s)`);

  const label = await page.evaluate(() => {
    document.getElementById('s-gravity').value = '0.17';
    document.getElementById('s-gravity').dispatchEvent(new Event('input'));
    return document.getElementById('v-gravity').textContent;
  });
  ok(label.startsWith('MOON'), `dial snaps to body names ("${label}")`);

  await page.evaluate(() => window.__mercury.applyGravity(0));
  await settle(page, 2);
  await page.screenshot({ path: join(shots, '09-zero-g.png') });
  await ctx.close();
}

// --- 7. phone movement drives inertia ---------------------------------------
{
  const { ctx, page } = await session('inertia');
  await page.click('#begin');
  await page.waitForTimeout(300);

  const drift = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    sim.setGravity(0, -1, 0);
    advance(3);
    const cx = () => {
      const a = sim.balls.filter(b => b.alive);
      return a.reduce((s, b) => s + b.x, 0) / a.length;
    };
    const before = cx();
    // Phone accelerated to the right -> liquid should pile to the LEFT.
    sim.setInertia(-9, 0, 0);
    advance(0.6);
    return cx() - before;
  });
  ok(drift < -0.05,
     `phone movement throws the mass the opposite way (drift ${drift.toFixed(3)})`);
  await ctx.close();
}

// --- 8. colour dial actually moves pixels ------------------------------------
{
  const { ctx, page } = await session('colour');
  await page.click('#begin');
  await page.waitForTimeout(300);
  await settle(page, 2.5);

  const hueOf = ([r, g, b]) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 1e-6) return -1;
    let h;
    if (max === r) h = ((g - b) / (max - min)) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    return (h * 60 + 360) % 360;
  };

  const sample = async (v) => {
    await page.evaluate((x) => window.__mercury.applySpectrum(x), v);
    await page.waitForTimeout(320);
    return page.evaluate(() => window.__mercury.meanColor());
  };

  const neutral = await sample(0);
  ok(await page.evaluate(() => window.__mercury.uniforms.uTint.value) === 0,
     `spectrum at zero leaves the studio neutral (hue ${hueOf(neutral).toFixed(0)}deg)`);

  // Each dial position should render near the hue it names. Tolerance is wide
  // because the near-neutral strip lights and key deliberately dilute it.
  for (const [v, expect] of [[0.08, 29], [0.33, 119], [0.55, 198], [0.80, 288]]) {
    const c = await sample(v);
    const got = hueOf(c);
    let d = Math.abs(got - expect);
    if (d > 180) d = 360 - d;
    ok(d < 55, `hue ${Math.round(v * 360)}deg renders as ${got.toFixed(0)}deg (off by ${d.toFixed(0)}deg)`);
  }

  for (const [v, name] of [[0.08, 'red'], [0.33, 'green'], [0.55, 'cyan'], [0.80, 'violet']]) {
    await page.evaluate((x) => window.__mercury.applySpectrum(x), v);
    await page.waitForTimeout(380);
    await page.screenshot({ path: join(shots, `10-hue-${name}.png`) });
  }
  await ctx.close();
}

// --- 9. controls drawer ------------------------------------------------------
{
  const { ctx, page } = await session('drawer', '', { reducedMotion: 'reduce' });
  await page.click('#begin');
  await page.waitForTimeout(500);

  await page.click('#controls-toggle');
  await page.waitForTimeout(500);
  ok(await page.isVisible('#s-gravity'), 'controls drawer opens');
  const fits = await page.evaluate(() => {
    const r = document.getElementById('controls').getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight + 1;
  });
  ok(fits, 'open drawer fits inside the viewport');

  await page.focus('#s-gravity');
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft');
  const moved = await page.evaluate(() => ({
    scale: window.__mercury.sim.gScale,
    value: parseFloat(document.getElementById('s-gravity').value),
    label: document.getElementById('v-gravity').textContent,
  }));
  ok(moved.value < 0.8 && Math.abs(moved.scale - moved.value) < 1e-6,
     `gravity slider drives the sim (value ${moved.value.toFixed(2)} -> gScale ${moved.scale.toFixed(2)})`);
  ok(/g$|ZERO-G/.test(moved.label), `readout follows the dial ("${moved.label}")`);

  // A drag over the sheet must not also pull a tendril out of the specimen.
  const box = await page.locator('#s-spectrum').boundingBox();
  await page.evaluate(() => { window.__dragSeen = false;
    document.getElementById('gl').addEventListener('pointerdown', () => { window.__dragSeen = true; }); });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  ok(await page.evaluate(() => window.__dragSeen) === false,
     'slider drags do not reach the canvas as a tendril pull');

  await page.screenshot({ path: join(shots, '11-controls.png') });

  await page.click('#controls-close');
  await page.waitForTimeout(600);
  ok(!(await page.isVisible('#s-gravity')),
     'controls drawer closes from inside the sheet, which covers the toggle');
  await ctx.close();
}

// --- 10. framed + sandboxed: the exact failure that was reported -------------
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.DeviceOrientationEvent = function () {};
    window.DeviceOrientationEvent.requestPermission =
      () => Promise.reject(new Error('blocked by permissions policy'));
    window.DeviceMotionEvent = function () {};
    window.DeviceMotionEvent.requestPermission = () => Promise.reject(new Error('blocked'));
  });
  // A cross-origin frame WITHOUT allow-popups. This is the shape that silently
  // swallowed the escape link in v2: target="_blank" is blocked with no error
  // the user can see, so the button simply did nothing.
  await page.setContent(
    `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
     <iframe sandbox="allow-scripts allow-same-origin" src="http://127.0.0.1:8199/"></iframe>`,
    { waitUntil: 'load' });
  const frame = page.frameLocator('iframe');
  await page.waitForTimeout(900);

  // BEGIN must stay primary — it is the control that always works.
  const beginText = await frame.locator('#begin').textContent();
  ok(beginText.trim() === 'TAP TO BEGIN', `BEGIN stays the primary action ("${beginText.trim()}")`);
  ok(await frame.locator('#intro').isVisible(), 'intro is up before begin');
  ok(await frame.locator('#escape-intro').isVisible(), 'framed page shows the escape panel');

  const href = await frame.locator('#escape-intro .escape-open').getAttribute('href');
  ok(href === PAGES_URL, `escape points at the unframed address (${href})`);
  ok(new URL(href).origin !== 'http://127.0.0.1:8199',
     'escape is cross-origin, which is the only kind a host will forward');

  ok((await frame.locator('#escape-intro .escape-url').textContent()).trim() === PAGES_URL,
     'the address is on screen as text, not only inside the link');

  // The regression itself: tap it, and because the sandbox eats the navigation,
  // the page must admit that nothing happened rather than sit there silently.
  ok(await frame.locator('#escape-intro .escape-failed').isHidden(),
     'no failure notice before the tap');
  await frame.locator('#escape-intro .escape-open').click();
  await page.waitForTimeout(1400);
  ok(await frame.locator('#escape-intro .escape-failed').isVisible(),
     'a swallowed tap is reported instead of failing silently');

  await frame.locator('#begin').click();
  await page.waitForTimeout(2300);
  ok(await frame.locator('#intro').isHidden(),
     'the intro really leaves the layout once dismissed');
  const src = await frame.locator('#v-source').textContent();
  ok(src.includes('FRAMED'), `telemetry names the real cause ("${src}")`);

  await frame.locator('#controls-toggle').click();
  await page.waitForTimeout(500);
  ok(await frame.locator('#escape-controls').isVisible(), 'controls carry the escape too');
  await page.screenshot({ path: join(shots, '12-framed.png') });
  await ctx.close();
}

// --- 10b. copying the address ------------------------------------------------
{
  const ctx = await browser.newContext({
    ...devices['iPhone 13'], isMobile: true, hasTouch: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8199/', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#begin');
  await page.waitForTimeout(2200);
  await page.click('#controls-toggle');
  await page.waitForTimeout(400);

  await page.click('#escape-controls .escape-copy-btn');
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(clip === PAGES_URL, `COPY puts the address on the clipboard (${clip})`);
  ok((await page.textContent('#escape-controls .escape-copy-btn')).includes('COPIED'),
     'COPY confirms it worked');
  await ctx.close();
}

// --- 10c. clipboard blocked -> selection fallback ----------------------------
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // Embed policies can withhold clipboard-write as well; the old selection
  // path has to carry it when the modern API is unavailable.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { get: () => undefined });
    window.__execCopy = 0;
    document.execCommand = (cmd) => { if (cmd === 'copy') window.__execCopy++; return true; };
  });
  await page.goto('http://localhost:8199/', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#begin');
  await page.waitForTimeout(2200);
  await page.click('#controls-toggle');
  await page.waitForTimeout(400);
  await page.click('#escape-controls .escape-copy-btn');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__execCopy) === 1,
     'falls back to selection copy when the clipboard API is withheld');
  const sel = await page.evaluate(() => String(window.getSelection()));
  ok(sel === PAGES_URL, 'the address is left selected so it can be copied by hand');
  await ctx.close();
}

// --- 10d. the Safari jump is iOS-only ----------------------------------------
{
  for (const [device, wantVisible] of [['iPhone 13', true], ['Desktop Chrome', false]]) {
    const ctx = await browser.newContext({ ...devices[device] });
    const page = await ctx.newPage();
    await page.goto('http://localhost:8199/', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.click('#begin');
    await page.waitForTimeout(2400);   // past the 1600ms sensor fallback
    await page.click('#controls-toggle');
    await page.waitForTimeout(400);
    const vis = await page.locator('#escape-controls .escape-safari').isVisible();
    ok(vis === wantVisible, `Safari jump ${wantVisible ? 'offered' : 'withheld'} on ${device}`);

    // A desktop has no accelerometer to recover, so pointing it at a full
    // screen tab would be noise; a phone that reports no motion might well be
    // an in-app browser, where the unframed address is the actual remedy.
    const panel = await page.locator('#escape-controls').isVisible();
    ok(panel === wantVisible,
       `escape panel ${wantVisible ? 'offered' : 'withheld'} on ${device}`);
    if (vis) {
      const h = await page.locator('#escape-controls .escape-safari').getAttribute('href');
      ok(h.startsWith('x-safari-https://'), `Safari jump uses the iOS scheme (${h})`);
    }
    await ctx.close();
  }
}

// --- 11. sensor retry --------------------------------------------------------
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__asked = 0;
    window.DeviceOrientationEvent = function () {};
    window.DeviceOrientationEvent.requestPermission = () => { window.__asked++; return Promise.resolve('denied'); };
    window.DeviceMotionEvent = function () {};
    window.DeviceMotionEvent.requestPermission = () => Promise.resolve('denied');
  });
  await page.goto('http://localhost:8199/', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#begin');
  await page.waitForTimeout(2200);

  await page.click('#controls-toggle');
  await page.waitForTimeout(450);
  ok(await page.isVisible('#enable-tilt'), 'a denied permission offers a retry');
  const status = await page.textContent('#v-tilt');
  ok(status === 'PERMISSION DENIED', `tilt status is specific ("${status}")`);

  await page.click('#enable-tilt');
  await page.waitForTimeout(400);
  const asked = await page.evaluate(() => window.__asked);
  ok(asked >= 2, `retry re-asks for permission (${asked} requests)`);
  await ctx.close();
}

// --- 11b. volume: drops accumulate, and the vessel has a ceiling -----------
{
  const { ctx, page, errors } = await session('volume');
  await page.click('#begin');
  await page.waitForTimeout(400);

  const before = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    sim.setGravity(0, -1, 0);
    advance(3);
    return sim.volume();
  });
  await page.waitForTimeout(600);
  const litBefore = await page.evaluate(() => window.__mercury.lit());

  const after = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    for (let i = 0; i < 5; i++) { sim.addDrop(0, 0.2); advance(0.35); }
    advance(3);
    return sim.volume();
  });
  await page.waitForTimeout(600);
  const litAfter = await page.evaluate(() => window.__mercury.lit());

  ok(after === before + 5, `five taps add five drops (${before} -> ${after})`);
  // Screen coverage, not the bounding sphere: the bound is pinned by the
  // container walls long before the volume stops growing.
  ok(litAfter > litBefore * 1.08,
     `the mass visibly grows on screen (${litBefore.toFixed(3)} -> ${litAfter.toFixed(3)} covered)`);
  await settle(page, 2);
  await page.screenshot({ path: join(shots, '13-grown.png') });

  const ceiling = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    let refusals = 0;
    for (let i = 0; i < 30; i++) { if (!sim.addDrop(0, 0.2)) refusals++; }
    advance(2);
    return { n: sim.volume(), refusals, full: sim.isFull() };
  });
  ok(ceiling.n === 16, `volume stops at capacity (${ceiling.n} / 16)`);
  ok(ceiling.refusals > 0 && ceiling.full, `taps past full are refused (${ceiling.refusals} refused)`);

  await page.evaluate(() => window.__mercury.sim.addDrop(0, 0.2));
  const flashed = await page.waitForFunction(
    () => document.getElementById('v-mass').textContent === 'FULL',
    null, { timeout: 4000 }).then(() => true).catch(() => false);
  ok(flashed, 'a refused tap says FULL instead of doing nothing');

  ok(errors.length === 0, `no errors while filling  ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// --- 11c. the port: sealed holds, open pours -------------------------------
{
  const { ctx, page, errors } = await session('port');
  await page.click('#begin');
  await page.waitForTimeout(400);

  // Sealed, inverted: the top wall is solid and nothing escapes.
  const sealed = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    sim.portOpen = false;
    sim.setGravity(0, 1, 0);          // "down" is now up the screen
    const before = sim.volume();
    advance(6);
    return { before, after: sim.volume() };
  });
  ok(sealed.after === sealed.before,
     `a sealed port holds it all in (${sealed.before} -> ${sealed.after})`);

  // Open, inverted: it pours out through the mouth until the cell is empty.
  const poured = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    sim.portOpen = true;
    const before = sim.volume();
    advance(2.5);
    const mid = sim.volume();
    advance(20);
    return { before, mid, after: sim.volume() };
  });
  ok(poured.mid < poured.before, `an open port pours (${poured.before} -> ${poured.mid})`);
  ok(poured.after === 0, `it empties completely (${poured.after} left)`);
  await settle(page, 1);
  await page.screenshot({ path: join(shots, '14-emptied.png') });

  // Empty must render rather than produce NaN geometry.
  const empty = await page.evaluate(() => {
    const u = window.__mercury.uniforms;
    return {
      r: u.uBoundR.value,
      finite: Number.isFinite(u.uBoundC.value.x) && Number.isFinite(u.uBoundR.value),
      lit: window.__mercury.lit(),
    };
  });
  ok(empty.finite && empty.r === 0, `an empty cell has clean bounds (r=${empty.r})`);
  ok(empty.lit < 0.02, `nothing is drawn when there is nothing in it (lit ${empty.lit.toFixed(3)})`);
  ok(errors.length === 0, `no errors while emptying  ${errors.slice(0, 2).join(' | ')}`);

  // ...and it can be refilled from empty.
  const count = await page.evaluate(() => {
    const { sim, advance } = window.__mercury;
    sim.portOpen = false;
    sim.setGravity(0, -1, 0);
    for (let i = 0; i < 4; i++) { sim.addDrop(0, 0.3); advance(0.3); }
    advance(2);
    return sim.volume();
  });
  ok(count === 4, `tapping refills from empty (${count})`);
  // lit() samples the render target, which only updates on an animation frame.
  await page.waitForTimeout(600);
  const relit = await page.evaluate(() => window.__mercury.lit());
  ok(relit > 0.005, `and it renders again (lit ${relit.toFixed(3)})`);
  await ctx.close();
}

// --- 11d. the port control ---------------------------------------------------
{
  const { ctx, page } = await session('port-ui', '', { reducedMotion: 'reduce' });
  await page.click('#begin');
  await page.waitForTimeout(1200);

  ok(await page.isVisible('#port'), 'the port is on screen');
  const box = await page.locator('#port').boundingBox();
  const vp = page.viewportSize();
  ok(box.y < vp.height * 0.30 && Math.abs((box.x + box.width / 2) - vp.width / 2) < 8,
     `it sits at the top centre, on the wall it drains through (y ${Math.round(box.y)})`);

  await page.evaluate(() => { window.__portDrag = false;
    document.getElementById('gl').addEventListener('pointerdown', () => { window.__portDrag = true; }); });
  await page.click('#port');
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => ({
    open: window.__mercury.sim.portOpen,
    label: document.querySelector('.port-label').textContent,
    leaked: window.__portDrag,
  }));
  ok(st.open === true, 'tapping it opens the port');
  ok(st.label === 'OPEN', `and it says so ("${st.label}")`);
  ok(st.leaked === false, 'tapping the port never lands on the canvas as a drop');

  await page.click('#port');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__mercury.sim.portOpen) === false, 'tapping again seals it');
  await page.screenshot({ path: join(shots, '15-port.png') });
  await ctx.close();
}

// --- 11e. spectrum track has no dead notch ----------------------------------
{
  const { ctx, page } = await session('spectrum-track', '', { reducedMotion: 'reduce' });
  await page.click('#begin');
  await page.waitForTimeout(900);
  await page.click('#controls-toggle');
  await page.waitForTimeout(400);

  // The gap was a flat grey run followed by a hard step straight into red.
  // Steel must end early and the first hue must start later, so the two blend.
  const stops = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        const t = rule.cssText || '';
        if (t.includes('.hue') && t.includes('linear-gradient')) return t;
      }
    }
    return '';
  });
  // The notch was steel and the first hue sharing a stop, so the track jumped
  // straight from grey to saturated red. They must now be separated by a span
  // the browser can interpolate across.
  const m = stops.match(/var\(--steel\)\s+0\s+([\d.]+)%,\s*#FF4D4D\s+([\d.]+)%/i);
  ok(!!m && parseFloat(m[2]) > parseFloat(m[1]),
     m ? `neutral blends into the spectrum across ${m[1]}%-${m[2]}% rather than stepping`
       : 'could not find the steel/hue stops in the track gradient');
  await page.screenshot({ path: join(shots, '16-spectrum.png') });
  await ctx.close();
}

// --- 12. intro state ----------------------------------------------------------
{
  const { ctx, page } = await session('intro');
  await page.screenshot({ path: join(shots, '00-intro.png') });
  ok(await page.isVisible('#begin'), 'intro gate presents a begin control');
  await ctx.close();
}

await browser.close();
server.close();

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
