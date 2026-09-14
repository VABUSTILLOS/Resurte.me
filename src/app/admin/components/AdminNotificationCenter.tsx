"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Bell, Volume2, VolumeX, Trash2 } from "lucide-react"
import {
  buildNewOrderEvent,
  parseNotifPrefs,
  serializeNotifPrefs,
  pushEvent,
  NOTIF_PREFS_STORAGE_KEY,
  type AdminNotificationEvent,
  type NotificationPrefs,
} from "@/lib/order-notifications"
import { formatRelativeTime } from "@/lib/relative-time"
import { useEscapeKey } from "@/hooks/use-escape-key"

/** Beep corto (880 Hz, 120 ms) vía WebAudio; sin assets de audio. */
function playBeep() {
  try {
    const Ctx = window.AudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
    osc.onended = () => void ctx.close()
  } catch {
    // Sin AudioContext (navegador viejo o autoplay bloqueado): se omite
  }
}

/**
 * Fase 10 — Centro de notificaciones del área admin.
 * Reutiliza el polling de /api/admin/pending-count: cuando el conteo de
 * pendientes SUBE registra un evento, hace beep (opcional) y dispara una
 * notificación del navegador (opcional, requiere permiso). El historial
 * vive solo en la sesión.
 */
export function AdminNotificationCenter() {
  const [events, setEvents] = useState<AdminNotificationEvent[]>([])
  const [open, setOpen] = useState(false)
  // Lazy init desde localStorage: el componente es client-only (campanita de
  // la subnav), no hay mismatch de hidratación.
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => {
    try {
      return parseNotifPrefs(localStorage.getItem(NOTIF_PREFS_STORAGE_KEY))
    } catch {
      // sin localStorage: defaults en memoria
      return { sound: true, browser: false }
    }
  })
  const prevCountRef = useRef<number | null>(null)
  const eventSeq = useRef(0)

  useEscapeKey(useCallback(() => setOpen(false), []), open)

  function updatePrefs(next: NotificationPrefs) {
    setPrefs(next)
    try {
      localStorage.setItem(NOTIF_PREFS_STORAGE_KEY, serializeNotifPrefs(next))
    } catch {
      // persiste solo en memoria
    }
  }

  async function toggleBrowser() {
    if (!prefs.browser) {
      if (typeof Notification === "undefined") return
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission()
      updatePrefs({ ...prefs, browser: permission === "granted" })
    } else {
      updatePrefs({ ...prefs, browser: false })
    }
  }

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch("/api/admin/pending-count", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { count?: number }
        if (cancelled || typeof data.count !== "number") return
        const message = buildNewOrderEvent(prevCountRef.current, data.count)
        prevCountRef.current = data.count
        if (message) {
          const at = new Date().toISOString()
          eventSeq.current += 1
          setEvents((prev) => pushEvent(prev, { id: `ev-${eventSeq.current}`, message, at }))
          if (prefs.sound) playBeep()
          if (
            prefs.browser &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            new Notification("resurte.me — Admin", { body: message, tag: "admin-orders" })
          }
        }
      } catch {
        // Silencioso: el siguiente poll lo reintenta
      }
    }

    poll()
    const id = setInterval(() => {
      if (document.visibilityState === "visible") poll()
    }, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [prefs.sound, prefs.browser])

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={events.length > 0 ? `Notificaciones (${events.length})` : "Notificaciones"}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {events.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {events.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Centro de notificaciones"
          className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <p className="text-xs font-bold text-gray-900">Notificaciones</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updatePrefs({ ...prefs, sound: !prefs.sound })}
                aria-label={prefs.sound ? "Silenciar sonido" : "Activar sonido"}
                title={prefs.sound ? "Sonido activado" : "Sonido desactivado"}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
              >
                {prefs.sound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setEvents([])}
                aria-label="Limpiar notificaciones"
                title="Limpiar"
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <ul className="max-h-72 overflow-y-auto divide-y divide-gray-50">
            {events.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-gray-400">
                Sin notificaciones en esta sesión
              </li>
            )}
            {events.map((ev) => (
              <li key={ev.id} className="px-4 py-2.5">
                <p className="text-xs font-medium text-gray-800">{ev.message}</p>
                <p className="text-[10px] text-gray-400" title={new Date(ev.at).toLocaleString("es-MX")}>
                  {formatRelativeTime(ev.at)}
                </p>
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-100 px-4 py-2.5">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.browser}
                onChange={() => void toggleBrowser()}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              Notificaciones del navegador
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
