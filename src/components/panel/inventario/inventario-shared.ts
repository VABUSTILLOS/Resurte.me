// Tipos y constantes compartidas del panel de inventario.

export interface InventoryItem {
  id: string
  name: string
  stock: number
  minStock: number
  unit: string
  pricePerUnit: number
  category?: string
  proveedorId?: string
}

export interface Proveedor {
  id: string
  nombre: string
  contacto?: string
  telefono?: string
}

export interface StockMovement {
  id?: string // asignado por useSyncedRows (panel_rows) al primer set
  fecha: string
  itemId: string
  itemName: string
  tipo: "entrada" | "salida" | "ajuste"
  delta: number
  motivo: string
}

export type SortField = "name" | "stock" | "pricePerUnit" | "status"

export interface ItemStatus {
  label: string
  color: string
  icon: string
}

export interface OrderItem extends InventoryItem {
  toBuy: number
  cost: number
}

export interface ProjectionRow {
  key: string
  name: string
  neededQty: number
  neededUnit: string
  stockQty: number | null
  stockUnit: string | null
  shortfallQty: number
  itemId: string | null
  status: "ok" | "justo" | "falta"
  label: string
  icon: string
}

export interface OrderGroup {
  proveedorId: string | null
  nombre: string
  items: OrderItem[]
}

// ── Reglas de dinero del inventario ──────────────────────
// Extraídas de src/app/panel/inventario/page.tsx (Fase 11) para poder probarlas:
// son las dos decisiones que gastan dinero —cuánto pedir y si alcanza— y estaban
// enterradas en `useMemo`s de una página de 700 líneas, sin un solo test.

/**
 * Colchón de seguridad de la proyección de stock: se considera "suficiente"
 * solo si el inventario cubre el consumo previsto **más un 10 %**. Sin margen,
 * cualquier error de captura de una receta deja el servicio sin ingrediente.
 */
export const PROJECTION_SAFETY_MARGIN = 1.1

/**
 * Objetivo de recompra de un insumo: el doble del mínimo. Reponer solo hasta el
 * mínimo deja el insumo al borde en la siguiente semana.
 */
export const PURCHASE_TARGET_MULTIPLIER = 2

/** Cuánto comprar de un insumo y cuánto cuesta. */
export function purchaseOrderLine(item: Pick<InventoryItem, "stock" | "minStock" | "pricePerUnit">): {
  target: number
  toBuy: number
  cost: number
} {
  const target = item.minStock * PURCHASE_TARGET_MULTIPLIER
  const toBuy = Math.max(0, target - item.stock)
  return { target, toBuy, cost: toBuy * item.pricePerUnit }
}

export interface ProjectionVerdict {
  status: "ok" | "justo" | "falta"
  label: string
  icon: string
  shortfallQty: number
}

/**
 * ¿El stock cubre el consumo previsto **con** el colchón de seguridad?
 *
 * La comparación se escala a enteros (`× 10` contra `× 11`) en vez de escribir
 * `stock >= needed * 1.1` porque en coma flotante `100 * 1.1` da
 * `110.00000000000001`: un inventario de exactamente 110 contra un consumo de
 * 100 quedaba clasificado como "justo" cuando el colchón del 10 % estaba
 * completo. El único límite que mueve es ese, el exacto.
 */
function cubreElServicio(stockQty: number, neededQty: number): boolean {
  return stockQty * 10 >= neededQty * 11
}

/**
 * Veredicto de una proyección de stock. `stockQty === null` significa "el
 * insumo no está registrado en inventario" y cuenta como falta: no se puede
 * afirmar que alcance lo que no se lleva.
 */
export function projectionVerdict(stockQty: number | null, neededQty: number): ProjectionVerdict {
  let status: ProjectionVerdict["status"]
  let label: string
  if (stockQty === null) {
    status = "falta"
    label = "No registrado en inventario"
  } else if (cubreElServicio(stockQty, neededQty)) {
    status = "ok"
    label = "Suficiente"
  } else if (stockQty >= neededQty) {
    status = "justo"
    label = "Justo (mínimo)"
  } else {
    status = "falta"
    label = "Falta pedir"
  }
  const icon = status === "ok" ? "🟢" : status === "justo" ? "🟡" : "🔴"
  const shortfallQty = stockQty === null ? neededQty : Math.max(0, neededQty - stockQty)
  return { status, label, icon, shortfallQty }
}
