"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Copy, Link2, Loader2, Send, Trash2, Wallet, X } from "lucide-react"
import { PAYMENT_METHOD_LABEL } from "@/lib/order-labels"
import type { PaymentMethod } from "@/types"

interface PaymentRow {
  id: string
  amount: number
  method: string
  origin: string
  status: "recorded" | "voided"
  note: string | null
  created_at: string
}

interface PaymentsData {
  available: boolean
  total: number
  paidAmount: number
  balance: number
  isPaidStatus: boolean
  paymentStatus: string
  payments: PaymentRow[]
  paymentLink: { url: string; amount: number | null; createdAt: string | null } | null
}

type Props = {
  orderId: number
  /** Estado del pedido: un pedido cancelado no admite pagos ni links. */
  status: string
  /** Se llama tras registrar o anular un pago, para refrescar la lista. */
  onChanged: () => void
}

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "spei", label: "SPEI (transferencia)" },
  { value: "cash_on_delivery", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "oxxo", label: "OXXO" },
  { value: "mercado_pago", label: "Mercado Pago" },
  { value: "codi", label: "CoDi" },
]

/**
 * Pagos del pedido (Ola 4, migración 00233): el libro de abonos,
 * el saldo y el link de pago de Stripe.
 *
 * El saldo que se pinta es el que calcula el servidor (total −
 * abonos registrados); esta sección no suma nada por su cuenta.
 * Registrar un pago aquí deja el asiento en el libro —distinto del
 * «Confirmar pago» de siempre, que solo voltea el estado— y si el
 * libro cubre el total, el pedido pasa a pagado en el servidor.
 */
