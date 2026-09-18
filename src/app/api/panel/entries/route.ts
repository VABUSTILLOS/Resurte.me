import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { resolveEffectiveOwner, ownerColumn } from "@/lib/panel/owner"
import { canWriteEntry } from "@/lib/panel-roles"

/**
 * GET /api/panel/entries?tool=<storage-key>&collection=<slug>
 *   → { found: boolean, value?: unknown, updated_at?: string }
 * PUT /api/panel/entries { tool, collection_slug?, value, base_updated_at? }
 *   → { saved: true, updated_at } o 409 { conflict: true, value, updated_at }
 *
 * Persistencia genérica de las herramientas del panel (ver migración
 * 00055_panel_entries). Identidad: sesión autenticada (cookie) o header
 * `x-guest-token` (UUID anónimo del navegador, mismo patrón que las
 * direcciones guest y /api/panel/dishes).
 *
 * CONTROL DE CONCURRENCIA (migración 00164)
 *
 * El valor sigue siendo *replace-all* por dueño+tool+colección, pero ya no es
 * ciego: el cliente manda la versión (`updated_at`) sobre la que construyó su
 * valor. Si el servidor tiene otra, responde **409 con el valor vigente** en vez
 * de sobrescribirlo, y el cliente combina ambos (ver `lib/panel-merge.ts`). Sin
 * esto, un segundo dispositivo con datos obsoletos borraba en silencio lo que el
 * primero acababa de guardar.
 *
 * `base_updated_at` es opcional a propósito: un cliente que no lo mande conserva
 * el comportamiento anterior (último escritor gana). Así un despliegue del
 * servidor no rompe las pestañas que ya estaban abiertas con el bundle viejo.
 */

const TOOL_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
const MAX_VALUE_BYTES = 256 * 1024 // 256 KB por clave; las listas del panel son pequeñas

function isValidTool(tool: unknown): tool is string {
  return typeof tool === "string" && TOOL_RE.test(tool)
}

/**
 * Una base vacía es válida (primera escritura de una clave). Cualquier otra cosa
 * que no sea una fecha parseable se rechaza: el RPC compara la cadena contra
 * `updated_at` y una cadena basura nunca coincidiría, lo que devolvería un 409
 * perpetuo en vez de un error claro.
 */
function parseBase(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null }
  if (typeof value !== "string") return { ok: false }
  if (Number.isNaN(Date.parse(value))) return { ok: false }
  return { ok: true, value }
}

interface PutRow {
  applied?: boolean
  value?: { value?: unknown } | null
  updated_at?: string | null
}

export async function GET(req: NextRequest) {
  try {
    const owner = await resolveEffectiveOwner(req)
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
      .select("payload, updated_at")
      .eq(col, val)
      .eq("tool", tool)
      .eq("collection_slug", collection)
      .limit(1)

    if (error) {
      logger.error("Panel entries load error:", error)
      return NextResponse.json({ error: "Error al cargar los datos" }, { status: 500 })
    }

    const row = (data || [])[0] as
      | { payload?: { value?: unknown }; updated_at?: string | null }
      | undefined
    if (!row || typeof row.payload !== "object" || row.payload === null || !("value" in row.payload)) {
      return NextResponse.json({ found: false })
    }
    return NextResponse.json({
      found: true,
      value: row.payload.value,
      updated_at: row.updated_at ?? null,
    })
  } catch (err) {
    logger.error("Panel entries GET error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const owner = await resolveEffectiveOwner(req)
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

    const body = (await req.json()) as {
      tool?: unknown
      collection_slug?: string
      value?: unknown
      base_updated_at?: unknown
    }
    if (!isValidTool(body.tool)) {
      return NextResponse.json({ error: "tool inválido" }, { status: 400 })
    }
    if (!canWriteEntry(owner.role, body.tool)) {
      return NextResponse.json({ error: "Tu rol no puede modificar esta clave" }, { status: 403 })
    }
    if (!("value" in body)) {
      return NextResponse.json({ error: "Falta value" }, { status: 400 })
    }
    const base = parseBase(body.base_updated_at)
    if (!base.ok) {
      return NextResponse.json({ error: "base_updated_at inválido" }, { status: 400 })
    }
    const payload = { value: body.value }
    if (JSON.stringify(payload).length > MAX_VALUE_BYTES) {
      return NextResponse.json({ error: "El valor excede el tamaño máximo (256 KB)" }, { status: 413 })
    }

    const collection = body.collection_slug?.trim() || "default"

    // Un solo viaje: `panel_entry_put` inserta o actualiza de forma atómica y
    // solo si la base coincide. El `delete()` + `insert()` anterior permitía que
    // dos escrituras concurrentes borraran ambas filas y luego insertaran dos.
    const { data, error } = await service.rpc("panel_entry_put", {
      p_user_id: owner.userId,
      p_guest_token: owner.guestToken,
      p_tool: body.tool,
      p_collection: collection,
      p_payload: payload,
      p_base_updated_at: base.value,
    })

    if (error) {
      logger.error("Panel entries put error:", error)
      return NextResponse.json({ error: "Error al guardar los datos" }, { status: 500 })
    }

    const row = (Array.isArray(data) ? data[0] : data) as PutRow | undefined
    if (!row) {
      logger.error("Panel entries put error: respuesta vacía del RPC")
      return NextResponse.json({ error: "Error al guardar los datos" }, { status: 500 })
    }

    const updatedAt = row.updated_at ?? null

    if (row.applied) {
      return NextResponse.json({ saved: true, updated_at: updatedAt })
    }

    // La fila cambió desde que el cliente leyó: se devuelve el valor vigente
    // para que combine en vez de sobrescribir.
    const current = row.value
    const serverValue =
      current && typeof current === "object" && "value" in current ? current.value : null
    return NextResponse.json(
      { conflict: true, value: serverValue, updated_at: updatedAt },
      { status: 409 },
    )
  } catch (err) {
    logger.error("Panel entries PUT error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
