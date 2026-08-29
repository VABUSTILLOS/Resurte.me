/** Tipos del Agente de Ventas IA (Comercialización). */

export type MessageKind =
  | "primer_contacto"
  | "seguimiento"
  | "cierre_urgencia"
  | "reorden"
  | "reactivacion"
  | "upsell"

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
  primer_contacto: "Primer contacto",
  seguimiento: "Seguimiento",
  cierre_urgencia: "Cierre con urgencia",
  reorden: "Reorden semanal",
  reactivacion: "Reactivación",
  upsell: "Subida de nivel",
}

export type AgentMessageStatus = "borrador" | "aprobado" | "enviado" | "descartado"

export type TouchChannel = "visita" | "whatsapp" | "llamada" | "demo"

export const TOUCH_LABEL: Record<TouchChannel, string> = {
  visita: "Visita",
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  demo: "Demo",
}

export interface AgentQueueItem {
  prospectId: number
  name: string
  restaurantName: string | null
  whatsapp: string | null
  phone: string | null
  status: string
  tier: number | null
  zone: string | null
  /** Toques registrados (actividades salientes). */
  touches: number
  /** Canal recomendado según la secuencia del plan (visita → WA → llamada). */
  recommendedChannel: TouchChannel
  /** Tipo de mensaje sugerido para generar con un clic. */
  suggestedKind: MessageKind
  nextFollowUpAt: string | null
  lastContactAt: string | null
  /** true si hoy es el día de ruta de su zona. */
  isZoneOfDay: boolean
}

export interface AgentMessage {
  id: number
  prospectId: number
  prospectName: string
  restaurantName: string | null
  whatsapp: string | null
  kind: MessageKind
  message: string
  status: AgentMessageStatus
  model: string | null
  createdAt: string
}

export interface AgentGoals {
  dailyVisitas: number
  dailyWhatsapp: number
  dailyLlamadas: number
  dailyDemos: number
  monthlyRegistros: number
  monthlyActivos: number
  monthlyVentas: number
}

export interface ActivityProgress {
  label: string
  today: number
  todayGoal: number
  week: number
  weekGoal: number
}

export interface FunnelStep {
  status: string
  label: string
  count: number
}

export interface SegmentConversion {
  segment: string
  total: number
  activos: number
  conversion: number // 0-1
}

export interface AgentKpis {
  funnel: FunnelStep[]
  activity: ActivityProgress[]
  monthIndex: number // 1..3 (mes de operación estimado)
  monthRegistros: number
  monthActivos: number
  monthVentas: number
  monthPedidos: number
  ticketPromedio: number
  targetRegistros: number
  targetActivos: number
  targetVentas: number
  targetConversion: number
  conversionGlobal: number // activos / total no perdidos
  byTier: SegmentConversion[]
  byZone: SegmentConversion[]
  borradoresPendientes: number
  enviadosSemana: number
  zoneOfDay: { id: string; label: string; visitGoal: number; pitch: string } | null
}
