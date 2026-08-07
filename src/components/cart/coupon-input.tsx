"use client"

import { useEffect, useState } from "react"
import { useCart } from "@/contexts/cart-context"
import { Tag, X, Loader2, Check } from "lucide-react"

/**
 * Input de cupón de descuento reutilizable para las páginas de carrito.
 * Valida el código contra POST /api/coupons/validate y lo guarda en el
 * cart-context (applyCoupon) sin consumirlo; el consumo real ocurre al
 * crear la orden en /api/orders.
 */
export function CouponInput() {
  const { subtotal, discount, coupon, applyCoupon, removeCoupon } = useCart()
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Revalida el cupón persistido (localStorage) al montar o si cambia el
  // subtotal. Si ya no es válido (expiró, se agotó o el carrito bajó del
  // pedido mínimo), se quita solo para no bloquear el checkout.
  useEffect(() => {
    if (!coupon) return
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: coupon.code, subtotal }),
        })
        if (cancelled) return
        if (!response.ok) removeCoupon()
      } catch {
        // Error de red: se conserva el cupón (no quitar por un fallo temporal)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [coupon, subtotal, removeCoupon])

  const handleApply = async () => {
    const trimmed = code.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, subtotal }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || "El cupón no es válido")
        return
      }
      applyCoupon(data)
      setCode("")
    } catch {
      setError("Error de conexión. Intenta de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  // Ya hay un cupón aplicado → mostrar resumen con opción de quitarlo
  if (coupon) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Check className="w-4 h-4 text-[#108910] shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0D720D] truncate">
              Cupón {coupon.code} aplicado
            </p>
            <p className="text-xs text-[#108910]">
              Descuento de ${discount.toFixed(2)}
            </p>
          </div>
        </div>
        <button
          onClick={removeCoupon}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#0D720D] hover:text-[#de3534] transition-colors shrink-0"
          aria-label="Quitar cupón"
        >
          <X className="w-3.5 h-3.5" />
          Quitar
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="w-4 h-4 text-[#B0B3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleApply()
              }
            }}
            placeholder="Código de descuento"
            className="w-full pl-9 pr-3 py-2.5 border border-[#e0dbd2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/20 focus:border-[#108910]"
          />
        </div>
        <button
          onClick={handleApply}
          disabled={!code.trim() || loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#108910] text-white text-sm font-semibold hover:bg-[#0D720D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Validando
            </>
          ) : (
            "Aplicar"
          )}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[#de3534]">{error}</p>}
    </div>
  )
}
