import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

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
    const body = (await request.json()) as LogErrorBody

    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "message es requerido" }, { status: 400 })
    }

    const supabase = await createServiceClient()

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