"use client"

import { useEffect, useId, useRef } from "react"
import { Trash2 } from "lucide-react"
import { useEscapeKey } from "@/hooks/use-escape-key"

interface RemoveLineDialogProps {
  open: boolean
  /** Nombre del artículo que se propone eliminar. */
  itemName: string
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Confirmación para eliminar un artículo del pedido.
 *
 * Se abre cuando el usuario vuelve a picar "−" en una línea que ya está en 0:
 * el checkout nunca borra un artículo sin un "sí" explícito. Se monta sobre el
 * CheckoutDrawer, así que usa z-[90] (el panel del drawer es z-[80]).
 */
export function RemoveLineDialog({ open, itemName, onCancel, onConfirm }: RemoveLineDialogProps) {
  const titleId = useId()
  const descId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEscapeKey(onCancel, open)

  // El foco entra al botón destructivo: el usuario ya pidió quitarlo con "−".
  useEffect(() => {
    if (open) confirmRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5"
      >
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-full bg-[#FEF2F2] flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-[#DC2626]" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-[#242529]">
              ¿Eliminar del pedido?
            </h2>
            <p id={descId} className="mt-1 text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[#242529]">{itemName}</span> ya está en 0. Si
              confirmas, sale de tu pedido.
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#F7F5F0] text-[#242529] text-sm font-semibold hover:bg-[#EFEDE8] transition-colors touch-target"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#DC2626] text-white text-sm font-bold hover:bg-[#B91C1C] transition-colors touch-target"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
