import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { resolveEffectiveOwner, ownerColumn, type EffectiveOwner } from "@/lib/panel/owner"
import { canReadRows, canWriteRows } from "@/lib/panel-roles"

/**
 * Almacenamiento por fila para las herramientas del panel de alto
 * volumen (ventas, mermas, movimientos de inventario) — ver migración
 * 00057_panel_rows. A diferencia de /api/panel/entries (valor completo,
 * cap 256 KB), aquí cada entidad es una fila con `client_id`
 * idempotente:
 *
 * GET /api/panel/rows?tool=&collection=&from=&to=&limit=&cursor=
 *   → { found, rows: unknown[], nextCursor?: string }
 *   Migración transparente: si no hay filas pero existe el array en
 *   panel_entries, lo importa antes de responder.
 * POST /api/panel/rows { tool, collection_slug?, rows: [{ client_id, entry_date?, data }] }
 *   → upsert idempotente por (dueño, tool, colección, client_id).
 * DELETE /api/panel/rows { tool, collection_slug?, client_ids? }
 *   → borra esos client_id; sin client_ids borra todo el tool+colección.
 */

const TOOL_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_BATCH_ROWS = 500
const MAX_BODY_BYTES = 256 * 1024
const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1000

function isValidTool(tool: unknown): tool is string {
  return typeof tool === "string" && TOOL_RE.test(tool)
}

interface RowIn {
  client_id: string
  entry_date: string | null
  data: unknown
}

/** Valida y normaliza las filas entrantes; null si alguna es inválida. */
function parseRows(input: unknown): RowIn[] | null {
  if (!Array.isArray(input) || input.length > MAX_BATCH_ROWS) return null
  const rows: RowIn[] = []
  for (const r of input) {
    if (typeof r !== "object" || r === null) return null
    const { client_id, entry_date, data } = r as Record<string, unknown>
    if (typeof client_id !== "string" || client_id.length < 1 || client_id.length > 80) return null
    if (entry_date != null && (typeof entry_date !== "string" || !DATE_RE.test(entry_date.slice(0, 10)))) return null
    rows.push({
      client_id,
      entry_date: typeof entry_date === "string" ? entry_date.slice(0, 10) : null,
      data,
    })
  }
  return rows
}

async function checkRate(req: NextRequest, owner: EffectiveOwner, limit: number) {
  const service = await createServiceClient()
  const rate = await rateLimited(
    service,
    `panel-rows:${owner.userId ?? owner.guestToken ?? clientIp(req)}`,
    limit,
    60,
  )
  return { service, rate }
}

