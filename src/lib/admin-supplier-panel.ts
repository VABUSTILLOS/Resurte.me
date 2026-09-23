/**
 * Modelo del apartado "Proveedores" de `/admin/productos`.
 *
 * Vive en `src/lib/` y no en el `page.tsx` por la misma razón que
 * `admin-product-bulk-run.ts`: el panel ya tiene ~6 700 líneas y una regla
 * enterrada ahí no se puede probar sin montar React. Todo lo de este archivo es
 * puro: recibe filas y devuelve planes o resúmenes.
 *
 * QUÉ RESUELVE
 * ------------
 * El panel de productos sabe activar/desactivar **por producto**
 * (`is_visible` para la tienda, `product_city_availability` para ciudades). Lo
 * que faltaba era hacerlo **por proveedor**, y eso son dos preguntas:
 *
 *   1. ¿Cómo está hoy este proveedor?  -> `summarizeSupplierCities`
 *   2. ¿Qué le mando al servidor para dejarlo como quiero? -> `supplierCityPlan`
 *
 * LA SEMÁNTICA DE CIUDADES NO ES INVENTADA
 * ----------------------------------------
 * Es la de `00065_product_city_availability.sql`, y tiene una trampa que
 * conviene tener presente: **la ausencia de filas significa "disponible en
 * todas las ciudades"**, y en cuanto un producto tiene UNA fila, solo está
 * disponible en las ciudades con `is_available = true`. Por eso "Global" se
 * implementa **borrando** filas (`scope: "all"`), no escribiendo `true` en
 * todas: escribir `true` en las 20 dejaría 20 filas que dicen lo mismo pero
 * impiden que una ciudad nueva herede el default.
 *
 * Por lo mismo, "solo disponible en las seleccionadas" se resuelve escribiendo
 * `false` en el resto (y `true` en las seleccionadas): es la única forma de
 * restringir sin depender de las filas que ya existían.
 */

import type { AvailabilityRow } from "@/lib/admin-product-list"

/** Los tres modos del control de ciudades, en el orden en que se pintan. */
export type SupplierCityMode = "all" | "exclude" | "only"

export interface SupplierCityModeMeta {
  value: SupplierCityMode
  /** Texto del botón. */
  label: string
  /** Qué hace, para el `title` y la ayuda bajo los botones. */
  help: string
  /** Exige al menos una ciudad marcada. */
  needsSelection: boolean
}

export const SUPPLIER_CITY_MODES: readonly SupplierCityModeMeta[] = [
  {
    value: "all",
    label: "Todas las ciudades",
    help: "Quita las restricciones: el proveedor queda disponible en todas las ciudades, incluidas las que se activen después.",
    needsSelection: false,
  },
  {
    value: "exclude",
    label: "No disponible en las marcadas",
    help: "Las ciudades marcadas se apagan; el resto sigue como estaba (global salvo que ya estuviera restringido).",
    needsSelection: true,
  },
  {
    value: "only",
    label: "Solo en las marcadas",
    help: "El proveedor queda disponible únicamente en las ciudades marcadas.",
    needsSelection: true,
  },
]

/** Estado de ciudades de un proveedor, ya resumido para pintar. */
export interface SupplierCitySummary {
  /** `true` cuando ningún producto tiene filas: disponible en todas partes. */
  global: boolean
  /** Ciudades activas donde el proveedor está disponible. */
  availableCount: number
  /** Ciudades activas en total (el denominador del "3 de 20"). */
  totalCities: number
  /** Esas ciudades, para el "solo en…" y para el detalle. */
  availableCityIds: number[]
}

/** Fila mínima de ciudad que necesita el resumen. */
export interface SupplierCityRef {
  id: number
}

/**
 * Resumen de ciudades de un proveedor a partir de las filas de restricción de
 * **sus** productos.
 *
 * Una ciudad cuenta como disponible cuando **ningún** producto del proveedor
 * tiene una fila `is_available = false` para ella. Es la misma regla que usa
 * `get_available_product_ids` (00065) para decidir si un producto se ve, leída
 * al revés: aquí se pregunta por el conjunto entero.
 *
 * `global` es `true` solo cuando no hay **ninguna** fila. Un proveedor a medio
 * restringir (unos productos globales y otros no) no es global, y el panel lo
 * muestra con los números en vez de con la etiqueta.
 */
export function summarizeSupplierCities(
  rows: readonly AvailabilityRow[],
  cities: readonly SupplierCityRef[],
  productIds: readonly number[]
): SupplierCitySummary {
  const own = new Set(productIds)
  const blocked = new Set<number>()
  let anyRow = false
  for (const row of rows) {
    if (!own.has(row.product_id)) continue
    anyRow = true
    if (!row.is_available) blocked.add(row.city_id)
  }
  const availableCityIds = cities.filter((c) => !blocked.has(c.id)).map((c) => c.id)
  return {
    global: !anyRow,
    availableCount: availableCityIds.length,
    totalCities: cities.length,
    availableCityIds,
  }
}

/** Celda de `product_city_availability` tal como la espera la ruta. */
export interface SupplierCityChange {
  cityId: number
  isAvailable: boolean
}

