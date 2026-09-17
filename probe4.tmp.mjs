import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 768, height: 900 });
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
const r = await page.evaluate(() => {
  const h = document.querySelector('header');
  const chain = [];
  let el = h;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    chain.push({ tag: el.tagName + '.' + String(el.className).slice(0, 50), overflowX: cs.overflowX, pos: cs.position });
    el = el.parentElement;
  }
  const cart = [...h.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').includes('carrito'));
  const cb = cart.getBoundingClientRect();
  const hit = document.elementFromPoint(Math.min(760, 767), Math.round(cb.top + cb.height/2));
  return {
    htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    docScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    chain,
    cartRect: { x: cb.x, right: cb.right, w: cb.width },
    hitTag: hit ? hit.tagName + '|' + (hit.getAttribute('aria-label') || hit.className).toString().slice(0, 40) : null,
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
