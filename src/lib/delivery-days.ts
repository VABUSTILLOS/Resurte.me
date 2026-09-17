import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"

// ============================================================
// Calendario de entrega del checkout
// ============================================================
// Módulo puro (sin React) para poder probarlo con un `now` inyectable.
//
// La regla que importa: el `value` que se envía al servidor es el DÍA LOCAL
// del restaurante (`YYYY-MM-DD`), nunca el día UTC. El servidor lo interpreta
// como fecha local al agendar:
//
//   new Date(`${schedule.date}T${hora}:00-06:00`)   // src/app/api/orders/route.ts
//
// Derivarlo con `toISOString()` desplazaba todas las opciones un día a partir
// de las 18:00 locales (cuando la hora local ya es el día siguiente en UTC),
// es decir toda la cena: el cliente elegía "Hoy" y su entrega se agendaba para
// mañana.
// ============================================================

export interface DeliveryDay {
  /** Día local del restaurante, `YYYY-MM-DD`. */
  value: string
  /** Etiqueta visible, en `es-MX`. */
  label: string
}

export const DELIVERY_DAY_COUNT = 7

const DAY_MS = 24 * 60 * 60 * 1000
const pad = (n: number) => String(n).padStart(2, "0")

// Se formatea con `timeZone: "UTC"` sobre el mediodía UTC del propio día: así
// la etiqueta corresponde siempre al día de `value`, sin importar la zona de
// quien mira la pantalla.
const dayLabelFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
})

/** `"2026-09-17"` → instante en el mediodía UTC de ese día natural. */
function utcNoonOf(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12))
}

/**
 * Los próximos 7 días de entrega, empezando por el día local de `now`.
 *
 * El primero se etiqueta "Hoy" y el segundo "Mañana": la etiqueta se decide
 * por posición sobre el día local, no sobre el día UTC.
 */
export function getNextDays(
  timezone: string | null | undefined = DEFAULT_TIMEZONE,
  now: Date = new Date()
): DeliveryDay[] {
  // Día local del restaurante; de aquí en adelante es aritmética de calendario
  // pura (el mediodía UTC no tiene horario de verano).
  const anchor = utcNoonOf(dayKeyOf(timezone, now))

  const days: DeliveryDay[] = []
  for (let i = 0; i < DELIVERY_DAY_COUNT; i++) {
    const date = new Date(anchor.getTime() + i * DAY_MS)
    const value = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
    const formatted = dayLabelFormatter.format(date)
    const label =
      i === 0
        ? `Hoy — ${formatted}`
        : i === 1
          ? `Mañana — ${formatted}`
          : formatted.replace(/^\w/, (c) => c.toUpperCase())
    days.push({ value, label })
  }

  return days
}