/**
 * Payload para `PATCH /api/admin/products/city-availability`.
 *
 * Los dos modos con `changes` escriben la misma celda en todos los ids del
 * proveedor (la ruta hace el `flatMap`), así que basta con mandar las ciudades.
 */
export type SupplierCityPlan =
  | { kind: "scope"; scope: "all"; isAvailable: true }
  | { kind: "changes"; changes: SupplierCityChange[] }

export type SupplierCityPlanResult =
  | { ok: true; plan: SupplierCityPlan }
  | { ok: false; reason: string }

/**
 * Traduce un modo + la selección de ciudades al payload exacto del endpoint.
 *
 * `only` con **todas** las ciudades marcadas devuelve `scope: "all"` en vez de
 * 20 celdas `true`: es el mismo efecto, deja la tabla sin filas y hace que una
 * ciudad nueva herede el default. La nota del modal de ciudades ya dice lo
 * mismo ("Marcar todas equivale a Global").
 */
export function supplierCityPlan(
  mode: SupplierCityMode,
  cities: readonly SupplierCityRef[],
  selectedCityIds: ReadonlySet<number>
): SupplierCityPlanResult {
  const selected = cities.filter((c) => selectedCityIds.has(c.id))

  if (mode === "all") {
    return { ok: true, plan: { kind: "scope", scope: "all", isAvailable: true } }
  }

  if (cities.length === 0) {
    return { ok: false, reason: "No hay ciudades activas." }
  }

  if (selected.length === 0) {
    return {
      ok: false,
      reason: "Marca al menos una ciudad.",
    }
  }

  if (mode === "exclude") {
    return {
      ok: true,
      plan: {
        kind: "changes",
        changes: selected.map((c) => ({ cityId: c.id, isAvailable: false })),
      },
    }
  }

  if (selected.length === cities.length) {
    return { ok: true, plan: { kind: "scope", scope: "all", isAvailable: true } }
  }

  const selectedSet = new Set(selected.map((c) => c.id))
  return {
    ok: true,
    plan: {
      kind: "changes",
      changes: cities.map((c) => ({
        cityId: c.id,
        isAvailable: selectedSet.has(c.id),
      })),
    },
  }
}

/** Texto del resumen de ciudades: "Global (20 de 20)" o "3 de 20 ciudades". */
export function supplierCityLabel(summary: SupplierCitySummary): string {
  if (summary.totalCities === 0) return "Sin ciudades activas"
  if (summary.global) return `Global (${summary.totalCities} de ${summary.totalCities})`
  if (summary.availableCount === 0) return "Sin ciudad disponible"
  return `${summary.availableCount} de ${summary.totalCities} ciudades`
}

// ============================================================
// Lectura del payload de /api/admin/suppliers/overview
// ============================================================

export interface SupplierOverview {
  id: number
  name: string
  slug: string
  status: string
  productCount: number
  visibleCount: number
  productIds: number[]
  cities: SupplierCitySummary
}

export const EMPTY_CITY_SUMMARY: SupplierCitySummary = {
  global: true,
  availableCount: 0,
  totalCities: 0,
  availableCityIds: [],
}

function toCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0
}

function toIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0)
}

/**
 * Sanea el payload del servidor. Igual que `parseProductCountsPayload`, un
 * payload incompleto devuelve `[]` en vez de pintar un panel con `NaN`: es
 * mejor no mostrar el apartado que mostrar conteos inventados.
 */
export function parseSupplierOverview(payload: unknown): SupplierOverview[] {
  if (!payload || typeof payload !== "object") return []
  const raw = (payload as { suppliers?: unknown }).suppliers
  if (!Array.isArray(raw)) return []
  const out: SupplierOverview[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const s = item as Record<string, unknown>
    if (typeof s.id !== "number" || !Number.isInteger(s.id) || s.id <= 0) continue
    if (typeof s.name !== "string" || typeof s.slug !== "string") continue
    const cities = (s.cities ?? {}) as Record<string, unknown>
    out.push({
      id: s.id,
      name: s.name,
      slug: s.slug,
      status: typeof s.status === "string" ? s.status : "prospecto",
      productCount: toCount(s.productCount),
      visibleCount: toCount(s.visibleCount),
      productIds: toIds(s.productIds),
      cities: {
        global: cities.global === true,
        availableCount: toCount(cities.availableCount),
        totalCities: toCount(cities.totalCities),
        availableCityIds: toIds(cities.availableCityIds),
      },
    })
  }
  return out
}

/**
 * Valor del filtro `?supplier=`. Igual que el resto de los filtros de texto,
 * un parámetro vacío **no** es un filtro: `?supplier=` no debe dejar el listado
 * en blanco.
 */
export function supplierFilterValue(raw: string | null | undefined): string {
  const value = (raw ?? "").trim()
  return value === "" ? "all" : value
}

/** Valor especial del filtro para "productos sin proveedor". */
export const SUPPLIER_FILTER_NONE = "none"

/** Etiqueta del filtro, sin depender de tener la lista cargada. */
export function supplierFilterLabel(value: string, names: ReadonlyMap<string, string>): string {
  if (value === "all") return "Todos los proveedores"
  if (value === SUPPLIER_FILTER_NONE) return "Sin proveedor"
  return names.get(value) ?? value
}
