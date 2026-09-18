"use client"

import { useState } from "react"
import { useCart } from "@/contexts/cart-context"
import { useToast } from "@/components/toast"
import { createClient } from "@/lib/supabase/client"
import {
  REORDER_CATALOG_COLUMNS,
  buildReorderPlan,
  reorderFeedback,
  type ReorderCatalogProduct,
  type ReorderSourceItem,
} from "@/lib/order-reorder"
import { AnalyticsEvents } from "@/lib/analytics"
import { RotateCcw, ShoppingCart } from "lucide-react"

interface Props {
  orderId: number
  items: readonly ReorderSourceItem[]
  /**
   * `true` para el botón ancho de una superficie de cancelación (el cliente
   * acaba de cancelar y necesita una salida), `false` para el botón compacto
   * de la lista de pedidos.
   */
  prominent?: boolean
  className?: string
}

/**
 * «Repetir pedido». Una sola implementación para las tres superficies que lo
 * ofrecen: la lista de pedidos y las dos donde el cliente puede cancelar.
 *
 * La decisión de qué se vuelve a agregar y a qué precio NO vive aquí: vive en
 * `@/lib/order-reorder`, que es lo que se prueba. Este componente sólo hace la
 * consulta al catálogo, despacha al carrito y avisa.
 */
export function RepeatOrderButton({ orderId, items, prominent = false, className = "" }: Props) {
  const { addOrderItems } = useCart()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(false)

  const handleRepeat = async (e: React.MouseEvent) => {
    // En la lista de pedidos el botón vive DENTRO del <Link> de la tarjeta: sin
    // esto, repetir el pedido también navegaría al detalle.
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    setBusy(true)

    let catalog: Map<number, ReorderCatalogProduct> | null = null
    try {
      const supabase = createClient()
      if (!supabase) throw new Error("no supabase client")
      const { data, error } = await supabase
        .from("products")
        .select(REORDER_CATALOG_COLUMNS)
        .in("id", items.map((i) => i.product_id))
      if (error) throw error
      catalog = new Map(
        ((data ?? []) as ReorderCatalogProduct[]).map((p) => [p.id, p]),
      )
    } catch {
      // Catálogo caído: `null` hace que el plan use el snapshot histórico. El
      // servidor sigue validando precios al confirmar el pedido.
      catalog = null
    }

    const plan = buildReorderPlan(items, catalog)
    if (plan.items.length > 0) {
      addOrderItems(plan.items)
      AnalyticsEvents.repeatOrder(orderId, plan.items.length)
    }

    const message = reorderFeedback(plan)
    if (message) toast(message)

    setBusy(false)
    if (plan.items.length > 0) {
      setAdded(true)
      setTimeout(() => setAdded(false), 1500)
    }
  }

  const label = added ? "¡Agregado!" : prominent ? "Repetir este pedido" : "Repetir"

  return (
    <button
      type="button"
      onClick={(e) => void handleRepeat(e)}
      disabled={busy || items.length === 0}
      aria-label={`Repetir pedido #${orderId} (${items.length} ${
        items.length === 1 ? "producto" : "productos"
      })`}
      className={
        prominent
          ? `w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl transition-colors disabled:opacity-50 touch-target ${className}`
          : `flex items-center gap-1.5 px-3.5 py-2 sm:px-2.5 sm:py-1.5 sm:text-xs text-sm font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors disabled:opacity-50 touch-target ${className}`
      }
    >
      {added ? (
        <>
          <ShoppingCart className="w-3.5 h-3.5" />
          {label}
        </>
      ) : (
        <>
          <RotateCcw className="w-3.5 h-3.5" />
          {label}
        </>
      )}
    </button>
  )
}
