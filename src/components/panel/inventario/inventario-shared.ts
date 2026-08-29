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
