"use client"

import { Building2, Store, Copy, Check } from "lucide-react"
import { useState } from "react"
import { useToast } from "@/components/toast"

/**
 * Instrucciones de pago para métodos manuales (SPEI / OXXO) — R6.4 / A1 parcial.
 *
 * Cuando el cliente paga con SPEI (transferencia) u OXXO (efectivo en tienda),
 * el pedido queda `payment_status: "pending"` y el admin confirma el cobro
 * manualmente (flujo existente que abona el cashback). Aquí se le muestran la
 * CLABE / referencia para completar el pago.
 *
 * Los datos bancarios/referencia se configuran por env (no hay credenciales de
 * cobro, solo la información para que el cliente transfiera):
 *   NEXT_PUBLIC_SPEI_CLABE, NEXT_PUBLIC_SPEI_BENEFICIARIO, NEXT_PUBLIC_OXXO_REFERENCIA
 * Si no están configuradas, se muestra un mensaje genérico de contacto.
 */

interface PaymentInstructionsProps {
  method: "spei" | "oxxo"
  /** Monto a pagar (para que el cliente sepa cuánto transferir). */
  amount?: number | null
  /** Referencia del pedido (p.ej. #1234) para incluir en el concepto. */
  orderRef?: string | null
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast(`${label} copiada`)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast("No se pudo copiar", "error")
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white border border-amber-200 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-amber-600">{label}</p>
        <p className="text-sm font-mono font-semibold text-gray-900 truncate">{value}</p>
      </div>
      <button
        onClick={copy}
        className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900"
        aria-label={`Copiar ${label}`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Copiada" : "Copiar"}
      </button>
    </div>
  )
}

export function PaymentInstructions({ method, amount, orderRef }: PaymentInstructionsProps) {
  const clabe = process.env.NEXT_PUBLIC_SPEI_CLABE ?? ""
  const beneficiario = process.env.NEXT_PUBLIC_SPEI_BENEFICIARIO ?? "Resurte.me"
  const oxxoRef = process.env.NEXT_PUBLIC_OXXO_REFERENCIA ?? ""

  const isSpei = method === "spei"
  const Icon = isSpei ? Building2 : Store
  const title = isSpei ? "Paga por transferencia (SPEI)" : "Paga en efectivo (OXXO)"

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-amber-600" />
        <p className="text-sm font-bold text-amber-800">{title}</p>
      </div>

      <div className="space-y-2">
        {amount != null && (
          <CopyRow label="Monto exacto" value={`$${amount.toFixed(2)} MXN`} />
        )}
        {isSpei ? (
          <>
            {clabe ? (
              <CopyRow label="CLABE" value={clabe} />
            ) : (
              <p className="text-xs text-amber-700 bg-white border border-amber-200 rounded-lg px-3 py-2">
                Te enviaremos la CLABE por WhatsApp al confirmar tu pedido.
              </p>
            )}
            <CopyRow label="Beneficiario" value={beneficiario} />
            {orderRef && <CopyRow label="Concepto / referencia" value={orderRef} />}
          </>
        ) : (
          <>
            {oxxoRef ? (
              <CopyRow label="Referencia OXXO" value={oxxoRef} />
            ) : orderRef ? (
              <CopyRow label="Referencia" value={orderRef} />
            ) : (
              <p className="text-xs text-amber-700 bg-white border border-amber-200 rounded-lg px-3 py-2">
                Te enviaremos la referencia por WhatsApp al confirmar tu pedido.
              </p>
            )}
          </>
        )}
      </div>

      <p className="text-[11px] text-amber-700 mt-3">
        {isSpei
          ? "Tu pedido se confirma y se surte en cuanto recibimos tu transferencia. Envíanos el comprobante por WhatsApp para agilizar."
          : "Presenta la referencia en cualquier OXXO y paga en caja. Tu pedido se surte al confirmar el pago."}
      </p>
    </div>
  )
}
