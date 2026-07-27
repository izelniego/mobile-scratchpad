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

async function session(tag, query = '') {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true });
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
  ok(stretch.anchored < 0.2, `pooled mass stays anchored (base moved ${stretch.anchored.toFixed(3)})`);
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(shots, '03-stretch.png') });

  // tap -> droplet
  const dropped = await page.evaluate(() => {
    const { sim } = window.__mercury;
    const before = sim.balls.filter(b => b.alive).length;
    sim.dropAt(0.2, 0.9);
    return sim.balls.filter(b => b.alive).length - before;
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

// --- 6. intro state ----------------------------------------------------------
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
