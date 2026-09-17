/**
 * Reglas puras para las acciones masivas del panel de pedidos.
 *
 * La UI selecciona pedidos y aplica una acción; aquí vive *qué* pedidos son
 * elegibles para cada acción y cómo resumir el resultado. El fan-out real
 * (llamar al PATCH por pedido) lo hace la página, para no duplicar los
 * efectos por pedido que ya viven en `PATCH /api/orders/[id]/status`
 * (reversión de cupón, cashback, workflows de WhatsApp, audit log).
 */

/** Subconjunto de un pedido relevante para decidir elegibilidad. */
export interface BulkOrder {
  id: number
  status: string
  payment_status: string
}

export type ToastTone = "success" | "warning" | "error"

/** Estados terminales: no admiten cambios masivos de estado. */
export const TERMINAL_ORDER_STATUSES = ["delivered", "cancelled"] as const

/**
 * Estados ofrecidos como destino en la barra masiva. Mismo conjunto que el
 * selector por fila (los 6 estados válidos del PATCH), en orden de proceso.
 */
export const BULK_STATUS_TARGETS = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_ORDER_STATUSES as readonly string[]).includes(status)
}

/**
 * Un pedido admite el cambio de estado si:
 * - el destino es un estado conocido,
 * - el pedido no está ya en ese estado (evita PATCHs no-op),
 * - el pedido no está en un estado terminal.
 *
 * La exclusión del estado terminal es deliberada y difiere del selector por
 * fila, que se deja libre para correcciones manuales: revertir en masa un
 * `cancelled` (que ya devolvió el cupón y marcó el pago como `failed`) es
 * casi siempre un accidente, no una intención.
 */
export function canChangeStatusTo(order: BulkOrder, nextStatus: string): boolean {
  if (!nextStatus) return false
  if (!(BULK_STATUS_TARGETS as readonly string[]).includes(nextStatus)) return false
  if (order.status === nextStatus) return false
  if (isTerminalStatus(order.status)) return false
  return true
}

/**
 * Un pedido admite confirmación de pago si no está pagado y no está
 * cancelado (confirmar el pago de un pedido cancelado no tiene sentido).
 */
export function canConfirmPayment(order: BulkOrder): boolean {
  if (order.payment_status === "paid") return false
  if (order.status === "cancelled") return false
  return true
}

/** Solo se asigna repartidor a pedidos en curso. */
export function canAssignDriver(order: BulkOrder): boolean {
  return !isTerminalStatus(order.status)
}

export type Selection = ReadonlySet<number>

export interface BulkPartition {
  eligible: number[]
  skipped: number[]
}

function partition(
  orders: readonly BulkOrder[],
  selected: Selection,
  isEligible: (order: BulkOrder) => boolean
): BulkPartition {
  const eligible: number[] = []
  const skipped: number[] = []
  for (const order of orders) {
    if (!selected.has(order.id)) continue
    if (isEligible(order)) eligible.push(order.id)
    else skipped.push(order.id)
  }
  return { eligible, skipped }
}

export function partitionForStatus(
  orders: readonly BulkOrder[],
  selected: Selection,
  nextStatus: string
): BulkPartition {
  return partition(orders, selected, (order) => canChangeStatusTo(order, nextStatus))
}

export function partitionForPayment(
  orders: readonly BulkOrder[],
  selected: Selection
): BulkPartition {
  return partition(orders, selected, canConfirmPayment)
}

export function partitionForDriver(
  orders: readonly BulkOrder[],
  selected: Selection
): BulkPartition {
  return partition(orders, selected, canAssignDriver)
}

/** Alterna un id conservando la referencia cuando no hay cambio. */
export function toggleSelection(current: Selection, id: number): Selection {
  const next = new Set(current)
  if (!next.delete(id)) next.add(id)
  return next
}

export function selectAll(visibleIds: readonly number[]): Selection {
  return new Set(visibleIds)
}

/**
 * Descarta ids que ya no están visibles (el refresco o un cambio de filtro
 * los quita de la lista). Devuelve la MISMA referencia si no hay nada que
 * podar, para poder usarse en un efecto sin re-dispararlo.
 */
