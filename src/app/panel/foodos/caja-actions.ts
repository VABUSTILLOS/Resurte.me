"use server"

// ============================================================
// Server Actions del corte de caja y arqueo (`/panel/foodos/caja`).
//
// Reglas que este archivo hace cumplir:
//   1. El nivel Diamante se verifica SIEMPRE en servidor, antes de la sesión.
//   2. Un solo turno abierto por restaurante + sucursal (lo garantiza el
//      índice único parcial `uq_foodos_pos_shifts_open`; aquí se comprueba
//      antes para dar un mensaje útil en lugar de un error de Postgres).
//   3. El efectivo esperado NUNCA llega del cliente: se recalcula con las
//      ventas del turno y sus movimientos. El cajero solo declara lo que contó.
// ============================================================

import { requireFoodosFeature } from "@/lib/foodos-tier"
import { assertOwnRestaurant } from "@/lib/foodos-owner"
import { requireFoodosAuth } from "@/lib/foodos-operating"
import { logger } from "@/lib/logger"
import {
  cashSalesFromOrders,
  computeArqueo,
  computeExpectedCash,
  salesByMethod,
  shiftHistoryRows,
  sumDenominations,
  type CashSaleLike,
  type ShiftHistoryRow,
} from "@/lib/foodos-cash"
import { findOpenShift, listShifts, SHIFT_COLUMNS, type ShiftRow } from "@/lib/foodos-shift"
import { revalidatePath } from "next/cache"

/** Capacidad premium que gobierna mostrador, folios, impresión y caja. */
const CAJA_FEATURE = "pos_mostrador" as const

export interface CajaShift extends ShiftRow {
  openedByName: string | null
  closedByName: string | null
}

export interface CajaMovement {
  id: string
  type: "in" | "out"
  amount: number
  reason: string | null
  created_at: string
}

export interface CajaSales {
  count: number
  total: number
  /** Efectivo que entró al cajón en el turno. */
  cash: number
  byMethod: Record<string, number>
}

export interface CajaData {
  shift: CajaShift | null
  movements: CajaMovement[]
  sales: CajaSales
  /** Efectivo que debería haber en el cajón ahora mismo. */
  expectedCash: number
  history: CajaShift[]
}

/** Lecturas: degradan a `null` en vez de romper la pantalla. */
async function canUseCaja(): Promise<boolean> {
  try {
    await requireFoodosFeature(CAJA_FEATURE)
    return true
  } catch {
    return false
  }
}

function emptySales(): CajaSales {
  return { count: 0, total: 0, cash: 0, byMethod: {} }
}

/** Nombres del personal para el historial. RLS de `profiles` es dueño-only. */
async function resolveStaffNames(
  supabase: Awaited<ReturnType<typeof requireFoodosAuth>>["supabase"],
  ids: (string | null)[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (unique.length === 0) return new Map()

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique)

  if (error) {
    // Un nombre que no se puede leer no debe impedir cerrar la caja.
    logger.warn("foodos.caja.staffNames", { error: error.message })
    return new Map()
  }

  return new Map(
    ((data as { id: string; full_name: string | null }[] | null) ?? [])
      .filter((row) => row.full_name)
      .map((row) => [row.id, row.full_name as string])
  )
}

function withNames(shift: ShiftRow, names: Map<string, string>): CajaShift {
  return {
    ...shift,
    openedByName: shift.opened_by ? names.get(shift.opened_by) ?? null : null,
    closedByName: shift.closed_by ? names.get(shift.closed_by) ?? null : null,
  }
}

async function loadSales(
  supabase: Awaited<ReturnType<typeof requireFoodosAuth>>["supabase"],
  shiftId: string
): Promise<CajaSales> {
  const { data, error } = await supabase
    .from("foodos_orders")
    .select("id, total, payment_method, payment_status, payment_breakdown")
    .eq("pos_shift_id", shiftId)

  if (error) {
    logger.warn("foodos.caja.sales", { error: error.message })
    return emptySales()
  }

  const orders = (data as CashSaleLike[] | null) ?? []
  const paid = orders.filter((order) => order.payment_status === "paid")
  return {
    count: orders.length,
    total: paid.reduce((sum, order) => sum + order.total, 0),
    cash: cashSalesFromOrders(orders),
    byMethod: salesByMethod(orders),
  }
}

