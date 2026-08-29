"use client"

import { useSyncExternalStore } from "react"
import { CloudUpload, Check, CloudOff, RefreshCw } from "lucide-react"
import {
  getPanelSyncSnapshot,
  retryPendingSyncs,
  subscribePanelSync,
} from "@/lib/panel-sync"
import { t } from "@/lib/i18n/es"

/**
 * Indicador discreto del estado de sincronización de las herramientas
 * del panel (localStorage ↔ Supabase). No renderiza nada en idle.
 */
export function SyncStatusBadge() {
  const { status } = useSyncExternalStore(
    subscribePanelSync,
    getPanelSyncSnapshot,
    getPanelSyncSnapshot,
  )

  if (status === "idle") return null

  if (status === "saving") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-gray-400" role="status">
        <CloudUpload className="w-3.5 h-3.5 animate-pulse" />
        <span className="hidden md:inline">{t("panel.syncSaving")}</span>
      </span>
    )
  }

  if (status === "saved") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-[#0E7A0E]" role="status">
        <Check className="w-3.5 h-3.5" />
        <span className="hidden md:inline">{t("panel.syncSynced")}</span>
      </span>
    )
  }

  return (
    <button
      onClick={() => retryPendingSyncs()}
      className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 transition-colors"
      role="alert"
    >
      <CloudOff className="w-3.5 h-3.5" />
      <span className="hidden md:inline">{t("panel.syncError")}</span>
      <RefreshCw className="w-3 h-3" />
      <span className="hidden md:inline underline">{t("panel.syncRetry")}</span>
    </button>
  )
}
