import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { logger } from "@/lib/logger"
import {
  MAX_PROBE_IDS,
  chunk,
  classifyImageProbe,
  imageProbeReason,
  isProbeableImageUrl,
  shouldRetryWithGet,
} from "@/lib/product-images"

export const runtime = "nodejs"

/** Timeout por imagen: el sondeo de un lote no debe colgar la respuesta. */
const PROBE_TIMEOUT_MS = 8000
/** Imágenes sondeadas en paralelo. */
const CONCURRENCY = 6

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...init,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
  } catch {
    return null
  }
}

/**
 * Sondea una URL con HEAD y, si el servidor lo rechaza (403/405/501) o la red
 * falla, reintenta con un GET de rango mínimo para no descargar la imagen.
 */
async function probeImage(url: string): Promise<{ status: number | null; reason: string }> {
  const head = await fetchWithTimeout(url, { method: "HEAD" })
  let status = head?.status ?? null
  if (head === null || shouldRetryWithGet(status)) {
    const get = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    })
    if (get) status = get.status
  }
  return { status, reason: imageProbeReason(status) }
}

/**
 * POST /api/admin/products/check-images
 *
 * Body: `{ ids?: number[] }` para revisar productos concretos (p. ej. la
 * selección) o `{ limit?, offset? }` para revisar la siguiente página de
 * productos con imagen. Máximo MAX_PROBE_IDS por corrida.
 *
 * Devuelve `{ checked, ok, skipped, broken[], hasMore }`, donde cada roto trae
 * `{ id, name, image_url, status, reason }`. Solo admin.
 */
export async function POST(request: NextRequest) {
  try {
    const { response: adminDenied } = await requireAdmin({ permission: "productos" })
    if (adminDenied) return adminDenied

    const parsed = await readJsonBody<{
      ids?: unknown
      limit?: unknown
      offset?: unknown
    }>(request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

    const body = parsed.data

    const ids = Array.isArray(body.ids)
      ? [
          ...new Set(
            body.ids.filter(
              (v): v is number => typeof v === "number" && Number.isInteger(v)
            )
          ),
        ]
      : null
    if (ids && ids.length > MAX_PROBE_IDS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_PROBE_IDS} productos por revisión` },
        { status: 400 }
      )
    }

    const rawLimit = Number(body.limit)
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_PROBE_IDS)
      : MAX_PROBE_IDS
    const rawOffset = Number(body.offset)
    const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0

    const supabase = await createServiceClient()
    let query = supabase
      .from("products")
      .select("id,name,image_url")
      .is("deleted_at", null)
      .order("id", { ascending: true })
    query = ids
      ? query.in("id", ids.length > 0 ? ids : [-1])
      : query.not("image_url", "is", null).range(offset, offset + limit - 1)

    const { data, error } = await query
    if (error) {
      logger.error("[CHECK-IMAGES] query error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data ?? []) as unknown as {
      id: number
      name: string
      image_url: string | null
    }[]
    const probeable = rows.filter((row) => isProbeableImageUrl(row.image_url))
    const broken: {
      id: number
      name: string
      image_url: string | null
      status: number | null
      reason: string
    }[] = []
    let ok = 0

    for (const batch of chunk(probeable, CONCURRENCY)) {
      const results = await Promise.all(
        batch.map(async (row) => ({
          row,
          probe: await probeImage(row.image_url as string),
        }))
      )
      for (const { row, probe } of results) {
        if (classifyImageProbe(probe.status) === "broken") {
          broken.push({
            id: row.id,
            name: row.name,
            image_url: row.image_url,
            status: probe.status,
            reason: probe.reason,
          })
        } else {
          ok++
        }
      }
    }

    return NextResponse.json({
      checked: probeable.length,
      ok,
      skipped: rows.length - probeable.length,
      broken,
      hasMore: !ids && rows.length === limit,
    })
  } catch (err) {
    logger.error("[CHECK-IMAGES] unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
