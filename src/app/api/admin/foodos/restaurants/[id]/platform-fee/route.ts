import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { parsePlatformFeePercent } from "@/lib/stripe-connect"

export const runtime = "nodejs"

/**
 * PATCH /api/admin/foodos/restaurants/[id]/platform-fee — fija la comisión de
 * la plataforma para un restaurante.
 *
 * `foodos_restaurants.platform_fee_percent` existía desde 00157 y se **leía**
 * en cuatro lugares (el estado de Connect, el saldo, el cobro y el reporte de
 * dispersiones), pero **ninguna ruta la escribía**: cambiar lo que la
 * plataforma cobra exigía abrir el SQL editor. Esta ruta cierra ese hueco.
 *
 * Decisiones que conviene no deshacer sin pensarlo:
 *
 *  1. **El valor por defecto sigue siendo 0.** Esta ruta no decide la
 *     política de precios, sólo la hace aplicable. Nada cambia en el dinero
 *     de nadie hasta que un admin escriba un número.
 *
 *  2. **Aplica a pedidos futuros, no reescribe los pasados.** El porcentaje
 *     se lee al construir el cargo (`buildDestinationChargeParams`), así que
 *     la comisión ya retenida en un pedido anterior queda como está. Es lo
 *     correcto: recalcular hacia atrás movería dinero entre cuentas por un
 *     cambio de tarifa.
 *
 *  3. **La comisión se puede fijar con Connect apagado.** Guardarla antes de
 *     encender Connect deja el precio listo y probado; el cobro de la
 *     comisión sólo empieza cuando los cargos se enrutan de verdad.
 *
 *  4. **Sólo PATCH.** Es una configuración de un valor único; un POST
 *     invitaría a crear duplicados y un PUT obligaría a mandar el objeto
 *     entero, del que aquí sólo se conoce un campo.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response } = await requireAdmin({ permission: "comisiones" })
    if (response) return response

    const { id } = await params
    if (!id || id.length > 64) {
      return NextResponse.json({ error: "Restaurante inválido" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
    }

    const parsed = parsePlatformFeePercent(body.platform_fee_percent)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: previous, error: readError } = await supabase
      .from("foodos_restaurants")
      .select("id, name, platform_fee_percent")
      .eq("id", id)
      .maybeSingle()

    if (readError) {
      logger.error("admin.platform_fee.read_failed", { restaurantId: id, error: readError.message })
      return NextResponse.json({ error: "No se pudo leer el restaurante" }, { status: 500 })
    }
    if (!previous) {
      return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 })
    }

    const previousPercent = Number(previous.platform_fee_percent ?? 0)

    const { error: writeError } = await supabase
      .from("foodos_restaurants")
      .update({ platform_fee_percent: parsed.value })
      .eq("id", id)

    if (writeError) {
      logger.error("admin.platform_fee.write_failed", {
        restaurantId: id,
        error: writeError.message,
      })
      return NextResponse.json({ error: "No se pudo guardar la comisión" }, { status: 500 })
    }

    await logAdminAction(supabase, {
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: "foodos_platform_fee_update",
      entity: "foodos_restaurants",
      entityId: id,
      detail: {
        name: previous.name ?? null,
        previous_percent: previousPercent,
        platform_fee_percent: parsed.value,
      },
    })

    logger.info("admin.platform_fee.updated", {
      restaurantId: id,
      previousPercent,
      platformFeePercent: parsed.value,
    })

    return NextResponse.json({
      ok: true,
      restaurant_id: id,
      platform_fee_percent: parsed.value,
      previous_percent: previousPercent,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido"
    logger.error("admin.platform_fee.failed", { error: message })
    return NextResponse.json({ error: "No se pudo guardar la comisión" }, { status: 500 })
  }
}
