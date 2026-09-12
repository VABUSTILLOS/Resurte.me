"use client"

/**
 * useFoodosVentasSync — importa los pedidos pagados del menú digital
 * (FoodOS) como ventas del panel (ventas-entries).
 *
 * Se monta una vez en la página de ventas: al entrar, trae los pedidos
 * pagados del restaurante del usuario y agrega los que falten (dedupe por
 * id estable). A partir de ahí fluyen a comanda, analítica y reportes.
 */

import { useEffect, useRef } from "react"
import { useSyncedRows } from "@/hooks/use-synced-rows"
import { useToast } from "@/components/toast"
import { listOrdersForSync } from "@/app/panel/foodos/actions"
import { missingFoodosEntries } from "@/lib/panel/foodos-sync"
import type { SaleEntry } from "@/components/panel/ventas/ventas-shared"

export function useFoodosVentasSync(slug: string | null) {
  const [entries, setEntries] = useSyncedRows<SaleEntry>("ventas-entries", [], slug)
  const { toast } = useToast()
  const ran = useRef(false)

  useEffect(() => {
    // Una sola corrida por montaje de la página (evita duplicar toasts en
    // StrictMode / re-renders). La dedupe por id lo hace idempotente aunque
    // corriera de nuevo.
    if (ran.current || !slug) return
    ran.current = true

    let cancelled = false
    void (async () => {
      try {
        const orders = await listOrdersForSync()
        if (cancelled || orders.length === 0) return
        const existing = new Set(entries.map((e) => e.id))
        const missing = missingFoodosEntries(orders, existing)
        if (missing.length === 0 || cancelled) return
        setEntries((prev) => [...prev, ...missing])
        toast(
          `${missing.length} venta${missing.length !== 1 ? "s" : ""} importada${missing.length !== 1 ? "s" : ""} desde tu app (pedidos pagados)`,
          "success"
        )
      } catch {
        // Sin restaurante FoodOS o sin sesión: nada que sincronizar.
      }
    })()
    return () => {
      cancelled = true
    }
    // entries cambia en cada sync; solo nos interesa el snapshot inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  return { importedCount: entries.filter((e) => e.id.startsWith("foodos-")).length }
}
