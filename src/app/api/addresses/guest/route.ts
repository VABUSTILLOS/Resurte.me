import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { rateLimited, rateLimitResponse, clientIp } from "@/lib/rate-limit"
import { GUEST_ADDRESS_LIMIT, sanitizeGuestToken } from "@/lib/address-book"
import type { Address } from "@/types"

/**
 * Libro de direcciones del checkout anónimo (invitado sin sesión).
 *
 * Hasta ahora el invitado solo tenía UNA dirección copiada en localStorage
 * (`resurte_last_address`), así que no podía elegir entre las que el servidor
 * ya le tenía guardadas por `guest_token` ni borrar las que no usaba. El
 * listado y el borrado viven aquí, porque las direcciones anónimas no son
 * accesibles por RLS desde el navegador.
 *
 * GET    /api/addresses/guest?guest_token=UUID → { addresses: Address[] }
 * DELETE /api/addresses/guest { guest_token, address_id } → { deleted: true }
 *
 * Auth: ninguna (el `guest_token` del navegador es la credencial, igual que en
 * POST /api/orders). Solo se tocan filas con user_id NULL y ese token exacto.
 * Rate limit por token+IP para acotar la enumeración de tokens.
 */

/** Listado de las últimas direcciones del navegador, sin la papelera. */
async function listGuestAddresses(token: string): Promise<Address[]> {
  const supabase = await createServiceClient()

  // Esquema completo: la de último uso primero (lo que el checkout precarga).
  const preferred = await supabase
    .from("addresses")
    .select("*")
    .eq("guest_token", token)
    .is("user_id", null)
    .is("deleted_at", null)
    .order("last_used_at", { ascending: false })
    .limit(GUEST_ADDRESS_LIMIT)
  if (!preferred.error) return (preferred.data ?? []) as Address[]

  // Esquema previo a 00117: sin `last_used_at`, y posiblemente sin `deleted_at`.
  const legacy = await supabase
    .from("addresses")
    .select("*")
    .eq("guest_token", token)
    .is("user_id", null)
    .order("created_at", { ascending: false })
    .limit(GUEST_ADDRESS_LIMIT)
  if (legacy.error) {
    logger.error("Guest addresses list error:", legacy.error)
    return []
  }
  return ((legacy.data ?? []) as Address[]).filter((a) => !a.deleted_at)
}

export async function GET(request: NextRequest) {
  try {
    const token = sanitizeGuestToken(request.nextUrl.searchParams.get("guest_token"))
    if (!token) {
      return NextResponse.json({ addresses: [] })
    }

    const rl = await rateLimited(
      await createServiceClient(),
      `addr-guest-get:${token}:${clientIp(request)}`,
      20,
      60
    )
    if (!rl.allowed) return rateLimitResponse(rl)

    return NextResponse.json({ addresses: await listGuestAddresses(token) })
  } catch (err) {
    logger.error("Guest addresses GET error:", err)
    return NextResponse.json({ addresses: [] })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { guest_token?: string; address_id?: number }
    const token = sanitizeGuestToken(body.guest_token)
    const addressId = Number(body.address_id)
    if (!token || !Number.isInteger(addressId) || addressId <= 0) {
      return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const rl = await rateLimited(
      supabase,
      `addr-guest-del:${token}:${clientIp(request)}`,
      20,
      60
    )
    if (!rl.allowed) return rateLimitResponse(rl)

    // Borrado lógico: `orders.address_id` es ON DELETE SET NULL, así que un
    // DELETE físico dejaría los pedidos históricos sin dirección (el ticket y
    // el panel la imprimen). `deleted_at` la oculta de las listas y el cron de
    // limpieza (00117) la purga cuando ya no la referencia ningún pedido.
    const { data, error } = await supabase
      .from("addresses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", addressId)
      .eq("guest_token", token)
      .is("user_id", null)
      .is("deleted_at", null)
      .select("id")

    if (error) {
      logger.error("Guest address delete error:", error)
      return NextResponse.json(
        { error: "No se pudo eliminar la dirección", detail: error.message },
        { status: 500 }
      )
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Dirección no encontrada" }, { status: 404 })
    }

    return NextResponse.json({ deleted: true })
  } catch (err) {
    logger.error("Guest address DELETE error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
