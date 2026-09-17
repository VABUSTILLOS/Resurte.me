/**
 * Lectura del cuerpo JSON de las rutas de escritura del admin.
 *
 * `await request.json()` lanza con un body ausente, vacío o malformado, y en las
 * rutas que lo hacían dentro del `try` general ese fallo del **cliente** se
 * convertía en un **500** del servidor (además de ensuciar `error_logs`). Un body
 * roto es un 400: el servidor está bien, la petición no.
 *
 * Devuelve un resultado discriminado en vez de una respuesta para que cada ruta
 * conserve su forma habitual de responder y el helper siga siendo trivial de
 * probar sin levantar Next.
 */

export type ReadJsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400; error: string }

const INVALID_BODY = "Cuerpo de la petición inválido: se esperaba un objeto JSON"
const MALFORMED_BODY = "Cuerpo de la petición inválido: JSON malformado o ausente"

/**
 * Lee el cuerpo como objeto JSON. Rechaza `null`, arrays y primitivos: todas las
 * rutas de escritura del admin esperan un objeto, y dejar pasar un `null` movía
 * el error al primer acceso a una propiedad (otra vez un 500).
 */
export async function readJsonBody<T>(request: Request): Promise<ReadJsonBodyResult<T>> {
  let data: unknown
  try {
    data = await request.json()
  } catch {
    return { ok: false, status: 400, error: MALFORMED_BODY }
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, status: 400, error: INVALID_BODY }
  }
  return { ok: true, data: data as T }
}
