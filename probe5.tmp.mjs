import { chromium, devices } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const before = await page.evaluate(() => ({ h: document.body.scrollHeight, innerH: window.innerHeight }));
await page.evaluate(() => window.scrollTo({ top: 400 }));
await page.evaluate(() => window.scrollTo({ top: 1200 }));
await page.waitForTimeout(800);
const after = await page.evaluate(() => {
  const h = document.querySelector('header');
  return { scrollY: window.scrollY, transform: h.style.transform, cls: h.className };
});
console.log(JSON.stringify({ before, after }));
await browser.close();
