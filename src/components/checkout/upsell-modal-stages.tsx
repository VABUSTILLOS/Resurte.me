"use client"

/**
 * Subcomponentes presentacionales del UpsellModal (extraídos para reducir
 * el monolito y facilitar pruebas): etapa de oferta (upsell/downsell) y
 * etapa de éxito con total consolidado. Sin estado propio — todo por props.
 */

import { AlertCircle, CheckCircle2, Sparkles } from "lucide-react"
import type { UpsellOffer } from "@/lib/upsell-offers"

export interface OfferStageProps {
  offer: UpsellOffer
  isDownsell: boolean
  error: string | null
  onAccept: () => void
  onDecline: () => void
}

export function OfferStage({ offer, isDownsell, error, onAccept, onDecline }: OfferStageProps) {
  const savings = offer.original_price - offer.price
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl bg-[#F7F5F0] flex items-center justify-center overflow-hidden shrink-0">
          {offer.product.image_url ? (
            <img
              src={offer.product.image_url}
              alt={offer.product.name}
              width={80}
              height={80}
              className="w-full h-full object-contain p-1.5"
            />
          ) : (
            <Sparkles className="w-7 h-7 text-[#C7C8CD]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 leading-tight">
            {offer.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
            {offer.description}
          </p>
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-extrabold text-[#1F2937]">
          ${offer.price.toFixed(2)}
        </span>
        {offer.original_price > offer.price && (
          <span className="text-sm text-gray-400 line-through">
            ${offer.original_price.toFixed(2)}
          </span>
        )}
        {offer.discount_pct > 0 && (
          <span className="text-[11px] font-bold text-white bg-emerald-600 px-1.5 py-0.5 rounded">
            Ahorra ${savings.toFixed(2)}
          </span>
        )}
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
        <p className="text-xs text-amber-800">
          {isDownsell ? (
            <>Una alternativa más económica. Se suma a tu envío de hoy con 1 clic.</>
          ) : (
            <>Se suma directo a tu envío de hoy. Sin costos de envío adicionales.</>
          )}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onAccept}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#1F2937] text-white font-bold py-3.5 hover:bg-gray-800 active:scale-[0.99] transition-all"
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        {isDownsell ? "Sí, lo quiero — 1 clic" : "Sí, agrégalo — 1 clic"}
      </button>
      <button
        type="button"
        onClick={onDecline}
        className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
      >
        {isDownsell ? "No, gracias — ver mi pedido" : "No, gracias"}
      </button>
    </div>
  )
}

export interface SuccessStageProps {
  orderId?: number
  baseTotal: number
  upsellAmount: number
  onDone: () => void
}

/**
 * Confirmación final consolidada: orden base + upsells pagados. Muestra el
 * resumen y deja el botón para ver el pedido confirmado (donde se despliega
 * el horario de entrega y el cashback ganado).
 */
export function SuccessStage({ orderId, baseTotal, upsellAmount, onDone }: SuccessStageProps) {
  const total = baseTotal + upsellAmount
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
      </div>
      <div>
        <p className="font-bold text-gray-900 text-lg">
          ¡Tu pedido está confirmado!
        </p>
        {orderId ? (
          <p className="text-sm text-gray-500 mt-0.5">Pedido #{orderId}</p>
        ) : null}
      </div>

      <div className="rounded-xl bg-[#F7F5F0] p-4 text-left space-y-1.5">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Pedido principal</span>
          <span className="font-medium">${baseTotal.toFixed(2)}</span>
        </div>
        {upsellAmount > 0 && (
          <div className="flex justify-between text-sm text-emerald-700">
            <span>Artículos agregados</span>
            <span className="font-medium">+${upsellAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-1.5">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Recibirás la confirmación por WhatsApp y podrás ver el horario de
        entrega en tu recibo.
      </p>

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-xl bg-[#1F2937] text-white font-bold py-3.5 hover:bg-gray-800 active:scale-[0.99] transition-all"
      >
        Ver mi pedido
      </button>
    </div>
  )
}
