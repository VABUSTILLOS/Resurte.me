"use client"

import { useEffect, useState } from "react"
import { TicketPercent } from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { AnalyticsEvents } from "@/lib/analytics"
import { getActiveRepurchaseCoupon } from "@/lib/wallet-actions"
import type { RepurchaseCouponInfo } from "@/types"

/**
 * Banner del home post-login: muestra el cupón personal vigente del usuario
 * (recompra post-compra o reactivación) con CTA "Aplicar" de 1 tap.
 */
export function RepurchaseCouponBanner() {
  const { applyCoupon, coupon } = useCart()
  const [activeCoupon, setActiveCoupon] = useState<RepurchaseCouponInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    getActiveRepurchaseCoupon()
      .then((c) => {
        if (!cancelled) setActiveCoupon(c)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!activeCoupon || coupon?.code === activeCoupon.code) return null

  const expiresLabel = new Date(activeCoupon.expires_at).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
  })

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 p-3 sm:p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/20">
        <TicketPercent className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">
          Tienes {activeCoupon.discount_value}% de descuento en tu próximo pedido
        </p>
        <p className="text-xs text-amber-50">
          Cupón {activeCoupon.code}
          {activeCoupon.min_order > 0 ? ` · mínimo $${activeCoupon.min_order.toFixed(2)}` : ""}
          {" · "}vence el {expiresLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          applyCoupon({
            code: activeCoupon.code,
            discount_type: activeCoupon.discount_type,
            discount_value: activeCoupon.discount_value,
            min_order: activeCoupon.min_order,
          })
          AnalyticsEvents.repurchaseCouponApplied(
            activeCoupon.code,
            activeCoupon.code.startsWith("EXTRA-") ? "reactivation" : "post_purchase"
          )
        }}
        className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-bold text-orange-600 transition-colors hover:bg-amber-50"
      >
        Aplicar
      </button>
    </div>
  )
}
