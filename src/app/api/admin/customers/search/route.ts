import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

/**
 * Buscador de clientes para el panel (Ola 5).
 *
 * GET ?q=<texto> — perfiles por nombre o teléfono (máx. 20), lo
 *   que la pantalla de recurrentes/precios necesita para elegir
 *   al cliente sin teclear UUIDs.
 * GET ?user_id=<uuid> — las direcciones vigentes de ESE cliente,
 *   para ligar la plantilla a una dirección guardada (opcional).
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin({ permission: "clientes" })
  if (adminDenied) return adminDenied

  const supabase = await createServiceClient()
  const userId = request.nextUrl.searchParams.get("user_id")

  if (userId) {
    const { data, error } = await supabase
      .from("addresses")
      .select("id, label, street, number, neighborhood, city_id, is_default")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .limit(20)
    if (error) {
      return NextResponse.json({ error: "No se pudieron leer las direcciones" }, { status: 500 })
    }
    return NextResponse.json({ addresses: data ?? [] })
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 2) {
    return NextResponse.json({ customers: [] })
  }
  // ilike con comodines escapados: el texto del staff no debe
  // convertirse en patrón.
  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .or(`full_name.ilike.${pattern},phone.ilike.${pattern}`)
    .order("full_name", { ascending: true })
    .limit(20)
  if (error) {
    return NextResponse.json({ error: "No se pudieron buscar clientes" }, { status: 500 })
  }
  return NextResponse.json({ customers: data ?? [] })
}
