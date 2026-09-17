/**
 * Utilidades puras de repartidores (migración 00076).
 *
 * El dashboard y el panel de pedidos ofrecen el mismo conjunto de repartidores
 * y etiquetan igual la asignación, así que ambas reglas viven aquí para no
 * duplicarlas.
 */

export interface DriverLike {
  id: number
  name: string
  is_active: boolean
}

/**
 * Repartidores ofrecibles: solo activos, ordenados por nombre.
 * Se ordena explícitamente porque el resultado de `/api/admin/drivers` ya viene
 * ordenado por el backend, pero el dashboard reutiliza la lista para etiquetar
 * pedidos y no debe depender de ese orden.
 */
export function activeDrivers<T extends DriverLike>(drivers: readonly T[]): T[] {
  return drivers
    .filter((d) => d.is_active)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"))
}

/**
 * Nombre del repartidor asignado a un pedido, o null si no hay asignación o si
 * el id no está en la lista (repartidor desactivado o borrado): en ese caso la
 * UI muestra "—" en lugar de un nombre que ya no puede ofrecerse.
 */
export function driverNameById(
  drivers: readonly DriverLike[],
  id: number | null | undefined
): string | null {
  if (id === null || id === undefined) return null
  return drivers.find((d) => d.id === id)?.name ?? null
}
