/**
 * Alertas del dueño en el panel
 * =============================
 * Lógica pura de la campana de FoodOS, separada del componente para poder
 * probarla: `vitest.config.ts` no soporta `.tsx`, así que todo lo que decide
 * qué se muestra y cuántos hay sin leer vive aquí.
 *
 * POR QUÉ HAY UNA CAMPANA PROPIA
 *   La campana de `/recompensas` está atada al dominio del monedero (importa
 *   `getWalletHistory`, `getMonthlyCashbackProgress`, `deriveNotifications` y
 *   el concepto de nivel). Meterla en el panel arrastraría ese dominio entero
 *   a una pantalla que no tiene nada que ver. Esta comparte el transporte
 *   (`/api/notifications`, que ya es por usuario) pero no la presentación.
 *
 * POR QUÉ ES LA PIEZA QUE HACE HONESTA LA FUNCIÓN
 *   En producción no hay `RESEND_API_KEY` ni credenciales de WhatsApp ni claves
 *   VAPID: push y correo no entregan nada hoy. Si el aviso al dueño dependiera
 *   solo de ellos, sería una función que existe y no hace nada. La campana lee
 *   filas de la propia base, así que entrega siempre.
 */

/** Tipos de `public.notifications` que produce el aviso al dueño de FoodOS. */export const FOODOS_ALERT_TYPES = [
  "foodos_order_created",
  "foodos_payment_proof_pending",
] as const

export type FoodosAlertType = (typeof FOODOS_ALERT_TYPES)[number]

/** Fila de `public.notifications` tal como la devuelve `/api/notifications`. */
export interface ServerNotification {
  id: number
  type: string
  title: string
  body: string | null
  action_url: string | null
  order_id: number | null
  read_at: string | null
  created_at: string
}

export function isFoodosAlertType(type: string): type is FoodosAlertType {
  return (FOODOS_ALERT_TYPES as readonly string[]).includes(type)
}

/** Solo los avisos de FoodOS, más recientes primero. */
export function filterFoodosAlerts(rows: readonly ServerNotification[]): ServerNotification[] {
  return rows
    .filter((row) => isFoodosAlertType(row.type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** Cuántos avisos de FoodOS siguen sin leer. */
export function countUnreadAlerts(rows: readonly ServerNotification[]): number {
  return rows.filter((row) => !row.read_at).length
}

/** Tiempo relativo corto ("hace 5 min"). Sin dependencias de fecha del servidor. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ""
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000))
  if (seconds < 60) return "ahora"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  return `hace ${days} d`
}
