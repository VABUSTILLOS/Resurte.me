"use client"

import Image from "next/image"
import { Minus, Plus, ShoppingBag } from "lucide-react"
import type { CartItem } from "@/types"
import type { SelectedBump } from "@/components/checkout/BumpCards"

interface OrderItemsListProps {
  /** Líneas visibles del pedido (incluye las que están en 0). */
  items: CartItem[]
  /** Order bumps ya agregados al pedido. */
  bumps: SelectedBump[]
  /**
   * Cambia la cantidad de un artículo del catálogo. Un valor negativo (el "−"
   * sobre una línea en 0) pide confirmación para eliminarla en lugar de
   * escribir la cantidad: ver `resolveQuantityChange` en `@/lib/order-lines`.
   */
  onUpdateItemQuantity: (productId: number, quantity: number) => void
  /** Cambia la cantidad de un artículo especial (misma regla que arriba). */
  onUpdateBumpQuantity: (ruleId: number, quantity: number) => void
  /** Resumen final de confirmación: misma lista, sin steppers. */
  readOnly?: boolean
}

/**
 * Stepper de cantidad +/− (0 incluido).
 *
 * Reutiliza el patrón visual del carrito (`cart-drawer.tsx`) para que editar
 * cantidades se sienta igual en todo el flujo. El "−" baja hasta 0 y, ya en 0,
 * pide confirmación para quitar el artículo: el checkout nunca elimina nada sin
 * un "sí" explícito del usuario.
 *
 * Exportado porque `ReviewStep` (checkout full-page) usa su propio lenguaje
 * visual de tarjeta y solo necesita el control, no la lista completa.
 */
export function QuantityStepper({
  quantity,
  label,
  onChange,
  onRequestRemove,
}: {
  quantity: number
  label: string
  onChange: (quantity: number) => void
  /** Si se pasa, el "−" en 0 no se deshabilita: pide confirmar la eliminación. */
  onRequestRemove?: () => void
}) {
  const atZero = quantity <= 0
  return (
    <div className="flex items-center gap-0.5 border border-[#E8E9EB] rounded-[10px]">
      <button
        type="button"
        onClick={() => (atZero ? onRequestRemove?.() : onChange(quantity - 1))}
        disabled={atZero && !onRequestRemove}
        aria-label={atZero ? `Eliminar ${label} del pedido` : `Reducir cantidad de ${label}`}
        className="p-2.5 sm:p-1.5 rounded-md hover:bg-[#F7F5F0] transition-colors touch-target disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[var(--text-secondary)]" />
      </button>
      <span
        className="w-8 text-center text-sm font-medium text-[#242529]"
        aria-live="polite"
        aria-label={`Cantidad: ${quantity}`}
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        aria-label={`Aumentar cantidad de ${label}`}
        className="p-2.5 sm:p-1.5 rounded-md hover:bg-[#F7F5F0] transition-colors touch-target"
      >
        <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[var(--text-secondary)]" />
      </button>
    </div>
  )
}

/** Miniatura cuadrada del producto (bumps en tono ámbar para distinguirlos). */
function Thumb({ src, alt, isBump }: { src?: string; alt: string; isBump?: boolean }) {
  return (
    <div
      className={`w-12 h-12 rounded-[10px] flex items-center justify-center shrink-0 overflow-hidden ${
        isBump ? "bg-[#FDF3E3]" : "bg-[#F7F5F0]"
      }`}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={48}
          height={48}
          className="w-full h-full object-contain p-1"
        />
      ) : isBump ? (
        <ShoppingBag className="w-5 h-5 text-[#B87A3A]" />
      ) : (
        <ShoppingBag className="w-5 h-5 text-[#C7C8CD]" />
      )}
    </div>
  )
}

/**
 * Lista de artículos del pedido (catálogo + order bumps) con cantidades
 * editables con +/− (bajan hasta 0; en 0 el "−" pide confirmar la eliminación).
 *
 * Fuente única del render de "Tu pedido" en el checkout: la usan el
 * CheckoutDrawer y el checkout full-page para que ambos permitan editar
 * cantidades igual. Los totales NO se calculan aquí: cada superficie pasa los
 * cambios a `calcCheckoutTotals`, que sigue siendo la fuente única.
 */
export function OrderItemsList({
  items,
  bumps,
  onUpdateItemQuantity,
  onUpdateBumpQuantity,
  readOnly = false,
}: OrderItemsListProps) {
  return (
    <ul className="divide-y divide-[#E8E9EB]">
      {items.map((item) => {
        const unitPrice = item.sale_price ?? item.price
        return (
          <li key={`item-${item.product_id}`} className="py-3 flex items-center gap-3">
            <Thumb src={item.image_url} alt={item.name} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#242529] truncate">
                {item.quantity}× {item.name}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">{item.brand}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                {!readOnly && (
                  <QuantityStepper
                    quantity={item.quantity}
                    label={item.name}
                    onChange={(q) => onUpdateItemQuantity(item.product_id, q)}
                    onRequestRemove={() => onUpdateItemQuantity(item.product_id, -1)}
                  />
                )}
                {item.quantity === 0 ? (
                  <span className="shrink-0 text-[10px] font-bold text-[#B91C1C] bg-[#FEF2F2] border border-[#FCA5A5] rounded-full px-2 py-0.5 uppercase tracking-wide">
                    En 0
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-[#242529]">
                    ${(unitPrice * item.quantity).toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </li>
        )
      })}

      {bumps.map((bump) => {
        const name = bump.name ?? `Artículo especial #${bump.productId}`
        return (
          <li key={`bump-${bump.ruleId}`} className="py-3 flex items-center gap-3">
            <Thumb src={bump.imageUrl} alt={name} isBump />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[#242529] truncate">
                  {bump.quantity}× {name}
                </p>
                <span className="shrink-0 text-[10px] font-bold text-[#8A5A28] bg-[#FDF3E3] border border-[#EEDCC4] rounded-full px-2 py-0.5 uppercase tracking-wide">
                  Especial
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                {readOnly ? (
                  <span className="text-xs text-[var(--text-secondary)]">
                    Agregado a tu pedido
                  </span>
                ) : (
                  <QuantityStepper
                    quantity={bump.quantity}
                    label={name}
                    onChange={(q) => onUpdateBumpQuantity(bump.ruleId, q)}
                    onRequestRemove={() => onUpdateBumpQuantity(bump.ruleId, -1)}
                  />
                )}
                {bump.quantity === 0 ? (
                  <span className="shrink-0 text-[10px] font-bold text-[#B91C1C] bg-[#FEF2F2] border border-[#FCA5A5] rounded-full px-2 py-0.5 uppercase tracking-wide">
                    En 0
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-[#B87A3A]">
                    ${(bump.unitPrice * bump.quantity).toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
