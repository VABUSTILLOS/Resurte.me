"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import {
  MIN_PAYOUT_NOTE,
  MIN_PAYOUT_REFERENCE,
  formatPayoutAmount,
  parseAmountInput,
} from "@/lib/foodos-payouts"
import type { PayoutRestaurantRow } from "@/lib/foodos/actions/payouts-admin"

/**
 * Alta de una dispersión a un restaurante.
 *
 * Va aparte de la página porque tiene estado propio y tres reglas que solo
 * tienen sentido aquí: el monto no puede pasar del saldo pendiente, el
 * comprobante es obligatorio (mínimo 4 caracteres) y una dispersión negativa
 * —el restaurante devolvió dinero— exige explicar por qué. Sin esas tres, el
 * libro no sirve para conciliar contra el banco.
 *
 * La validación local replica `validatePayoutInput` y los CHECK de 00157 para
 * que el error se vea antes de la ida y vuelta. La base sigue siendo la
 * autoridad: es la única que conoce el saldo pendiente.
 *
 * El error se pinta dentro del diálogo, junto a los campos: «la dispersión
 * excede el saldo pendiente» solo sirve si se lee antes de reintentar.
 */

type SubmitState = { busy: boolean; error: string | null }

const FIELD =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
const LABEL = "block text-xs font-semibold text-gray-600 mb-1.5"
const SUBMIT =
  "flex-1 inline-flex items-center justify-center gap-1.5 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
const CANCEL_BTN =
  "flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm"

/** Reinicia el formulario cuando cambia el restaurante objetivo. */
function useResetOnRestaurant(restaurantId: string | undefined, reset: () => void) {
  const [seen, setSeen] = useState(restaurantId)
  if (seen !== restaurantId) {
    setSeen(restaurantId)
    reset()
  }
}

export function RecordPayoutDialog({
  target,
  onClose,
  onDone,
}: {
  target: PayoutRestaurantRow | null
  onClose: () => void
  onDone: () => void
}) {
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [settledAmount, setSettledAmount] = useState("")
  const [feeAmount, setFeeAmount] = useState("")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [state, setState] = useState<SubmitState>({ busy: false, error: null })

  useResetOnRestaurant(target?.restaurantId, () => {
    setPeriodStart("")
    setPeriodEnd("")
    setSettledAmount("")
    setFeeAmount("")
    setReference("")
    setNotes("")
    setState({ busy: false, error: null })
  })

  if (!target) return null

  const parsedAmount = parseAmountInput(settledAmount)
  const parsedFee = parseAmountInput(feeAmount === "" ? "0" : feeAmount)
  const outstanding = target.outstanding
  const overBalance =
    parsedAmount !== null &&
    parsedAmount > 0 &&
    parsedFee !== null &&
    parsedFee >= 0 &&
    parsedAmount + parsedFee > outstanding
  const negativeNeedsNote = parsedAmount !== null && parsedAmount < 0 && notes.trim().length < MIN_PAYOUT_NOTE
  const referenceTooShort = reference.trim().length < MIN_PAYOUT_REFERENCE

  const canSubmit =
    parsedAmount !== null &&
    parsedAmount !== 0 &&
    parsedFee !== null &&
    parsedFee >= 0 &&
    !overBalance &&
    !negativeNeedsNote &&
    !referenceTooShort

  /** Sugiere el saldo completo: es lo que se dispersa en el caso normal. */
  function fillOutstanding() {
    if (outstanding <= 0) return
    setSettledAmount(outstanding.toFixed(2))
  }

  async function submit() {
    if (!canSubmit) return
    setState({ busy: true, error: null })
    try {
      const res = await fetch("/api/admin/foodos/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: target?.restaurantId,
          periodStart,
          periodEnd,
          settledAmount,
          feeAmount: feeAmount === "" ? 0 : feeAmount,
          reference,
          notes,
        }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setState({ busy: false, error: payload?.error ?? "No se pudo registrar la dispersión" })
        return
      }
      setState({ busy: false, error: null })
      onDone()
    } catch {
      setState({ busy: false, error: "No se pudo conectar con el servidor" })
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      ariaLabelledby="payout-sheet-title"
      maxWidthClass="max-w-md"
    >
      <div className="p-6">
        <h4 id="payout-sheet-title" className="font-bold text-gray-900 mb-1">
          Registrar dispersión
        </h4>
        <p className="text-sm text-gray-500 mb-4">
          {target.restaurantName} · saldo pendiente{" "}
          <strong className={outstanding > 0 ? "text-brand-600" : "text-gray-900"}>
            {formatPayoutAmount(outstanding)}
          </strong>
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="payout-period-start">
                Periodo desde
              </label>
              <input
                id="payout-period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="payout-period-end">
                Periodo hasta
              </label>
              <input
                id="payout-period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className={FIELD}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="payout-amount">
                Monto dispersado
              </label>
              <input
                id="payout-amount"
                inputMode="decimal"
                value={settledAmount}
                onChange={(e) => setSettledAmount(e.target.value)}
                placeholder="0.00"
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="payout-fee">
                Comisión retenida
              </label>
              <input
                id="payout-fee"
                inputMode="decimal"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder="0.00"
                className={FIELD}
              />
            </div>
          </div>

          {outstanding > 0 && (
            <button
              type="button"
              onClick={fillOutstanding}
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              Usar el saldo completo ({formatPayoutAmount(outstanding)})
            </button>
          )}

          <div>
            <label className={LABEL} htmlFor="payout-reference">
              Comprobante
            </label>
            <input
              id="payout-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Folio SPEI, CLABE, últimos 4 de la transferencia…"
              className={FIELD}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Obligatorio, mínimo {MIN_PAYOUT_REFERENCE} caracteres. Es lo que permite cuadrar
              contra el estado de cuenta.
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor="payout-notes">
              Notas
            </label>
            <textarea
              id="payout-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Qué cubre esta dispersión"
              className={FIELD}
            />
            {negativeNeedsNote && (
              <p className="mt-1 text-[11px] text-amber-600">
                Una dispersión negativa exige explicar por qué (mínimo {MIN_PAYOUT_NOTE}{" "}
                caracteres).
              </p>
            )}
          </div>

          {overBalance && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-700">
              El monto más la comisión retenida supera el saldo pendiente (
              {formatPayoutAmount(outstanding)}). Baja el monto o registra primero la dispersión
              que corresponde a este periodo.
            </p>
          )}
        </div>

        {state.error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700"
          >
            {state.error}
          </p>
        )}

        <p className="mt-4 text-[11px] text-gray-400">
          Una dispersión no se puede editar ni borrar: el dinero ya salió. Si hay un error, se
          corrige registrando otra dispersión, que es lo que deja rastro.
        </p>

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={submit}
            disabled={state.busy || !canSubmit}
            className={`${SUBMIT} bg-[#0E7A0E] hover:bg-[#0D720D]`}
          >
            {state.busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Registrar
          </button>
          <button type="button" onClick={onClose} disabled={state.busy} className={CANCEL_BTN}>
            Cancelar
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