async function loadMovements(
  supabase: Awaited<ReturnType<typeof requireFoodosAuth>>["supabase"],
  shiftId: string
): Promise<CajaMovement[]> {
  const { data, error } = await supabase
    .from("foodos_pos_shift_movements")
    .select("id, type, amount, reason, created_at")
    .eq("shift_id", shiftId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)
  return (data as CajaMovement[] | null) ?? []
}

function movementTotals(movements: CajaMovement[]): { cashIn: number; cashOut: number } {
  return movements.reduce(
    (acc, movement) => {
      if (movement.type === "in") acc.cashIn += movement.amount
      else acc.cashOut += movement.amount
      return acc
    },
    { cashIn: 0, cashOut: 0 }
  )
}

// ------------------------------------------------------------
// Lectura
// ------------------------------------------------------------

/**
 * Estado completo de la caja: turno abierto, sus movimientos, sus ventas, el
 * efectivo esperado y el historial de cortes del alcance pedido.
 */
export async function getCajaData(
  restaurantId: string,
  branchId?: string | null
): Promise<CajaData | null> {
  if (!(await canUseCaja())) return null
  const { supabase } = await requireFoodosAuth()

  const shift = await findOpenShift(supabase, restaurantId, branchId)

  const [movements, sales, historyRows] = await Promise.all([
    shift ? loadMovements(supabase, shift.id) : Promise.resolve([] as CajaMovement[]),
    shift ? loadSales(supabase, shift.id) : Promise.resolve(emptySales()),
    listShifts(supabase, restaurantId, branchId),
  ])

  const names = await resolveStaffNames(supabase, [
    ...(shift ? [shift.opened_by, shift.closed_by] : []),
    ...historyRows.flatMap((row) => [row.opened_by, row.closed_by]),
  ])

  const { cashIn, cashOut } = movementTotals(movements)
  const expectedCash = shift
    ? computeExpectedCash({
        openingFloat: shift.opening_float,
        cashSales: sales.cash,
        cashIn,
        cashOut,
      })
    : 0

  return {
    shift: shift ? withNames(shift, names) : null,
    movements,
    sales,
    expectedCash,
    history: historyRows.map((row) => withNames(row, names)),
  }
}

/** Historial de cortes ya normalizado para la tabla y el CSV. */
export async function getShiftHistory(
  restaurantId: string,
  branchId?: string | null
): Promise<ShiftHistoryRow[] | null> {
  const data = await getCajaData(restaurantId, branchId)
  if (!data) return null
  return shiftHistoryRows(data.history)
}

// ------------------------------------------------------------
// Escrituras
// ------------------------------------------------------------

export interface ShiftActionResult {
  ok: boolean
  error?: string
}

/**
 * Abre un turno con su fondo inicial. Falla si ya hay uno abierto en el mismo
 * restaurante y sucursal: dos turnos abiertos harían que las ventas del día se
 * repartieran entre dos arqueos y ninguno cuadraría.
 */
