// ORA verification harness: drives the built app in headless Chromium at an
// iPhone viewport with real touch input, screenshots every mood + gesture,
// and fails on console errors. Usage: node test/shoot.mjs [--webgpu]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = process.env.SHOT_DIR || 'test/shots';
mkdirSync(OUT, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', '4173', '--directory', 'dist'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const wantWebGPU = process.argv.includes('--webgpu');
const args = ['--no-sandbox', '--disable-dev-shm-usage'];
if (wantWebGPU) args.push('--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(process.env.SHOT_URL || 'http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });

// wait for the universe to boot (first rendered frame sets window.__ORA)
let ora = null;
for (let i = 0; i < 60; i++) {
  ora = await page.evaluate(() => window.__ORA
    ? { backend: window.__ORA.backend, count: window.__ORA.count } : null);
  if (ora) break;
  await page.waitForTimeout(500);
}
console.log('boot:', ora ? JSON.stringify(ora) : 'FAILED');

await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/01-splash.png` });

const cdp = await ctx.newCDPSession(page);
const touch = async (type, points) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: points.map(([x, y]) => ({ x, y })),
});

// tap → dismiss splash + shockwave
await touch('touchStart', [[195, 420]]);
await page.waitForTimeout(60);
await touch('touchEnd', []);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/02-tap-shockwave.png` });
await page.waitForTimeout(1200);

// stroke drag → ink streaks
await touch('touchStart', [[70, 640]]);
for (let i = 1; i <= 14; i++) {
  await touch('touchMove', [[70 + i * 18, 640 - i * 26]]);
  await page.waitForTimeout(16);
}
await touch('touchEnd', []);
await page.waitForTimeout(350);
await page.screenshot({ path: `${OUT}/03-stroke.png` });

// hold → gravity well
await touch('touchStart', [[195, 400]]);
await page.waitForTimeout(1300);
await page.screenshot({ path: `${OUT}/04-hold-well.png` });
await touch('touchEnd', []);

// pinch → compression, then release burst
await touch('touchStart', [[120, 350], [270, 500]]);
for (let i = 1; i <= 10; i++) {
  await touch('touchMove', [[120 + i * 6, 350 + i * 6], [270 - i * 6, 500 - i * 6]]);
  await page.waitForTimeout(20);
}
await page.screenshot({ path: `${OUT}/05-pinch.png` });
await touch('touchEnd', []);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/06-burst.png` });
await page.waitForTimeout(900);

// double-tap logic check with zero-latency synthetic pointer events
const dblResult = await page.evaluate(() => {
  const el = document.getElementById('stage');
  const before = window.__ORA.mixer.index;
  const fire = (type, id) => el.dispatchEvent(new PointerEvent(type, {
    pointerId: id, clientX: 200, clientY: 300, bubbles: true,
  }));
  fire('pointerdown', 901); fire('pointerup', 901);
  fire('pointerdown', 902); fire('pointerup', 902);
  return { before, after: window.__ORA.mixer.index };
});
console.log('double-tap mechanism:', JSON.stringify(dblResult),
  dblResult.after !== dblResult.before ? 'OK' : 'BROKEN');
await page.waitForTimeout(600);

// then drive the remaining moods deterministically via the real dot buttons
const names = ['tide', 'ember', 'swarm'];
for (let i = 0; i < names.length; i++) {
  const x = await page.evaluate((idx) => {
    const d = document.querySelectorAll('.dot')[idx];
    const r = d.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, i + 1);
  await touch('touchStart', [x]);
  await page.waitForTimeout(40);
  await touch('touchEnd', []);
  await page.waitForTimeout(2800);
  console.log(`mood ${names[i]} index:`, await page.evaluate(() => window.__ORA.mixer.index));
  await page.screenshot({ path: `${OUT}/07-mood-${names[i]}.png` });
}

const probe = await page.evaluate(() => ({ fps: window.__ORA?.probe?.fps }));
console.log('fps probe:', JSON.stringify(probe));
console.log(errors.length ? `CONSOLE ERRORS (${errors.length}):\n` + errors.slice(0, 12).join('\n---\n') : 'no console errors');

await browser.close();
server.kill();
process.exit(ora && errors.length === 0 ? 0 : 1);
