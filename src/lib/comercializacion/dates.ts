const TZ = "America/Mexico_City"

function mexicoCityDateParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0"
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  }
}

/**
 * Límites de la semana actual (lunes 00:00 → domingo 23:59) en
 * America/Mexico_City, devueltos como ISO (UTC) para comparar contra
 * TIMESTAMPTZ.
 */
export function getWeekBounds(now = new Date()): {
  startISO: string
  endISO: string
} {
  const { year, month, day } = mexicoCityDateParts(now)
  const local = new Date(year, month - 1, day, 0, 0, 0)
  const diffToMonday = (local.getDay() + 6) % 7 // getDay(): 0=domingo
  const monday = new Date(local)
  monday.setDate(local.getDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  // CDMX = UTC-6 (sin horario de verano desde 2022)
  const startUTC = Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate(), 6, 0, 0)
  const endUTC = Date.UTC(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 6 + 23, 59, 59)
  return {
    startISO: new Date(startUTC).toISOString(),
    endISO: new Date(endUTC).toISOString(),
  }
}

/** Límites del mes actual en CDMX, como ISO (UTC). */
export function getMonthBounds(now = new Date()): {
  startISO: string
  endISO: string
} {
  const { year, month } = mexicoCityDateParts(now)
  const startUTC = Date.UTC(year, month - 1, 1, 6, 0, 0)
  const nextMonthUTC = Date.UTC(year, month, 1, 6, 0, 0) - 1
  return {
    startISO: new Date(startUTC).toISOString(),
    endISO: new Date(nextMonthUTC).toISOString(),
  }
}

/** Límites de hoy en CDMX, como ISO (UTC). */
export function getTodayBounds(now = new Date()): {
  startISO: string
  endISO: string
} {
  const { year, month, day } = mexicoCityDateParts(now)
  const startUTC = Date.UTC(year, month - 1, day, 6, 0, 0)
  return {
    startISO: new Date(startUTC).toISOString(),
    endISO: new Date(startUTC + 86_400_000 - 1).toISOString(),
  }
}

/** Formatea una fecha ISO para mostrar en CDMX. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso))
}
