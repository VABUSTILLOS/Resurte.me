export type ProspectStatus =
  | "nuevo"
  | "contactado"
  | "en_seguimiento"
  | "cliente_activo"
  | "inactivo"
  | "perdido"

export type ActivityType =
  | "llamada"
  | "whatsapp"
  | "correo"
  | "visita"
  | "nota"
  | "pedido"

export type ActivityDirection = "saliente" | "entrante"

export const PROSPECT_STATUSES: ProspectStatus[] = [
  "nuevo",
  "contactado",
  "en_seguimiento",
  "cliente_activo",
  "inactivo",
  "perdido",
]

export const PROSPECT_STATUS_LABEL: Record<ProspectStatus, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  en_seguimiento: "En seguimiento",
  cliente_activo: "Cliente activo",
  inactivo: "Inactivo",
  perdido: "Perdido",
}

export const ACTIVITY_TYPES: ActivityType[] = [
  "llamada",
  "whatsapp",
  "correo",
  "visita",
  "nota",
  "pedido",
]

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  correo: "Correo",
  visita: "Visita",
  nota: "Nota",
  pedido: "Pedido",
}

export const ACTIVITY_OUTCOMES = [
  "respondio",
  "no_respondio",
  "interesado",
  "no_interesado",
  "agendo_llamada",
  "enviado",
  "sin_contestar",
  "pedido_confirmado",
] as const

export const ACTIVITY_OUTCOME_LABEL: Record<string, string> = {
  respondio: "Respondió",
  no_respondio: "No respondió",
  interesado: "Interesado",
  no_interesado: "No interesado",
  agendo_llamada: "Agendó llamada",
  enviado: "Enviado",
  sin_contestar: "Sin contestar",
  pedido_confirmado: "Pedido confirmado",
}

export interface Prospect {
  id: number
  seller_id: string
  name: string
  restaurant_name: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  city_id: number | null
  city_name: string | null
  status: ProspectStatus
  user_id: string | null
  referral_code: string | null
  last_contact_at: string | null
  next_follow_up_at: string | null
  notes: string | null
  source: string
  created_at: string
  updated_at: string
}

export interface Activity {
  id: number
  prospect_id: number
  seller_id: string
  type: ActivityType
  direction: ActivityDirection
  outcome: string | null
  summary: string | null
  duration_seconds: number | null
  occurred_at: string
  created_at: string
}

export interface DashboardKpis {
  totalProspects: number
  pendingContact: number
  activeClients: number
  callsToday: number
  whatsappToday: number
  callsWeek: number
  whatsappWeek: number
  linkedClients: number
  weekRevenue: number
  weekCommission: number
  monthRevenue: number
  monthCommission: number
}

export interface FollowUp {
  id: number
  name: string
  restaurant_name: string | null
  whatsapp: string | null
  phone: string | null
  status: ProspectStatus
  next_follow_up_at: string | null
  last_contact_at: string | null
  user_id: string | null
}

export interface ClientToReorder {
  id: number
  name: string
  restaurant_name: string | null
  whatsapp: string | null
  phone: string | null
  user_id: string
  last_order_at: string | null
}

export interface AssistedOrderSummary {
  id: number
  client_name: string | null
  status: string
  payment_status: string
  total: number
  item_count: number
  created_at: string
}

export interface CatalogProduct {
  id: number
  name: string
  brand: string | null
  unit: string | null
  price: number
  sale_price: number | null
  stock_status: string
  image_url: string | null
}

export interface ClientAddress {
  id: number
  label: string
  street: string
  number: string
  interior: string | null
  neighborhood: string
  city: string
  state: string
  zip_code: string
  references: string | null
}

export interface SellerClientSummary {
  prospectId: number
  prospectName: string
  userId: string
  email: string | null
  phone: string | null
  status: ProspectStatus
}
