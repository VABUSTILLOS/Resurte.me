import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { resolveEffectiveOwner, ownerColumn } from "@/lib/panel/owner"
import { canUseBackup } from "@/lib/panel-roles"

/**
 * Respaldo completo del panel (Fase 4.4 — ver plan y docs/OPS.md §7).
 *
 * GET /api/panel/backup
 *   → JSON descargable con TODAS las claves del dueño:
 *     { app, version: 2, exportedAt, entries: [...], rows: [...], dishes: [...] }
 * POST /api/panel/backup
 *   → importa un respaldo version 2 reemplazando los datos del dueño en las
 *     tres tablas (panel_entries, panel_rows, panel_dishes). Valida esquema
 *     antes de escribir: si algo no cuadra, no se toca nada.
 *
 * Identidad: sesión autenticada (cookie) o header `x-guest-token`, igual que
 * el resto de rutas /api/panel/*.
 */

const TOOL_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_BODY_BYTES = 8 * 1024 * 1024 // 8 MB: respaldo completo de un restaurante activo
const MAX_ENTRIES = 500
const MAX_ROWS = 50_000
const MAX_DISHES = 500
const MAX_ENTRY_BYTES = 256 * 1024 // mismo cap que /api/panel/entries

// ── Validación del esquema del respaldo ──────────────────────────────

interface EntryIn {
  tool: string
  collection_slug: string
  value: unknown
}

interface RowIn {
  tool: string
  collection_slug: string
  client_id: string
  entry_date: string | null
  data: unknown
}

interface DishIn {
  id: string
  name: string
  collection_slug: string
  ingredients: unknown
  foodCostPercent: number
  sellingPrice: number
  modificadores?: unknown
}

export interface BackupPayload {
  entries: EntryIn[]
  rows: RowIn[]
  dishes: DishIn[]
}

function isValidSlug(s: unknown): s is string {
  return typeof s === "string" && s.length >= 1 && s.length <= 60
}

/** Valida el cuerpo de un POST; null si no es un respaldo v2 válido. */
export function parseBackup(body: unknown): BackupPayload | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (b.app !== "resurte-me" || b.version !== 2) return null

  const entries: EntryIn[] = []
  if (b.entries != null) {
    if (!Array.isArray(b.entries) || b.entries.length > MAX_ENTRIES) return null
    for (const e of b.entries) {
      if (!e || typeof e !== "object") return null
      const { tool, collection_slug, value } = e as Record<string, unknown>
      if (typeof tool !== "string" || !TOOL_RE.test(tool)) return null
      if (!isValidSlug(collection_slug)) return null
      if (JSON.stringify({ value }).length > MAX_ENTRY_BYTES) return null
      entries.push({ tool, collection_slug, value })
    }
  }

  const rows: RowIn[] = []
  if (b.rows != null) {
    if (!Array.isArray(b.rows) || b.rows.length > MAX_ROWS) return null
    for (const r of b.rows) {
      if (!r || typeof r !== "object") return null
      const { tool, collection_slug, client_id, entry_date, data } = r as Record<string, unknown>
      if (typeof tool !== "string" || !TOOL_RE.test(tool)) return null
      if (!isValidSlug(collection_slug)) return null
      if (typeof client_id !== "string" || client_id.length < 1 || client_id.length > 80) return null
      if (entry_date != null && (typeof entry_date !== "string" || !DATE_RE.test(entry_date))) return null
      rows.push({ tool, collection_slug, client_id, entry_date: entry_date ?? null, data })
    }
  }

  const dishes: DishIn[] = []
  if (b.dishes != null) {
    if (!Array.isArray(b.dishes) || b.dishes.length > MAX_DISHES) return null
    for (const d of b.dishes) {
      if (!d || typeof d !== "object") return null
      const { id, name, collection_slug, ingredients, foodCostPercent, sellingPrice, modificadores } =
        d as Record<string, unknown>
      if (typeof id !== "string" || id.length < 1 || id.length > 80) return null
      if (typeof name !== "string") return null
      if (!isValidSlug(collection_slug)) return null
      if (typeof foodCostPercent !== "number" || typeof sellingPrice !== "number") return null
      dishes.push({
        id, name, collection_slug,
        ingredients: Array.isArray(ingredients) ? ingredients : [],
        foodCostPercent, sellingPrice,
        ...(modificadores ? { modificadores } : {}),
      })
    }
  }

  return { entries, rows, dishes }
}