export function PaymentsSection({ orderId, status, onChanged }: Props) {
  const [data, setData] = useState<PaymentsData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("spei")
  const [note, setNote] = useState("")

  const [linkAmount, setLinkAmount] = useState("")
  const [link, setLink] = useState<{ url: string; amount: number | null } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/payments`)
      const json = (await res.json().catch(() => null)) as PaymentsData | { error?: string } | null
      if (!res.ok || !json || !("total" in json)) {
        setLoadError(
          json && "error" in json && json.error ? json.error : "No se pudieron leer los pagos"
        )
        return
      }
      setData(json)
      setLink(json.paymentLink ? { url: json.paymentLink.url, amount: json.paymentLink.amount } : null)
    } catch {
      setLoadError("No se pudieron leer los pagos")
    }
  }, [orderId])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const cancelled = status === "cancelled"
  const balance = data?.balance ?? 0
  const canRegister = !!data?.available && !data.isPaidStatus && !cancelled && balance > 0
  const canLink = !!data && !data.isPaidStatus && !cancelled && balance > 0

  async function registerPayment() {
    const value = Number(amount || balance)
    if (!Number.isFinite(value) || value <= 0) {
      setError("Escribe un monto válido mayor a cero")
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: value,
          method,
          note: note.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? "No se pudo registrar el pago")
        return
      }
      setAmount("")
      setNote("")
      setNotice(
        json?.becamePaid
          ? "Pago registrado: el pedido quedó pagado por completo."
          : `Pago registrado. Saldo restante: $${Number(json?.balance ?? 0).toFixed(2)}.`
      )
      await load()
      onChanged()
    } catch {
      setError("No se pudo registrar el pago")
    } finally {
      setBusy(false)
    }
  }

  async function voidPayment(paymentId: string) {
    if (!window.confirm("¿Anular este pago del libro? Dejará de contar en el saldo.")) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/payments/${paymentId}`, {
        method: "DELETE",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? "No se pudo anular el pago")
        return
      }
      setNotice(
        json?.revertedPaid
          ? "Pago anulado: el pedido volvió a figurar como pendiente de pago."
          : "Pago anulado."
      )
      await load()
      onChanged()
    } catch {
      setError("No se pudo anular el pago")
    } finally {
      setBusy(false)
    }
  }

  async function generateLink(send: boolean) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const parsed = linkAmount.trim() ? Number(linkAmount) : undefined
      const res = await fetch(`/api/admin/orders/${orderId}/payment-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(parsed != null && Number.isFinite(parsed) ? { amount: parsed } : {}),
          send,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? "No se pudo generar el link de pago")
        return
      }
      setLink({ url: json.url, amount: json.amount })
      if (send) {
        setNotice(
          json.sent
            ? "Link enviado por WhatsApp al teléfono del pedido."
            : "No se pudo enviar por WhatsApp (ventana de 24 h cerrada, probablemente). Copia el link y pégalo donde hables con el cliente."
        )
      } else {
        setNotice(json.reused ? "Este link ya estaba generado y sigue vigente." : "Link de pago generado.")
      }
    } catch {
      setError("No se pudo generar el link de pago")
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("No se pudo copiar el link")
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-gray-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-700">Pagos y link de pago</span>
        {data &&
          (data.isPaidStatus ? (
            <span className="ml-auto text-[10px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
              Pagado
            </span>
          ) : balance > 0 ? (
            <span className="ml-auto text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              Saldo ${balance.toFixed(2)}
            </span>
          ) : null)}
      </div>

      {loadError && (
        <p className="flex items-start gap-1.5 text-[11px] text-red-700">
          <X className="w-3 h-3 mt-0.5 shrink-0" />
          {loadError}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white border border-gray-200 px-2 py-1.5">
              <p className="text-[10px] text-gray-500">Total</p>
              <p className="text-xs font-bold text-gray-900">${data.total.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 px-2 py-1.5">
              <p className="text-[10px] text-gray-500">Abonado</p>
              <p className="text-xs font-bold text-green-700">${data.paidAmount.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 px-2 py-1.5">
              <p className="text-[10px] text-gray-500">Saldo</p>
              <p className="text-xs font-bold text-gray-900">${data.balance.toFixed(2)}</p>
            </div>
          </div>

          {!data.available && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
              El libro de pagos se activa al aplicar la migración 00233 en Supabase. El link de
              pago funciona desde ya; los abonos se podrán registrar en cuanto se aplique.
            </p>
          )}

          {data.available && data.payments.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-lg bg-white border border-gray-200 px-2">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[11px] font-medium text-gray-800 ${
                        p.status === "voided" ? "line-through text-gray-500" : ""
                      }`}
                    >
                      ${p.amount.toFixed(2)} ·{" "}
                      {PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method}
                      <span className="text-gray-500 font-normal">
                        {" "}
                        · {p.origin === "stripe_link" ? "Link de Stripe" : "Manual"}
                      </span>
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {new Date(p.created_at).toLocaleString("es-MX")}
                      {p.note ? ` · ${p.note}` : ""}
                      {p.status === "voided" ? " · Anulado" : ""}
                    </p>
                  </div>
                  {p.status === "recorded" && !cancelled && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void voidPayment(p.id)}
                      aria-label="Anular este pago"
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Anular
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canRegister && (
            <div className="space-y-2 rounded-lg bg-white border border-gray-200 p-2">
              <p className="text-[11px] font-semibold text-gray-700">
                Registrar un pago (anticipo o abono)
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={balance.toFixed(2)}
                  aria-label="Monto del pago"
                  className="w-24 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
                  disabled={busy}
                />
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  aria-label="Método del pago"
                  className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
                  disabled={busy}
                >
                  {METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota opcional (folio de la transferencia, quién pagó…)"
                aria-label="Nota del pago"
                className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
                disabled={busy}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void registerPayment()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wallet className="w-3 h-3" />}
                Registrar pago
              </button>
              <p className="text-[10px] text-gray-500">
                Sin monto se registra el saldo completo (${balance.toFixed(2)}). Si el libro cubre
                el total, el pedido pasa a pagado.
              </p>
            </div>
          )}

          {canLink && (
            <div className="space-y-2 rounded-lg bg-white border border-gray-200 p-2">
              <p className="text-[11px] font-semibold text-gray-700">
                Link de pago con tarjeta (Stripe)
              </p>
              {link ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 min-w-0 truncate text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">
                    {link.url}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={linkAmount}
                  onChange={(e) => setLinkAmount(e.target.value)}
                  placeholder={`Saldo: ${balance.toFixed(2)}`}
                  aria-label="Monto del link (vacío = saldo completo)"
                  className="w-28 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
                  disabled={busy}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void generateLink(false)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                  Generar link
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void generateLink(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-3 h-3" />
                  Enviar por WhatsApp
                </button>
              </div>
              <p className="text-[10px] text-gray-500">
                Página segura hospedada por Stripe. Sin monto, el link es por el saldo completo;
                con monto, es un anticipo y el resto queda de saldo. Al pagarse, el pago se
                registra solo y el pedido se marca pagado si se cubre el total.
              </p>
            </div>
          )}

          {cancelled && (
            <p className="text-[11px] text-gray-500">
              El pedido está cancelado: no admite pagos ni links.
            </p>
          )}
        </>
      )}

      {notice && (
        <p className="flex items-start gap-1.5 text-[11px] text-green-700">
          <Check className="w-3 h-3 mt-0.5 shrink-0" />
          {notice}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-red-700">
          <X className="w-3 h-3 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
