/**
 * Caducidad de los Créditos Resurte (ronda de mejoras, fase M7a / R17).
 *
 * Los abonos caducan a los 12 meses. Para saber cuánto de un saldo está por
 * vencer hay que repartir los canjes entre los abonos que los financiaron:
 * el monedero guarda un saldo agregado, no un saldo por lote.
 *
 * El reparto es FIFO: un canje consume primero el abono que antes caduca, así
 * que el usuario nunca pierde créditos mientras le queden lotes más nuevos.
 *
 * ⚠️ Autoridad única: quien mueve dinero es el SQL (`expire_wallet_credits`,
 * migración 00133). Este módulo **solo calcula para mostrar** — no escribe
 * saldo ni movimientos. Las dos implementaciones comparten la regla y los
 * fixtures de `wallet-expiry.test.ts`; si divergen, manda el SQL.
 *
 * Es puro y nunca lanza: recibe filas crudas de PostgREST y las normaliza.
 */

/** Meses de vigencia de un abono. Espejo del `INTERVAL '12 months'` de 00132. */
export const CREDIT_TTL_MONTHS = 12

/** Antelación del aviso "te caducan créditos". */
export const EXPIRY_WARNING_DAYS = 30

const DAY_MS = 86_400_000

/** Fila cruda de `wallet_transactions` tal como llega de PostgREST. */
export interface WalletExpiryMovement {
  id?: number | string | null
  amount: number | string | null
  created_at: string | null
  expires_at?: string | null
}

/** Un abono con su parte ya consumida por canjes y su restante vivo. */
export interface CreditLot {
  id: string | null
  createdAt: string
  expiresAt: string
  /** Créditos abonados originalmente. */
  original: number
  /** Créditos de este lote ya gastados en canjes. */
  consumed: number
  /** Créditos de este lote aún disponibles (o vencidos sin dar de baja). */
  remaining: number
  expired: boolean
}

export interface WalletExpirySummary {
  lots: CreditLot[]
  /** Restante de lotes vigentes. */
  active: number
  /** Restante de lotes ya vencidos (pendientes de la baja del cron). */
  expired: number
  /** Restante que vence dentro de la ventana de aviso. */
  expiringSoon: number
  /** Fecha ISO del próximo vencimiento con restante, o null. */
  nextExpiryAt: string | null
  /** Días que faltan para ese vencimiento, o null. */
  nextExpiryDays: number | null
  /** Restante que vence en esa próxima fecha. */
  nextExpiryAmount: number
}

/**
 * Suma meses conservando el día, recortando al último día del mes destino
 * (31 de enero + 12 meses es 31 de enero; 29 de febrero + 12, 28 de febrero).
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const daysInTarget = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(day, daysInTarget))
  return result
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Caducidad de un abono que no trae `expires_at` (migración 00132 sin aplicar,
 * o fila anterior al backfill).
 *
 * Espeja exactamente el backfill del SQL — `GREATEST(created_at + 12 months,
 * now() + 12 months)` — y no la política a secas. Aplicar la política
 * retroactivamente mostraría como vencido un saldo que el monedero todavía
 * tiene intacto: una alarma falsa sobre dinero del usuario.
 */
function deriveExpiry(createdAt: Date, now: Date): Date {
  const fromCredit = addMonths(createdAt, CREDIT_TTL_MONTHS)
  const fromPolicy = addMonths(now, CREDIT_TTL_MONTHS)
  return fromCredit.getTime() >= fromPolicy.getTime() ? fromCredit : fromPolicy
}

function toAmount(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Reparte los canjes entre los abonos (FIFO por fecha de abono) y resume
 * cuánto del saldo está vigente, vencido o por vencer.
 *
 * `expires_at` manda cuando existe; si falta (migración 00132 sin aplicar, o
 * un abono anterior al backfill) se deriva con la misma regla que el backfill
 * del SQL, para no degradar a "todo vigente para siempre" ni acusar de vencido
 * un saldo que la base de datos aún no dio de baja.
 */
export function summarizeWalletExpiry(
  movements: readonly WalletExpiryMovement[],
  options: { now?: Date } = {}
): WalletExpirySummary {
  const now = options.now ?? new Date()

  const credits: { id: string | null; createdAt: Date; expiresAt: Date; original: number }[] = []
  let debitPool = 0

  for (const movement of movements) {
    const amount = toAmount(movement.amount)
    if (amount === 0) continue
    const createdAt = toDate(movement.created_at)
    if (!createdAt) continue

    if (amount < 0) {
      debitPool += Math.abs(amount)
      continue
    }

    credits.push({
      id: movement.id === null || movement.id === undefined ? null : String(movement.id),
      createdAt,
      expiresAt: toDate(movement.expires_at) ?? deriveExpiry(createdAt, now),
      original: amount,
    })
  }

  // FIFO: el abono más antiguo se consume (y caduca) primero.
  credits.sort((a, b) => {
    const byDate = a.createdAt.getTime() - b.createdAt.getTime()
    if (byDate !== 0) return byDate
    return (a.id ?? "").localeCompare(b.id ?? "")
  })

  const warningEdge = new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY_MS)

  let active = 0
  let expired = 0
  let expiringSoon = 0
  let nextExpiryAt: Date | null = null
  let nextExpiryAmount = 0

  const lots: CreditLot[] = credits.map((credit) => {
    const taken = Math.min(debitPool, credit.original)
    debitPool -= taken
    const remaining = credit.original - taken

    return {
      id: credit.id,
      createdAt: credit.createdAt.toISOString(),
      expiresAt: credit.expiresAt.toISOString(),
      original: credit.original,
      consumed: taken,
      remaining,
      expired: credit.expiresAt.getTime() <= now.getTime(),
    }
  })

  for (const lot of lots) {
    if (lot.remaining <= 0) continue
    if (lot.expired) {
      expired += lot.remaining
      continue
    }
    active += lot.remaining
    if (new Date(lot.expiresAt).getTime() <= warningEdge.getTime()) {
      expiringSoon += lot.remaining
    }
    const candidate = new Date(lot.expiresAt)
    if (!nextExpiryAt || candidate.getTime() < nextExpiryAt.getTime()) {
      nextExpiryAt = candidate
      nextExpiryAmount = lot.remaining
    }
  }

  return {
    lots,
    active,
    expired,
    expiringSoon,
    nextExpiryAt: nextExpiryAt ? nextExpiryAt.toISOString() : null,
    nextExpiryDays: nextExpiryAt
      ? Math.max(0, Math.ceil((nextExpiryAt.getTime() - now.getTime()) / DAY_MS))
      : null,
    nextExpiryAmount,
  }
}
