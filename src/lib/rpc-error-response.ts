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