export async function openShiftAction(input: {
  restaurant_id: string
  branch_id?: string | null
  opening_float: number
}): Promise<ShiftActionResult> {
  await requireFoodosFeature(CAJA_FEATURE)
  const { supabase, user, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const openingFloat = Number(input.opening_float)
  if (!Number.isFinite(openingFloat) || openingFloat < 0) {
    return { ok: false, error: "El fondo inicial no puede ser negativo." }
  }

  const branchId = input.branch_id ?? null
  const existing = await findOpenShift(supabase, input.restaurant_id, branchId)
  if (existing) return { ok: false, error: "Ya hay un turno abierto." }

  const { error } = await supabase.from("foodos_pos_shifts").insert({
    restaurant_id: input.restaurant_id,
    branch_id: branchId,
    opening_float: Math.round(openingFloat * 100) / 100,
    opened_by: user.id,
  })

  if (error) {
    // Carrera perdida contra el índice único parcial: otro dispositivo abrió
    // la caja al mismo tiempo. El mensaje debe ser el mismo, no un 23505 crudo.
    if (error.code === "23505") return { ok: false, error: "Ya hay un turno abierto." }
    return { ok: false, error: error.message }
  }

  revalidatePath("/panel/foodos/caja")
  return { ok: true }
}

/**
 * Registra una entrada o salida de efectivo del turno.
 * El turno debe estar abierto: un movimiento sobre un corte ya cerrado
 * cambiaría un arqueo que el cajero ya firmó.
 */
export async function addShiftMovementAction(input: {
  shift_id: string
  type: "in" | "out"
  amount: number
  reason?: string
}): Promise<ShiftActionResult> {
  await requireFoodosFeature(CAJA_FEATURE)
  const { supabase, user, ownerUserId } = await requireFoodosAuth()

  const { data: shift, error: shiftError } = await supabase
    .from("foodos_pos_shifts")
    .select("id, restaurant_id, status")
    .eq("id", input.shift_id)
    .maybeSingle()

  if (shiftError) return { ok: false, error: shiftError.message }
  const row = shift as Pick<ShiftRow, "id" | "restaurant_id" | "status"> | null
  if (!row) return { ok: false, error: "Turno no encontrado." }
  if (row.status !== "open") return { ok: false, error: "El turno ya está cerrado." }

  await assertOwnRestaurant(supabase, ownerUserId, row.restaurant_id)

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "El monto debe ser mayor a cero." }
  }
  if (input.type !== "in" && input.type !== "out") {
    return { ok: false, error: "Tipo de movimiento no reconocido." }
  }

  const { error } = await supabase.from("foodos_pos_shift_movements").insert({
    shift_id: input.shift_id,
    type: input.type,
    amount: Math.round(amount * 100) / 100,
    reason: input.reason?.trim() || null,
    // Atribución de quién movió el cajón, no propiedad: el RLS de esta tabla
    // va por `shift_id` → `foodos_restaurants.user_id`. Ver foodos-operating.
    user_id: user.id,
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath("/panel/foodos/caja")
  return { ok: true }
}

/**
 * Cierra el turno con el conteo físico del cajón.
 *
 * El cliente manda el conteo por denominación (lo que el cajero tiene en las
 * manos); el esperado y la diferencia se calculan aquí, con las ventas y los
 * movimientos guardados. Si el esperado llegara del navegador, cualquiera
 * podría cuadrar un faltante editando la petición.
 */
export async function closeShiftAction(input: {
  shift_id: string
  counts: Record<string, number>
  notes?: string
}): Promise<ShiftActionResult & { difference?: number }> {
  await requireFoodosFeature(CAJA_FEATURE)
  const { supabase, user, ownerUserId } = await requireFoodosAuth()

  const { data: shift, error: shiftError } = await supabase
    .from("foodos_pos_shifts")
    .select(SHIFT_COLUMNS)
    .eq("id", input.shift_id)
    .maybeSingle()

  if (shiftError) return { ok: false, error: shiftError.message }
  const row = shift as ShiftRow | null
  if (!row) return { ok: false, error: "Turno no encontrado." }
  if (row.status !== "open") return { ok: false, error: "El turno ya está cerrado." }

  await assertOwnRestaurant(supabase, ownerUserId, row.restaurant_id)

  const [movements, sales] = await Promise.all([
    loadMovements(supabase, row.id),
    loadSales(supabase, row.id),
  ])

  const { cashIn, cashOut } = movementTotals(movements)
  const declaredCash = sumDenominations(input.counts ?? {})
  const arqueo = computeArqueo({
    openingFloat: row.opening_float,
    cashSales: sales.cash,
    cashIn,
    cashOut,
    declaredCash,
  })

  const { error } = await supabase
    .from("foodos_pos_shifts")
    .update({
      status: "closed",
      closed_by: user.id,
      closed_at: new Date().toISOString(),
      declared_cash: arqueo.declaredCash,
      expected_cash: arqueo.expectedCash,
      difference: arqueo.difference,
      notes: input.notes?.trim() || null,
    })
    .eq("id", row.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath("/panel/foodos/caja")
  return { ok: true, difference: arqueo.difference }
}
