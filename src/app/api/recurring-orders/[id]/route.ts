import { NextRequest, NextResponse } from "next/server"
import { readJsonBody } from "@/lib/api-body"
import { dayKeyOf, DEFAULT_TIMEZONE } from "@/lib/local-date"
import {
  computeInitialNextRun,
  type RecurringOrderRow,
} from "@/lib/recurring-orders"
import { isMissingRelationError } from "@/lib/sale-window"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

/**
 * PATCH /api/recurring-orders/[id] — el cliente pausa, reanuda
 * o cancela SU recurrencia (Ola 5, 00234). La propiedad se
 * fuerza en el predicado de la actualización (id + user_id de
 * la sesión): tocar la de otro cliente responde 404, igual que
 * si no existiera. Editar artículos o frecuencia es del panel;
 * aquí solo el estado. Al reanudar con la fecha vencida, la
 * próxima corrida se recalcula desde hoy.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para cambiar tu recurrencia" }, { status: 401 })
  }

  const { id } = await params
  const bodyResult = await readJsonBody<{ status?: unknown }>(request)
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status })
  }
  const status = bodyResult.data.status
  if (status !== "active" && status !== "paused" && status !== "cancelled") {
    return NextResponse.json(
      { error: "Estado inválido: usa active, paused o cancelled" },
      { status: 400 }
    )
  }

  const service = await createServiceClient()
  const { data: current, error: fetchError } = await service
    .from("recurring_orders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (fetchError) {
    if (isMissingRelationError(fetchError)) {
      return NextResponse.json(
        { error: "Los pedidos recurrentes aún no están disponibles" },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: "No se pudo leer tu recurrencia" }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: "Recurrencia no encontrada" }, { status: 404 })
  }
  const template = current as RecurringOrderRow

  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (status === "active" && template.status !== "active") {
    const todayKey = dayKeyOf(DEFAULT_TIMEZONE)
    if (template.next_run_on < todayKey) {
      update.next_run_on = computeInitialNextRun(template, todayKey)
    }
  }

  const { data, error } = await service
    .from("recurring_orders")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, status, next_run_on")
    .single()

  if (error) {
    return NextResponse.json({ error: "No se pudo guardar el cambio" }, { status: 500 })
  }
  return NextResponse.json({ template: data })
}
