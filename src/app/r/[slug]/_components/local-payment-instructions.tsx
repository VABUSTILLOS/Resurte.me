"use client"

import { useState } from "react"
import {
  Check,
  Copy,
  ExternalLink,
  Clock,
  AlertCircle,
  Loader2,
  Barcode,
  Building2,
  QrCode,
  RefreshCw,
} from "lucide-react"
import { formatMoney } from "@/lib/foodos"
import type { PaymentNextAction } from "@/lib/payment-next-action"

type LocalMethod = "oxxo" | "spei" | "codi" | "unknown"

function detectMethod(action: PaymentNextAction): LocalMethod {
  if (action.voucherNumber || action.barcodeImageUrl) return "oxxo"
  if (action.clabe) return "spei"
  if (action.qrImageUrl || action.qrSvgUrl) return "codi"
  return "unknown"
}

const METHOD_META: Record<
  LocalMethod,
  { title: string; hint: string; icon: typeof Barcode }
> = {
  oxxo: {
    title: "Paga en OXXO",
    hint: "Muestra la referencia y el código de barras en cualquier tienda OXXO. Tu pedido se confirma automáticamente al acreditarse el pago.",
    icon: Barcode,
  },
  spei: {
    title: "Transfiere por SPEI",
    hint: "Haz la transferencia desde tu banca en línea con la CLABE y la referencia. Tu pedido se confirma automáticamente al acreditarse el pago.",
    icon: Building2,
  },
  codi: {
    title: "Paga con CoDi",
    hint: "Escanea el código QR con tu app bancaria y autoriza el cobro. Tu pedido se confirma automáticamente al acreditarse el pago.",
    icon: QrCode,
  },
  unknown: {
    title: "Completa tu pago",
    hint: "Tu método de pago requiere pasos adicionales. Sigue las instrucciones para confirmar el pedido.",
    icon: Clock,
  },
}

/** Botón de copiado con confirmación visual. */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin permiso de portapapeles el dato sigue visible para copiarlo a mano.
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <p className="font-mono text-sm font-bold text-stone-900 break-all">{value}</p>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copiar ${label}`}
          className="shrink-0 flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  )
}

/**
 * Instrucciones para completar un pago con método local asíncrono
 * (OXXO, SPEI, CoDi) dentro del micrositio FoodOS.
 *
 * El pago NO se confirma aquí: el acreditamiento lo reporta Stripe por webhook
 * y el pedido pasa a `paid`. Por eso el botón de comprobación es manual —un
 * voucher de OXXO puede tardar horas— y se apoya en el endpoint público de
 * tracking, que ya valida que el slug corresponda al restaurante del pedido.
 */
export function LocalPaymentInstructions({
  action,
  amount,
  orderId,
  slug,
  onPaid,
  onClose,
}: {
  action: PaymentNextAction
  amount: number
  orderId: string
  slug: string
  /** Se llama cuando el pedido ya figura como pagado. */
  onPaid: () => void
  /** Se llama al cerrar sin pago confirmado (el pedido sigue pendiente). */
  onClose: () => void
}) {
  const method = detectMethod(action)
  const meta = METHOD_META[method]
  const Icon = meta.icon

  const [checking, setChecking] = useState(false)
  const [checkMessage, setCheckMessage] = useState<string | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  const expiresAt = action.expiresAt ? new Date(action.expiresAt) : null
  const expiresLabel =
    expiresAt && !Number.isNaN(expiresAt.getTime())
      ? expiresAt.toLocaleDateString("es-MX", {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null

  const checkStatus = async () => {
    setChecking(true)
    setCheckError(null)
    setCheckMessage(null)
    try {
      const res = await fetch(
        `/api/foodos/orders/${orderId}/track?slug=${encodeURIComponent(slug)}`
      )
      const data = await res.json()
      if (!res.ok) {
        setCheckError(data.error ?? "No pudimos consultar el estado del pedido.")
        return
      }
      if (data.payment_status === "paid") {
        onPaid()
        return
      }
      if (data.payment_status === "expired") {
        setCheckError(
          "Esta referencia caducó y el pago no se acreditó. Vuelve a intentar el pago para generar una nueva."
        )
        return
      }
      setCheckMessage(
        "Todavía no se acredita tu pago. Algunos métodos tardan unas horas; puedes volver a revisar más tarde."
      )
    } catch {
      setCheckError("No pudimos consultar el estado del pedido. Revisa tu conexión.")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand-50 p-2.5 text-brand-700">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-black text-stone-900 text-lg leading-tight">
            {meta.title}
          </h2>
          <p className="text-sm text-stone-500">
            Total a pagar: <strong className="text-stone-800">{formatMoney(amount)}</strong>
          </p>
        </div>
      </div>

      <p className="text-sm text-stone-600">{meta.hint}</p>

      {method === "oxxo" && action.voucherNumber && (
        <CopyField label="Referencia" value={action.voucherNumber} />
      )}

      {method === "oxxo" && action.barcodeImageUrl && (
        <div className="rounded-xl border border-stone-200 bg-white p-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen servida por Stripe, tamaño fijo */}
          <img
            src={action.barcodeImageUrl}
            alt="Código de barras del voucher OXXO"
            className="mx-auto h-24 w-auto"
          />
        </div>
      )}

      {method === "spei" && action.clabe && (
        <CopyField label="CLABE" value={action.clabe} />
      )}
      {method === "spei" && action.bankName && (
        <p className="text-xs text-stone-500">Banco destino: {action.bankName}</p>
      )}
      {method === "spei" && action.reference && (
        <CopyField label="Referencia" value={action.reference} />
      )}

      {method === "codi" && action.qrImageUrl && (
        <div className="rounded-xl border border-stone-200 bg-white p-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR servido por Stripe, tamaño fijo */}
          <img
            src={action.qrImageUrl}
            alt="Código QR de CoDi"
            className="mx-auto h-48 w-48"
          />
        </div>
      )}
      {method === "codi" && !action.qrImageUrl && action.reference && (
        <CopyField label="Referencia" value={action.reference} />
      )}

      {action.hostedInstructionsUrl && (
        <a
          href={action.hostedInstructionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ExternalLink className="w-4 h-4" />
          Ver instrucciones completas
        </a>
      )}

      {expiresLabel && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Esta referencia es válida hasta el {expiresLabel}.</span>
        </div>
      )}

      {checkMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
          <RefreshCw className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{checkMessage}</span>
        </div>
      )}

      {checkError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{checkError}</span>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
        >
          Cerrar
        </button>
        <button
          type="button"
          onClick={checkStatus}
          disabled={checking}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {checking ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Revisando...
            </>
          ) : (
            "Ya pagué, revisar estado"
          )}
        </button>
      </div>
    </div>
  )
}
