import { NextResponse } from "next/server"

/**
 * Traduce el código de error de Postgres de una RPC de negocio a una respuesta
 * HTTP.
 *
 * Las RPC del admin (`commission_*` en 00155, `record_foodos_payout` en 00157)
 * lanzan mensajes en español pensados para quien opera: «El periodo ya está
 * «pagada»: no se puede pagar dos veces», «La dispersión (1200.00) excede el
 * saldo pendiente del restaurante (1000.00)». Por eso los códigos de negocio
 * conocidos se reenvían tal cual y solo los inesperados se sustituyen por un
 * mensaje genérico, para no filtrar detalles internos.
 */
const STATUS_BY_CODE: Record<string, number> = {
  // violación de llave foránea — el restaurante, el vendedor o el periodo no existen
  "23503": 404,
  // violación de CHECK o guarda de la migración — regla de negocio
  "23514": 400,
  // fecha/hora inválida (rango de periodo invertido)
  "22007": 400,
  // parámetro inválido (tasa fuera de rango, zona horaria desconocida)
  "22023": 400,
  // llave duplicada
  "23505": 409,
  // permiso insuficiente. Las RPC de negocio comprueban el rol por su cuenta
  // (`is_admin()` en las de comisiones, `profiles.role = 'admin'` en
  // `foodos_restaurant_review`), así que un `42501` significa «no te toca», no
  // «se rompió algo»: 403 lo dice, y 500 lo ocultaría como una avería.
  "42501": 403,
  // no existe. `P0002` es `no_data_found` y las RPC lo usan para «esa fila no
  // está» (`foodos_restaurant_review` con un id que ya no existe). Es el mismo
  // caso que `23503` —algo que el cliente nombró y no está— y merece el mismo
  // 404: un 500 lo disfrazaría de avería y escondería que la petición estaba mal.
  P0002: 404,
}

export function rpcErrorResponse(
  error: { code?: string | null; message: string },
  fallback = "No se pudo completar la operación"
): NextResponse {
  const status = error.code ? STATUS_BY_CODE[error.code] : undefined
  if (!status) {
    return NextResponse.json({ error: fallback }, { status: 500 })
  }
  return NextResponse.json({ error: error.message }, { status })
}
