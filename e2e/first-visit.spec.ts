import { test, expect, type Locator, type Page } from "@playwright/test"

// ---------------------------------------------------------------------------
// Primera visita: consentimiento y guía no pueden pedir el mismo tap.
//
// Regresión que cubre: la guía paso a paso se auto-abría al montar
// (`useState(() => !seen)`), y el banner de cookies aparecía 800 ms después. El
// drawer de la guía (`z-[90]`, ancho `100vw - 3rem`) y su backdrop (`z-[85]`,
// `inset-0`, `onClick={onClose}`) interceptaban el tap, así que el primer tap
// de un usuario nuevo **cerraba la guía** en vez de consentir. La suite lo
// tapaba con `isVisible({ timeout: 3000 })` + `tap()`, que es exactamente la
// carrera que ocultaba el defecto.
//
// La regla que lo cierra: la guía es presentación y puede esperar; consentir es
// una obligación y no. `useToolGuide` no se auto-abre hasta que
// `readConsentDecision() !== null`.
//
// Corre en ambos projects a propósito: el panel de la guía es `lg:w-96` a
// pantalla completa en desktop, así que el solape con el banner no es solo
// móvil. `src/lib/first-visit.contract.test.ts` vigila la parte estática.
// ---------------------------------------------------------------------------

const COOKIE_KEY = "resurte_cookie_consent"
const ACCEPT_ALL = "Aceptar todas"
const CLOSE_GUIDE = "Cerrar guía"
const OPEN_GUIDE = /Abrir guía paso a paso/

/** Siembra la decisión de cookies para todas las navegaciones del test. */
async function seedConsent(page: Page, value: string): Promise<void> {
  await page.addInitScript(
    ([key, decision]: [string, string]) => {
      try {
        window.localStorage.setItem(key, decision)
      } catch {
        // Storage no disponible: el banner volverá a pedir la decisión.
      }
    },
    [COOKIE_KEY, value] as [string, string],
  )
}

/**
 * `locator.tap()` exige un contexto táctil (`hasTouch`) que el project de
 * escritorio no declara, y sin esto el spec falla por la API en vez de por el
 * defecto. El gesto es el mismo: un único punto de contacto sobre el banner con
 * las comprobaciones de accionabilidad de Playwright, que es justo lo que
 * destapa un overlay por encima.
 */
async function tapOrClick(locator: Locator): Promise<void> {
  if (test.info().project.use.hasTouch) await locator.tap()
  else await locator.click()
}

/**
 * Abre `/panel` y espera a que la página esté **hidratada**.
 *
 * El banner y la guía son efectos de cliente: existen cuando React monta, no
 * cuando el servidor responde. `domcontentloaded` dispara **antes** de que
 * corran los scripts diferidos, así que con un `next dev` en frío el
 * presupuesto de la aserción se gastaba compilando los *client chunks* de
 * `/panel` en vez de esperando al producto — medido: 23,6 s hasta
 * `domcontentloaded` con dos navegaciones en paralelo, y el banner apareciendo
 * ~1,2 s después de que el bundle estuviera disponible.
 *
 * `load` es la precondición correcta y no un margen: se cumple cuando los
 * scripts diferidos ya se descargaron y ejecutaron. Con eso la espera del
 * banner vuelve a medir la regla del producto (consentimiento antes que guía)
 * y no la latencia del servidor de desarrollo. `networkidle` no sirve aquí:
 * `/panel` mantiene peticiones de fondo y no lo alcanza.
 */
async function openPanel(page: Page): Promise<void> {
  await page.goto("/panel", { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("load")
}

test.describe("primera visita: consentimiento antes que guía", { tag: "@ci" }, () => {
  test("sin decisión de cookies la guía no se auto-abre y el primer tap consiente", async ({ page }) => {
    await openPanel(page)

    const accept = page.getByRole("button", { name: ACCEPT_ALL })
    // El banner es la señal determinista de que la decisión sigue pendiente: se
    // espera a él y solo entonces se comprueba la guía, para que un auto-open
    // tardío tampoco pase desapercibido.
    await expect(accept).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole("button", { name: CLOSE_GUIDE })).toHaveCount(0)

    // El tap tiene que llegar al banner a la primera, sin despejar overlays.
    await page.waitForTimeout(700) // deja terminar la animación de entrada
    await tapOrClick(accept)
    await expect(accept).not.toBeVisible()
  })

  test("consentir durante la vista no hace saltar la guía encima", async ({ page }) => {
    await openPanel(page)

    const accept = page.getByRole("button", { name: ACCEPT_ALL })
    await expect(accept).toBeVisible({ timeout: 8000 })
    await tapOrClick(accept)
    await expect(accept).not.toBeVisible()

    // El auto-open es deliberadamente "solo al montar": si el usuario consiente
    // en esta misma vista, la guía espera a la siguiente navegación en vez de
    // abrirse sobre el banner que acaba de cerrar (un popup sobre otro popup le
    // roba el tap que iba a dar).
    await page.waitForTimeout(1000)
    await expect(page.getByRole("button", { name: CLOSE_GUIDE })).toHaveCount(0)
  })

  test("con la decisión ya tomada la guía sí se auto-abre", async ({ page }) => {
    // La otra mitad de la regla. Sin este test, "arreglar" el tap desactivando
    // la guía por completo pasaría la suite igual.
    await seedConsent(page, "accepted")
    await openPanel(page)

    await expect(page.getByRole("button", { name: CLOSE_GUIDE })).toBeVisible({ timeout: 8000 })
    // Y el banner no vuelve a pedir una decisión ya tomada.
    await expect(page.getByRole("button", { name: ACCEPT_ALL })).toHaveCount(0)
  })

  test("consentir no cuesta la guía: el botón flotante la reabre", async ({ page }) => {
    await openPanel(page)

    const accept = page.getByRole("button", { name: ACCEPT_ALL })
    await expect(accept).toBeVisible({ timeout: 8000 })
    await tapOrClick(accept)
    await expect(accept).not.toBeVisible()

    // Mientras el banner estaba visible este botón lo tapaba el CSS
    // (`body.cookie-consent-visible .guide-toggle-floating`); al consentir
    // vuelve, así que la guía sigue a un tap.
    const toggle = page.getByRole("button", { name: OPEN_GUIDE })
    await expect(toggle).toBeVisible()
    await tapOrClick(toggle)
    await expect(page.getByRole("button", { name: CLOSE_GUIDE })).toBeVisible()
  })
})
