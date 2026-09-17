// ============================================================
// Fecha y hora locales del restaurante
// ============================================================
// Módulo puro, sin dependencias de servidor ni de React: se puede importar
// tanto desde una server action como desde un componente cliente.
//
// Vive aparte de `foodos-rfm.ts` porque lo comparten varias superficies
// (audiencias de marketing, flotilla de reparto, automatizaciones) y no
// queremos que la logística dependa del módulo de segmentación.
//
// Nota: `src/lib/whatsapp-automations-engine.ts` tiene un equivalente fijo a
// America/Mexico_City para las automatizaciones de la plataforma. Aquí la zona
// es un parámetro porque cada restaurante tiene la suya.
// ============================================================

export interface LocalDateParts {
  year: number
  month: number
  day: number
  hour: number
}

export const DEFAULT_TIMEZONE = "America/Mexico_City"

/**
 * Fecha y hora actuales en la zona del restaurante.
 *
 * Nunca lanza: si la zona es inválida se degrada a la fecha UTC en vez de
 * romper un cron o una página.
 */
export function localDateParts(
  timezone: string | null | undefined,
  now: Date = new Date()
): LocalDateParts {
  const tz = timezone?.trim() || DEFAULT_TIMEZONE
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hour12: false,
    })
    const parts = Object.fromEntries(
      fmt
        .formatToParts(now)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, Number(p.value)])
    )
    return {
      year: parts.year ?? 0,
      month: parts.month ?? 0,
      day: parts.day ?? 0,
      // `hour12: false` puede devolver 24 para medianoche en algunos ICU.
      hour: parts.hour === 24 ? 0 : (parts.hour ?? 0),
    }
  } catch {
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
      hour: now.getUTCHours(),
    }
  }
}

const pad = (n: number) => String(n).padStart(2, "0")

/** Día local del restaurante como `YYYY-MM-DD`. Útil para agrupar por día. */
export function dayKeyOf(
  timezone: string | null | undefined,
  now: Date = new Date()
): string {
  const p = localDateParts(timezone, now)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/**
 * Instante → valor de `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`).
 *
 * A diferencia del resto del módulo, aquí NO se recorta a una zona: el input
 * solo entiende la zona de quien mira la pantalla. Es el inverso exacto de
 * `new Date(valor).toISOString()`, así que abrir y guardar sin editar conserva
 * el instante. Derivarlo con `toISOString()` desplazaba la hora de pared.
 *
 * Devuelve `""` si la fecha es inválida.
 */
export function toDatetimeLocalValue(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Minutos transcurridos del día local (0..1439), para turnos de repartidor. */
export function minutesOfDay(
  timezone: string | null | undefined,
  now: Date = new Date()
): number {
  const p = localDateParts(timezone, now)
  return p.hour * 60 + minutesWithinHour(timezone, now)
}

/** Minutos dentro de la hora local (0..59). */
export function minutesWithinHour(
  timezone: string | null | undefined,
  now: Date = new Date()
): number {
  const tz = timezone?.trim() || DEFAULT_TIMEZONE
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      minute: "numeric",
    })
    return Number(fmt.format(now)) || 0
  } catch {
    return now.getUTCMinutes()
  }
}

/**
 * ¿Está `minutes` dentro del rango `start`..`end`, interpretado como horas
 * locales `HH:MM`? Soporta turnos que cruzan medianoche (`22:00`–`02:00`).
 *
 * Si el turno no está declarado (`null`) se considera siempre dentro.
 */
export function isWithinShift(
  start: string | null | undefined,
  end: string | null | undefined,
  minutes: number
): boolean {
  const from = parseHhMm(start)
  const to = parseHhMm(end)
  if (from === null || to === null) return true
  if (from === to) return true
  if (from < to) return minutes >= from && minutes < to
  // Cruza medianoche.
  return minutes >= from || minutes < to
}

/** `"09:30"` o `"09:30:00"` → 570. `null` si no es parseable. */
export function parseHhMm(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}
