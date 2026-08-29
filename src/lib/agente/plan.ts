/**
 * Constantes del Plan de Prospección Chihuahua (Resurte.me).
 * Fuente: "Plan Completo de Prospección — Chihuahua" (agosto 2026).
 * Solo datos y helpers puros: seguro para usar en server y client.
 */

export interface Zone {
  id: string
  label: string
  /** Día de la semana (0 = domingo … 6 = sábado) asignado en la ruta. */
  weekday: number
  /** Meta de visitas por recorrido. */
  visitGoal: number
  pitch: string
  keyProducts: string[]
}

export const ZONES: Zone[] = [
  {
    id: "centro",
    label: "Centro Histórico",
    weekday: 1, // lunes
    visitGoal: 8,
    pitch: "Deja de salir a la central bajo el sol. Te llevamos el surtido a tu puerta.",
    keyProducts: ["Frijol", "Tortillas de harina", "Chile colorado", "Queso menonita", "Carne molida"],
  },
  {
    id: "distrito_uno",
    label: "Distrito Uno / Zona Tec",
    weekday: 2, // martes
    visitGoal: 6,
    pitch: "Abasto premium sin salir de tu cocina: pides a las 9 AM y llega a las 4 PM.",
    keyProducts: ["Rib eye", "Arrachera", "Queso menonita", "Tortillas de harina", "Verduras gourmet"],
  },
  {
    id: "paseo_central",
    label: "Paseo Central / Plaza del Sol",
    weekday: 3, // miércoles
    visitGoal: 8,
    pitch: "Precios de central de abastos con entrega en menos de 24 horas y factura automática.",
    keyProducts: ["Pollo", "Carne molida", "Tortillas", "Aceite", "Papa", "Cebolla"],
  },
  {
    id: "periferico",
    label: "Periférico / Zonas Residenciales",
    weekday: 4, // jueves
    visitGoal: 10,
    pitch: "Pida antes de las 10 AM y le llega el mismo día. Sin salir de su negocio.",
    keyProducts: ["Pollo entero", "Carne molida", "Tortillas de harina", "Salsa", "Cebolla", "Cilantro"],
  },
]

export const ZONE_LABEL: Record<string, string> = Object.fromEntries(
  ZONES.map((z) => [z.id, z.label])
)

/** Viernes = seguimiento (llamadas, demos, WhatsApp masivo). */
export const FRIDAY_NOTE =
  "Viernes de seguimiento: WhatsApp masivo, llamadas, demos virtuales y revisión de métricas."

export function zoneOfDay(date = new Date()): Zone | null {
  const weekday = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      weekday: "short",
    })
      .formatToParts(date)
      .find((p) => p.type === "weekday")?.value === "Sun"
      ? 0
      : new Date(
          date.toLocaleString("en-US", { timeZone: "America/Mexico_City" })
        ).getDay()
  )
  return ZONES.find((z) => z.weekday === weekday) ?? null
}

export const TIER_LABEL: Record<number, string> = {
  1: "Tier 1 · Early Adopter",
  2: "Tier 2 · Growth",
  3: "Tier 3 · Long Tail",
}

export const TIER_VOLUME: Record<number, string> = {
  1: "$8,000 – $25,000 MXN/sem",
  2: "$3,000 – $8,000 MXN/sem",
  3: "$500 – $3,000 MXN/sem",
}

/** Mínimos diarios no negociables del agente (defaults del plan). */
export const DEFAULT_GOALS = {
  daily_visitas: 8,
  daily_whatsapp: 15,
  daily_llamadas: 5,
  daily_demos: 3,
  monthly_registros: 20,
  monthly_activos: 12,
  monthly_ventas: 100000,
} as const

/** Metas acumuladas por mes de operación (plan maestro). */
export const MONTH_TARGETS = [
  { month: 1, registrados: 20, activos: 12, ventas: 100_000, conversion: 0.15 },
  { month: 2, registrados: 60, activos: 40, ventas: 350_000, conversion: 0.2 },
  { month: 3, registrados: 120, activos: 85, ventas: 700_000, conversion: 0.25 },
] as const

/** Oferta de lanzamiento usada en los guiones. */
export const LAUNCH_OFFER =
  "Envío gratis en tu primer pedido + crédito a 7 días desde el día 1 + 500 puntos de bienvenida del Club del Chef."

/** Propuesta de valor (contexto para la IA y las plantillas). */
export const VALUE_PROPS = [
  "Entrega en menos de 24 horas (pides antes de las 10 AM y llega el mismo día)",
  "Precios de central de abastos",
  "Crédito a 7/15/30 días sin aval, según historial",
  "Club del Chef: cada peso gastado regresa como puntos canjeables por descuentos",
  "Facturación CFDI 4.0 automática",
  "Pedido mínimo de $500 MXN y envío gratis desde $3,000 MXN",
]