export function pruneSelection(current: Selection, visibleIds: readonly number[]): Selection {
  if (current.size === 0) return current
  const visible = new Set(visibleIds)
  let stale = false
  for (const id of current) {
    if (!visible.has(id)) {
      stale = true
      break
    }
  }
  if (!stale) return current
  const next = new Set<number>()
  for (const id of current) if (visible.has(id)) next.add(id)
  return next
}

export function areAllSelected(visibleIds: readonly number[], selected: Selection): boolean {
  if (visibleIds.length === 0) return false
  return visibleIds.every((id) => selected.has(id))
}

export function isPartiallySelected(visibleIds: readonly number[], selected: Selection): boolean {
  if (selected.size === 0) return false
  return !areAllSelected(visibleIds, selected)
}

export interface BulkResult {
  id: number
  ok: boolean
  error?: string
}

export interface BulkOutcome {
  ok: number
  skipped: number
  failed: number
}

export function summarizeBulkResult(
  results: readonly BulkResult[],
  skipped: number
): BulkOutcome {
  let ok = 0
  let failed = 0
  for (const result of results) {
    if (result.ok) ok += 1
    else failed += 1
  }
  return { ok, skipped, failed }
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** Mensaje de un solo renglón para el toast, p. ej. "3 aplicados · 2 omitidos". */
export function bulkOutcomeMessage(outcome: BulkOutcome): string {
  const parts = [plural(outcome.ok, "aplicado", "aplicados")]
  if (outcome.skipped > 0) parts.push(plural(outcome.skipped, "omitido", "omitidos"))
  if (outcome.failed > 0) parts.push(`${outcome.failed} con error`)
  return parts.join(" · ")
}

export function bulkOutcomeTone(outcome: BulkOutcome): ToastTone {
  if (outcome.failed > 0) return "error"
  if (outcome.ok === 0 || outcome.skipped > 0) return "warning"
  return "success"
}

/** Texto de confirmación para la acción destructiva (cancelación masiva). */
export function bulkCancelConfirmMessage(count: number): string {
  return `¿Cancelar ${plural(count, "pedido", "pedidos")}? Se devolverá el cupón usado y, si el pago estaba pendiente, quedará como fallido.`
}

/** Acciones que la barra masiva puede aplicar. */
export type BulkAction = "status" | "payment" | "driver"

/**
 * Confirmar el pago abona cashback **real** a la wallet de cada cliente, así
 * que la acción pide confirmación explícita antes de ejecutarse.
 */
export function bulkConfirmPaymentConfirmMessage(count: number): string {
  return `¿Confirmar el pago de ${plural(count, "pedido", "pedidos")}? Se abonará cashback real a la wallet de cada cliente.`
}

/** Asignar repartidor pisa la asignación previa de cada pedido. */
export function bulkAssignDriverConfirmMessage(count: number, driverName: string): string {
  return `¿Asignar ${driverName} a ${plural(count, "pedido", "pedidos")}? Se reemplaza la asignación anterior.`
}

/**
 * Solo la confirmación de pago ofrece deshacer.
 *
 * Es la única acción masiva que mueve dinero (abona cashback a la wallet), y
 * equivocarse no se arregla volviendo a aplicar otra acción. El resto no lo
 * necesita: asignar repartidor se corrige asignando otro, y el estado se
 * vuelve a cambiar con el mismo control. La cancelación tampoco lo ofrece
 * porque es irreversible por diseño (devuelve el cupón y marca el pago como
 * fallido), y por eso se confirma aparte antes de ejecutarse.
 */
export function isBulkActionUndoable(action: BulkAction): boolean {
  return action === "payment"
}

/** Texto de la barra de deshacer, con la advertencia de que hubo dinero de por medio. */
export function bulkUndoMessage(count: number): string {
  return `Se confirmó el pago de ${plural(count, "pedido", "pedidos")} y se abonó cashback.`
}

/** Resultado del deshacer, con el mismo formato de un renglón que el toast. */
export function bulkUndoOutcomeMessage(outcome: BulkOutcome): string {
  const parts = [`${plural(outcome.ok, "revertido", "revertidos")}`]
  if (outcome.failed > 0) parts.push(`${outcome.failed} con error`)
  return parts.join(" · ")
}
