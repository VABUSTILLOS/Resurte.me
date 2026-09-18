/**
 * Combinación de dos versiones del mismo valor del panel.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * Las claves de `panel_entries` se guardan con semántica *replace-all*: cada
 * dispositivo escribe el valor completo. Mientras un solo dispositivo escribe,
 * eso es invisible. Con dos (tablet en caja + laptop en la oficina) produce una
 * secuencia concreta y silenciosa:
 *
 *   t=0    Ambos dispositivos leen `inventario-items` = [A, B].
 *   t=100  Tablet agrega C → escribe [A, B, C].
 *   t=400  Laptop (base obsoleta [A, B]) corrige el stock de A → escribe
 *          [A', B] y **borra C**.
 *
 * Nadie se enteró. La migración 00164 detecta la base obsoleta y responde 409
 * en vez de sobrescribir; este módulo decide **qué escribir después del 409**.
 *
 * LA REGLA
 *
 * Solo se combina cuando los elementos tienen **identidad** (un `id`, o un
 * `name` en su defecto, o el propio valor cuando es un primitivo). Con
 * identidad, el resultado conserva lo del otro dispositivo *y* la intención
 * local: no se pierde nada y el merge es determinista.
 *
 * Sin identidad no hay merge posible —un escalar no se combina con otro
 * escalar— y este módulo **no adivina**: conserva la versión local (que es la
 * acción que el usuario acaba de tomar en este dispositivo) y lo reporta para
 * que la UI lo anuncie. Elegir la del servidor sería revertir en silencio la
 * edición que el usuario acaba de hacer; elegir la local sin decirlo sería el
 * bug original. Se elige la local **y se dice**.
 *
 * LÍMITE CONOCIDO Y ACEPTADO
 *
 * Combinar por identidad no distingue "el otro dispositivo borró esta fila" de
 * "esta fila es nueva para mí": en ambos casos la fila existe en un solo lado.
 * Este módulo la **conserva** y la cuenta en `keptFromServer`. Es la decisión
 * deliberada: un borrado que no se propaga es un defecto menor y recuperable;
 * una fila borrada por accidente, no. Cuando el conteo es > 0 la UI lo dice, así
 * que el usuario puede volver a borrarla a mano.
 */

/** Cómo se resolvió el choque entre la versión local y la del servidor. */
export type MergeOutcome =
  /** El servidor ya tenía exactamente lo mismo: no hubo choque real. */
  | "identical"
  /** Se combinaron ambos lados por identidad de elemento. */
  | "merged"
  /** Sin identidad por elemento: se conservó la versión local. */
  | "local-wins"
  /** Las dos versiones no son del mismo tipo (p. ej. arreglo contra objeto). */
  | "incompatible"

export interface MergeResult {
  outcome: MergeOutcome
  /** Valor que debe escribirse: siempre uno de los dos que entraron. */
  value: unknown
  /** Elementos que existían solo en el servidor y se conservaron. */
  keptFromServer: number
  /** Elementos presentes en ambos lados donde la versión local reemplazó a la del servidor. */
  localOverwrote: number
  /** Elementos que existían solo en local. */
  localAdded: number
}

const ZERO: Omit<MergeResult, "outcome" | "value"> = {
  keptFromServer: 0,
  localOverwrote: 0,
  localAdded: 0,
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * Compara dos valores JSON por su forma serializada.
 *
 * Las claves de `panel_entries` son JSON puro (`jsonb`), así que el orden de
 * las propiedades es el de inserción en ambos lados y una comparación textual
 * es fiel. Se usa solo para contar cuántos elementos cambió el otro
 * dispositivo; un falso "distinto" solo infla el conteo, nunca pierde datos.
 */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a !== "object") return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/**
 * Identidad de un elemento dentro de un arreglo.
 *
 * `null` significa "no tiene identidad", y basta un solo elemento sin ella para
 * que el arreglo completo deje de ser combinable: combinar la mitad y
 * reemplazar la otra mitad daría un resultado que nadie puede razonar.
 */
function elementKey(item: unknown): string | null {
  if (typeof item === "string") return item === "" ? null : `s:${item}`
  if (typeof item === "number" && Number.isFinite(item)) return `n:${item}`
  if (isPlainObject(item)) {
    const id = item["id"]
    if (typeof id === "string" && id !== "") return `id:${id}`
    const name = item["name"]
    if (typeof name === "string" && name !== "") return `name:${name}`
  }
  return null
}

function mergeArrays(local: unknown[], server: unknown[]): MergeResult {
  const localKeys = local.map(elementKey)
  const serverKeys = server.map(elementKey)
  if (localKeys.some((k) => k === null) || serverKeys.some((k) => k === null)) {
    return { outcome: "local-wins", value: local, ...ZERO }
  }

  const serverByKey = new Map<string, unknown>()
  for (let i = 0; i < server.length; i++) {
    const k = serverKeys[i]
    if (k !== null && !serverByKey.has(k)) serverByKey.set(k, server[i])
  }

  const seen = new Set<string>()
  const out: unknown[] = []
  let localOverwrote = 0
  let localAdded = 0

  for (let i = 0; i < local.length; i++) {
    const k = localKeys[i]
    if (k === null) continue
    seen.add(k)
    const remote = serverByKey.get(k)
    if (remote === undefined) localAdded++
    else if (!sameJson(local[i], remote)) localOverwrote++
    out.push(local[i])
  }

  let keptFromServer = 0
  for (let i = 0; i < server.length; i++) {
    const k = serverKeys[i]
    if (k === null || seen.has(k)) continue
    seen.add(k)
    keptFromServer++
    out.push(server[i])
  }

  return { outcome: "merged", value: out, keptFromServer, localOverwrote, localAdded }
}

function mergeRecords(local: Record<string, unknown>, server: Record<string, unknown>): MergeResult {
  const out: Record<string, unknown> = {}
  let localOverwrote = 0
  let localAdded = 0

  for (const key of Object.keys(local)) {
    const has = Object.prototype.hasOwnProperty.call(server, key)
    if (!has) localAdded++
    else if (!sameJson(local[key], server[key])) localOverwrote++
    out[key] = local[key]
  }

  let keptFromServer = 0
  for (const key of Object.keys(server)) {
    if (Object.prototype.hasOwnProperty.call(local, key)) continue
    keptFromServer++
    out[key] = server[key]
  }

  return { outcome: "merged", value: out, keptFromServer, localOverwrote, localAdded }
}

/**
 * Decide qué escribir cuando el servidor rechazó nuestra base por obsoleta.
 *
 * `local` es el valor de localStorage del dispositivo que empuja; `server` es el
 * valor que el servidor tiene ahora (el que devolvió el 409).
 */
export function mergePanelValue(local: unknown, server: unknown): MergeResult {
  if (sameJson(local, server)) return { outcome: "identical", value: server, ...ZERO }

  if (Array.isArray(local) && Array.isArray(server)) return mergeArrays(local, server)
  if (isPlainObject(local) && isPlainObject(server)) return mergeRecords(local, server)

  const bothPrimitive =
    (local === null || typeof local !== "object") && (server === null || typeof server !== "object")
  return { outcome: bothPrimitive ? "local-wins" : "incompatible", value: local, ...ZERO }
}

/** `true` cuando hubo un choque real y la UI debe anunciarlo. */
export function isRealConflict(result: MergeResult): boolean {
  return result.outcome !== "identical"
}
