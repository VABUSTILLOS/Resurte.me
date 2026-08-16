/**
 * Cálculo de comisión estimada del vendedor.
 *
 * Regla de negocio: comisión = Σ(pedidos PAGADOS de clientes vinculados
 * al vendedor) × tasa global. La tasa se configura vía la env var
 * SELLER_COMMISSION_RATE (ej: "0.05" = 5%). Solo es una cifra estimada
 * de visualización: no hay ledger de pagos de comisiones.
 */
import { formatMoney as sharedFormatMoney } from "@/lib/money"

export function getCommissionRate(): number {
  const raw = process.env.SELLER_COMMISSION_RATE
  if (!raw) return 0.05
  const parsed = Number(raw)
  if (Number.isNaN(parsed) || parsed < 0) return 0.05
  return parsed
}

export function formatMoney(n: number): string {
  // Decimales fijos (2) — mismo output que el formato histórico de este módulo.
  return sharedFormatMoney(n, "MXN", { minDecimals: 2, maxDecimals: 2 })
}
