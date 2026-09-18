"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import {
  MIN_ADJUSTMENT_REASON,
  MIN_PAYMENT_REFERENCE,
  previewAmountDue,
} from "@/lib/comercializacion/commission-ledger"
import type { CommissionPeriodRow } from "@/lib/comercializacion/actions/commissions-admin"
import { formatMoney } from "@/lib/comercializacion/commissions"

/**
 * Formularios de dinero del ledger de comisiones.
 *
 * Van aparte de la página porque son tres diálogos con estado propio
 * (pago, cancelación y ajuste) y cada uno tiene su validación. Ninguno usa
 * `alert`: el error de la API se pinta dentro del diálogo, junto al campo,
 * porque «la referencia debe tener al menos 4 caracteres» solo sirve si se
 * ve antes de reintentar.
 *
 * La validación local replica los mínimos del módulo puro
 * (`commission-ledger.ts`), que a su vez replica los CHECK de 00155. Es
 * deliberado: el usuario ve el error sin ida y vuelta, y la base sigue
 * siendo la que manda.
 */

type SubmitState = { busy: boolean; error: string | null }

const FIELD =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
const LABEL = "block text-xs font-semibold text-gray-600 mb-1.5"
const SUBMIT =
  "flex-1 inline-flex items-center justify-center gap-1.5 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
const CANCEL_BTN =
  "flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm"

/**
 * Reinicia el formulario cuando cambia el periodo objetivo.
 *
 * Se hace durante el render y no en un efecto: es el patrón que React
 * documenta para «ajustar estado cuando cambia una prop» y evita el render en
 * cascada que marca `react-hooks/set-state-in-effect`.
 */
function useResetOnPeriod(periodId: number | undefined, reset: () => void) {
  const [seen, setSeen] = useState(periodId)
  if (seen !== periodId) {
    setSeen(periodId)
    reset()
  }
}

