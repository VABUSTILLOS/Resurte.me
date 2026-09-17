/**
 * Ronda 12 (B25-B26) — diff de tres vías del conflicto de escritura del modal
 * de producto.
 *
 * Cuando el servidor rechaza un guardado porque la fila ya cambió (409
 * `stale_write`) devuelve la fila vigente. Para que el admin decida con
 * información hay que separar dos casos que desde fuera se ven iguales:
 *
 * - campos que el otro cambió y este formulario también: choque real, alguien
 *   pierde su versión;
 * - campos que el otro cambió y este formulario no tocó: no hay choque, basta
 *   con no revertirlos (`adoptTheirs`), que es lo que hace «Guardar lo mío».
 *
 * Son reglas puras, así que viven aquí y el modal solo pinta (invariante B5).
 */

import { timeAgo } from "./admin-product-list"
import { auditFieldLabel, formatAuditValue } from "./audit-diff"
import { formatMoney } from "./money"

/** Campos que el servidor re-deriva del stock capturado, no de la selección. */
const DERIVED_FIELDS = new Set(["stock_status"])

/** Campos monetarios: se formatean con el es-MX del panel, no con la bitácora. */
const MONEY_FIELDS = new Set(["price", "sale_price", "cost"])

/** Número si el valor es numérico (Postgres manda `numeric` como texto a veces). */
function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Igualdad tolerante a las diferencias de forma que introduce el transporte:
 * `null` y `undefined` son lo mismo, `100` y `"100"` también, y una misma marca
 * de tiempo puede llegar como `+00:00` o como `.000Z`. Sin esto el diff
 * reportaría choques que no existen.
 */
function sameValue(field: string, a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    return a.length === b.length && a.every((v, i) => sameValue(field, v, b[i]))
  }
  if (field.endsWith("_at")) {
    const ta = Date.parse(String(a))
    const tb = Date.parse(String(b))
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb
  }
  if (typeof a === "boolean" || typeof b === "boolean") return a === b
  const na = asNumber(a)
  const nb = asNumber(b)
  if (na !== null && nb !== null) return na === nb
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim()
  return JSON.stringify(a) === JSON.stringify(b)
}

export interface WriteConflictField {
  field: string
  label: string
  /** Valor vigente en la base (el del otro usuario). */
  theirs: string
  /** Valor que este formulario intentaba guardar. */
  mine: string
}

export interface WriteConflictSummary {
  /** Ambos cambiaron el campo: alguien pierde si se guarda tal cual. */
  changes: WriteConflictField[]
  /** Solo lo cambió el otro: hay que conservarlo, no revertirlo. */
  untouched: WriteConflictField[]
}

export interface WriteConflictInput {
  /** Fila con la que se armó el formulario (la versión que se leyó). */
  loaded: Record<string, unknown> | null
  /** Cuerpo que se intentó guardar. */
  payload: Record<string, unknown>
  /** Fila vigente devuelta por el 409. */
  current: Record<string, unknown> | null
}

function skipDerived(payload: Record<string, unknown>): Set<string> {
  const skip = new Set<string>()
  // Con unidades capturadas el servidor re-deriva `stock_status` a partir del
  // umbral, así que mostrarlo como choque aparte duplicaría el de
  // `stock_quantity` (y el admin no eligió ese valor: lo eligió el sistema).
  if (asNumber(payload.stock_quantity) !== null) {
    for (const field of DERIVED_FIELDS) skip.add(field)
  }
  return skip
}

/** Valor de un campo como texto para el panel. */
function fieldValue(field: string, value: unknown): string {
  if (value == null || value === "") return "—"
  if (MONEY_FIELDS.has(field)) {
    const amount = asNumber(value)
    // Montos en es-MX (`$90`), no el formato de la bitácora: este panel es el
    // mismo que captura los precios y debe hablar el mismo idioma.
    if (amount !== null) return formatMoney(amount)
  }
  return formatAuditValue(field, value)
}

/** Separa el 409 en choques reales y cambios ajenos que solo hay que respetar. */
export function summarizeWriteConflict(input: WriteConflictInput): WriteConflictSummary {
  const changes: WriteConflictField[] = []
  const untouched: WriteConflictField[] = []
  const { loaded, payload, current } = input
  // Sin la fila leída no hay tres vías que comparar: no se inventa un diff.
  if (!loaded || !current) return { changes, untouched }
  const skip = skipDerived(payload)
  for (const [field, mine] of Object.entries(payload)) {
    if (skip.has(field)) continue
    // Solo se compara lo que el servidor devuelve en la fila vigente: si la
    // columna no viene (descripción, imágenes…) no hay contra qué comparar.
    if (!(field in current)) continue
    const theirs = current[field]
    if (sameValue(field, theirs, loaded[field])) continue
    const row: WriteConflictField = {
      field,
      label: auditFieldLabel(field),
      theirs: fieldValue(field, theirs),
      mine: fieldValue(field, mine),
    }
    if (sameValue(field, mine, loaded[field])) untouched.push(row)
    else changes.push(row)
  }
  return { changes, untouched }
}

/**
 * Cuerpo a reenviar tras el 409: adopta los valores vigentes de los campos que
 * este formulario no tocó, para no revertir el trabajo del otro usuario, y deja
 * intactos los campos que sí se editaron (ahí manda la decisión del admin).
 */
export function adoptTheirs(input: WriteConflictInput): Record<string, unknown> {
  const { loaded, payload, current } = input
  if (!loaded || !current) return payload
  const next = { ...payload }
  for (const field of Object.keys(payload)) {
    if (!(field in current)) continue
    if (!sameValue(field, payload[field], loaded[field])) continue
    next[field] = current[field]
  }
  return next
}

export interface WriteConflictNotice {
  title: string
  detail: string
}

/** Título y explicación del panel de conflicto, en el idioma del admin. */
export function describeWriteConflict(
  summary: WriteConflictSummary,
  currentUpdatedAt: string | null,
  now = Date.now()
): WriteConflictNotice {
  const when = currentUpdatedAt ? ` ${timeAgo(currentUpdatedAt, now)}` : ""
  if (summary.changes.length === 0 && summary.untouched.length === 0) {
    return {
      title: "Otro usuario guardó este producto primero",
      detail: `La fila cambió${when} y no se pudo comparar campo por campo. Si guardas lo tuyo, se sobrescribe su versión.`,
    }
  }
  if (summary.changes.length === 0) {
    return {
      title: "Nadie tocó lo que editaste",
      detail: `Otro usuario guardó cambios${when} en campos que tú no editaste. Puedes guardar lo tuyo: se conservan los suyos.`,
    }
  }
  const { length } = summary.changes
  return {
    title: length === 1 ? "1 campo en conflicto" : `${length} campos en conflicto`,
    detail: `Otro usuario guardó cambios${when}. Al guardar lo tuyo se conservan los campos que no editaste; en los que ambos cambiaron queda tu versión.`,
  }
}
