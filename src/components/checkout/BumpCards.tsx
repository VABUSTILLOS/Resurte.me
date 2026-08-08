"use client"

import { useEffect, useState } from "react"
import { Sparkles, Check } from "lucide-react"
import { MAX_BUMPS } from "@/lib/checkout-config"
import type { OrderBump } from "@/lib/order-bumps"

export interface SelectedBump {
  ruleId: number
  productId: number
  quantity: number
  unitPrice: number
}

interface BumpCardsProps {
  /** product_id → quantity del carrito (para derivar reglas server-side). */
  cartItems: { product_id: number; quantity: number }[]
  /** Bumps seleccionados (controlado desde el drawer). */
  selected: SelectedBump[]
  onChange: (selected: SelectedBump[]) => void
}

/**
 * Tarjetas de order bumps condicionales (mecánica ThriveCart).
 *
 * Consulta POST /api/cart/bumps con los items del carrito y renderiza hasta
 * MAX_BUMPS tarjetas con checkbox. El estado de selección es local (prop
 * controlada); NO toca CartProvider ni los componentes base del carrito.
 *
 * Fallback seguro: si la API falla o no hay bumps, renderiza null — el
 * checkout nunca se bloquea por esto.
 */
export function BumpCards({ cartItems, selected, onChange }: BumpCardsProps) {
  const [bumps, setBumps] = useState<OrderBump[]>([])
  // Marca la clave del carrito ya cargada para derivar "loading" sin llamar
  // setState sincrónicamente dentro del efecto (regla react-hooks).
  const [loadedFor, setLoadedFor] = useState<string>("")
  const cartKey = cartItems.map((i) => `${i.product_id}:${i.quantity}`).join("|")
  const loading = cartKey !== "" && loadedFor !== cartKey

  useEffect(() => {
    if (!cartItems || cartItems.length === 0) return
    let cancelled = false
    fetch("/api/cart/bumps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cartItems }),
    })
      .then((res) => (res.ok ? res.json() : { bumps: [] }))
      .then((data: { bumps?: OrderBump[] }) => {
        if (cancelled) return
        setBumps(data.bumps ?? [])
        // Descarta selecciones previas de bumps que ya no aplican.
        const valid = new Set((data.bumps ?? []).map((b) => b.ruleId))
        onChange(selected.filter((s) => valid.has(s.ruleId)))
      })
      .catch(() => {
        if (!cancelled) setBumps([])
      })
      .finally(() => {
        if (!cancelled) setLoadedFor(cartKey)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey])

  if (loading && bumps.length === 0) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-20 bg-gray-100 rounded-xl" />
        <div className="h-20 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (bumps.length === 0) return null

  const toggle = (bump: OrderBump) => {
    const isSelected = selected.some((s) => s.ruleId === bump.ruleId)
    let next: SelectedBump[]
    if (isSelected) {
      next = selected.filter((s) => s.ruleId !== bump.ruleId)
    } else if (selected.length < MAX_BUMPS) {
      next = [
        ...selected,
        {
          ruleId: bump.ruleId,
          productId: bump.product.id,
          quantity: 1,
          unitPrice: bump.price,
        },
      ]
    } else {
      return // ya hay MAX_BUMPS seleccionados
    }
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-[#B87A3A]" />
        <p className="text-xs font-semibold text-[#B87A3A] uppercase tracking-wide">
          Agrega a tu pedido
        </p>
      </div>
      {bumps.map((bump) => {
        const isSelected = selected.some((s) => s.ruleId === bump.ruleId)
        return (
          <button
            key={bump.ruleId}
            type="button"
            onClick={() => toggle(bump)}
            aria-pressed={isSelected}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
              isSelected
                ? "border-brand-500 bg-brand-50"
                : "border-gray-200 bg-white hover:border-brand-200"
            }`}
          >
            <div className="w-14 h-14 rounded-lg bg-[#F7F5F0] flex items-center justify-center shrink-0 overflow-hidden">
              {bump.product.image_url ? (
                <img
                  src={bump.product.image_url}
                  alt={bump.product.name}
                  loading="lazy"
                  width={56}
                  height={56}
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <Sparkles className="w-5 h-5 text-[#C7C8CD]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-tight">
                {bump.title}
              </p>
              <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                {bump.description}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-sm font-bold text-brand-700">
                  ${bump.price.toFixed(2)}
                </span>
                {bump.original_price > bump.price && (
                  <span className="text-xs text-gray-400 line-through">
                    ${bump.original_price.toFixed(2)}
                  </span>
                )}
                {bump.discount_pct > 0 && (
                  <span className="text-[10px] font-semibold text-white bg-brand-600 px-1.5 py-0.5 rounded">
                    -{Math.round(bump.discount_pct * 100)}%
                  </span>
                )}
              </div>
            </div>
            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                isSelected ? "border-brand-600 bg-brand-600" : "border-gray-300"
              }`}
            >
              {isSelected && <Check className="w-4 h-4 text-white" />}
            </div>
          </button>
        )
      })}
      <p className="text-[11px] text-gray-400">
        Hasta {MAX_BUMPS} artículos especiales por pedido.
      </p>
    </div>
  )
}
