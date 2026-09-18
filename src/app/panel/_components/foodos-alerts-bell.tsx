"use client"

/**
 * Campana de avisos de pedidos FoodOS.
 *
 * Es el canal que hace que el aviso al dueño no sea una promesa vacía: lee
 * `/api/notifications` (filas de `public.notifications`, la base del propio
 * dueño) y no depende de Resend, WhatsApp ni VAPID. Cuando se configuren las
 * claves VAPID, el mismo aviso además llegará por push; hasta entonces, aquí.
 *
 * El estado "leído" vive en `read_at` en el servidor, así que sobrevive entre
 * dispositivos (misma decisión que la campana de /recompensas).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck, Inbox } from "lucide-react"
import { t } from "@/lib/i18n/es"
import { useEscapeKey } from "@/hooks/use-escape-key"
import {
  countUnreadAlerts,
  filterFoodosAlerts,
  relativeTime,
  type ServerNotification,
} from "@/lib/foodos-alerts"

export function FoodosAlertsBell() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [rows, setRows] = useState<ServerNotification[]>([])
  const [loaded, setLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setIsOpen(false), [])
  useEscapeKey(close, isOpen)

  useEffect(() => {
    let cancelled = false
    fetch("/api/notifications", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((json: { notifications?: ServerNotification[] }) => {
        if (cancelled) return
        setRows(filterFoodosAlerts(json.notifications ?? []))
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Cerrar al hacer clic fuera: la campana no es un diálogo modal, así que el
  // patrón correcto es click-fuera, no atrapar el foco.
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [isOpen])

  const unread = countUnreadAlerts(rows)

  const markRead = useCallback(
    (ids: number[]) => {
      if (ids.length === 0) return
      setRows((current) =>
        current.map((row) =>
          ids.includes(row.id) ? { ...row, read_at: row.read_at ?? new Date().toISOString() } : row
        )
      )
      void fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }).catch(() => {
        // El marcado es cosmético: si falla, la próxima carga lo reintenta.
      })
    },
    []
  )

  const openAlert = useCallback(
    (row: ServerNotification) => {
      markRead([row.id])
      setIsOpen(false)
      if (row.action_url) router.push(row.action_url)
    },
    [markRead, router]
  )

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={t("panel.alertsTitle")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors touch-target"
      >
        <Bell className="w-5 h-5 text-gray-700" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t("panel.alertsTitle")}
          className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white shadow-xl z-50"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">{t("panel.alertsTitle")}</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead(rows.filter((row) => !row.read_at).map((row) => row.id))}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0E7A0E] hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                {t("panel.alertsMarkAll")}
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-gray-500">
              <Inbox className="w-6 h-6 text-gray-300" aria-hidden="true" />
              {loaded ? t("panel.alertsEmpty") : t("panel.syncSaving")}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openAlert(row)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                          row.read_at ? "bg-transparent" : "bg-red-600"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900">
                          {row.title}
                        </span>
                        {row.body && (
                          <span className="block text-xs text-gray-600 mt-0.5">{row.body}</span>
                        )}
                        <span className="block text-[11px] text-gray-400 mt-1">
                          {relativeTime(row.created_at)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
