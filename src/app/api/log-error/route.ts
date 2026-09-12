import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"

// Endpoint público de ingesta de logs del cliente: sin rate limit ni tope
// de tamaño era un vector de abuso (escrituras ilimitadas en error_logs →
// costo y ruido). Se defiende igual que /api/csp-report:
//   · Tope de body (los reportes legítimos son << 64 KB).
//   · Rate limit durable por IP (helper compartido, ver src/lib/rate-limit.ts).
const MAX_BODY_BYTES = 64 * 1024
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_SECONDS = 60

interface LogErrorBody {
  message: string
  context?: Record<string, unknown>
  severity?: "info" | "warn" | "error" | "fatal"
  userId?: string
  sessionId?: string
  requestId?: string
  userAgent?: string
  url?: string
  stack?: string
  source?: "client" | "server" | "edge"
}

export async function POST(request: NextRequest) {
  try {
    // Tope de tamaño ANTES de parsear: un body gigante solo sirve para abusar.
    const contentLength = Number(request.headers.get("content-length") ?? 0)
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload demasiado grande" }, { status: 413 })
    }

    const supabase = await createServiceClient()

    // Rate limit durable por IP: frena el spam de escrituras en error_logs.
    const rate = await rateLimited(
      supabase,
      `log-error:${clientIp(request)}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SECONDS
    )
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const body = (await request.json()) as LogErrorBody

    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "message es requerido" }, { status: 400 })
    }

    const { error } = await supabase.from("error_logs").insert({
      message: body.message.slice(0, 5000),
      context: body.context ?? {},
      severity: body.severity ?? "error",
      user_id: body.userId ?? null,
      session_id: body.sessionId ?? null,
      request_id: body.requestId ?? null,
      user_agent: body.userAgent ?? request.headers.get("user-agent"),
      url: body.url ?? null,
      stack: body.stack?.slice(0, 10000) ?? null,
      source: body.source ?? "client",
    })

    if (error) {
      logger.error("log-error insert failed:", error)
      return NextResponse.json(
        { error: "Error al registrar el log" },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error("log-error unexpected:", err)
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    )
  }
}
