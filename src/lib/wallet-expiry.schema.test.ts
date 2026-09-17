import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CREDIT_TTL_MONTHS, EXPIRY_WARNING_DAYS } from "@/lib/wallet-expiry"

/**
 * Contrato de esquema: la caducidad de créditos vive en DOS sitios que deben
 * decir lo mismo — el SQL (00132 + 00133) y `src/lib/wallet-expiry.ts`, que
 * solo calcula para mostrar. Si divergen, la tarjeta del panel promete una
 * fecha o un importe que el job no va a cumplir.
 *
 * ¿Qué detecta?
 *  - Que el TTL de la lib y el `INTERVAL` del trigger de 00132 coincidan.
 *  - Que la ventana de aviso de la lib y el `INTERVAL` de 00133 coincidan.
 *  - Que el backfill siga siendo NO retroactivo (`GREATEST(..., now() + TTL)`),
 *    que es exactamente lo que espeja `deriveExpiry`. Si alguien lo vuelve
 *    retroactivo, la lib acusaría de vencido un saldo que la BD conserva.
 *  - Que la baja sea append-only: un movimiento negativo compensatorio, sin
 *    UPDATE ni DELETE del abono original (el libro debe seguir cuadrando).
 *  - Que la baja nunca deje el saldo negativo (CHECK balance_credits >= 0).
 *  - Que sea idempotente (`expiry_settled_at`) y que el job no se duplique
 *    al re-aplicar la migración (`cron.unschedule` antes de `cron.schedule`).
 *  - Que las funciones de mantenimiento no queden expuestas por RPC.
 *
 * No ejecuta SQL: lee los archivos de migración, como los demás tests de
 * contrato de este repo (no hay Postgres en CI).
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations")

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), "utf8")
}

const MARK = readMigration("00132_wallet_credit_expiry.sql")
const JOB = readMigration("00133_wallet_credit_expiry_job.sql")

/** Quita los comentarios `--` para no dar por buena una regla solo comentada. */
function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
}

const MARK_CODE = withoutComments(MARK)
const JOB_CODE = withoutComments(JOB)

describe("00132 · marca de caducidad", () => {
  it("añade expires_at y expiry_settled_at a wallet_transactions", () => {
    expect(MARK_CODE).toMatch(/ALTER TABLE public\.wallet_transactions/i)
    expect(MARK_CODE).toMatch(/ADD COLUMN IF NOT EXISTS expires_at\s+TIMESTAMPTZ/i)
    expect(MARK_CODE).toMatch(/ADD COLUMN IF NOT EXISTS expiry_settled_at\s+TIMESTAMPTZ/i)
  })

  it("el TTL del trigger coincide con CREDIT_TTL_MONTHS", () => {
    const interval = MARK_CODE.match(/INTERVAL '(\d+) months'/i)
    expect(interval).not.toBeNull()
    expect(Number(interval?.[1])).toBe(CREDIT_TTL_MONTHS)
  })

  it("solo los abonos reciben fecha (los débitos no caducan)", () => {
    const trigger = MARK_CODE.slice(MARK_CODE.indexOf("set_wallet_credit_expiry"))
    expect(trigger).toMatch(/IF NEW\.amount > 0 AND NEW\.expires_at IS NULL THEN/)
    expect(trigger).toMatch(/NEW\.expires_at := COALESCE\(NEW\.created_at, now\(\)\) \+ INTERVAL/)
    expect(trigger).toMatch(/BEFORE INSERT ON public\.wallet_transactions/i)
  })

  it("el backfill no es retroactivo (espeja deriveExpiry)", () => {
    // GREATEST(created_at + TTL, now() + TTL): el lote viejo conserva la
    // ventana completa desde el despliegue. Sin el `now()` la lib derivaría
    // una fecha anterior a la que la BD realmente escribió.
    const backfill = MARK_CODE.slice(MARK_CODE.indexOf("UPDATE public.wallet_transactions"))
    expect(backfill).toMatch(/SET expires_at = GREATEST\(/i)
    expect(backfill).toMatch(/created_at \+ INTERVAL '\d+ months',/i)
    expect(backfill).toMatch(/now\(\) \+ INTERVAL '\d+ months'/i)
    expect(backfill).toMatch(/WHERE amount > 0\s+AND expires_at IS NULL/i)
  })

  it("el índice del job solo cubre lotes pendientes", () => {
    expect(MARK_CODE).toMatch(
      /ON public\.wallet_transactions \(expires_at\)\s+WHERE amount > 0 AND expires_at IS NOT NULL AND expiry_settled_at IS NULL/i
    )
  })

  it("el dedupe de avisos sin pedido es único por (user_id, type, dedupe_key)", () => {
    expect(MARK_CODE).toMatch(/ADD COLUMN IF NOT EXISTS dedupe_key TEXT/i)
    expect(MARK_CODE).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe\s+ON public\.notifications \(user_id, type, dedupe_key\)\s+WHERE dedupe_key IS NOT NULL/i
    )
  })
})

