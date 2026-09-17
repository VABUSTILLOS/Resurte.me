// ============================================================
// Comandero de mesas: lógica pura.
//
// Nada de Supabase ni de React aquí. El mapa de mesas, el estado de una
// cuenta, el total en vivo y el reparto de la cuenta dividida se calculan con
// funciones que se pueden probar sin base de datos ni navegador.
//
// Regla de oro de una cuenta de mesa: cada envío a cocina deja una fila en
// `foodos_orders` (comanda operativa, `payment_status = "pending"`, nunca se
// cobra) y el cierre deja una fila más (la cuenta, `payment_status = "paid"`).
// Los ingresos se cuentan por `payment_status = "paid"`, así que la cuenta se
// suma exactamente una vez.
// ============================================================

import type { FoodosOrder, FoodosOrderItem } from "@/types/foodos"
import { fromCents, toCents } from "@/lib/foodos-cash"

/** Canal con el que entran las comandas y la cuenta de una mesa. */
export const MESAS_CHANNEL = "mesero" as const

/** Formas soportadas por el editor de acomodo. */
export type TableShape = "square" | "round" | "rect"

/** Color del mapa: libre, ocupada o con la cuenta pedida. */
export type TableStatus = "free" | "occupied" | "billing"

export interface MesasZone {
  id: string
  restaurant_id: string
  branch_id: string | null
  name: string
  sort_order: number
  width: number
  height: number
  created_at: string
}

export interface MesasTable {
  id: string
  restaurant_id: string
  branch_id: string | null
  zone_id: string | null
  label: string
  seats: number
  shape: TableShape
  pos_x: number
  pos_y: number
  is_active: boolean
  created_at: string
}

export type TableTicketStatus = "open" | "closed" | "void"

export interface TableTicket {
  id: string
  restaurant_id: string
  branch_id: string | null
  table_id: string
  status: TableTicketStatus
  guests: number
  opened_by: string | null
  opened_at: string
  closed_by: string | null
  closed_at: string | null
  closed_order_id: string | null
  /** `null` mientras nadie ha pedido la cuenta. */
  billing_requested_at: string | null
  note: string | null
}

export const TABLE_SHAPES: readonly TableShape[] = ["square", "round", "rect"]

/** Medidas por omisión de una zona nueva, en las unidades del lienzo. */
export const ZONE_DEFAULT_WIDTH = 1000
export const ZONE_DEFAULT_HEIGHT = 700
/** Caja mínima de una mesa, para que nadie la deje inclickable. */
export const TABLE_MIN_SIZE = 48

export function isTableShape(value: unknown): value is TableShape {
  return typeof value === "string" && (TABLE_SHAPES as readonly string[]).includes(value)
}

export function isTicketOpen(ticket: Pick<TableTicket, "status"> | null | undefined): boolean {
  return ticket?.status === "open"
}

/**
 * Estado visible de una mesa. "Por cobrar" gana sobre "ocupada" porque es la
 * señal que busca el cajero: alguien ya pidió la cuenta.
 */
export function tableStatus(ticket: TableTicket | null | undefined): TableStatus {
  if (!isTicketOpen(ticket)) return "free"
  return ticket?.billing_requested_at ? "billing" : "occupied"
}

/** Índice `table_id → ticket abierto`, para pintar el mapa en una pasada. */
export function openTicketByTable(
  tickets: readonly TableTicket[],
): Map<string, TableTicket> {
  const map = new Map<string, TableTicket>()
  for (const ticket of tickets) {
    if (isTicketOpen(ticket)) map.set(ticket.table_id, ticket)
  }
  return map
}

/** Índice `table_ticket_id → pedidos`, para sumar cada cuenta en una pasada. */
export function ordersByTicket(
  orders: readonly FoodosOrder[],
): Map<string, FoodosOrder[]> {
  const map = new Map<string, FoodosOrder[]>()
  for (const order of orders) {
    const ticketId = order.table_ticket_id
    if (!ticketId) continue
    const list = map.get(ticketId)
    if (list) list.push(order)
    else map.set(ticketId, [order])
  }
  return map
}

/**
 * ¿El pedido es una comanda operativa de una cuenta todavía abierta? No es
 * ingreso: la comida ya se mandó a cocina y se cobrará en la cuenta del cierre.
 */
export function isOpenComanda(order: Pick<FoodosOrder, "channel" | "payment_status">): boolean {
  return order.channel === MESAS_CHANNEL && order.payment_status === "pending"
}

/**
 * Pedidos que representan dinero cobrado. Es la regla que ya usa el arqueo y
 * la que hay que usar en cualquier reporte para no contar dos veces una mesa.
 */
export function billableOrders(orders: readonly FoodosOrder[]): FoodosOrder[] {
  return orders.filter((order) => order.payment_status === "paid")
}

export interface AccountTotals {
  /** Número de pedidos (comandas + cuenta) que componen la cuenta. */
  orders: number
  /** Piezas totales, sumando cantidades. */
  items: number
  subtotal: number
  discount: number
  tip: number
  total: number
}

/**
 * Totales en vivo de una cuenta. Se suma en centavos enteros para que una mesa
 * con veinte comandas no acumule centavos fantasma.
 *
 * `paidOnly` sirve para el cierre: sólo la cuenta cobrada es ingreso.
 */
