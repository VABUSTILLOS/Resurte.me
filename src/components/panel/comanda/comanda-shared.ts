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

/**
 * Caracteres aleatorios que el id lleva al final, después del `Date.now()`
 * codificado: `id = base36(Date.now()) + RANDOM_SUFFIX chars`.
 */
const RANDOM_SUFFIX = 4

export function entryTime(e: SaleEntryLike): number {
  if (e.createdAt) {
    const t = Date.parse(e.createdAt)
    if (!isNaN(t)) return t
  }
  // El sufijo aleatorio se descarta ANTES de parsear, no después: `parseInt` del
  // id completo da ~2.97e18 (base36 del timestamp por 36⁴), muy por encima de
  // `Number.MAX_SAFE_INTEGER` (9.007e15), así que el redondeo del motor decidía
  // el último dígito. En CI el mismo id devolvía el instante +1 ms y el test
  // salía rojo; en local salía exacto. Parseando solo la parte codificada el
  // resultado es exacto en cualquier motor.
  const encoded = e.id.length > RANDOM_SUFFIX ? e.id.slice(0, -RANDOM_SUFFIX) : ""
  const parsed = parseInt(encoded, 36)
  if (!Number.isFinite(parsed)) return 0
  return parsed
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