describe("00133 · job de caducidad", () => {
  it("la baja es append-only: nunca edita ni borra el abono", () => {
    expect(JOB_CODE).not.toMatch(/DELETE FROM public\.wallet_transactions/i)
    expect(JOB_CODE).not.toMatch(/SET\s+amount\s*=/i)
  })

  it("compensa con un movimiento negativo del mismo libro", () => {
    expect(JOB_CODE).toMatch(
      /INSERT INTO public\.wallet_transactions \(wallet_id, amount, concept, order_id\)\s+VALUES \([^)]*-v_to_remove, 'Caducidad de créditos', NULL\)/i
    )
  })

  it("nunca deja el saldo negativo", () => {
    // wallets.balance_credits tiene CHECK (>= 0): la baja se acota al saldo.
    expect(JOB_CODE).toMatch(/v_to_remove := LEAST\(v_total_expired, COALESCE\(v_balance, 0\)\)/)
    expect(JOB_CODE).toMatch(/IF v_to_remove > 0 THEN/)
    expect(JOB_CODE).toMatch(/SET balance_credits = balance_credits - v_to_remove/i)
  })

  it("es idempotente vía expiry_settled_at, incluso en lotes sin restante", () => {
    const settle = JOB_CODE.match(/UPDATE public\.wallet_transactions[\s\S]*?SET expiry_settled_at = p_now[\s\S]*?;/i)
    expect(settle).not.toBeNull()
    // Sin filtrar por restante > 0: un lote agotado también se marca, si no
    // el job lo revisaría en cada corrida.
    expect(settle?.[0]).not.toMatch(/remaining > 0/i)
    expect(settle?.[0]).toMatch(/expiry_settled_at IS NULL/i)
  })

  it("serializa contra canjes y cashback con FOR UPDATE sobre wallets", () => {
    expect(JOB_CODE).toMatch(/FROM public\.wallets w\s+WHERE w\.id = v_wallet\.wallet_id\s+FOR UPDATE/i)
  })

  it("la ventana de aviso coincide con EXPIRY_WARNING_DAYS", () => {
    const interval = JOB_CODE.match(/INTERVAL '(\d+) days'/i)
    expect(interval).not.toBeNull()
    expect(Number(interval?.[1])).toBe(EXPIRY_WARNING_DAYS)
  })

  it("el aviso se deduplica por día de vencimiento", () => {
    expect(JOB_CODE).toMatch(/ON CONFLICT \(user_id, type, dedupe_key\) WHERE dedupe_key IS NOT NULL DO NOTHING/i)
    expect(JOB_CODE).toMatch(/'wallet-expiry:' \|\| to_char\(w\.expiry_day, 'YYYY-MM-DD'\)/)
  })

  it("el reparto FIFO usa el mismo corte que summarizeWalletExpiry", () => {
    // remaining = importe - min(max(débitos - abonado_antes, 0), importe)
    const lots = JOB_CODE.slice(JOB_CODE.indexOf("CREATE OR REPLACE FUNCTION public.wallet_credit_lots"))
    expect(lots).toMatch(/credit_before/)
    expect(lots).toMatch(/debit_total/)
    expect(lots).toMatch(/GREATEST\(\s*c\.amount - GREATEST\(COALESCE\(d\.debit_total, 0\) - c\.credit_before, 0\),\s*0\s*\)/)
    // FIFO = más antiguo primero, con desempate por id.
    expect(lots).toMatch(/ORDER BY wt\.created_at, wt\.id/i)
    expect(lots).not.toMatch(/ORDER BY wt\.created_at DESC/i)
  })

  it("las funciones de mantenimiento no se exponen por RPC", () => {
    expect(JOB_CODE).toMatch(
      /REVOKE ALL ON FUNCTION public\.wallet_credit_lots\(BIGINT\) FROM PUBLIC, anon, authenticated/i
    )
    expect(JOB_CODE).toMatch(
      /REVOKE ALL ON FUNCTION public\.expire_wallet_credits\(TIMESTAMPTZ\) FROM PUBLIC, anon, authenticated/i
    )
  })

  it("el job diario se reprograma sin duplicarse", () => {
    const unschedule = JOB_CODE.indexOf("cron.unschedule('expire-wallet-credits')")
    const schedule = JOB_CODE.indexOf("cron.schedule(\n  'expire-wallet-credits'")
    expect(unschedule).toBeGreaterThan(-1)
    expect(schedule).toBeGreaterThan(-1)
    expect(unschedule).toBeLessThan(schedule)
    expect(JOB_CODE).toMatch(/SELECT public\.expire_wallet_credits\(now\(\)\)/)
  })
})

describe("00133 · aviso de caducidad ↔ campana de notificaciones", () => {
  it("el tipo 'wallet_expiry' que emite el job tiene mapeo propio en la campana", () => {
    expect(JOB_CODE).toMatch(/'wallet_expiry'/)
    const bell = readFileSync(
      join(process.cwd(), "src", "app", "recompensas", "_components", "NotificationBell.tsx"),
      "utf8"
    )
    // Sin rama propia cae al icono genérico: el aviso es urgente, no genérico.
    expect(bell).toMatch(/type === "wallet_expiry"/)
  })
})