export function accountTotals(
  orders: readonly FoodosOrder[],
  options: { paidOnly?: boolean } = {},
): AccountTotals {
  const source = options.paidOnly ? billableOrders(orders) : orders
  let subtotal = 0
  let discount = 0
  let tip = 0
  let total = 0
  let items = 0
  for (const order of source) {
    subtotal += toCents(order.subtotal)
    discount += toCents(order.discount)
    tip += toCents(order.tip)
    total += toCents(order.total)
    for (const item of order.items ?? []) items += item.qty
  }
  return {
    orders: source.length,
    items,
    subtotal: fromCents(subtotal),
    discount: fromCents(discount),
    tip: fromCents(tip),
    total: fromCents(total),
  }
}

/**
 * Identidad de una línea para poder consolidarla. Dos líneas se funden sólo si
 * son el mismo platillo, al mismo precio, con exactamente los mismos
 * modificadores: "2 tacos sin cebolla" y "1 taco sin cebolla" son una línea de
 * 3; un taco con queso es otra. El precio entra en la clave a propósito: si el
 * menú subió a mitad de la mesa, la cuenta muestra las dos líneas y sigue
 * cuadrando con lo que ya se cobró.
 */
export function accountLineKey(item: FoodosOrderItem): string {
  if (item.combo_id) return `combo:${item.combo_id}@${item.price}`
  const values = (item.modifiers ?? [])
    .map((mod) => mod.value_id)
    .slice()
    .sort()
    .join(",")
  return `${item.item_id}|${values}@${item.price}`
}

/**
 * Líneas de la cuenta consolidando lo que se mandó en varias comandas. El
 * precio unitario se conserva tal cual se cobró: si el menú subió a mitad de la
 * mesa, la cuenta respeta el precio con el que se pidió.
 */
export function aggregateAccountItems(orders: readonly FoodosOrder[]): FoodosOrderItem[] {
  const merged = new Map<string, FoodosOrderItem>()
  for (const order of orders) {
    for (const item of order.items ?? []) {
      const key = accountLineKey(item)
      const current = merged.get(key)
      if (current) {
        current.qty += item.qty
        continue
      }
      merged.set(key, {
        ...item,
        modifiers: item.modifiers ? item.modifiers.map((mod) => ({ ...mod })) : undefined,
      })
    }
  }
  return [...merged.values()]
}

/**
 * Reparte un total en centavos entre `parts` personas sin perder ni inventar un
 * centavo: las primeras `resto` partes llevan un centavo extra. Dividir la
 * cuenta "a partes iguales" con flotantes produce cuentas que no cuadran.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("El total a dividir debe ser un entero de centavos no negativo")
  }
  if (!Number.isInteger(parts) || parts < 1) {
    throw new Error("La cuenta se divide entre al menos una persona")
  }
  const base = Math.floor(totalCents / parts)
  const remainder = totalCents - base * parts
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0))
}

/** Igual que `splitCents` pero devolviendo pesos, para pintar el reparto. */
export function splitAmount(total: number, parts: number): number[] {
  return splitCents(toCents(total), parts).map(fromCents)
}

/** Cuántas personas caben en la mesa, como tope del divisor de cuenta. */
export function maxAccountParts(ticket: Pick<TableTicket, "guests">): number {
  return Math.max(1, Math.min(50, Math.trunc(ticket.guests) || 1))
}

/** Personas sumadas de las cuentas abiertas de una zona o del salón. */
export function sumGuests(tickets: readonly TableTicket[]): number {
  return tickets.reduce(
    (total, ticket) => total + (isTicketOpen(ticket) ? Math.max(0, ticket.guests) : 0),
    0,
  )
}

export function sortZones(zones: readonly MesasZone[]): MesasZone[] {
  return [...zones].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/** Mesas de una zona, ordenadas por etiqueta natural ("Mesa 2" antes que "Mesa 10"). */
export function tablesInZone(
  tables: readonly MesasTable[],
  zoneId: string | null,
): MesasTable[] {
  return tables
    .filter((table) => table.zone_id === zoneId)
    .sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }))
}

/** Siguiente etiqueta libre: "Mesa 1", "Mesa 2"… sin repetir las existentes. */
export function nextTableLabel(existing: readonly string[]): string {
  const taken = new Set(existing.map((label) => label.trim().toLowerCase()))
  let index = 1
  while (taken.has(`mesa ${index}`)) index += 1
  return `Mesa ${index}`
}

/**
 * Acota una posición al lienzo de su zona para que una mesa nunca quede fuera
 * de vista. Se mide desde el centro de la mesa, igual que el editor.
 */
export function clampPosition(
  x: number,
  y: number,
  zone: Pick<MesasZone, "width" | "height">,
  size: number = TABLE_MIN_SIZE,
): { x: number; y: number } {
  const half = Math.max(0, size) / 2
  const clampAxis = (value: number, max: number) => {
    // Se acota antes de comprobar finitud: así +Infinity cae en el borde
    // derecho y -Infinity en el izquierdo. Sólo NaN necesita respaldo.
    const clamped = Math.min(Math.max(value, half), max)
    return Number.isFinite(clamped) ? clamped : half
  }
  return {
    x: clampAxis(x, Math.max(half, zone.width - half)),
    y: clampAxis(y, Math.max(half, zone.height - half)),
  }
}

/** Cuántas mesas siguen activas en una zona (para avisar antes de borrarla). */
export function activeTablesInZone(tables: readonly MesasTable[], zoneId: string): number {
  return tables.filter((table) => table.zone_id === zoneId && table.is_active).length
}

/** Minutos transcurridos desde que se abrió la cuenta, nunca negativos. */
export function elapsedMinutes(openedAt: string, now: number = Date.now()): number {
  const started = new Date(openedAt).getTime()
  if (!Number.isFinite(started)) return 0
  return Math.max(0, Math.floor((now - started) / 60_000))
}
