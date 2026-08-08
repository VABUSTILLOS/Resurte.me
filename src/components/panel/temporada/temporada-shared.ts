// Tipos canónicos compartidos del panel de Temporada.
// Antes de la Fase 12 se duplicaban inline en temporada/page.tsx, el hub y
// el planificador. Extraídos aquí para una única fuente de verdad.

/** Item de la lista de compras de temporada. */
export interface ShoppingItem {
  key: string
  name: string
  icon: string
  pricePerKg: number
  quantityKg: number
}

/**
 * Item transferido de Temporada al Planificador. `name` sin emoji + `unit`
 * real para que el planificador lo case contra inventario. `qtyKg` se
 * conserva solo para datos legacy escritos antes de la unificación de unidades.
 */
export interface TransferItem {
  name: string
  unit: string
  price: number
  qty: number
  icon?: string
  qtyKg?: number
}
