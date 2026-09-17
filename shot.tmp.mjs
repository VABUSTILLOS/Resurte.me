import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
for (const w of [768, 820, 900, 1024, 1280]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const o = await page.evaluate(() => {
    const h = document.querySelector('header');
    return h.scrollWidth - h.clientWidth;
  });
  console.log(w, 'overflow', o);
  if (w === 768 || w === 1024) await page.screenshot({ path: `shot-${w}.tmp.png`, clip: { x: 0, y: 0, width: w, height: 70 } });
}
await browser.close();
