import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
for (const w of [320, 360, 412]) {
  await page.setViewportSize({ width: w, height: 700 });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `nav-${w}.tmp.png`, clip: { x: 0, y: 0, width: w, height: 64 } });
}
await browser.close();
