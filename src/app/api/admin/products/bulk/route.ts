/**
 * POST /api/admin/products/bulk
 *
 * Aplica cambios a muchos productos en una sola petición. Existe porque el
 * panel hacía fan-out de N `PATCH /update` (uno por producto seleccionado): N
 * round-trips, N entradas de bitácora y fallos parciales imposibles de
 * atribuir. Aquí el servidor agrupa por parche idéntico, escribe por trozos y
 * devuelve exactamente qué ids cambiaron y cuáles fallaron.
 *
 * Admite dos formas de entrada, mutuamente excluyentes:
 *
 *   { ids, patch:   { is_visible: false } }          // mismo valor para todos
 *   { ids, patches: { "12": { price: 30 }, ... } }   // un valor por producto
 *
 * La segunda cubre los ajustes calculados por producto (subir precios un %,
 * añadir una etiqueta a las que ya tiene cada uno) sin volver al fan-out:
 * siguen siendo **una** petición.
 *
 * B19 — concurrencia optimista: `expected: { "12": "<updated_at>" }` es
 * opcional. Los ids cuya versión ya cambió **no se escriben** y vuelven en
 * `failed` (más `stale`, para que el panel pueda explicarlo sin parsear
 * textos); `force: true` ignora las precondiciones a conciencia.
 *
 * No hay transacción distribuida (PostgREST no la ofrece): el contrato es
 * "mejor esfuerzo con reporte preciso", no atomicidad.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import {
  BULK_CHUNK,
  chunkList,
  groupByPatch,
  normalizeBulkIds,
  rejectedBulkFields,
  type BulkFailure,
} from "@/lib/product-bulk"
import { validateProductPatch, type ProductPatch } from "@/lib/product-patch"
import { parseExpectedMap, staleIds, STALE_WRITE_REASON } from "@/lib/product-conflict"
import { deriveStockStatus } from "@/lib/stock"
import { isMissingColumnError } from "@/lib/sale-window"
import { NextResponse } from "next/server"

type ValidatedPatch = { ok: true; updates: ProductPatch } | { ok: false; error: string }

/** Valida un parche con la **misma** función que el endpoint de un producto,
 *  así que las reglas por campo no pueden divergir entre ambos. */
function validateOne(raw: Record<string, unknown>, context: string): ValidatedPatch {
  const rejected = rejectedBulkFields(raw)
  if (rejected.length > 0) {
    return { ok: false, error: `${context}: campos no permitidos en lote: ${rejected.join(", ")}` }
  }
  const parsed = validateProductPatch(raw, { productId: 0 })
  if (!parsed.ok) return { ok: false, error: `${context}: ${parsed.error}` }
  if (Object.keys(parsed.updates).length === 0) {
    return { ok: false, error: `${context}: no hay campos válidos para actualizar` }
  }
  return { ok: true, updates: parsed.updates }
}

/** Un parche por id, o el motivo del rechazo. */
function parsePatches(
  body: { patch?: unknown; patches?: unknown },
  ids: number[]
): { ok: true; patchById: Map<number, ProductPatch> } | { ok: false; error: string } {
  const hasPatch = body.patch !== undefined
  const hasPatches = body.patches !== undefined
  if (hasPatch && hasPatches) return { ok: false, error: "usa patch o patches, no ambos" }
  if (!hasPatch && !hasPatches) return { ok: false, error: "se requiere patch o patches" }

  if (hasPatch) {
    if (typeof body.patch !== "object" || body.patch === null || Array.isArray(body.patch)) {
      return { ok: false, error: "patch debe ser un objeto" }
    }
    const validated = validateOne(body.patch as Record<string, unknown>, "patch")
    if (!validated.ok) return validated
    // Copia por id: cada parche se muta luego al derivar `stock_status`.
    return { ok: true, patchById: new Map(ids.map((id) => [id, { ...validated.updates }])) }
  }

  if (typeof body.patches !== "object" || body.patches === null || Array.isArray(body.patches)) {
    return { ok: false, error: "patches debe ser un objeto { id: parche }" }
  }
  const patchById = new Map<number, ProductPatch>()
  const known = new Set(ids)
  for (const [key, value] of Object.entries(body.patches as Record<string, unknown>)) {
    const id = Number(key)
    if (!Number.isInteger(id) || !known.has(id)) {
      return { ok: false, error: `patches contiene el id desconocido ${key}` }
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ok: false, error: `patches[${key}] debe ser un objeto` }
    }
    const validated = validateOne(value as Record<string, unknown>, `patches[${key}]`)
    if (!validated.ok) return validated
    patchById.set(id, validated.updates)
  }
  // Un id sin parche sería un cambio silenciosamente ignorado: mejor rechazarlo.
  for (const id of ids) {
    if (!patchById.has(id)) return { ok: false, error: `patches no incluye el id ${id}` }
  }
  return { ok: true, patchById }
}

/** El parche si es idéntico para todos los ids, o null si varía. */
function uniformPatchOf(patchById: Map<number, ProductPatch>): ProductPatch | null {
  let first: string | null = null
  let patch: ProductPatch | null = null
  for (const value of patchById.values()) {
    const key = JSON.stringify(value)
    if (first === null) {
      first = key
      patch = value
    } else if (key !== first) {
      return null
    }
  }
  return patch
}

