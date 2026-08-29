import { chromium } from '@playwright/test';
const browser = await chromium.launch();
for (const vp of [{ width: 1280, height: 900, name: 'desktop' }, { width: 390, height: 844, name: 'mobile' }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:3001/recompensas', { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{});
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => ({
    spinners: document.querySelectorAll('.animate-spin').length,
    text: (document.querySelector('#main-content')?.innerText || '').slice(0, 300),
  }));
  console.log(vp.name, JSON.stringify(state), 'errors:', errors.length);
  await page.screenshot({ path: `/tmp/recompensas-${vp.name}.png` });
  await page.close();
}
await browser.close();
