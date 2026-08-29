import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { PanelRole } from "@/lib/panel-roles"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface EffectiveOwner {
  /** Columna de dueño a filtrar: user_id o guest_token. */
  userId: string | null
  guestToken: string | null
  /** Rol efectivo del operador sobre los datos del dueño. */
  role: PanelRole
  /** true cuando opera un miembro sobre los datos de su dueño. */
  viaMember: boolean
}

/**
 * Resuelve el dueño de los datos del panel y el rol del operador.
 *
 * - Sesión con membresía activa (panel_members.member_user_id) → opera
 *   sobre los datos del dueño con el rol asignado.
 * - Sesión sin membresía → sus propios datos, rol "dueno".
 * - Sin sesión → guest_token (header x-guest-token UUID), rol "dueno"
 *   (los guests no pueden ser miembros: la aceptación exige sesión).
 */
export async function resolveEffectiveOwner(req: NextRequest): Promise<EffectiveOwner | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const service = await createServiceClient()
    const { data: membership } = await service
      .from("panel_members")
      .select("owner_user_id, role")
      .eq("member_user_id", user.id)
      .eq("status", "activo")
      .limit(1)
    const m = Array.isArray(membership) ? membership[0] : membership
    if (m && typeof m.owner_user_id === "string") {
      const role = m.role === "cocina" || m.role === "mesero" || m.role === "gerente" ? m.role : "gerente"
      return { userId: m.owner_user_id, guestToken: null, role, viaMember: true }
    }
    return { userId: user.id, guestToken: null, role: "dueno", viaMember: false }
  }

  const token = (req.headers.get("x-guest-token") || "").trim()
  if (!UUID_RE.test(token)) return null
  return { userId: null, guestToken: token, role: "dueno", viaMember: false }
}

export function ownerColumn(owner: EffectiveOwner): [string, string] {
  if (owner.userId) return ["user_id", owner.userId]
  return ["guest_token", owner.guestToken ?? ""]
}
