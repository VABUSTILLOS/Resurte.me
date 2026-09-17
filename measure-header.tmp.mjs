import { chromium } from '@playwright/test';

const widths = [320, 340, 360, 375, 390, 412, 480, 640];
const browser = await chromium.launch();
const page = await browser.newPage();

for (const w of widths) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const h = document.querySelector('header');
    if (!h) return null;
    const row = h.querySelector('.max-w-7xl > div');
    const items = [...row.querySelectorAll('a,button')].filter(
      (el) => getComputedStyle(el).display !== 'none'
    );
    const boxes = items.map((el) => {
      const r = el.getBoundingClientRect();
      return { label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 14), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) };
    });
    let overlap = 0;
    for (let i = 1; i < boxes.length; i++) if (boxes[i].x < boxes[i - 1].right) overlap++;
    return {
      clientWidth: h.clientWidth,
      scrollWidth: h.scrollWidth,
      overflow: h.scrollWidth - h.clientWidth,
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      boxes,
      overlap,
    };
  });
  console.log(`\n=== ${w}px === overflow=${m.overflow} docOverflow=${m.bodyOverflow} overlaps=${m.overlap} (client=${m.clientWidth} scroll=${m.scrollWidth})`);
  console.log(m.boxes.map((b) => `  ${String(b.w).padStart(3)}px x=${String(b.x).padStart(3)} .. ${String(b.right).padStart(3)}  ${b.label}`).join('\n'));
}
await browser.close();
