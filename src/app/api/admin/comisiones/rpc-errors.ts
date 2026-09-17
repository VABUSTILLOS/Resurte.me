import { NextResponse } from "next/server"

/**
 * Traduce el código de error de Postgres de las RPC del ledger de comisiones
 * a una respuesta HTTP.
 *
 * Las RPC de 00155 lanzan mensajes en español pensados para el admin
 * («El periodo ya está «pagada»: no se puede pagar dos veces»). Por eso los
 * códigos de negocio conocidos se reenvían tal cual y solo los inesperados
 * se sustituyen por un mensaje genérico, para no filtrar detalles internos.
 */
const STATUS_BY_CODE: Record<string, number> = {
  // violación de llave foránea — el vendedor o el periodo no existen
  "23503": 404,
  // violación de CHECK o guarda de la migración — regla de negocio
  "23514": 400,
  // fecha/hora inválida (rango de periodo invertido)
  "22007": 400,
  // parámetro inválido (tasa fuera de [0,1], zona horaria desconocida)
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
