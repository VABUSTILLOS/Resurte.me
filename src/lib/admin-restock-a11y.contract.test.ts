import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrato de accesibilidad del panel de reabasto (`RestockPanel`, B35).
 *
 * "Reponer" es una escritura asíncrona y, al terminar bien, la fila
 * **desaparece** de la lista: sin una región viva, quien usa lector de pantalla
 * pulsa el botón y el elemento se esfuma sin decir si funcionó ni qué se hizo.
 * Y al terminar mal no pasaba nada visible en absoluto: el `catch` no dejaba
 * ni mensaje ni log, así que la fila seguía ahí sin explicación y el admin
 * podía creer que el clic no se registró.
 *
 * El componente es `.tsx` y el entorno de vitest es `node` (sin jsdom), así que
 * el contrato se fija sobre el texto del archivo, igual que en
 * `admin-product-modal-a11y.contract.test.ts`.
 */

const PANEL = join(process.cwd(), "src", "app", "admin", "components", "RestockPanel.tsx")

/** Sin comentarios: las aserciones hablan del código, no de lo que dice de él. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const panel = stripComments(readFileSync(PANEL, "utf8"))

/** Cuerpo de `restock()`, hasta el cierre de la función. */
function restockBody(): string {
  const start = panel.indexOf("async function restock(")
  expect(start).toBeGreaterThan(-1)
  return panel.slice(start, start + 1400)
}

describe("RestockPanel — contrato de accesibilidad", () => {
  it("anuncia el trabajo en curso y el resultado en una región viva", () => {
    expect(panel).toContain('role="status"')
    expect(panel).toContain('aria-live="polite"')
    expect(panel).toContain("{liveStatus}")
  })

  it("el estado se anuncia en los tres momentos: al empezar, al terminar bien y al fallar", () => {
    const body = restockBody()
    expect(body).toContain("setLiveStatus(`Reponiendo ${s.name}…`)")
    expect(body).toContain("setLiveStatus(`Reabastecido: ${s.name}`)")
    // En el fallo se limpia: el error lo anuncia el `role="alert"` de abajo.
    expect(body).toContain('setLiveStatus("")')
  })

  it("un reabasto fallido deja de ser silencioso", () => {
    const body = restockBody()
    expect(body).toContain("setRestockError(")
    // El error se limpia al reintentar, o el aviso quedaría pegado.
    expect(body).toContain("setRestockError(null)")
    expect(panel).toContain('role="alert"')
    expect(panel).toContain("{restockError}")
  })

  it("el botón anuncia que está ocupado y no se puede pulsar dos veces", () => {
    expect(panel).toContain("disabled={busy}")
    expect(panel).toContain("aria-busy={busy}")
  })

  it("cada botón se distingue por producto: en una lista repetida el nombre solo no basta", () => {
    expect(panel).toContain("aria-label={`${label} · ${s.name}`}")
    // La etiqueta visible y la accesible salen de la misma variable.
    expect(panel).toContain(
      'const label =\n              s.suggestedQuantity > 0 ? `Reponer ${s.suggestedQuantity}` : "Reabastecer"'
    )
  })

  it("el estado ocupado no deja el nombre accesible en puntos suspensivos", () => {
    expect(panel).toContain('{busy ? "…" : label}')
  })

  it("la escritura sigue delegando en `adjustProductStock` y refrescando el historial", () => {
    const body = restockBody()
    expect(body).toContain("await adjustProductStock(")
    expect(body).toContain("onRestocked(s.productId)")
    expect(body).toContain("if (showHistory) await loadHistory()")
  })

  it("el refresco del historial queda fuera del `try` de la escritura", () => {
    // Si el refresco viviera dentro, un fallo decorativo haría que un reabasto
    // correcto se anunciara como fallido —y la fila ya se habría ido.
    const body = restockBody()
    expect(body.indexOf("if (showHistory) await loadHistory()")).toBeGreaterThan(
      body.indexOf("} finally {")
    )
  })
})
