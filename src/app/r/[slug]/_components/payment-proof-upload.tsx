"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Upload, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react"
import { sf, type StorefrontLang } from "@/lib/foodos-i18n"
import type { FoodosPaymentProofMethod, FoodosPaymentProofStatus } from "@/types/foodos"

interface ProofRow {
  id: number
  method: FoodosPaymentProofMethod
  amount: number | null
  status: FoodosPaymentProofStatus
  notes: string | null
  created_at: string
}

const METHOD_LABEL: Record<FoodosPaymentProofMethod, string> = {
  transfer: "Transferencia",
  oxxo: "OXXO",
  efectivo: "Efectivo",
  otro: "Otro",
}

/**
 * Subida del comprobante de pago manual desde el micrositio.
 *
 * El comensal no tiene sesión: la autorización es el UUID del pedido
 * más el slug del restaurante, que el route handler valida contra la
 * BD antes de aceptar el archivo. Por eso la subida va por
 * `/api/foodos/orders/[id]/payment-proof` y no directo a Storage.
 */
export function PaymentProofUpload({
  restaurantSlug,
  orderId,
  lang = "es",
  defaultMethod = "transfer",
  onUploaded,
}: {
  restaurantSlug: string
  orderId: string
  lang?: StorefrontLang
  defaultMethod?: FoodosPaymentProofMethod
  onUploaded?: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [method, setMethod] = useState<FoodosPaymentProofMethod>(defaultMethod)
  const [reference, setReference] = useState("")
  const [amount, setAmount] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latest, setLatest] = useState<ProofRow | null>(null)
  const [loaded, setLoaded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/foodos/orders/${orderId}/payment-proof?slug=${encodeURIComponent(restaurantSlug)}`,
        { cache: "no-store" }
      )
      if (!res.ok) return
      const json = (await res.json()) as { payments?: ProofRow[] }
      setLatest(json.payments?.[0] ?? null)
    } finally {
      setLoaded(true)
    }
  }, [orderId, restaurantSlug])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || sending) return
    setSending(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("method", method)
      if (reference.trim()) form.append("reference", reference.trim())
      if (amount.trim()) form.append("amount", amount.trim())

      const res = await fetch(
        `/api/foodos/orders/${orderId}/payment-proof?slug=${encodeURIComponent(restaurantSlug)}`,
        { method: "POST", body: form }
      )
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null
        setError(json?.error ?? sf(lang, "proofError"))
        return
      }
      setFile(null)
      setReference("")
      setAmount("")
      if (inputRef.current) inputRef.current.value = ""
      await refresh()
      onUploaded?.()
    } catch {
      setError(sf(lang, "proofError"))
    } finally {
      setSending(false)
    }
  }

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-4 flex items-center gap-2 text-sm text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        {sf(lang, "proofPending")}
      </div>
    )
  }

  if (latest?.status === "pending") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900">
          <p className="font-bold">{sf(lang, "proofPending")}</p>
          <p className="text-amber-800 mt-1">
            {METHOD_LABEL[latest.method]}
            {latest.amount != null && ` · $${latest.amount.toFixed(2)}`}
          </p>
        </div>
      </div>
    )
  }

  if (latest?.status === "approved") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        <p className="text-sm font-bold text-emerald-900">{sf(lang, "proofApproved")}</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-stone-200 bg-white p-4 text-left"
    >
      <p className="text-sm font-bold text-stone-900 flex items-center gap-2">
        <Upload className="w-4 h-4" />
        {sf(lang, "proofUpload")}
      </p>

      {latest?.status === "rejected" && (
        <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
          <p className="font-semibold">{sf(lang, "proofRejected")}</p>
          {latest.notes && <p className="mt-1">{latest.notes}</p>}
        </div>
      )}

      <label className="mt-3 block text-xs font-medium text-stone-600">
        {sf(lang, "proofChooseFile")}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-stone-700 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-white file:text-xs file:font-semibold"
        />
      </label>
      <p className="mt-1 text-[11px] text-stone-400">{sf(lang, "proofUploadHint")}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-stone-600">
          {sf(lang, "proofAmount")}
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          {sf(lang, "proofReference")}
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={120}
            className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <select
        value={method}
        onChange={(e) => setMethod(e.target.value as FoodosPaymentProofMethod)}
        className="mt-3 w-full rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
        aria-label="Método de pago"
      >
        {(Object.keys(METHOD_LABEL) as FoodosPaymentProofMethod[]).map((m) => (
          <option key={m} value={m}>
            {METHOD_LABEL[m]}
          </option>
        ))}
      </select>

      {error && (
        <p className="mt-3 flex items-center gap-2 text-xs font-medium text-red-700">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!file || sending}
        className="mt-4 w-full py-2.5 rounded-xl bg-stone-900 text-white text-sm font-bold hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {sending && <Loader2 className="w-4 h-4 animate-spin" />}
        {sending ? sf(lang, "proofSending") : sf(lang, "proofSend")}
      </button>
    </form>
  )
}
