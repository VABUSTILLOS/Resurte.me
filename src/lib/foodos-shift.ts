/**
 * Turno de caja: lectura y exigencia.
 *
 * Vive en `lib` (no en `caja-actions.ts`) porque lo necesitan tres superficies
 * distintas: la propia caja, el mostrador y el comandero de mesas. Un archivo
 * `"use server"` solo puede exportar acciones invocables desde el navegador, y
 * estas funciones reciben un cliente de Supabase: no son serializables.
 *
 * Invariante del punto de venta: **no se vende ni se cierra una mesa sin un
 * turno de caja abierto**. Sin turno no hay dónde colgar el efectivo, y un
 * pedido de mostrador sin turno desaparece del arqueo del día.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { ShiftLike } from "./foodos-cash"

export const SHIFT_COLUMNS =
  "id, restaurant_id, branch_id, status, opening_float, opened_by, opened_at, " +
  "closed_by, closed_at, declared_cash, expected_cash, difference, notes, created_at"

export type ShiftRow = ShiftLike & {
  restaurant_id: string
  created_at: string
}

/** No hay turno abierto donde registrar la venta. La UI lo reconoce por `code`. */
export class NoOpenShiftError extends Error {
  readonly code = "FOODOS_NO_OPEN_SHIFT"

  constructor() {
    super("Abre la caja antes de vender: no hay un turno abierto.")
    this.name = "NoOpenShiftError"
  }
}

/**
 * Turno abierto del alcance pedido, o `null`.
 *
 * El alcance es restaurante + sucursal, con la misma semántica que el índice
 * único parcial `uq_foodos_pos_shifts_open`: `COALESCE(branch_id, cero)`.
 * Por eso `branchId` nulo se filtra con `is null` y no con `eq null`, que en
 * SQL nunca encuentra nada.
 */
export async function findOpenShift(
  supabase: SupabaseClient,
  restaurantId: string,
  branchId: string | null | undefined
): Promise<ShiftRow | null> {
  const base = supabase
    .from("foodos_pos_shifts")
    .select(SHIFT_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .eq("status", "open")

  const { data, error } = await (branchId
    ? base.eq("branch_id", branchId)
    : base.is("branch_id", null)
  ).maybeSingle()

  if (error) throw new Error(error.message)
  return (data as ShiftRow | null) ?? null
}

/**
 * Igual que `findOpenShift`, pero lanza `NoOpenShiftError` si no hay turno.
 * Es la puerta que deben cruzar el mostrador y el comandero antes de cobrar.
 */
export async function requireOpenShift(
  supabase: SupabaseClient,
  restaurantId: string,
  branchId: string | null | undefined
): Promise<ShiftRow> {
  const shift = await findOpenShift(supabase, restaurantId, branchId)
  if (!shift) throw new NoOpenShiftError()
  return shift
}

/** True si el error viene de `requireOpenShift`. */
export function isNoOpenShiftError(error: unknown): boolean {
  return error instanceof NoOpenShiftError
}

/**
 * Cortes del alcance pedido, del más reciente al más viejo. Misma semántica de
 * sucursal que `findOpenShift`.
 */
export async function listShifts(
  supabase: SupabaseClient,
  restaurantId: string,
  branchId: string | null | undefined,
  limit = 30
): Promise<ShiftRow[]> {
  const base = supabase
    .from("foodos_pos_shifts")
    .select(SHIFT_COLUMNS)
    .eq("restaurant_id", restaurantId)

  const { data, error } = await (branchId
    ? base.eq("branch_id", branchId)
    : base.is("branch_id", null)
  )
    .order("opened_at", { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  // El `select` se arma con una constante de texto, así que el cliente no puede
  // inferir la forma de la fila: se afirma aquí, una sola vez, contra `ShiftRow`.
  return (data as unknown as ShiftRow[] | null) ?? []
}
