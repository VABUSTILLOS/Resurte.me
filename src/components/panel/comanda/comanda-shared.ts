// Datos estáticos, tipos y helpers compartidos del monitor de Comanda.
// Extraído de src/app/panel/comanda/page.tsx (Fase 11).

export interface SaleEntryLike {
  id: string
  dishId: string
  dishName: string
  quantity: number
  date: string
  unitPrice: number
  unitCost: number
  paymentMethod?: string
  channel?: string
  clienteId?: string
  mesaId?: string
  modificadores?: { nombre: string; precio: number }[]
  createdAt?: string
}

export interface MesaLike {
  id: string
  nombre: string
  capacidad?: number
  zona?: string
}

export interface ComandaStatus {
  status: "pendiente" | "en-cocina" | "listo"
  startedAt?: number
  readyAt?: number
  hidden?: boolean
}

export const CHANNELS = [
  { key: "comedor", label: "Comedor", icon: "🍽️" },
  { key: "rapido", label: "Rápido", icon: "⚡" },
  { key: "para-llevar", label: "Para llevar", icon: "🥡" },
  { key: "domicilio", label: "Domicilio", icon: "🛵" },
] as const

export const STATUS_META = {
  pendiente: { label: "Pendientes", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  "en-cocina": { label: "En cocina", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  listo: { label: "Listas", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
} as const

export type StatusKey = keyof typeof STATUS_META

/** Timestamp for event handlers (module scope keeps the purity rule happy). */
export const nowMs = () => Date.now()

export function entryTime(e: SaleEntryLike): number {
  if (e.createdAt) {
    const t = Date.parse(e.createdAt)
    if (!isNaN(t)) return t
  }
  const parsed = parseInt(e.id, 36)
  if (!Number.isFinite(parsed)) return 0
  // id = base36(Date.now()) + 4 random base36 chars
  return Math.floor(parsed / Math.pow(36, 4))
}

export function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export interface ComandaRow {
  entry: SaleEntryLike
  time: number
  status: "pendiente" | "en-cocina" | "listo"
  startedAt?: number
  readyAt?: number
  hidden: boolean
}
