import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ORDER_PAYMENT_STATUS_VALUES } from "@/lib/order-filters"
import { TERMINAL_STATUSES } from "@/lib/reconcile-payments"

/**
 * Contrato del enum `payment_status`: **el código y Postgres tienen que
 * declarar los mismos valores**.
 *
 * Contexto (deriva real, medida en producción): el enum de Postgres tenía
 * SEIS valores y el código declaraba OCHO. `processing` y `expired` nunca
 * llegaron a la base, y las dos consecuencias fueron silenciosas:
 *
 *  1. `reconcile-payments.ts` pasaba `TERMINAL_STATUSES` —que incluía
 *     `canceled`, valor que NO existe en el enum— a
 *     `.not("payment_status", "in", …)`. Postgres rechazaba la consulta
 *     ENTERA con `22P02`, así que el cron diario de reconciliación fallaba
 *     por completo: no reconciliaba *ningún* pago, no solo los cancelados.
 *  2. `handlePaymentIntentProcessing()` escribía `'processing'` sobre
 *     `orders` sin comprobar el error; el UPDATE fallaba y el pedido se
 *     quedaba en `'pending'`. La rama "En proceso" de `order-tracking.tsx`
 *     era inalcanzable.
 *
 * La guardia que debía haberlo detectado vivía en `order-filters.test.ts` y
 * comparaba `ORDER_PAYMENT_STATUS_VALUES` con `PAYMENT_STATUS_LABEL` — **dos
 * constantes de TypeScript entre sí**. Por construcción no podía ver la
 * divergencia con Postgres: ambas se movían juntas y la prueba quedaba verde
 * mientras producción fallaba. Es la misma deriva que ya había ocurrido en
 * `00135`, cuando el valor ausente era `amount_mismatch` y los pedidos con
 * monto incorrecto quedaban `'pending'` en silencio.
 *
 * Este contrato cierra esa ceguera leyendo la **fuente de verdad real**: el
 * texto de `supabase/migrations/`. El enum se declara una vez en `00001` y se
 * amplía con `ALTER TYPE … ADD VALUE` en migraciones posteriores, así que se
 * reconstruye aplicando ambos en orden de versión.
 *
 * **Limitación asumida y deliberada**: es un barrido de texto, no un parser de
 * SQL, y no consulta el enum *vivo*. Una migración aplicada fuera del
 * directorio —por ejemplo vía MCP `apply_migration`, que es justo lo que
 * produjo este desfase— seguiría siendo invisible. Es el techo de lo que puede
 * comprobarse sin acceso a la base desde el runner, y por eso va acompañado de
 * la convención documentada en `docs/OPS.md`: toda migración numerada pasa por
 * el CLI, no por `apply_migration`.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations")
const FILE_RE = /^(\d{5})_.+\.sql$/

/** Valores del enum `payment_status` declarados por las migraciones. */
function enumValuesFromMigrations(): Set<string> {
  const values = new Set<string>()

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => FILE_RE.test(f))
    .sort()

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8")

    // 1. Declaración inicial (00001): CREATE TYPE payment_status AS ENUM (…);
    const create = /CREATE TYPE payment_status AS ENUM\s*\(([^)]*)\)/i.exec(sql)
    const createBody = create?.[1]
    if (createBody) {
      for (const match of createBody.matchAll(/'([^']+)'/g)) {
        const value = match[1]
        if (value) values.add(value)
      }
    }

    // 2. Ampliaciones (00135, 00153): ALTER TYPE payment_status ADD VALUE …
    const alter = /ALTER TYPE payment_status ADD VALUE(?:\s+IF NOT EXISTS)?\s+'([^']+)'/gi
    for (const match of sql.matchAll(alter)) {
      const value = match[1]
      if (value) values.add(value)
    }
  }

  return values
}

describe("contrato del enum payment_status", () => {
  it("reconstruye el enum desde las migraciones", () => {
    // Sin esto, un barrido que dejara de encontrar las declaraciones dejaría
    // al resto del contrato pasando en falso (conjunto vacío).
    const values = enumValuesFromMigrations()
    expect(values.size).toBeGreaterThanOrEqual(4)
    expect(values.has("pending")).toBe(true)
    expect(values.has("paid")).toBe(true)
  })

  it("el código declara exactamente los valores que declaran las migraciones", () => {
    // La aserción central de la ronda: es la que la guardia anterior no podía
    // hacer porque nunca miraba fuera de TypeScript.
    expect([...ORDER_PAYMENT_STATUS_VALUES].sort()).toEqual(
      [...enumValuesFromMigrations()].sort()
    )
  })

  it("ningún estado terminal de reconciliación es ajeno al enum", () => {
    // El bug de producción exacto: `canceled` (una L) es un estado del
    // PaymentIntent de Stripe, no del enum `payment_status`. Al colarse en la
    // lista, Postgres rechazaba la consulta entera con 22P02 y el cron de
    // reconciliación dejaba de funcionar por completo.
    const values = enumValuesFromMigrations()
    const ajenos = TERMINAL_STATUSES.filter((status) => !values.has(status))
    expect(ajenos).toEqual([])
  })

  it("no declara 'canceled': la cancelación de pedidos vive en orders.status", () => {
    // Distinto de 'cancelled' (dos L), que sí es un valor de orders.status.
    expect(enumValuesFromMigrations().has("canceled")).toBe(false)
  })
})
