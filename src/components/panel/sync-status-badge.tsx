"use client"

import { useState, useSyncExternalStore } from "react"
import { CloudUpload, Check, CloudOff, RefreshCw, TriangleAlert } from "lucide-react"
import {
  clearConflicts,
  getPanelSyncSnapshot,
  retryPendingSyncs,
  subscribePanelSync,
} from "@/lib/panel-sync"
import { t } from "@/lib/i18n/es"

/**
 * Indicador discreto del estado de sincronización de las herramientas
 * del panel (localStorage ↔ Supabase). No renderiza nada en idle.
 *
 * El estado `conflict` es el que necesita decisión del usuario: otro
 * dispositivo escribió la misma clave sobre una base que este ya no tenía. Si
 * los dos valores se pudieron combinar, el aviso es informativo; si no, hay que
 * decir cuál se está mostrando y ofrecer reenviar el local. Por eso el badge se
 * abre: una frase de ese tamaño no cabe en la barra.
 */
export function SyncStatusBadge() {
  const { status, conflict } = useSyncExternalStore(
    subscribePanelSync,
    getPanelSyncSnapshot,
    getPanelSyncSnapshot,
  )
  const [openConflict, setOpenConflict] = useState(false)

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

  if (status === "conflict") {
    const message =
      conflict === "kept-local" ? t("panel.syncConflictKept") : t("panel.syncConflictMerged")
    return (
      <div
        className="relative shrink-0"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpenConflict(false)
        }}
      >
        <button
          type="button"
          onClick={() => setOpenConflict((v) => !v)}
          aria-expanded={openConflict}
          aria-label={message}
          title={message}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors touch-target"
        >
          <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">{t("panel.syncConflict")}</span>
        </button>
        {openConflict && (
          <div
            role="group"
            aria-label={message}
            className="absolute right-0 top-full mt-2 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-200 bg-white p-3 shadow-lg text-left"
          >
            <p className="text-xs leading-relaxed text-gray-700">{message}</p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  retryPendingSyncs()
                  setOpenConflict(false)
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700 transition-colors touch-target"
              >
                {t("panel.syncConflictRetry")}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearConflicts()
                  setOpenConflict(false)
                }}
                className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors touch-target"
              >
                {t("panel.syncConflictDismiss")}
              </button>
            </div>
          </div>
        )}
      </div>
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
