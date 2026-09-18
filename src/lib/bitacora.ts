/**
 * Vocabulario compartido de una bitácora con tope duro.
 *
 * POR QUÉ EXISTE: las tres pestañas de `/admin/bitacoras` consultan con un
 * `LIMIT` fijo y ninguna declaraba que se había cortado. Una lista truncada en
 * silencio se lee como una lista completa: el admin ve 100 filas y concluye
 * "eso es todo lo que pasó". Es la misma familia de fallo que la Ronda 23
 * persiguió en otros sitios —un límite que no coincide con la realidad y no
 * avisa— y aquí es más caro, porque `admin_audit_log` es el registro de quién
 * tocó el dinero, el catálogo y los permisos.
 *
 * Este módulo nombra las tres cosas que una lista capada debe poder declarar
 * —cuántas muestra, cuál es su tope y si hay más— para que ninguna superficie
 * pueda volver a presentar una página como un total.
 */

/**
 * Topes duros de las tres bitácoras de `/admin/bitacoras`.
 *
 * POR QUÉ VIVEN AQUÍ Y NO EN SUS CONSUMIDORES:
 *  - `admin-errors.ts` es un módulo `"use server"`, y un módulo `"use server"`
 *    **solo puede exportar funciones asíncronas y tipos**: un valor exportado
 *    invalida el módulo entero y el fallo aparece a dos archivos de distancia,
 *    en el bundler. Lo vigila `src/lib/use-server.contract.test.ts`.
 *  - El route handler de correos no es el sitio de un número de producto, y un
 *    `route.ts` exporta endpoints, no constantes de dominio.
 *
 * Tener los tres juntos es además lo que permite verlos de un vistazo: son la
 * única razón por la que una bitácora puede mentir, y son tres números.
 */

/** Tope duro de filas por consulta de la bitácora de errores. */
export const ERROR_LOG_CAP = 200

/**
 * Filas por página de errores cuando el llamador no pide un número.
 *
 * POR QUÉ ESTÁ NOMBRADA: antes este `100` vivía dentro de la expresión del
 * `Math.max(...)` de `getErrorLogs` mientras el tope de arriba decía `200`. Dos
 * números para una sola cosa —el tope efectivo era el menor, y ninguno de los
 * dos se veía desde la UI—, que es la misma familia de fallo que esta ronda
 * persigue. El número que la UI declara es el que `paginaCapada` recibe
 * (`cap`), no el techo.
 */
export const ERROR_LOG_PAGE_DEFAULT = 100

/** Tope duro de filas por consulta de la bitácora de correos. */
export const EMAIL_LOG_CAP = 200

export interface PaginaCapada<T> {
  entries: T[]
  /** Filas devueltas al llamador. */
  shown: number
  /** Tope duro de la consulta. */
  cap: number
  /** `true` si la consulta se topó: existe al menos una fila más. */
  truncated: boolean
  /**
   * Total real de filas que cumplen el filtro, si se preguntó. `null` = no se
   * preguntó.
   *
   * NUNCA se rellena con `shown`. Hacerlo es exactamente el error que este
   * módulo existe para evitar: `getErrorLogs` devolvía `total: entries.length`,
   * un campo llamado `total` que significaba "mostradas".
   */
  total: number | null
}

/**
 * Arma la página a partir de **`cap + 1` filas pedidas a propósito**.
 *
 * La fila de más es la sonda: si llega, hay más. Cuesta una fila en vez de un
 * `count(*)` y responde la única pregunta que la UI necesita —"¿esto es todo?"—
 * sin recorrer la tabla. Si el llamador además preguntó el total, se pasa aquí.
 */
export function paginaCapada<T>(
  filas: T[],
  cap: number,
  total: number | null = null
): PaginaCapada<T> {
  const truncated = filas.length > cap
  const entries = truncated ? filas.slice(0, cap) : filas
  return { entries, shown: entries.length, cap, truncated, total }
}

/**
 * Frase honesta para la cabecera de una bitácora capada.
 *
 * Devuelve una cadena que dice **cuántas se ven y de cuántas**, y añade el
 * aviso cuando la lista se cortó. Nunca devuelve una frase que se pueda leer
 * como "esto es todo" si no lo es.
 */
export function resumenDeCorte(pagina: {
  shown: number
  cap: number
  truncated: boolean
  total: number | null
}): string {
  const { shown, truncated, total } = pagina

  if (total !== null && total > shown) {
    return `Mostrando ${shown} de ${total} registros`
  }
  if (total !== null) {
    return `${shown} ${shown === 1 ? "registro" : "registros"}`
  }
  if (truncated) {
    return `Mostrando las ${shown} más recientes · hay más`
  }
  return `${shown} ${shown === 1 ? "registro" : "registros"}`
}
