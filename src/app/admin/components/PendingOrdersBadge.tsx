"use client"

import { useEffect, useState } from "react"

/**
 * Fase 3 — Badge con el número de pedidos pendientes junto al enlace
 * "Pedidos" de la subnav admin. Polling ligero cada 30 s contra
 * /api/admin/pending-count; se oculta cuando no hay pendientes.
 */
export function PendingOrdersBadge() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchCount() {
      try {
        const res = await fetch("/api/admin/pending-count", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { count?: number }
        if (!cancelled && typeof data.count === "number") {
          setCount(data.count)
        }
      } catch {
        // Silencioso: el badge es informativo, no bloquea la navegación
      }
    }

    fetchCount()
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchCount()
    }, 30_000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!count || count <= 0) return null

  return (
    <span
      aria-label={`${count} pedidos pendientes`}
      className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}
