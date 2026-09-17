import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
for (const w of [768]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const h = document.querySelector('header');
    const row = h.querySelector('.max-w-7xl > div');
    const items = [...row.children].map((el) => {
      const b = el.getBoundingClientRect();
      return { cls: el.className.slice(0, 40), x: Math.round(b.x), right: Math.round(b.right), w: Math.round(b.width) };
    });
    const btns = [...row.querySelectorAll('a,button')].filter(e => getComputedStyle(e).display !== 'none')
      .map(e => { const b = e.getBoundingClientRect(); return { l: (e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,22), x: Math.round(b.x), r: Math.round(b.right), w: Math.round(b.width) }; });
    return { docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, headerOverflow: h.scrollWidth - h.clientWidth, items, btns };
  });
  console.log('docOverflow', r.docOverflow, 'headerOverflow', r.headerOverflow);
  console.log('children:'); console.log(r.items.map(i=>`  ${i.w}px x=${i.x}..${i.right} ${i.cls}`).join('\n'));
  console.log('controls:'); console.log(r.btns.map(i=>`  ${i.w}px x=${i.x}..${i.r} ${i.l}`).join('\n'));
}
await browser.close();
