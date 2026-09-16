import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { mergeBumps, sanitizeStoredBumps } from "@/lib/bumps-sync"
import type { SelectedBump } from "@/components/checkout/BumpCards"

export const runtime = "nodejs"

/**
 * POST /api/cart/bumps/hydrate — reconcilia los bumps del dispositivo con los
 * del servidor y devuelve el ganador.
 *
 * Body: { bumps?: SelectedBump[], updatedAt?: number | null }
 *   - `bumps`/`updatedAt` describen el snapshot local (localStorage). Si no
 *     vienen, el servidor es la única fuente.
 *   - `updatedAt` es epoch ms del último cambio local; `null`/ausente significa
 *     snapshot legacy (sessionStorage) sin timestamp.
 *
 * Respuesta: { bumps, updated_at, source }
 *   - source "server": el servidor era más reciente (o el local no existía).
 *   - source "local": el local era más reciente y se subió al servidor.
 *   - source "none": ambos vacíos.
 *
 * El merge (last-write-wins) vive en `mergeBumps` y es el mismo que usa el
 * cliente en memoria, para que ambos lados no diverjan.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)

    let localBumps: SelectedBump[] = []
    if (body?.bumps !== undefined) {
      const parsed = sanitizeStoredBumps(body.bumps)
      if (!parsed) {
        return NextResponse.json({ error: "bumps local inválido" }, { status: 400 })
      }
      localBumps = parsed
    }
    const updatedAt = typeof body?.updatedAt === "number" && Number.isFinite(body.updatedAt)
      ? body.updatedAt
      : null

    const { data, error } = await supabase
      .from("user_carts")
      .select("bumps, bumps_updated_at")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      logger.error("[CART_BUMPS] hydrate read error:", error)
      return NextResponse.json({ error: "No se pudieron cargar los artículos especiales" }, { status: 500 })
    }

    const serverBumps = sanitizeStoredBumps(data?.bumps ?? []) ?? []
    const decision = mergeBumps(
      { bumps: localBumps, updatedAt },
      { bumps: serverBumps, updated_at: data?.bumps_updated_at ?? null }
    )

    if (decision.action === "use-server") {
      return NextResponse.json(
        { bumps: decision.bumps, updated_at: data?.bumps_updated_at ?? null, source: "server" },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    if (decision.action === "upload-local") {
      const now = new Date().toISOString()
      const { error: upsertError } = await supabase
        .from("user_carts")
        .upsert({ user_id: user.id, bumps: localBumps, bumps_updated_at: now }, { onConflict: "user_id" })

      if (upsertError) {
        // No es fatal: el usuario sigue con su selección local aunque no se
        // haya podido sincronizar. Se reporta para no bloquear el checkout.
        logger.error("[CART_BUMPS] hydrate upsert error:", upsertError)
        return NextResponse.json(
          { bumps: localBumps, updated_at: null, source: "local" },
          { headers: { "Cache-Control": "no-store" } }
        )
      }

      return NextResponse.json(
        { bumps: localBumps, updated_at: now, source: "local" },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    return NextResponse.json(
      { bumps: [], updated_at: data?.bumps_updated_at ?? null, source: "none" },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[CART_BUMPS] hydrate unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
