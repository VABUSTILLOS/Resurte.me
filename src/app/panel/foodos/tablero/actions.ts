"use server"

// ============================================================
// Datos del tablero: pedidos de la ventana pedida + turnos de caja.
//
// `getFoodosPanelData` no sirve para reportes: trae los últimos 200 pedidos
// sin importar la fecha, así que un periodo de 90 días se truncaba en
// silencio y el reporte mentía a la baja. Aquí la ventana se filtra en SQL.
// ============================================================

import { requireFoodosAuth } from "@/lib/foodos-operating"
import { listRestaurantShifts, type ShiftRow } from "@/lib/foodos-shift"
import { PUBLIC_FOODOS_ORDERS_SELECT } from "@/lib/sensitive-columns"
import type { FoodosOrder } from "@/types/foodos"

const DAY_MS = 86_400_000

/** Tope de filas del reporte. Si se alcanza, la UI lo advierte. */
const MAX_REPORT_ORDERS = 5000

export interface FoodosReportData {
  orders: FoodosOrder[]
  shifts: ShiftRow[]
  /** Se alcanzó `MAX_REPORT_ORDERS`: el reporte puede estar incompleto. */
  truncated: boolean
}

/**
 * Pedidos de los últimos `days` días y los cortes de caja del restaurante.
 *
 * `now` lo manda el cliente para que el corte en SQL y el agrupado por día en
 * el navegador usen el mismo instante; si no, un pedido de la medianoche del
 * límite entraría por un lado y se descartaría por el otro. El margen de un día
 * extra absorbe cualquier desfase de reloj.
 */
export async function getFoodosReportData(input: {
  days: number
  branchId?: string | null
  now?: number
}): Promise<FoodosReportData> {
  const { ctx } = await requireFoodosAuth()
  const restaurantId = ctx.restaurantId
  if (!restaurantId) return { orders: [], shifts: [], truncated: false }
  const db = ctx.client

  const days = Math.min(Math.max(Math.trunc(input.days) || 1, 1), 365)
  const stamp =
    typeof input.now === "number" && Number.isFinite(input.now) ? input.now : Date.now()
  const cutoff = new Date(stamp - (days + 1) * DAY_MS).toISOString()
  const branchId = input.branchId ?? null

  // Columnas explícitas (00195): los `stripe_*` de `foodos_orders` ya no están
  // concedidos a `authenticated`. El reporte no los usa; con `select("*")` la
  // consulta entera fallaría con `42501`.
  const base = db
    .from("foodos_orders")
    .select(PUBLIC_FOODOS_ORDERS_SELECT)
    .eq("restaurant_id", restaurantId)
    .gte("created_at", cutoff)

  const [ordersRes, shifts] = await Promise.all([
    (branchId ? base.eq("branch_id", branchId) : base)
      .order("created_at", { ascending: false })
      .limit(MAX_REPORT_ORDERS),
    listRestaurantShifts(db, restaurantId),
  ])

  if (ordersRes.error) throw new Error(ordersRes.error.message)

  const orders = (ordersRes.data as FoodosOrder[] | null) ?? []
  return { orders, shifts, truncated: orders.length >= MAX_REPORT_ORDERS }
}
