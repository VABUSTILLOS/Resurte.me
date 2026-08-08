import { test, expect } from "@playwright/test"

test.describe("smoke: páginas públicas", () => {
  test("home responde y renderiza la landing", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(/Resurte/i)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  })

  test("marketplace /comer responde", async ({ page }) => {
    const response = await page.goto("/comer", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  })

  test("blog /blog renderiza el index", async ({ page }) => {
    const response = await page.goto("/blog", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  })

  test("ciudad /cdmx responde", async ({ page }) => {
    const response = await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  })

  test("recompensas /recompensas responde", async ({ page }) => {
    const response = await page.goto("/recompensas", { waitUntil: "domcontentloaded" })
    expect(response?.status()).toBe(200)
  })

  test("404 para rutas inexistentes", async ({ page }) => {
    const response = await page.goto("/ruta-que-no-existe-xyz", { waitUntil: "domcontentloaded" })
    // En dev, App Router sirve un soft-404; lo que importa es el contenido.
    expect([200, 404]).toContain(response?.status())
    await expect(page).toHaveTitle(/Ciudad no encontrada/i)
  })
})
