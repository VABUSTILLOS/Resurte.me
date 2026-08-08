import { NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"

// Endpoint de recepción de reportes de violación CSP (directiva report-uri).
//
// La CSP se desplegó en modo enforce (ver src/lib/csp.ts). Este endpoint
// permite observar violaciones reales (analytics bloqueado, script inline
// sin nonce, etc.) para ajustar la policy sin romper funcionalidad.
//
// Diseño defensivo:
// - Solo POST (los navegadores envían el reporte como POST con JSON).
// - Límite de tamaño de body (los reportes reales son <2 KB; evita abuso).
// - Rate limit en memoria por dirección IP (evita spam de logs).
// - Se registra solo metadata sin PII: se descarta document-uri/referrer
//   con query string y nunca se loguean payloads de violación de script.

const MAX_BODY_BYTES = 16 * 1024
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20

// fixed-window rate limit simple en memoria. Suficiente para este endpoint:
// el objetivo es observar violaciones, no endurecer contra atacantes.
const ipCounters = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = ipCounters.get(ip)
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    ipCounters.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count += 1
  return entry.count > MAX_PER_WINDOW
}

/** Recorta query string/credenciales de un URI para no loguear datos de usuario. */
function safeUri(uri: unknown): string | undefined {
  if (typeof uri !== "string" || !uri) return undefined
  try {
    const u = new URL(uri, "https://resurte.me")
    u.search = ""
    u.hash = ""
    return u.href
  } catch {
    return undefined
  }
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  if (isRateLimited(ip)) {
    return new NextResponse(null, { status: 429 })
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (contentLength > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 })
  }

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 })
  }

  let report: unknown
  try {
    report = JSON.parse(raw) as unknown
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const cspReport =
    report && typeof report === "object" && "csp-report" in report
      ? (report as { "csp-report"?: Record<string, unknown> })["csp-report"]
      : undefined

  if (!cspReport) {
    return new NextResponse(null, { status: 204 })
  }

  logger.warn("[CSP-VIOLATION]", {
    disposition: cspReport["disposition"] ?? "enforce",
    effective_directive: cspReport["effective-directive"] ?? undefined,
    violated_directive: cspReport["violated-directive"] ?? undefined,
    blocked_uri: safeUri(cspReport["blocked-uri"]),
    source_file: safeUri(cspReport["source-file"]),
    line: cspReport["line-number"] ?? undefined,
    column: cspReport["column-number"] ?? undefined,
    // document-uri/script-sample se omiten a propósito: pueden contener
    // query strings y trozos de scripts con datos sensibles.
  })

  return new NextResponse(null, { status: 204 })
}

// Solo POST: los navegadores nunca consultan este endpoint con GET.
export function GET() {
  return new NextResponse(null, { status: 405 })
}
