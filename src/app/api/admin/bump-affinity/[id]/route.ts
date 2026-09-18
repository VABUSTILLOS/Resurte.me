import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { validateAffinityPairPatch } from "@/lib/admin-marketing-validation"

export const runtime = "nodejs"

/**
 * PATCH /api/admin/bump-affinity/[id] — actualiza peso, kind u on/off de un
 * par de afinidad.
 * DELETE /api/admin/bump-affinity/[id] — elimina el par.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user: adminUser, response: adminDenied } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  try {
    const { id } = await params
    const pairId = Number(id)
    if (!Number.isInteger(pairId) || pairId <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const parsed = validateAffinityPairPatch(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { error } = await supabase.from("bump_affinity").update(parsed.value).eq("id", pairId)
    if (error) throw error

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "affinity_pair_update",
      entity: "bump_affinity",
      entityId: pairId,
      detail: { ...parsed.value },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("[ADMIN-BUMP-AFFINITY] update error:", error)
    return NextResponse.json({ error: "Error al actualizar el par de afinidad" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user: adminUser, response: adminDenied } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  try {
    const { id } = await params
    const pairId = Number(id)
    if (!Number.isInteger(pairId) || pairId <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { error } = await supabase.from("bump_affinity").delete().eq("id", pairId)
    if (error) throw error

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "affinity_pair_delete",
      entity: "bump_affinity",
      entityId: pairId,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("[ADMIN-BUMP-AFFINITY] delete error:", error)
    return NextResponse.json({ error: "Error al eliminar el par de afinidad" }, { status: 500 })
  }
}
