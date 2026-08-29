import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://localhost:3001/recompensas', { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{});
await page.waitForTimeout(4000);
// walk through onboarding steps
for (let i = 0; i < 6; i++) {
  const btn = page.locator('button:has-text("Comenzar"), button:has-text("Continuar"), button:has-text("Explorar"), button:has-text("Saltar")').first();
  if (await btn.count()) { await btn.click().catch(()=>{}); await page.waitForTimeout(1200); }
  const txt = await page.evaluate(() => (document.querySelector('#main-content')?.innerText || '').slice(0, 80).replace(/\n/g, ' | '));
  console.log(`step${i}:`, txt);
}
await page.screenshot({ path: '/tmp/rec-home.png' });
// go to store tab
const storeTab = page.locator('button:has-text("Tienda"), a:has-text("Tienda")').first();
if (await storeTab.count()) { await storeTab.click(); await page.waitForTimeout(1500); }
await page.screenshot({ path: '/tmp/rec-store.png' });
console.log('store text:', await page.evaluate(() => (document.querySelector('#main-content')?.innerText || '').slice(0, 150).replace(/\n/g,' | ')));
console.log('errors:', errors);
await browser.close();
