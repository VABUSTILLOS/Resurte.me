import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { MEMBER_ROLES, type MemberRole } from "@/lib/panel-roles"

/**
 * Administración del personal del panel (Fase 4.6, migración 00058).
 *
 * GET /api/panel/members
 *   → { members: PanelMember[] } — lista del dueño autenticado.
 * GET /api/panel/members?mine=1
 *   → { role: PanelRole, viaMember } — rol efectivo del usuario actual
 *     ("dueno" si no es miembro de nadie). Lo usa la UI para filtrar
 *     herramientas; no requiere ser dueño.
 * POST /api/panel/members { email, role }
 *   → invita (o re-invita) a un miembro. Devuelve el invite_token para
 *     compartir el enlace /panel/unirse?token=….
 * PATCH /api/panel/members { id, role }   → cambia el rol de un miembro.
 * DELETE /api/panel/members { id }        → revoca el acceso.
 *
 * Solo el dueño (sesión autenticada, sin membresía activa sobre los
 * datos de otro) administra; los miembros no invitan a otros.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isMemberRole(r: unknown): r is MemberRole {
  return typeof r === "string" && (MEMBER_ROLES as string[]).includes(r)
}

/**
 * Usuario autenticado actuando como dueño. Si el usuario es miembro
 * activo de otro panel, no puede administrar personal (403).
 */
async function requireOwnerUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, memberOfOther: false }

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("panel_members")
    .select("id")
    .eq("member_user_id", user.id)
    .eq("status", "activo")
    .limit(1)
  const memberOfOther = Array.isArray(membership) ? membership.length > 0 : !!membership
  return { user, memberOfOther }
}

async function checkRate(req: NextRequest, key: string, limit: number) {
  const service = await createServiceClient()
  const rate = await rateLimited(service, `panel-members:${key}`, limit, 60)
  return { service, rate }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const service = await createServiceClient()

    // ?mine=1: rol efectivo del usuario actual (para la UI).
    if (req.nextUrl.searchParams.get("mine") === "1") {
      const { data: membership } = await service
        .from("panel_members")
        .select("owner_user_id, role")
        .eq("member_user_id", user.id)
        .eq("status", "activo")
        .limit(1)
      const m = Array.isArray(membership) ? membership[0] : membership
      if (m && typeof m.owner_user_id === "string") {
        return NextResponse.json({ role: m.role, viaMember: true, owner_user_id: m.owner_user_id })
      }
      return NextResponse.json({ role: "dueno", viaMember: false })
    }

    const { rate } = await checkRate(req, user.id, 30)
    if (!rate.allowed) return rateLimitResponse(rate)

    const { data, error } = await service
      .from("panel_members")
      .select("id, member_email, role, status, invite_token, created_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true })
    if (error) {
      logger.error("Panel members list error:", error)
      return NextResponse.json({ error: "Error al cargar el personal" }, { status: 500 })
    }
    return NextResponse.json({ members: data || [] })
  } catch (err) {
    logger.error("Panel members GET error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, memberOfOther } = await requireOwnerUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    if (memberOfOther) {
      return NextResponse.json({ error: "Los miembros no pueden invitar personal" }, { status: 403 })
    }

    const { service, rate } = await checkRate(req, user.id ?? clientIp(req), 10)
    if (!rate.allowed) return rateLimitResponse(rate)

    const body = (await req.json()) as { email?: unknown; role?: unknown }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!EMAIL_RE.test(email) || email.length > 120) {
      return NextResponse.json({ error: "Correo inválido" }, { status: 400 })
    }
    if (!isMemberRole(body.role)) {
      return NextResponse.json({ error: "Rol inválido (gerente, cocina o mesero)" }, { status: 400 })
    }
    if (user.email && email === user.email.toLowerCase()) {
      return NextResponse.json({ error: "No puedes invitarte a ti mismo" }, { status: 400 })
    }

    // Re-invitación por (dueño, email): regenera token y vuelve a pendiente.
    const now = new Date().toISOString()
    const { data: existing } = await service
      .from("panel_members")
      .select("id, status")
      .eq("owner_user_id", user.id)
      .ilike("member_email", email)
      .limit(1)
    const prev = Array.isArray(existing) ? existing[0] : existing

    if (prev && typeof prev.id === "string") {
      const { data, error } = await service
        .from("panel_members")
        .update({ role: body.role, invite_token: crypto.randomUUID(), status: "pendiente", updated_at: now })
        .eq("id", prev.id)
        .select("id, member_email, role, status, invite_token, created_at")
      if (error) {
        logger.error("Panel members re-invite error:", error)
        return NextResponse.json({ error: "Error al invitar" }, { status: 500 })
      }
      return NextResponse.json({ member: (Array.isArray(data) ? data[0] : data) ?? null })
    }

    const { data, error } = await service
      .from("panel_members")
      .insert({
        owner_user_id: user.id,
        member_email: email,
        role: body.role,
        updated_at: now,
      })
      .select("id, member_email, role, status, invite_token, created_at")
    if (error) {
      logger.error("Panel members invite error:", error)
      return NextResponse.json({ error: "Error al invitar" }, { status: 500 })
    }
    return NextResponse.json({ member: (Array.isArray(data) ? data[0] : data) ?? null }, { status: 201 })
  } catch (err) {
    logger.error("Panel members POST error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, memberOfOther } = await requireOwnerUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    if (memberOfOther) {
      return NextResponse.json({ error: "Los miembros no pueden administrar personal" }, { status: 403 })
    }

    const { service, rate } = await checkRate(req, user.id ?? clientIp(req), 10)
    if (!rate.allowed) return rateLimitResponse(rate)

    const body = (await req.json()) as { id?: unknown; role?: unknown }
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }
    if (!isMemberRole(body.role)) {
      return NextResponse.json({ error: "Rol inválido (gerente, cocina o mesero)" }, { status: 400 })
    }

    const { error } = await service
      .from("panel_members")
      .update({ role: body.role, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("owner_user_id", user.id)
    if (error) {
      logger.error("Panel members update error:", error)
      return NextResponse.json({ error: "Error al actualizar el rol" }, { status: 500 })
    }
    return NextResponse.json({ updated: true })
  } catch (err) {
    logger.error("Panel members PATCH error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, memberOfOther } = await requireOwnerUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    if (memberOfOther) {
      return NextResponse.json({ error: "Los miembros no pueden administrar personal" }, { status: 403 })
    }

    const { service, rate } = await checkRate(req, user.id ?? clientIp(req), 10)
    if (!rate.allowed) return rateLimitResponse(rate)

    const body = (await req.json()) as { id?: unknown }
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const { error } = await service
      .from("panel_members")
      .delete()
      .eq("id", body.id)
      .eq("owner_user_id", user.id)
    if (error) {
      logger.error("Panel members delete error:", error)
      return NextResponse.json({ error: "Error al revocar el acceso" }, { status: 500 })
    }
    return NextResponse.json({ deleted: true })
  } catch (err) {
    logger.error("Panel members DELETE error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
