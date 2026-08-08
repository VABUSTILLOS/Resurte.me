import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

// Rate limiting durable compartido: fixed-window counter en Supabase
// (RPC consume_rate_limit, tabla rate_limits). Compartido entre
// instancias serverless; no se reinicia en deploys.

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retry_after_seconds: number
}

export type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Consume una "hit" del fixed-window counter para `key`.
 * Fail-open: si la BD falla, no bloquea tráfico legítimo.
 */
export async function rateLimited(
  supabase: ServiceClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })

  if (error || !data || data.length === 0) {
    logger.warn("[RATE-LIMIT] RPC error, fail-open", { rpc_error: error?.message ?? "empty data" })
    return { allowed: true, remaining: limit, retry_after_seconds: 0 }
  }

  const row = data[0] as RateLimitResult
  return row
}

/** Resuelve la IP del cliente desde proxies (Vercel/Cloudflare). */
export function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

/** Respuesta 429 estándar con header Retry-After. */
export function rateLimitResponse(rate: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Demasiadas peticiones. Intenta en un minuto." },
    { status: 429, headers: { "Retry-After": String(rate.retry_after_seconds) } },
  )
}