export async function POST(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) return adminDenied

    const bodyResult = await readJsonBody<{
      ids?: unknown
      patch?: unknown
      patches?: unknown
      expected?: unknown
      force?: unknown
    }>(request)
    if (!bodyResult.ok)
      return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status })

    const body = bodyResult.data

    const idsResult = normalizeBulkIds(body.ids)
    if (!idsResult.ok) {
      return NextResponse.json({ error: idsResult.error }, { status: 400 })
    }
    const ids = idsResult.ids

    const parsed = parsePatches(body, ids)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const patchById = parsed.patchById

    const supabase = await createServiceClient()

    // B19 — precondiciones de versión. Los ids cuya fila ya cambió se sacan del
    // lote antes de escribir: en vez de pisar el cambio ajeno en silencio se
    // reportan por id (mismo resumen de fallos parciales de B4). `force: true`
    // ignora las precondiciones a conciencia.
    const batch = new Set(ids)
    const expected =
      body.force === true
        ? new Map<number, string>()
        : new Map([...parseExpectedMap(body.expected)].filter(([id]) => batch.has(id)))
    const stale: number[] = []
    if (expected.size > 0) {
      const currentRows: Array<{ id: number; updated_at: string | null }> = []
      for (const idsChunk of chunkList([...expected.keys()], BULK_CHUNK)) {
        // Si el esquema aún no expone `updated_at` la lectura falla: sin filas
        // no hay conflicto que detectar y el lote sigue su curso normal.
        const read = await supabase.from("products").select("id, updated_at").in("id", idsChunk)
        if (read.error) continue
        for (const row of (read.data ?? []) as Array<Record<string, unknown>>) {
          currentRows.push({
            id: row.id as number,
            updated_at: (row.updated_at as string | null) ?? null,
          })
        }
      }
      stale.push(...staleIds(expected, currentRows))
      for (const id of stale) patchById.delete(id)
    }

    // `stock_quantity` obliga a derivar `stock_status` con el umbral **de cada**
    // producto (misma regla que create/update), así que hay que leerlos antes
    // de escribir.
    const needsThresholds = [...patchById.values()].some((p) => "stock_quantity" in p)
    const thresholds = new Map<number, number | null>()
    if (needsThresholds) {
      for (const idsChunk of chunkList(ids, BULK_CHUNK)) {
        let read = await supabase
          .from("products")
          .select("id, low_stock_threshold")
          .in("id", idsChunk)
        if (read.error && isMissingColumnError(read.error)) {
          // Migración 00108 pendiente: se deriva con el umbral por defecto.
          read = (await supabase
            .from("products")
            .select("id")
            .in("id", idsChunk)) as unknown as typeof read
        }
        for (const row of (read.data ?? []) as Array<Record<string, unknown>>) {
          thresholds.set(row.id as number, (row.low_stock_threshold as number | null) ?? null)
        }
      }
    }

    for (const [id, patch] of patchById) {
      if (!("stock_quantity" in patch)) continue
      // La tienda lee `stock_status`: con cantidad conocida siempre se deriva
      // contra el umbral del producto; el status manual solo aplica cuando la
      // cantidad se deja vacía y no se pidió un status explícito.
      const quantity = patch.stock_quantity as number | null
      if (quantity !== null || !("stock_status" in patch)) {
        patch.stock_status = deriveStockStatus(quantity, thresholds.get(id) ?? null)
      }
    }

    const updated: number[] = []
    const failed: BulkFailure[] = []
    for (const id of stale) failed.push({ id, reason: STALE_WRITE_REASON })

    for (const { patch, ids: groupIds } of groupByPatch(ids, patchById).values()) {
      for (const idsChunk of chunkList(groupIds, BULK_CHUNK)) {
        let res = await supabase.from("products").update(patch).in("id", idsChunk).select("id")
        if (res.error && isMissingColumnError(res.error) && "low_stock_threshold" in patch) {
          // Migración 00108 pendiente: PostgREST rechaza el UPDATE entero por
          // una sola columna inexistente (mismo patrón que update/route.ts).
          const { low_stock_threshold: _omit, ...rest } = patch
          res = await supabase.from("products").update(rest).in("id", idsChunk).select("id")
        }
        if (res.error) {
          for (const id of idsChunk) failed.push({ id, reason: res.error.message })
          continue
        }
        const touched = new Set(
          ((res.data ?? []) as Array<Record<string, unknown>>).map((row) => row.id as number)
        )
        for (const id of idsChunk) {
          if (touched.has(id)) updated.push(id)
          else failed.push({ id, reason: "El producto no existe" })
        }
      }
    }

    if (updated.length > 0) {
      // Los cambios deben verse en la tienda sin esperar el TTL de la caché.
      revalidateCatalogCache()
      resetCatalogCache()
    }

    // Una sola entrada de bitácora por operación de lote: N filas idénticas no
    // aportarían nada y dificultarían leer la bitácora. Con parches por
    // producto se guarda un resumen (cuántos distintos y qué campos) en lugar
    // de N payloads, para no inflar la tabla.
    const uniformPatch = uniformPatchOf(patchById)
    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_bulk_update",
      entity: "products",
      detail: {
        ids,
        count: updated.length,
        failed,
        ...(stale.length > 0 ? { stale } : {}),
        ...(uniformPatch
          ? { patch: uniformPatch }
          : {
              patchCount: new Set([...patchById.values()].map((p) => JSON.stringify(p))).size,
              fields: [...new Set([...patchById.values()].flatMap((p) => Object.keys(p)))].sort(),
            }),
      },
    })

    if (updated.length > 0) {
      // WA5 — un solo encolado incremental del catálogo WhatsApp.
      const { enqueueProductsForWaSync } = await import("@/lib/whatsapp-sync-queue")
      await enqueueProductsForWaSync(supabase, updated, "product_bulk_update")
    }

    return NextResponse.json({ updated, failed, stale })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
