// Verificación visual Fase 2 — /recompensas (borrar tras uso)
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

// PNG 1x1 rojo para probar la captura real del escáner
const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
writeFileSync('/tmp/factura-test.png', Buffer.from(pngB64, 'base64'));

const browser = await chromium.launch();
const shots = '/Users/mac/.copilot/session-state/4c89f0f0-0859-4fff-84fc-e34ef452eeb7/files';

// --- 1. Onboarding primera visita (desktop) ---
let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
let page = await ctx.newPage();
await page.goto('http://localhost:3001/recompensas');
await page.waitForSelector('text=Crear cuenta gratis', { timeout: 20000 }).catch(() => {});
// Ir al último paso
for (let i = 0; i < 3; i++) {
  const btn = page.locator('button:has-text("Continuar")').first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(600); }
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${shots}/p2-onboarding-last-step.png`, fullPage: true });

// --- 2. Explorar sin cuenta → dashboard demo ---
const explore = page.locator('button:has-text("Explorar sin cuenta")');
if (await explore.count()) {
  await explore.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${shots}/p2-home-demo-desktop.png`, fullPage: true });
  console.log('EXPLORAR OK — dashboard visible tras demo');
} else {
  console.log('ERROR: botón Explorar sin cuenta no encontrado');
}

// --- 3. Notificaciones (estado vacío sin sesión) ---
const bell = page.locator('button[aria-label*="otificac"], button:has(svg.lucide-bell)').first();
if (await bell.count()) {
  await bell.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${shots}/p2-notifications.png` });
  await page.keyboard.press('Escape');
  console.log('NOTIFICATIONS OK');
} else console.log('WARN: bell no encontrado');

// --- 4. Segunda visita: NO debe mostrar onboarding ---
await page.goto('http://localhost:3001/recompensas');
await page.waitForTimeout(2500);
const onboardingVisible = await page.locator('text=Crear cuenta gratis').count();
console.log(onboardingVisible === 0 ? 'REVISIT OK — sin onboarding' : 'ERROR: onboarding reapareció en segunda visita');

// --- 5. Perfil: entrada "¿Cómo funciona?" ---
await page.locator('button:has-text("Perfil")').first().click().catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/p2-profile.png`, fullPage: true });
const howBtn = page.locator('button:has-text("¿Cómo funciona?")');
if (await howBtn.count()) {
  await howBtn.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${shots}/p2-onboarding-replay.png` });
  console.log('REPLAY ONBOARDING OK');
  // salir del onboarding replay
  const skipExplore = page.locator('button:has-text("Explorar sin cuenta")');
  for (let i = 0; i < 3; i++) {
    const c = page.locator('button:has-text("Continuar")').first();
    if (await c.count()) { await c.click(); await page.waitForTimeout(500); }
  }
  if (await skipExplore.count()) await skipExplore.click();
  await page.waitForTimeout(1000);
} else console.log('ERROR: entrada "¿Cómo funciona?" no encontrada en Perfil');

// --- 6. Escáner con archivo real ---
await page.goto('http://localhost:3001/recompensas?tab=home');
await page.waitForTimeout(2000);
// abrir scanner: buscar botón/quick action que lo abra
const scanOpen = page.locator('button:has-text("Escanear"), button:has-text("factura")').first();
if (await scanOpen.count()) {
  await scanOpen.click();
  await page.waitForTimeout(1000);
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    await fileInput.setInputFiles('/tmp/factura-test.png');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${shots}/p2-scanner-file.png`, fullPage: true });
    console.log('SCANNER FILE OK');
  } else console.log('ERROR: input file no encontrado en scanner');
} else console.log('WARN: no se encontró entrada al scanner desde home');
await ctx.close();

// --- 7. Mobile home ---
ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
page = await ctx.newPage();
await page.goto('http://localhost:3001/recompensas');
await page.evaluate(() => localStorage.setItem('cashback-onboarded', 'true'));
await page.reload();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shots}/p2-home-mobile.png`, fullPage: true });
console.log('MOBILE OK');

await browser.close();
console.log('DONE');
