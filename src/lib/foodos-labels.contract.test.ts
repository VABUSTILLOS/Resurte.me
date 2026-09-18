import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrato de las etiquetas de FoodOS: una sola tabla por vocabulario.
 *
 * POR QUÉ EXISTE: la forma de pago del **comprobante** que sube el comensal
 * (`FoodosPaymentProofMethod`) estuvo declarada dos veces —en el micrositio y en
 * el panel de pedidos— con dos tipos distintos: `Record<FoodosPaymentProofMethod,
 * string>` en el micrositio y `Record<string, string>` en el panel. La copia sin
 * tipo no fallaba al añadir una forma nueva: simplemente dejaba de pintarla y
 * mostraba el slug crudo. Ahora la tabla vive en `src/lib/foodos.ts` y las dos
 * superficies la importan; este archivo impide que vuelva a copiarse.
 *
 * Se lee el texto y no se importan los módulos porque `vitest.config.ts` solo
 * incluye `src/**\/*.test.ts`: los `.tsx` no se pueden importar aquí.
 */

const RAIZ = join(__dirname, "..", "..")

const SUPERFICIES_DEL_COMPROBANTE = [
  "src/app/r/[slug]/_components/payment-proof-upload.tsx",
  "src/app/panel/foodos/pedidos/page.tsx",
]

const FUENTE_UNICA = "src/lib/foodos.ts"

const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8")

describe("una sola tabla para la forma de pago del comprobante", () => {
  it("la tabla vive en el módulo compartido y cubre las cuatro formas", () => {
    const fuente = leer(FUENTE_UNICA)
    expect(fuente).toContain("export const PROOF_METHOD_LABELS")
    expect(fuente).toMatch(/PROOF_METHOD_LABELS:\s*Record<FoodosPaymentProofMethod,\s*string>/)
    for (const forma of ["transfer", "oxxo", "efectivo", "otro"]) {
      expect(fuente, `falta la forma ${forma}`).toContain(`${forma}: `)
    }
  })

  it.each(SUPERFICIES_DEL_COMPROBANTE)("%s no declara su propia tabla de formas", (rel) => {
    const fuente = leer(rel)
    // Cada superficie toma la etiqueta del módulo compartido —la tabla el
    // micrositio, la función el panel— en vez de copiarla.
    expect(fuente).toMatch(
      /import\s*\{[^}]*\b(PROOF_METHOD_LABELS|proofMethodLabel)\b[^}]*\}\s*from\s*"@\/lib\/foodos"/
    )
    // La regla que importa: ninguna de las dos vuelve a declarar la tabla.
    expect(fuente, `${rel} volvió a declarar su propia tabla`).not.toMatch(
      /const\s+METHOD_LABEL\b/
    )
  })

  it("el panel pinta el slug con la función, no con un mapa local", () => {
    const fuente = leer("src/app/panel/foodos/pedidos/page.tsx")
    expect(fuente).toMatch(/proofMethodLabel\(proof\.method\)/)
  })

  it("la unión de formas sigue siendo la del tipo compartido", () => {
    const tipos = leer("src/types/foodos.ts")
    expect(tipos).toMatch(
      /FoodosPaymentProofMethod\s*=\s*"transfer"\s*\|\s*"oxxo"\s*\|\s*"efectivo"\s*\|\s*"otro"/
    )
  })

  it("el vocabulario del comprobante no se mezcla con el del cobro", () => {
    // Son dominios distintos: `FOODOS_PAYMENT_METHODS` describe cómo se cobró el
    // pedido; `FoodosPaymentProofMethod`, cómo lo pagó el comensal. Si alguien
    // los unifica, la tabla de comprobantes deja de etiquetar `transfer` y esto
    // se pone rojo.
    const cobro = leer("src/lib/foodos-payments.ts")
    expect(cobro).toContain("FOODOS_PAYMENT_METHODS")
    expect(cobro).toContain('"branch"')
    const fuente = leer(FUENTE_UNICA)
    const tabla = fuente.slice(fuente.indexOf("export const PROOF_METHOD_LABELS"))
    const cuerpo = tabla.slice(0, tabla.indexOf("}"))
    expect(cuerpo).not.toContain('"branch"')
    expect(cuerpo).not.toContain('"cash"')
  })
})