export async function GET(req: NextRequest) {
  try {
    const owner = await resolveEffectiveOwner(req)
    if (!owner) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const tool = req.nextUrl.searchParams.get("tool")?.trim() || ""
    if (!isValidTool(tool)) return NextResponse.json({ error: "tool inválido" }, { status: 400 })
    if (!canReadRows(owner.role, tool)) {
      return NextResponse.json({ error: "Tu rol no tiene acceso a esta herramienta" }, { status: 403 })
    }
    const collection = req.nextUrl.searchParams.get("collection")?.trim() || "default"
    const from = req.nextUrl.searchParams.get("from")
    const to = req.nextUrl.searchParams.get("to")
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
      return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 })
    }
    const limitRaw = Number.parseInt(req.nextUrl.searchParams.get("limit") || "", 10)
    const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT
    const cursorRaw = Number.parseInt(req.nextUrl.searchParams.get("cursor") || "", 10)
    const offset = Number.isFinite(cursorRaw) && cursorRaw >= 0 ? cursorRaw : 0

    const { service, rate } = await checkRate(req, owner, 60)
    if (!rate.allowed) return rateLimitResponse(rate)

    const [col, val] = ownerColumn(owner)

    let query = service
      .from("panel_rows")
      .select("payload, client_id")
      .eq(col, val)
      .eq("tool", tool)
      .eq("collection_slug", collection)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit)
    if (from) query = query.gte("entry_date", from)
    if (to) query = query.lte("entry_date", to)

    const firstPage = await query
    if (firstPage.error) {
      logger.error("Panel rows load error:", firstPage.error)
      return NextResponse.json({ error: "Error al cargar los datos" }, { status: 500 })
    }
    let data = firstPage.data

    // Migración transparente desde panel_entries: primer GET sin filas
    // importa el array completo existente (solo sin filtros ni cursor).
    let migrated = false
    if ((data || []).length === 0 && offset === 0 && !from && !to) {
      migrated = await importFromPanelEntries(service, owner, tool, collection)
      if (migrated) {
        const requery = await service
          .from("panel_rows")
          .select("payload, client_id")
          .eq(col, val)
          .eq("tool", tool)
          .eq("collection_slug", collection)
          .order("created_at", { ascending: true })
          .range(0, limit)
        if (requery.error) {
          logger.error("Panel rows requery error:", requery.error)
          return NextResponse.json({ error: "Error al cargar los datos" }, { status: 500 })
        }
        data = requery.data
      } else {
        // Nada en panel_entries (o no era un array con contenido):
        // found=false para que el cliente suba su copia local si tiene.
        return NextResponse.json({ found: false, rows: [] })
      }
    }

    // El cliente usa payload.id como client_id para la diff; los
    // payloads migrados sin id (p. ej. movimientos) lo reciben aquí.
    const rows = (data || []).slice(0, limit).map((r) => {
      const { payload, client_id } = r as { payload: unknown; client_id: string }
      if (payload && typeof payload === "object" && !Array.isArray(payload) && !("id" in payload)) {
        return { ...(payload as Record<string, unknown>), id: client_id }
      }
      return payload
    })
    const hasMore = (data || []).length > limit
    return NextResponse.json({
      found: true,
      rows,
      ...(hasMore ? { nextCursor: String(offset + limit) } : {}),
      ...(migrated ? { migrated: true } : {}),
    })
  } catch (err) {
    logger.error("Panel rows GET error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

/** Importa el array de panel_entries a panel_rows. true si importó algo. */
async function importFromPanelEntries(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  owner: EffectiveOwner,
  tool: string,
  collection: string,
): Promise<boolean> {
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
    logger.error("Panel rows migration read error:", error)
    return false
  }
  const row = (data || [])[0] as { payload?: { value?: unknown } } | undefined
  const value = row?.payload && typeof row.payload === "object" ? row.payload.value : undefined
  if (!Array.isArray(value) || value.length === 0) return false

  const rows = value.slice(0, 10_000).map((entry, i) => {
    const e = entry as Record<string, unknown>
    const clientId = typeof e?.id === "string" && e.id ? e.id : `mig-${i}-${Math.random().toString(36).slice(2, 10)}`
    const rawDate = typeof e?.date === "string" ? e.date : typeof e?.fecha === "string" ? e.fecha : null
    const entryDate = rawDate && DATE_RE.test(rawDate.slice(0, 10)) ? rawDate.slice(0, 10) : null
    return {
      tool,
      collection_slug: collection,
      user_id: owner.userId,
      guest_token: owner.guestToken,
      client_id: clientId,
      entry_date: entryDate,
      payload: entry,
      updated_at: new Date().toISOString(),
    }
  })
  const { error: insertError } = await service.from("panel_rows").insert(rows)
  if (insertError) {
    logger.error("Panel rows migration insert error:", insertError)
    return false
  }
  return true
}

export async function POST(req: NextRequest) {
  try {
    const owner = await resolveEffectiveOwner(req)
    if (!owner) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { service, rate } = await checkRate(req, owner, 30)
    if (!rate.allowed) return rateLimitResponse(rate)

    const rawBody = await req.text()
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "El lote excede el tamaño máximo (256 KB)" }, { status: 413 })
    }
    const body = JSON.parse(rawBody) as { tool?: unknown; collection_slug?: string; rows?: unknown }
    if (!isValidTool(body.tool)) return NextResponse.json({ error: "tool inválido" }, { status: 400 })
    if (!canWriteRows(owner.role, body.tool)) {
      return NextResponse.json({ error: "Tu rol no puede modificar esta herramienta" }, { status: 403 })
    }
    const rows = parseRows(body.rows)
    if (!rows) return NextResponse.json({ error: "rows inválidas" }, { status: 400 })
    if (rows.length === 0) return NextResponse.json({ saved: true, count: 0 })

    const collection = body.collection_slug?.trim() || "default"
    const now = new Date().toISOString()
    const records = rows.map((r) => ({
      tool: body.tool as string,
      collection_slug: collection,
      user_id: owner.userId,
      guest_token: owner.guestToken,
      client_id: r.client_id,
      entry_date: r.entry_date,
      payload: r.data,
      updated_at: now,
    }))

    // Upsert por (dueño, tool, colección, client_id): hay dos índices
    // únicos parciales (user/guest), así que se elige el constraint según
    // el tipo de dueño para que ON CONFLICT lo cubra.
    const { error } = await service.from("panel_rows").upsert(records, {
      onConflict: owner.userId
        ? "user_id,tool,collection_slug,client_id"
        : "guest_token,tool,collection_slug,client_id",
    })
    if (error) {
      logger.error("Panel rows upsert error:", error)
      return NextResponse.json({ error: "Error al guardar los datos" }, { status: 500 })
    }
    return NextResponse.json({ saved: true, count: records.length })
  } catch (err) {
    logger.error("Panel rows POST error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const owner = await resolveEffectiveOwner(req)
    if (!owner) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { service, rate } = await checkRate(req, owner, 30)
    if (!rate.allowed) return rateLimitResponse(rate)

    const body = (await req.json()) as { tool?: unknown; collection_slug?: string; client_ids?: unknown }
    if (!isValidTool(body.tool)) return NextResponse.json({ error: "tool inválido" }, { status: 400 })
    if (!canWriteRows(owner.role, body.tool)) {
      return NextResponse.json({ error: "Tu rol no puede modificar esta herramienta" }, { status: 403 })
    }
    const collection = body.collection_slug?.trim() || "default"
    const [col, val] = ownerColumn(owner)

    let query = service
      .from("panel_rows")
      .delete()
      .eq(col, val)
      .eq("tool", body.tool)
      .eq("collection_slug", collection)

    if (body.client_ids !== undefined) {
      if (!Array.isArray(body.client_ids) || body.client_ids.length > MAX_BATCH_ROWS) {
        return NextResponse.json({ error: "client_ids inválidos" }, { status: 400 })
      }
      const ids = body.client_ids.filter(
        (x): x is string => typeof x === "string" && x.length >= 1 && x.length <= 80,
      )
      if (ids.length === 0) return NextResponse.json({ deleted: true, count: 0 })
      query = query.in("client_id", ids)
    }

    const { error } = await query
    if (error) {
      logger.error("Panel rows delete error:", error)
      return NextResponse.json({ error: "Error al borrar los datos" }, { status: 500 })
    }
    return NextResponse.json({ deleted: true })
  } catch (err) {
    logger.error("Panel rows DELETE error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
