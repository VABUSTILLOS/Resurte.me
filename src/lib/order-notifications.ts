/**
 * Fase 10 — lógica pura del centro de notificaciones admin:
 * detección de pedidos nuevos por conteo y preferencias persistidas.
 */

export interface NotificationPrefs {
  /** Beep corto vía WebAudio al llegar un pedido nuevo */
  sound: boolean
  /** Notificación del navegador (Notification API) */
  browser: boolean
}

export const NOTIF_PREFS_STORAGE_KEY = "admin-notif-prefs"

export const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  sound: true,
  browser: false,
}

export function parseNotifPrefs(json: string | null): NotificationPrefs {
  if (!json) return DEFAULT_NOTIF_PREFS
  try {
    const raw: unknown = JSON.parse(json)
    if (typeof raw !== "object" || raw === null) return DEFAULT_NOTIF_PREFS
    const p = raw as Partial<NotificationPrefs>
    return {
      sound: typeof p.sound === "boolean" ? p.sound : DEFAULT_NOTIF_PREFS.sound,
      browser: typeof p.browser === "boolean" ? p.browser : DEFAULT_NOTIF_PREFS.browser,
    }
  } catch {
    return DEFAULT_NOTIF_PREFS
  }
}

export function serializeNotifPrefs(prefs: NotificationPrefs): string {
  return JSON.stringify(prefs)
}

/**
 * Compara el conteo de pendientes entre polls. Devuelve el mensaje del
 * evento cuando SUBE el conteo (entró pedido nuevo); null en cualquier
 * otro caso (incluye la primera carga, cuando prevCount es null).
 */
export function buildNewOrderEvent(
  prevCount: number | null,
  nextCount: number
): string | null {
  if (prevCount === null) return null
  if (nextCount <= prevCount) return null
  const diff = nextCount - prevCount
  return diff === 1
    ? "Nuevo pedido recibido"
    : `${diff} pedidos nuevos recibidos`
}

/** Evento del centro de notificaciones (solo vive en la sesión). */
export interface AdminNotificationEvent {
  id: string
  message: string
  at: string // ISO
}

export const MAX_NOTIFICATION_EVENTS = 20

/** Inserta el evento al frente y recorta el historial. */
export function pushEvent(
  events: AdminNotificationEvent[],
  event: AdminNotificationEvent
): AdminNotificationEvent[] {
  return [event, ...events].slice(0, MAX_NOTIFICATION_EVENTS)
}
