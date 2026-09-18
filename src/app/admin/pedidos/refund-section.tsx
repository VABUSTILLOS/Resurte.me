"use client"

import { useState } from "react"
import { AlertTriangle, Check, Loader2, RotateCcw, X } from "lucide-react"
import { PAYMENT_STATUS_LABEL } from "@/lib/order-labels"

type Props = {
  orderId: number
  /** Estado de pago del pedido (`payment_status`). */
  paymentStatus: string
  /** Centavos ya devueltos al cliente, o null si el esquema aún no lo reporta. */
  refundedAmountCents: number | null
  /** Se llama tras un reembolso exitoso, para refrescar la lista y el pedido. */
  onChanged: () => void
}

/**
 * Reembolso del pedido (migración 00187).
 *
 * El importe que se puede devolver lo manda **Stripe**, no `orders.total`:
 * `total` es lo que el panel calculó al crear el pedido y puede no coincidir
 * con lo cobrado (propina añadida al PaymentIntent, cupón aplicado después).
 * Por eso este bloque no calcula el saldo restante por su cuenta: deja el
 * campo vacío y deja que la ruta decida —vacío significa "todo lo pendiente"—
 * y muestra el saldo real cuando la ruta lo informa en un error.
 *
 * El reembolso NO cambia el estado del pedido: devolver dinero y cancelar son
 * ejes distintos. Por eso este bloque nunca toca `status`.
 */
export function RefundSection({
  orderId,
  paymentStatus,
  refundedAmountCents,
  onChanged,
}: Props) {
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [remainingHint, setRemainingHint] = useState<number | null>(null)

  const refundedCents = refundedAmountCents ?? 0
  const refundable = paymentStatus === "paid" || paymentStatus === "partially_refunded"
  const settled = paymentStatus === "refunded"

  async function refund(fullRemaining: boolean) {
    const pesos = Number(amount.replace(",", "."))
    const amountCents = Math.round(pesos * 100)

    if (!fullRemaining && (!Number.isFinite(pesos) || amountCents <= 0)) {
      setError("Escribe un monto mayor que 0")
      return
    }

    const label = fullRemaining
      ? "todo lo que queda pendiente"
      : `$${pesos.toFixed(2)}`
    if (
      !window.confirm(
        `¿Reembolsar ${label} del pedido #${orderId}? El dinero sale de Stripe y no se puede deshacer.`
      )
    ) {
      return
    }

    setBusy(true)
    setError(null)
    setDone(null)
    setRemainingHint(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(fullRemaining ? {} : { amount_cents: amountCents }),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "No se pudo procesar el reembolso")
        if (typeof data?.refundable_cents === "number") {
          setRemainingHint(data.refundable_cents)
        }
        return
      }
      setAmount("")
      setReason("")
      setDone(
        `Reembolsados $${((data?.amount_cents ?? 0) / 100).toFixed(2)} · ${
          PAYMENT_STATUS_LABEL[data?.payment_status] ?? data?.payment_status
        }`
      )
      onChanged()
    } catch {
      setError("No se pudo procesar el reembolso")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <RotateCcw className="w-4 h-4 text-gray-600 shrink-0" />
        <span className="text-xs font-semibold text-gray-700">Reembolso</span>
        <span
          className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${
            settled
              ? "text-gray-600 bg-white border border-gray-200"
              : refundedCents > 0
                ? "text-amber-700 bg-amber-50"
                : "text-gray-500 bg-white border border-gray-200"
          }`}
        >
          {refundedCents > 0
            ? `$${(refundedCents / 100).toFixed(2)} devueltos`
            : "Sin reembolsos"}
        </span>
      </div>

      {settled ? (
        <p className="text-xs text-gray-500">
          El pedido está reembolsado por completo. No queda saldo por devolver.
        </p>
      ) : !refundable ? (
        <p className="text-xs text-gray-600">
          Solo se puede reembolsar un pedido cobrado. Este está en{" "}
          <span className="font-medium text-gray-600">
            {PAYMENT_STATUS_LABEL[paymentStatus] ?? paymentStatus}
          </span>
          .
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              id={`refund-amount-${orderId}`}
              type="text"
              inputMode="decimal"
              value={amount}
              disabled={busy}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Monto parcial en pesos"
              aria-label="Monto a reembolsar en pesos"
              className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
            />
            <button
              type="button"
              disabled={busy || !amount.trim()}
              onClick={() => void refund(false)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Reembolsar monto
            </button>
          </div>

          <input
            id={`refund-reason-${orderId}`}
            type="text"
            value={reason}
            maxLength={200}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (opcional, queda en la bitácora)"
            aria-label="Motivo del reembolso"
            className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
          />

          <button
            type="button"
            disabled={busy}
            onClick={() => void refund(true)}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            Reembolsar todo lo pendiente
          </button>

          <p className="text-[10px] text-gray-600">
            El importe se toma del cobro real en Stripe, no del total del pedido. Si el pedido se
            cobró a la cuenta del restaurante, el reembolso también revierte la transferencia. No
            cambia el estado del pedido.
          </p>

          {remainingHint !== null && (
            <p className="text-[11px] text-amber-700">
              Quedan ${(remainingHint / 100).toFixed(2)} por reembolsar en este pedido.
            </p>
          )}
        </div>
      )}

      {done && (
        <p className="flex items-start gap-1.5 text-[11px] text-green-700">
          <Check className="w-3 h-3 mt-0.5 shrink-0" />
          {done}
        </p>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-red-700">
          {error.includes("Revisa el pedido") ? (
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          ) : (
            <X className="w-3 h-3 mt-0.5 shrink-0" />
          )}
          {error}
        </p>
      )}
    </div>
  )
}
