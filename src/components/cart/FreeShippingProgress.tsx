"use client"

import { Truck } from "lucide-react"
import { freeShippingProgress, FREE_SHIPPING_THRESHOLD } from "@/lib/checkout-config"

interface FreeShippingProgressProps {
  /** Subtotal pagable (subtotal del carrito menos descuento del cupón). */
  payableSubtotal: number
}

/**
 * Barra de progreso hacia el envío gratis (mecánica de conversión ThriveCart).
 *
 * Componente puro: recibe el subtotal pagable como prop, calcula el progreso
 * contra FREE_SHIPPING_THRESHOLD y no muta ningún estado externo.
 *
 * Estados:
 *   · subtotal >= umbral → "🎉 Tienes envío gratis" (barra completa).
 *   · subtotal < umbral  → "Agrega $X más para envío gratis".
 */
export function FreeShippingProgress({ payableSubtotal }: FreeShippingProgressProps) {
  const { percent, isFree, message } = freeShippingProgress(payableSubtotal)

  return (
    <div className="bg-[#F6FDF6] border border-brand-100 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Truck className="w-4 h-4 text-brand-600 shrink-0" />
        <p className="text-xs font-semibold text-brand-800">{message}</p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="Progreso hacia envío gratis"
        className="h-2 bg-brand-100 rounded-full overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isFree ? "bg-brand-600" : "bg-brand-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {!isFree && (
        <p className="mt-1.5 text-[11px] text-brand-700/80">
          Pide ${FREE_SHIPPING_THRESHOLD.toFixed(2)} o más y el envío corre por nuestra cuenta.
        </p>
      )}
    </div>
  )
}
