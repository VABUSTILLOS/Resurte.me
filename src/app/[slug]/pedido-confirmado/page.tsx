"use client"

import { useState, useEffect } from "react"
import { useCity } from "@/contexts/city-context"
import { CheckCircle2, ArrowRight, Package, Clock, MapPin, Store, Share2, Sparkles, TicketPercent } from "lucide-react"
import Link from "next/link"
import { AnalyticsEvents } from "@/lib/analytics"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import type { RepurchaseCouponInfo } from "@/types"

function generateOrderId(): string {
  const prefix = "RT"
  const random = Math.random().toString(36).substring(2, 7).toUpperCase()
  const timestamp = Date.now().toString(36).substring(-4).toUpperCase()
  return `${prefix}-${random}${timestamp}`
}

export default function OrderConfirmedPage() {
  const { city } = useCity()
  // Prefer the real DB order id saved by the checkout page; fall back to a
  // generated reference if it's not available (e.g. direct visit).
  const [orderId] = useState(() => {
    try {
      const raw = sessionStorage.getItem("last_order")
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.orderId) return `#${parsed.orderId}`
      }
    } catch {
      // Ignore malformed session data
    }
    return generateOrderId()
  })

  // Cashback estimado devuelto por POST /api/orders y guardado en last_order
  const [cashback] = useState<{ credits: number; tier: string | null } | null>(() => {
    try {
      const raw = sessionStorage.getItem("last_order")
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.cashbackCredits && parsed.cashbackCredits > 0) {
          return {
            credits: parsed.cashbackCredits,
            tier: parsed.cashbackTier ?? null,
          }
        }
      }
    } catch {
      // Ignore malformed session data
    }
    return null
  })

  // Cupón de recompra emitido con este pedido (solo usuarios logueados)
  const [repurchaseCoupon] = useState<RepurchaseCouponInfo | null>(() => {
    try {
      const raw = sessionStorage.getItem("last_order")
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.repurchaseCoupon?.code) return parsed.repurchaseCoupon
      }
    } catch {
      // Ignore malformed session data
    }
    return null
  })

  // Track purchase on page mount (total/items come from sessionStorage,
  // set right before the cart was cleared on the checkout page)
  useEffect(() => {
    let value: number | undefined
    let items:
      | Array<{ id: string; name: string; quantity: number; price: number }>
      | undefined

    try {
      const raw = sessionStorage.getItem("last_order")
      if (raw) {
        const parsed = JSON.parse(raw)
        value = parsed.total
        items = parsed.items
        sessionStorage.removeItem("last_order")
      }
    } catch {
      // Ignore malformed session data
    }

    AnalyticsEvents.purchase(
      orderId,
      value,
      undefined,
      items?.map((i) => ({
        item_id: i.id,
        item_name: i.name,
        quantity: i.quantity,
        price: i.price,
      }))
    )
  }, [orderId])

  if (!city) {
    return <PageSkeleton titleWidth="w-48" cards={2} className="max-w-xl" />
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
      {/* Success icon */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          ¡Pedido confirmado!
        </h1>
        <p className="text-gray-500 text-sm sm:text-base">
          Tu pedido <span className="font-mono font-bold text-brand-600">{orderId}</span> ha sido
          registrado exitosamente.
        </p>
      </div>

      {/* Order info cards */}
      <div className="space-y-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Estado del pedido</p>
            <p className="text-sm text-gray-500">Pendiente de confirmación por la tienda.</p>
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                <Clock className="w-3 h-3" />
                Pendiente
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Seguimiento en tiempo real</p>
            <p className="text-sm text-gray-500">
              Te notificaremos cuando la tienda confirme, prepare y envíe tu pedido.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Entrega en {city.name}</p>
            <p className="text-sm text-gray-500">
              Recibirás una notificación cuando el repartidor esté en camino.
            </p>
          </div>
        </div>

        {cashback && cashback.credits > 0 && (
          <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-xl p-4 flex items-start gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">¡Ganaste {cashback.credits} Créditos Resurte!</p>
              <p className="text-sm text-brand-50 mt-0.5">
                {cashback.tier ? `Nivel ${cashback.tier}` : "Recompensa"} — se abonan a tu wallet cuando la tienda confirme el pago de este pedido.
              </p>
            </div>
          </div>
        )}

        {repurchaseCoupon && (
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl p-4 flex items-start gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <TicketPercent className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">
                ¡Tu próximo pedido con {repurchaseCoupon.discount_value}% de descuento!
              </p>
              <p className="text-sm text-amber-50 mt-0.5">
                Usa el cupón <span className="font-mono font-bold">{repurchaseCoupon.code}</span>
                {repurchaseCoupon.min_order > 0 ? ` en pedidos desde $${repurchaseCoupon.min_order.toFixed(2)}` : ""}
                {" · "}Vence el {new Date(repurchaseCoupon.expires_at).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
              </p>
              <Link
                href={`/${city.slug}`}
                className="inline-flex items-center gap-1 mt-2 text-sm font-bold text-white underline underline-offset-2 hover:text-amber-100"
              >
                Usarlo ahora
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* CTA buttons */}
      <div className="space-y-3">
        <Link
          href={`/${city.slug}`}
          className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
        >
          Seguir comprando
          <ArrowRight className="w-4 h-4" />
        </Link>

        {/* WhatsApp share button — viral referral */}
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `¡Acabo de pedir mis insumos para restaurante en Resurte.me! 🥑\n\n✅ Precios de mayoreo\n✅ Entrega el mismo día\n✅ Facturación CFDI\n\nPruébalo: https://resurte.me`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => AnalyticsEvents.shareReferral()}
          className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#0F7A3D] text-white font-semibold rounded-xl hover:bg-[#0F6B3A] transition-colors"
        >
          <Share2 className="w-4 h-4" />
          Compartir con otro restaurante
        </a>

        <Link
          href={`/${city.slug}/mis-pedidos`}
          className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
        >
          <Package className="w-4 h-4" />
          Ver mis pedidos
        </Link>
      </div>
    </div>
  )
}
