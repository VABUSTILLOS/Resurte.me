/**
 * Resumen transparente del monedero: cuánto se ha acumulado, cuánto se ha
 * canjeado y cuál es el neto. Es puro y determinista para poder testearlo.
 */

import { mexicoMonthKey } from "@/lib/wallet-progress"

export interface WalletMovementLike {
  amount: number | string | null
  created_at: string
}

export interface WalletSummary {
  /** Saldo disponible según `wallets.balance_credits`. */
  balance: number
  /** Total de abonos (cashback) histórico. */
  earned: number
  /** Total canjeado en valor absoluto. */
  redeemed: number
  /** earned - redeemed (neto generado, no necesariamente igual al saldo). */
  net: number
  earnedThisMonth: number
  redeemedThisMonth: number
  movements: number
}

/**
 * Agrega los movimientos del monedero. Los importes no numéricos o inválidos
 * se ignoran; `amount === 0` cuenta como movimiento pero no suma.
 */
export function summarizeWallet(
  movements: WalletMovementLike[],
  options: { balance?: number; now?: Date } = {}
): WalletSummary {
  const { balance = 0, now = new Date() } = options
  const currentMonth = mexicoMonthKey(now)

  let earned = 0
  let redeemed = 0
  let earnedThisMonth = 0
  let redeemedThisMonth = 0
  let counted = 0

  for (const movement of movements) {
    // `null` es un dato incompleto (no un cero): no cuenta como movimiento.
    if (movement.amount === null || movement.amount === undefined) continue
    const amount = Number(movement.amount)
    if (!Number.isFinite(amount)) continue
    counted += 1

    const created = new Date(movement.created_at)
    const isCurrentMonth =
      !Number.isNaN(created.getTime()) && mexicoMonthKey(created) === currentMonth

    if (amount > 0) {
      earned += amount
      if (isCurrentMonth) earnedThisMonth += amount
    } else if (amount < 0) {
      const spent = Math.abs(amount)
      redeemed += spent
      if (isCurrentMonth) redeemedThisMonth += spent
    }
  }

  return {
    balance,
    earned,
    redeemed,
    net: earned - redeemed,
    earnedThisMonth,
    redeemedThisMonth,
    movements: counted,
  }
}
