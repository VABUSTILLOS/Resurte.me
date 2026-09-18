import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrato de la **primera visita**: el consentimiento de cookies y la guía
 * paso a paso no pueden pedir el mismo tap.
 *
 * Contexto: la guía se auto-abría al montar (`useState(() => !seen)`) y el
 * banner de cookies aparecía 800 ms después. El drawer de la guía (`z-[90]`,
 * ancho `100vw - 3rem`) más su backdrop (`z-[85]`, `inset-0`, `onClick={onClose}`)
 * interceptaban el tap, así que el primer tap de un usuario nuevo **cerraba la
 * guía en vez de consentir**. Y la suite no lo veía: `mobile.spec.ts` y
 * `mobile-chrome.spec.ts` "despejaban" la guía con un sondeo temporizado
 * (`isVisible({ timeout: 3000 })` + `tap()`), que es exactamente la carrera que
 * producía el defecto. El test era el cómplice, no el testigo.
 *
 * La regla que lo cierra es de precedencia, no de z-index: la guía es
 * presentación y puede esperar; consentir es una obligación y no. Por eso
 * `useToolGuide` exige `readConsentDecision() !== null` antes de abrirse.
 *
 * Este contrato cierra las cuatro formas de reintroducir el defecto:
 *
 *  1. Que el drawer vuelva a cubrir pantalla completa sin que la regla exista.
 *  2. Que la clave de consentimiento se duplique (y las dos copias se
 *     desincronicen).
 *  3. Que el auto-open pierda su guarda de consentimiento.
 *  4. Que un spec vuelva a "despejar" la guía con un sondeo en vez de afirmar
 *     la invariante.
 */

const RAIZ = process.cwd()

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), "utf8")
}

const GUIA_HOOK = leer("src/hooks/use-tool-guide.ts")
const GUIA_PANEL = leer("src/components/panel/guide/tool-guide.tsx")
const BANNER = leer("src/components/ui/cookie-consent.tsx")
const MODULO = leer("src/lib/cookie-consent.ts")

/** Specs que antes esquivaban la guía en vez de comprobar la invariante. */
const SPECS_CON_GUIA = ["e2e/mobile.spec.ts", "e2e/mobile-chrome.spec.ts"] as const

describe("contrato: primera visita (consentimiento vs guía)", () => {
  it("premisa: el drawer de la guía sigue cubriendo la pantalla entera", () => {
    // Canario. Si hiciste la guía no bloqueante (por ejemplo, quitando el
    // backdrop `inset-0`), la precedencia puede dejar de ser necesaria: revisa
    // este contrato y `useToolGuide` antes de relajar las aserciones.
    expect(GUIA_PANEL).toContain("fixed inset-0 z-[85]")
    expect(GUIA_PANEL).toContain("fixed top-0 right-0 bottom-0 z-[90]")
  })

  it("la clave de consentimiento vive en un solo lugar", () => {
    // Si el banner vuelve a hardcodear la clave, existen dos fuentes de verdad
    // para "¿ya decidió?" y la guarda de la guía puede leer una distinta.
    expect(MODULO).toContain('COOKIE_CONSENT_KEY = "resurte_cookie_consent"')
    expect(BANNER).not.toContain("resurte_cookie_consent")
    expect(BANNER).toContain("readConsentDecision")
    expect(BANNER).toContain("writeConsentDecision")
  })

  it("el consentimiento no se guarda como JSON", () => {
    // El banner histórico guardaba `accepted` en crudo. Pasar por los helpers
    // de storage lo envolvería en comillas y dejaría como "pendiente" a todo
    // usuario que ya había decidido — el banner reaparecería para todos.
    expect(MODULO).not.toContain("readStored")
    expect(MODULO).not.toContain("writeStored")
  })

  it("la guía no se auto-abre sin decisión de cookies", () => {
    expect(
      GUIA_HOOK,
      "El auto-open de la guía debe salir temprano si no hay decisión de cookies: " +
        "el drawer y su backdrop interceptan el tap que el banner necesita.",
    ).toMatch(/if\s*\(\s*readConsentDecision\(\)\s*===\s*null\s*\)\s*return/)

    // La guarda tiene que ir ANTES del auto-open, no después.
    const guarda = GUIA_HOOK.indexOf("readConsentDecision()")
    const autoOpen = GUIA_HOOK.indexOf("setOpen(true)")
    expect(guarda).toBeGreaterThan(-1)
    expect(autoOpen).toBeGreaterThan(-1)
    expect(guarda).toBeLessThan(autoOpen)
  })

  it("la guía sigue abriéndose cuando corresponde", () => {
    // La otra mitad: "arreglar" el tap desactivando la guía por completo
    // pasaría la suite de e2e si nadie vigilara esto.
    expect(GUIA_HOOK).toContain("openGuide: () => setOpen(true)")
    expect(GUIA_HOOK).not.toContain("useState(() => !")
    expect(GUIA_HOOK, "El auto-open debe decidirse en un efecto de montaje, no en el render inicial: " +
      "el HTML prerenderizado no conoce localStorage.").toContain("useEffect(")
  })

  it("ningún spec despeja la guía con un sondeo temporizado", () => {
    // La invariante se afirma (`expect(...)`), no se sortea. Un `if` sobre la
    // visibilidad del botón es la carrera que ocultaba el defecto.
    for (const ruta of SPECS_CON_GUIA) {
      const lineas = leer(ruta)
        .split("\n")
        .map((linea, indice) => ({ linea, numero: indice + 1 }))
        .filter(({ linea }) => linea.includes("Cerrar guía"))

      expect(lineas.length, `${ruta} debe afirmar la ausencia de la guía`).toBeGreaterThan(0)

      for (const { linea, numero } of lineas) {
        expect(
          linea,
          `${ruta}:${numero} menciona "Cerrar guía" fuera de una aserción. Los specs no ` +
            `deben despejar la guía: en un contexto sin decisión de cookies la guía no se ` +
            `auto-abre, así que hay que afirmarlo, no sondearlo.`,
        ).toContain("expect(")
      }
    }

    expect(leer("e2e/mobile.spec.ts")).not.toContain("dismissToolGuide")
  })

  it("existe el spec que prueba la regla en las dos direcciones", () => {
    const spec = leer("e2e/first-visit.spec.ts")
    // Sin `@ci` el spec existiría pero `npm run test:e2e` nunca lo correría.
    expect(spec).toContain("@ci")
    // Siembra la decisión para la mitad positiva (mismo precedente que
    // `checkout-drawer.spec.ts`), y afirma la ausencia para la negativa.
    expect(spec).toContain("addInitScript")
    expect(spec).toContain("toHaveCount(0)")
  })
})
