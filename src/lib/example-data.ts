/**
 * Distinguir dato de ejemplo de dato propio.
 *
 * Costeo y Rentabilidad arrancan con listas de ejemplo (ingredientes con
 * precio, platillos con costo y precio) para que la herramienta sirva desde el
 * primer día. El problema no es que existan: es que **no se distinguían** de lo
 * que el dueño había capturado. Un food cost calculado con el precio de un
 * ejemplo y un "considera ajustar la porción de portobello" escrito sobre un
 * costo inventado son indistinguibles de un consejo real.
 *
 * Este módulo es la fuente única de esa distinción: las filas declaran su
 * origen (`example`) y la UI lo dice con la misma frase en todas partes.
 */

/** Etiqueta corta para marcar una fila. */
export const EXAMPLE_BADGE_LABEL = "ejemplo"

/** Motivo corto, para el `title`/`aria-label` de la etiqueta. */
export const EXAMPLE_BADGE_HELP =
  "Dato de ejemplo con precios inventados, no una medición de tu negocio."

export interface OriginRow {
  /** `true` = precio/costo de ejemplo, no capturado por el usuario. */
  example?: boolean
}

export interface SplitByOrigin<T extends OriginRow> {
  real: T[]
  example: T[]
}

/**
 * Separa las filas por origen preservando el orden original dentro de cada
 * grupo. Una fila sin `example` se considera propia: el silencio nunca debe
 * marcar como falso un dato que el usuario sí capturó.
 */
export function splitByOrigin<T extends OriginRow>(rows: T[]): SplitByOrigin<T> {
  const real: T[] = []
  const example: T[] = []
  for (const row of rows) {
    if (row.example === true) example.push(row)
    else real.push(row)
  }
  return { real, example }
}

/** ¿Alguna de estas filas trae un dato de ejemplo? */
export function hasExampleRows(rows: OriginRow[]): boolean {
  return rows.some((row) => row.example === true)
}

/**
 * Aviso para una tabla que mezcla filas propias y de ejemplo. Devuelve `null`
 * cuando no hay nada que advertir — un aviso permanente se vuelve invisible.
 */
export function exampleRowsNotice(
  exampleCount: number,
  realCount: number,
  nounPlural: string,
): string | null {
  const example = Math.max(0, Math.trunc(exampleCount))
  const real = Math.max(0, Math.trunc(realCount))
  if (example === 0) return null

  if (real === 0) {
    return `Los ${example} ${nounPlural} que ves son de ejemplo: precios y costos inventados, no mediciones de tu negocio. Sustitúyelos por los tuyos para que los números signifiquen algo.`
  }

  return `${example} de los ${example + real} ${nounPlural} son de ejemplo (precios inventados); los otros ${real} son tuyos. Los totales mezclan ambos: usa el filtro para ver solo los tuyos.`
}

/**
 * Aviso para una lista de ingredientes donde algunos precios son de ejemplo.
 * Es el caso de Costeo: el catálogo real rellena la lista y los ejemplos
 * rellenan los huecos.
 */
export function exampleIngredientsNotice(exampleCount: number, total: number): string | null {
  const example = Math.max(0, Math.trunc(exampleCount))
  const all = Math.max(0, Math.trunc(total))
  if (example === 0) return null
  if (all === 0) return null

  if (example === all) {
    return `Ninguno de los ${all} ingredientes viene del catálogo: todos traen precio de ejemplo. El food cost que calcules con ellos no es real hasta que sustituyas los precios por los tuyos.`
  }

  return `${example} de ${all} ingredientes traen precio de ejemplo (no están en el catálogo). Los platillos que los usen llevan la etiqueta "${EXAMPLE_BADGE_LABEL}" y su food cost no es real.`
}
