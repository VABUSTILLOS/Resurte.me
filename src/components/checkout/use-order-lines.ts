"use client"

import { useCallback, useState } from "react"
import type { CartItem } from "@/types"
import { useCart } from "@/contexts/cart-context"
import { resolveQuantityChange } from "@/lib/order-lines"

/** Línea del pedido que espera confirmación para eliminarse. */
export interface PendingRemoval {
  kind: "item" | "bump"
  id: number
  name: string
}

interface UseOrderLinesOptions {
  /** Bumps ya agregados al pedido (para resolver el nombre al confirmar). */
  bumps: { ruleId: number; name?: string }[]
  /** Aplica una cantidad de bump en el estado del checkout. */
  onSetBumpQuantity: (ruleId: number, quantity: number) => void
  /** Quita un bump del pedido. */
  onRemoveBump: (ruleId: number) => void
}

/**
 * Estado de las líneas del pedido en el checkout: cantidades, líneas vaciadas
 * (en 0) y la confirmación de eliminación. Compartido por el CheckoutDrawer y
 * el checkout full-page para que ambos se comporten igual.
 *
 * Una línea en 0 sale del carrito (una sola fuente para totales, envío gratis
 * y `POST /api/orders`, que rechaza cantidad 0) pero sigue visible en el pedido
 * hasta que el usuario confirma quitarla o la vuelve a subir.
 */
export function useOrderLines({ bumps, onSetBumpQuantity, onRemoveBump }: UseOrderLinesOptions) {
  const { cart, addItem, updateQuantity, removeItem } = useCart()
  // Líneas vaciadas: copia de la línea del carrito con cantidad 0.
  const [emptied, setEmptied] = useState<CartItem[]>([])
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null)

  // El pedido que ve el usuario: lo que está en el carrito + lo que vació.
  const items = [...cart.items, ...emptied]

  const updateItemQuantity = useCallback(
    (productId: number, quantity: number) => {
      const action = resolveQuantityChange(
        cart.items.some((i) => i.product_id === productId),
        quantity
      )

      switch (action.type) {
        case "set":
          updateQuantity(productId, action.quantity)
          return

        case "empty": {
          const line = cart.items.find((i) => i.product_id === productId)
          if (line) {
            setEmptied((prev) =>
              prev.some((i) => i.product_id === productId)
                ? prev
                : [...prev, { ...line, quantity: 0 }]
            )
          }
          updateQuantity(productId, 0)
          return
        }

        case "restore": {
          const line = emptied.find((i) => i.product_id === productId)
          setEmptied((prev) => prev.filter((i) => i.product_id !== productId))
          if (line) addItem({ ...line, quantity: action.quantity })
          return
        }

        case "confirm-remove": {
          const line =
            emptied.find((i) => i.product_id === productId) ??
            cart.items.find((i) => i.product_id === productId)
          if (line) setPendingRemoval({ kind: "item", id: productId, name: line.name })
          return
        }
      }
    },
    [cart.items, emptied, addItem, updateQuantity]
  )

  const updateBumpQuantity = useCallback(
    (ruleId: number, quantity: number) => {
      // Un bump en 0 sigue en el pedido (no vive en el carrito), así que el
      // segundo "−" es lo que dispara la confirmación de eliminación.
      if (quantity < 0) {
        const name = bumps.find((b) => b.ruleId === ruleId)?.name ?? "Artículo especial"
        setPendingRemoval({ kind: "bump", id: ruleId, name })
        return
      }
      onSetBumpQuantity(ruleId, quantity)
    },
    [bumps, onSetBumpQuantity]
  )

  const confirmRemoval = useCallback(() => {
    const pending = pendingRemoval
    if (!pending) return
    if (pending.kind === "item") {
      setEmptied((prev) => prev.filter((i) => i.product_id !== pending.id))
      removeItem(pending.id)
    } else {
      onRemoveBump(pending.id)
    }
    setPendingRemoval(null)
  }, [pendingRemoval, removeItem, onRemoveBump])

  const cancelRemoval = useCallback(() => setPendingRemoval(null), [])

  return {
    items,
    pendingRemoval,
    updateItemQuantity,
    updateBumpQuantity,
    confirmRemoval,
    cancelRemoval,
  }
}
