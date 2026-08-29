import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * GET /api/panel/entries?tool=<storage-key>&collection=<slug>
 *   → { found: boolean, value?: unknown }
 * PUT /api/panel/entries { tool, collection_slug?, value }
 *   → guarda el valor completo de la clave (replace-all por dueño+tool+colección).
 *
 * Persistencia genérica de las herramientas del panel (ver migración
 * 00055_panel_entries). Identidad: sesión autenticada (cookie) o header
 * `x-guest-token` (UUID anónimo del navegador, mismo patrón que las
 * direcciones guest y /api/panel/dishes).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOOL_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
const MAX_VALUE_BYTES = 256 * 1024 // 256 KB por clave; las listas del panel son pequeñas

interface Owner {
  userId: string | null
  guestToken: string | null
}

/** Sesión autenticada gana; si no hay, se usa el guest_token del navegador. */
async function resolveOwner(req: NextRequest): Promise<Owner | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) return { userId: user.id, guestToken: null }

  const token = (req.headers.get("x-guest-token") || "").trim()
  if (!UUID_RE.test(token)) return null
  return { userId: null, guestToken: token }
}

function ownerColumn(owner: Owner): [string, string] {
  if (owner.userId) return ["user_id", owner.userId]
  return ["guest_token", owner.guestToken ?? ""]
}

function isValidTool(tool: unknown): tool is string {
  return typeof tool === "string" && TOOL_RE.test(tool)
}

export async function GET(req: NextRequest) {
  try {
    const owner = await resolveOwner(req)
    if (!owner) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const tool = req.nextUrl.searchParams.get("tool")?.trim() || ""
    if (!isValidTool(tool)) {
      return NextResponse.json({ error: "tool inválido" }, { status: 400 })
    }
    const collection = req.nextUrl.searchParams.get("collection")?.trim() || "default"

    const service = await createServiceClient()
    const rate = await rateLimited(
      service,
      `panel-entries:${owner.userId ?? owner.guestToken ?? clientIp(req)}`,
      60,
      60,
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const [col, val] = ownerColumn(owner)
    const { data, error } = await service
      .from("panel_entries")
      .select("payload")
      .eq(col, val)
      .eq("tool", tool)
      .eq("collection_slug", collection)
      .order("created_at", { ascending: false })
      .limit(1)

    if (error) {
      logger.error("Panel entries load error:", error)
      return NextResponse.json({ error: "Error al cargar los datos" }, { status: 500 })
    }

    const row = (data || [])[0] as { payload?: { value?: unknown } } | undefined
    if (!row || typeof row.payload !== "object" || row.payload === null || !("value" in row.payload)) {
      return NextResponse.json({ found: false })
    }
    return NextResponse.json({ found: true, value: row.payload.value })
  } catch (err) {
    logger.error("Panel entries GET error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const owner = await resolveOwner(req)
    if (!owner) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const service = await createServiceClient()
    const rate = await rateLimited(
      service,
      `panel-entries:${owner.userId ?? owner.guestToken ?? clientIp(req)}`,
      30,
      60,
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const body = (await req.json()) as { tool?: unknown; collection_slug?: string; value?: unknown }
    if (!isValidTool(body.tool)) {
      return NextResponse.json({ error: "tool inválido" }, { status: 400 })
    }
    if (!("value" in body)) {
      return NextResponse.json({ error: "Falta value" }, { status: 400 })
    }
    const payload = { value: body.value }
    if (JSON.stringify(payload).length > MAX_VALUE_BYTES) {
      return NextResponse.json({ error: "El valor excede el tamaño máximo (256 KB)" }, { status: 413 })
    }

    const collection = body.collection_slug?.trim() || "default"
    const [col, val] = ownerColumn(owner)

    // Replace-all por dueño + tool + colección: borra y reinserta la fila.
    const { error: deleteError } = await service
      .from("panel_entries")
      .delete()
      .eq(col, val)
      .eq("tool", body.tool)
      .eq("collection_slug", collection)
    if (deleteError) {
      logger.error("Panel entries delete error:", deleteError)
      return NextResponse.json({ error: "Error al guardar los datos" }, { status: 500 })
    }

    const { error: insertError } = await service.from("panel_entries").insert({
      tool: body.tool,
      collection_slug: collection,
      user_id: owner.userId,
      guest_token: owner.guestToken,
      payload,
      updated_at: new Date().toISOString(),
    })
    if (insertError) {
      logger.error("Panel entries insert error:", insertError)
      return NextResponse.json({ error: "Error al guardar los datos" }, { status: 500 })
    }

    return NextResponse.json({ saved: true })
  } catch (err) {
    logger.error("Panel entries PUT error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
