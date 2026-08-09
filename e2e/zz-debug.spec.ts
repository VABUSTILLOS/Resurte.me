import { test, expect, type Page } from "@playwright/test"

const CART_STORAGE_KEY = "resurte_cart"
const CHECKOUT_DRAWER_EVENT = "resurte:toggle-checkout-drawer"

function seedCart(page: Page) {
  return page.addInitScript((key) => {
    const item = { product_id: 999001, name: "Aguacate", slug: "x", image_url: "", brand: "B", price: 850, sale_price: null, quantity: 1, stock_status: "in_stock" }
    localStorage.setItem(key, JSON.stringify({ cart: { items: [item] }, coupon: null }))
  }, CART_STORAGE_KEY)
}

test("debug drawer open", async ({ page }) => {
  const logs: string[] = []
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(m.text()) })
  seedCart(page)
  await page.goto("/chihuahua", { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2000)
  console.log(">> hydrated, dispatching")
  await page.evaluate((evt) => window.dispatchEvent(new Event(evt)), CHECKOUT_DRAWER_EVENT)
  await page.waitForTimeout(1500)
  const state = await page.evaluate(() => {
    const h = document.querySelector("h2")
    return {
      headings: Array.from(document.querySelectorAll("h2")).map((e) => e.textContent),
      hasDrawerHeader: !!Array.from(document.querySelectorAll("h2")).find((e) => e.textContent === "Tu pedido"),
      consoleErrs: (window as Window & { __lastErrors?: unknown[] }).__lastErrors || [],
    }
  })
  console.log(">> STATE:", JSON.stringify(state))
  console.log(">> CONSOLE:", JSON.stringify(logs))
  expect(true).toBe(true)
})
