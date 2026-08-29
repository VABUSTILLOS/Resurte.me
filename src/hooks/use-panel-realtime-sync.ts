"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { applyRemoteEntry } from "@/lib/panel-sync"
import { refreshSyncedKeys } from "@/hooks/use-synced-storage"
import { refreshSyncedRowKeys } from "@/hooks/use-synced-rows"

interface PanelEntryRow {
  tool: string
  collection_slug: string
  payload: { value?: unknown } | null
  updated_at: string
}

/**
 * Multi-dispositivo para las herramientas del panel:
 *  - Usuarios con sesión: suscripción Realtime a `panel_entries`
 *    (RLS filtra a las filas del propio usuario; guests no reciben
 *    eventos porque anon no tiene permisos). Un cambio remoto se aplica
 *    al localStorage y despierta a los hooks montados; los ecos de
 *    nuestros propios pushes se ignoran en `applyRemoteEntry`.
 *  - Guests y fallback: al volver a la pestaña (visibilitychange/focus)
 *    se re-descargan las claves registradas vía `refreshSyncedKeys`.
 *
 * Montar una sola vez (layout del panel).
 */
export function usePanelRealtimeSync() {
  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null
    let cancelled = false
    let rowsRefreshTimer: ReturnType<typeof setTimeout> | null = null

    // Los eventos de panel_rows no traen el array completo: se programa
    // una re-descarga debounced de las claves por fila registradas.
    const scheduleRowsRefresh = () => {
      if (rowsRefreshTimer) clearTimeout(rowsRefreshTimer)
      rowsRefreshTimer = setTimeout(() => refreshSyncedRowKeys(), 1500)
    }

    async function subscribe() {
      if (!supabase) return
      const { data } = await supabase.auth.getSession()
      if (cancelled || !data.session) return
      channel = supabase
        .channel("panel-entries-sync")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "panel_entries" },
          (payload) => {
            const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Partial<PanelEntryRow>
            if (!row.tool || !row.collection_slug) return
            if (payload.eventType === "DELETE") return
            const value = (payload.new as PanelEntryRow).payload?.value
            applyRemoteEntry(row.tool, row.collection_slug, value)
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "panel_rows" },
          () => scheduleRowsRefresh(),
        )
        .subscribe()
    }
    subscribe()

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refreshSyncedKeys()
        refreshSyncedRowKeys()
      }
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      if (rowsRefreshTimer) clearTimeout(rowsRefreshTimer)
      document.removeEventListener("visibilitychange", onVisible)
      if (channel && supabase) supabase.removeChannel(channel)
    }
  }, [])
}
