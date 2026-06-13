#!/usr/bin/env node
// Dev verification: loads the game in headless chromium, waits for the world
// to finish building, hides the start overlay, walks the camera to a few
// viewpoints and saves screenshots to /tmp. Reports console errors.
import { chromium } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';

const URL = process.env.URL ?? 'http://localhost:5173';
const exe = path.join(
  os.homedir(),
  'Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell'
);

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => !document.querySelector('#start')?.disabled || document.querySelector('#loadmsg')?.textContent?.includes('失败'),
  null,
  { timeout: 60000 }
);
const loadMsg = await page.$eval('#loadmsg', (el) => el.textContent);
await page.evaluate(() => {
  document.getElementById('overlay').style.display = 'none';
});
await page.waitForTimeout(1500);

const shots = [
  // [name, x, z, yawDeg, pitchDeg]
  ['spawn-mansion', -0.5, -18, 196, 4],
  ['wukang-north', 0, -60, 0, 2],
  ['prow-far', -10, 34, 269, 20],
  ['prow-near', 4, 36.6, 270, 26],
  ['ne-corner', -2, 24, 307, 6],
  ['sign-east', -4.5, 3.6, 90, -2],
  ['sign-west', -12.5, 3.6, 270, -2],
];
for (const [name, x, z, yaw, pitch] of shots) {
  await page.evaluate(
    ([x, z, yaw, pitch]) => window.__setCam?.(x, z, (yaw * Math.PI) / 180, (pitch * Math.PI) / 180),
    [x, z, yaw, pitch]
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: `/tmp/citywalk-${name}.png` });
  console.log(`shot: /tmp/citywalk-${name}.png`);
}

console.log('loadmsg:', JSON.stringify(loadMsg));
console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
