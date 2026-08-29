"use client"

import { useEffect, useState } from "react"
import { Users } from "lucide-react"

/**
 * Insignia de prueba social para el checkout ("X pedidos entregados esta
 * semana"). Obtiene el dato agregado de /api/social-proof y se oculta si
 * no hay volumen suficiente o la llamada falla (fail-open).
 */
export function SocialProofBadge({ minOrders = 5 }: { minOrders?: number }) {
  const [delivered, setDelivered] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/social-proof")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { deliveredLast7Days?: number } | null) => {
        if (!cancelled && typeof data?.deliveredLast7Days === "number") {
          setDelivered(data.deliveredLast7Days)
        }
      })
      .catch(() => {
        /* fail-open: el badge simplemente no se muestra */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (delivered === null || delivered < minOrders) return null

  return (
    <div className="flex items-center gap-2 text-xs text-[#6b6b6b]">
      <Users className="w-4 h-4 text-[#0E7A0E]" />
      <span>
        <strong className="text-[#242529]">{delivered} pedidos</strong> entregados esta semana
      </span>
    </div>
  )
}