/** Envoltorio común: título, error y par de botones. */
function Sheet({
  open,
  title,
  subtitle,
  error,
  busy,
  submitLabel,
  submitClass,
  canSubmit,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean
  title: string
  subtitle?: string
  error: string | null
  busy: boolean
  submitLabel: string
  submitClass: string
  canSubmit: boolean
  onClose: () => void
  onSubmit: () => void
  children?: React.ReactNode
}) {
  return (
    <BottomSheet open={open} onClose={onClose} ariaLabelledby="commission-sheet-title" maxWidthClass="max-w-sm">
      <div className="p-6">
        <h4 id="commission-sheet-title" className="font-bold text-gray-900 mb-1">
          {title}
        </h4>
        {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
        <div className="space-y-3">{children}</div>
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onSubmit} disabled={busy || !canSubmit} className={`${SUBMIT} ${submitClass}`}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitLabel}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={CANCEL_BTN}>
            Cancelar
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

/**
 * Pago de un periodo. La referencia es obligatoria cuando hay algo que pagar
 * (misma regla que el CHECK de 00155): un pago sin comprobante no se puede
 * auditar después.
 */
export function PayCommissionDialog({
  period,
  onClose,
  onDone,
}: {
  period: CommissionPeriodRow | null
  onClose: () => void
  onDone: () => void
}) {
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [state, setState] = useState<SubmitState>({ busy: false, error: null })

  useResetOnPeriod(period?.id, () => {
    setReference("")
    setNotes("")
    setState({ busy: false, error: null })
  })

  const needsReference = (period?.amountDue ?? 0) > 0
  const canSubmit = !needsReference || reference.trim().length >= MIN_PAYMENT_REFERENCE

  async function submit() {
    if (!period) return
    setState({ busy: true, error: null })
    try {
      const res = await fetch(`/api/admin/comisiones/${period.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reference.trim(), notes: notes.trim() || undefined }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setState({ busy: false, error: payload?.error ?? "No se pudo registrar el pago" })
        return
      }
      onDone()
    } catch {
      setState({ busy: false, error: "No se pudo conectar con el servidor" })
    }
  }

  return (
    <Sheet
      open={period !== null}
      title="Registrar pago"
      subtitle={
        period
          ? `${period.sellerName} · ${formatMoney(period.amountDue)}`
          : undefined
      }
      error={state.error}
      busy={state.busy}
      submitLabel="Marcar como pagado"
      submitClass="bg-brand-600 hover:bg-brand-700"
      canSubmit={canSubmit}
      onClose={onClose}
      onSubmit={submit}
    >
      <div>
        <label className={LABEL} htmlFor="commission-pay-ref">
          Referencia del pago {needsReference ? "" : "(opcional: no hay monto a pagar)"}
        </label>
        <input
          id="commission-pay-ref"
          className={FIELD}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="SPEI 4471, transferencia 12-oct…"
          maxLength={120}
        />
        {needsReference && reference.trim().length > 0 && reference.trim().length < MIN_PAYMENT_REFERENCE && (
          <p className="mt-1 text-xs text-amber-700">
            Al menos {MIN_PAYMENT_REFERENCE} caracteres.
          </p>
        )}
      </div>
      <div>
        <label className={LABEL} htmlFor="commission-pay-notes">
          Nota (opcional)
        </label>
        <input
          id="commission-pay-notes"
          className={FIELD}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Quién pagó, por qué medio…"
          maxLength={500}
        />
      </div>
      <p className="text-xs text-gray-400">
        Al pagar, el periodo deja de ser editable: para corregir el monto después habrá que
        agregar un ajuste, y quedará el rastro.
      </p>
    </Sheet>
  )
}

/** Cancelación de un periodo devengado. El motivo es obligatorio. */
export function CancelCommissionDialog({
  period,
  onClose,
  onDone,
}: {
  period: CommissionPeriodRow | null
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState("")
  const [state, setState] = useState<SubmitState>({ busy: false, error: null })

  useResetOnPeriod(period?.id, () => {
    setReason("")
    setState({ busy: false, error: null })
  })

  async function submit() {
    if (!period) return
    setState({ busy: true, error: null })
    try {
      const res = await fetch(`/api/admin/comisiones/${period.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setState({ busy: false, error: payload?.error ?? "No se pudo cancelar el periodo" })
        return
      }
      onDone()
    } catch {
      setState({ busy: false, error: "No se pudo conectar con el servidor" })
    }
  }

  return (
    <Sheet
      open={period !== null}
      title="Cancelar periodo"
      subtitle={period ? `${period.sellerName} · ${formatMoney(period.amountDue)} devengados` : undefined}
      error={state.error}
      busy={state.busy}
      submitLabel="Cancelar periodo"
      submitClass="bg-red-600 hover:bg-red-700"
      canSubmit={reason.trim().length >= MIN_ADJUSTMENT_REASON}
      onClose={onClose}
      onSubmit={submit}
    >
      <div>
        <label className={LABEL} htmlFor="commission-cancel-reason">
          Motivo
        </label>
        <textarea
          id="commission-cancel-reason"
          className={`${FIELD} min-h-[84px] resize-y`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Duplicado de abril, pedido reembolsado…"
          maxLength={500}
        />
        <p className="mt-1 text-xs text-gray-400">
          Al menos {MIN_ADJUSTMENT_REASON} caracteres. Un periodo cancelado no suma dinero, pero
          queda visible con su motivo.
        </p>
      </div>
    </Sheet>
  )
}

/**
 * Ajuste manual. Es append-only: se captura un movimiento y el total se
 * recalcula en la base. Para corregir un ajuste previo se captura el
 * contrario, no se edita.
 */
export function AdjustCommissionDialog({
  period,
  onClose,
  onDone,
}: {
  period: CommissionPeriodRow | null
  onClose: () => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [state, setState] = useState<SubmitState>({ busy: false, error: null })

  useResetOnPeriod(period?.id, () => {
    setAmount("")
    setReason("")
    setState({ busy: false, error: null })
  })

  const parsedAmount = Number(amount)
  const amountValid = amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount !== 0
  const canSubmit = amountValid && reason.trim().length >= MIN_ADJUSTMENT_REASON

  const preview =
    period && amountValid
      ? previewAmountDue(period.revenue, period.rate, period.adjustments + parsedAmount)
      : null

  async function submit() {
    if (!period) return
    setState({ busy: true, error: null })
    try {
      const res = await fetch(`/api/admin/comisiones/${period.id}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount, reason: reason.trim() }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setState({ busy: false, error: payload?.error ?? "No se pudo registrar el ajuste" })
        return
      }
      onDone()
    } catch {
      setState({ busy: false, error: "No se pudo conectar con el servidor" })
    }
  }

  return (
    <Sheet
      open={period !== null}
      title="Ajustar comisión"
      subtitle={period ? `${period.sellerName} · devengado ${formatMoney(period.amountDue)}` : undefined}
      error={state.error}
      busy={state.busy}
      submitLabel="Registrar ajuste"
      submitClass="bg-gray-900 hover:bg-gray-800"
      canSubmit={canSubmit}
      onClose={onClose}
      onSubmit={submit}
    >
      <div>
        <label className={LABEL} htmlFor="commission-adj-amount">
          Monto
        </label>
        <input
          id="commission-adj-amount"
          className={FIELD}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="150 o -150"
          inputMode="decimal"
        />
        <p className="mt-1 text-xs text-gray-400">
          Positivo suma, negativo descuenta. No puede ser cero.
        </p>
      </div>
      <div>
        <label className={LABEL} htmlFor="commission-adj-reason">
          Motivo
        </label>
        <input
          id="commission-adj-reason"
          className={FIELD}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Bono de temporada, cargo por devolución…"
          maxLength={500}
        />
      </div>
      {preview !== null && (
        <p className="rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-xs text-gray-600">
          Total a pagar después del ajuste: <strong>{formatMoney(preview)}</strong>
        </p>
      )}
    </Sheet>
  )
}
