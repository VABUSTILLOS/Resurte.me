import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
for (const w of [600, 639, 640, 641, 700, 767, 768, 820]) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const h = document.querySelector('header');
    const mq = window.matchMedia('(min-width: 640px)').matches;
    const mobileVisible = [...h.querySelectorAll('.sm\\:hidden')].filter(e=>getComputedStyle(e).display!=='none').length;
    return { overflow: h.scrollWidth - h.clientWidth, mq640: mq, innerWidth: window.innerWidth, mobileVisible };
  });
  console.log(w, JSON.stringify(r));
}
await browser.close();