// ── GET: exportar todo ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const owner = await resolveEffectiveOwner(req)
    if (!owner) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    if (!canUseBackup(owner.role)) {
      return NextResponse.json({ error: "Solo el dueño puede respaldar el panel" }, { status: 403 })
    }

    const service = await createServiceClient()
    const rate = await rateLimited(
      service,
      `panel-backup:${owner.userId ?? owner.guestToken ?? clientIp(req)}`,
      10,
      60,
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const [col, val] = ownerColumn(owner)

    const [entriesRes, rowsRes, dishesRes] = await Promise.all([
      service
        .from("panel_entries")
        .select("tool, collection_slug, payload")
        .eq(col, val),
      service
        .from("panel_rows")
        .select("tool, collection_slug, client_id, entry_date, payload")
        .eq(col, val)
        .order("created_at", { ascending: true }),
      service
        .from("panel_dishes")
        .select("client_id, name, ingredients, food_cost_percent, selling_price, modificadores, collection_slug")
        .eq(col, val),
    ])
    if (entriesRes.error || rowsRes.error || dishesRes.error) {
      logger.error("Panel backup export error:", entriesRes.error ?? rowsRes.error ?? dishesRes.error)
      return NextResponse.json({ error: "Error al exportar el respaldo" }, { status: 500 })
    }

    const entries = (entriesRes.data || []).map((e) => {
      const { tool, collection_slug, payload } = e as {
        tool: string; collection_slug: string; payload: { value?: unknown }
      }
      return { tool, collection_slug, value: payload?.value }
    })
    const rows = (rowsRes.data || []).map((r) => {
      const { tool, collection_slug, client_id, entry_date, payload } = r as {
        tool: string; collection_slug: string; client_id: string
        entry_date: string | null; payload: unknown
      }
      return { tool, collection_slug, client_id, entry_date, data: payload }
    })
    const dishes = (dishesRes.data || []).map((d) => {
      const { client_id, name, ingredients, food_cost_percent, selling_price, modificadores, collection_slug } =
        d as {
          client_id: string; name: string; ingredients: unknown
          food_cost_percent: number; selling_price: number
          modificadores: unknown; collection_slug: string
        }
      return {
        id: client_id, name, collection_slug,
        ingredients: ingredients ?? [],
        foodCostPercent: food_cost_percent,
        sellingPrice: selling_price,
        ...(modificadores ? { modificadores } : {}),
      }
    })

    const backup = {
      app: "resurte-me",
      version: 2,
      exportedAt: new Date().toISOString(),
      entries,
      rows,
      dishes,
    }

    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="resurte-panel-respaldo-${stamp}.json"`,
      },
    })
  } catch (err) {
    logger.error("Panel backup GET error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// ── POST: importar (replace-all por dueño en las 3 tablas) ───────────

export async function POST(req: NextRequest) {
  try {
    const owner = await resolveEffectiveOwner(req)
    if (!owner) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    if (!canUseBackup(owner.role)) {
      return NextResponse.json({ error: "Solo el dueño puede restaurar respaldos" }, { status: 403 })
    }

    const service = await createServiceClient()
    const rate = await rateLimited(
      service,
      `panel-backup:${owner.userId ?? owner.guestToken ?? clientIp(req)}`,
      5,
      60,
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "El respaldo excede el tamaño máximo (8 MB)" }, { status: 413 })
    }
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "El archivo no es JSON válido" }, { status: 400 })
    }

    const parsed = parseBackup(body)
    if (!parsed) {
      return NextResponse.json({ error: "El archivo no es un respaldo válido del panel" }, { status: 400 })
    }

    const [col, val] = ownerColumn(owner)
    const now = new Date().toISOString()

    // Replace-all: borra todo lo del dueño y reinserta desde el respaldo.
    for (const table of ["panel_entries", "panel_rows", "panel_dishes"] as const) {
      const { error } = await service.from(table).delete().eq(col, val)
      if (error) {
        logger.error(`Panel backup clear error (${table}):`, error)
        return NextResponse.json({ error: "Error al importar el respaldo" }, { status: 500 })
      }
    }

    if (parsed.entries.length > 0) {
      const { error } = await service.from("panel_entries").insert(
        parsed.entries.map((e) => ({
          tool: e.tool,
          collection_slug: e.collection_slug,
          user_id: owner.userId,
          guest_token: owner.guestToken,
          payload: { value: e.value },
          updated_at: now,
        })),
      )
      if (error) {
        logger.error("Panel backup entries insert error:", error)
        return NextResponse.json({ error: "Error al importar el respaldo" }, { status: 500 })
      }
    }

    if (parsed.rows.length > 0) {
      // Lotes de 500 para no exceder límites de statement.
      for (let i = 0; i < parsed.rows.length; i += 500) {
        const batch = parsed.rows.slice(i, i + 500).map((r) => ({
          tool: r.tool,
          collection_slug: r.collection_slug,
          client_id: r.client_id,
          entry_date: r.entry_date,
          user_id: owner.userId,
          guest_token: owner.guestToken,
          payload: r.data,
          updated_at: now,
        }))
        const { error } = await service.from("panel_rows").insert(batch)
        if (error) {
          logger.error("Panel backup rows insert error:", error)
          return NextResponse.json({ error: "Error al importar el respaldo" }, { status: 500 })
        }
      }
    }

    if (parsed.dishes.length > 0) {
      const { error } = await service.from("panel_dishes").insert(
        parsed.dishes.map((d) => ({
          client_id: d.id,
          collection_slug: d.collection_slug,
          name: d.name,
          ingredients: d.ingredients,
          food_cost_percent: d.foodCostPercent,
          selling_price: d.sellingPrice,
          modificadores: d.modificadores ?? null,
          user_id: owner.userId,
          guest_token: owner.guestToken,
          updated_at: now,
        })),
      )
      if (error) {
        logger.error("Panel backup dishes insert error:", error)
        return NextResponse.json({ error: "Error al importar el respaldo" }, { status: 500 })
      }
    }

    return NextResponse.json({
      imported: true,
      counts: {
        entries: parsed.entries.length,
        rows: parsed.rows.length,
        dishes: parsed.dishes.length,
      },
    })
  } catch (err) {
    logger.error("Panel backup POST error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
