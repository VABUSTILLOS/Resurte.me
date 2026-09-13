/**
 * Fase 7 — Fechas relativas en español para el panel admin.
 * "hace 2 min", "hace 3 h", "ayer", o fecha corta si es más viejo.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const diffMs = now.getTime() - date.getTime()
  if (Number.isNaN(diffMs)) return "—"
  if (diffMs < 0) {
    return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" })
  }

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "ahora"
  if (minutes < 60) return `hace ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`

  const days = Math.floor(hours / 24)
  if (days === 1) return "ayer"
  if (days < 7) return `hace ${days} días`

  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}
