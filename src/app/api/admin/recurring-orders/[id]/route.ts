import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { logAdminAction } from "@/lib/audit-log"
import { dayKeyOf, DEFAULT_TIMEZONE } from "@/lib/local-date"
import { logger } from "@/lib/logger"
import {
  computeInitialNextRun,
  validateRecurringTemplateInput,
  type RecurringOrderRow,
  type RecurringStatus,
} from "@/lib/recurring-orders"
import { isMissingRelationError } from "@/lib/sale-window"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

/**
 * PATCH /api/admin/recurring-orders/[id] (Ola 5, 00234).
 *
 * Edita una plantilla: estado (pausar / reanudar / cancelar),
 * artículos, frecuencia, método habitual, nombre y dirección.
 * Los campos de programación se validan fusionados con los
 * actuales (las reglas puras exigen el conjunto completo). Al
 * reanudar con la fecha ya vencida, la próxima corrida se
 * recalcula desde hoy: no se genera una ráfaga de atrasados.
 */

const STATUSES: RecurringStatus[] = ["active", "paused", "cancelled"]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: admin, response: adminDenied } = await requireAdmin({ permission: "clientes" })
  if (adminDenied) return adminDenied

  const { id } = await params
  const bodyResult = await readJsonBody<{
    status?: unknown
    name?: unknown
    items?: unknown
    frequency?: unknown
    weekday?: unknown
    day_of_month?: unknown
    payment_method?: unknown
    address_id?: unknown
  }>(request)
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status })
  }
  const body = bodyResult.data

  const supabase = await createServiceClient()
  const { data: current, error: fetchError } = await supabase
    .from("recurring_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (fetchError) {
    if (isMissingRelationError(fetchError)) {
      return NextResponse.json(
        { error: "La migración 00234 aún no se aplica: no hay recurrencias todavía" },
        { status: 409 }
      )
    }
    logger.error("[admin/recurring-orders] error leyendo la plantilla", fetchError)
    return NextResponse.json({ error: "No se pudo leer la recurrencia" }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: "Recurrencia no encontrada" }, { status: 404 })
  }
  const template = current as RecurringOrderRow

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const changes: Record<string, unknown> = {}

  // ── Estado ────────────────────────────────────────────────
  let nextStatus = template.status
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as RecurringStatus)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
    }
    nextStatus = body.status as RecurringStatus
    if (nextStatus !== template.status) {
      update.status = nextStatus
      changes.status = { from: template.status, to: nextStatus }
    }
  }

  // ── Programación / artículos / método (fusionados) ────────
  const touchesSchedule =
    body.items !== undefined ||
    body.frequency !== undefined ||
    body.weekday !== undefined ||
    body.day_of_month !== undefined ||
    body.payment_method !== undefined ||
    body.name !== undefined
  let schedule = {
    frequency: template.frequency,
    weekday: template.weekday,
    day_of_month: template.day_of_month,
  }
  if (touchesSchedule) {
    const validated = validateRecurringTemplateInput({
      name: body.name !== undefined ? body.name : template.name,
      items: body.items !== undefined ? body.items : template.items,
      frequency: body.frequency !== undefined ? body.frequency : template.frequency,
      weekday: body.weekday !== undefined ? body.weekday : template.weekday,
      day_of_month:
        body.day_of_month !== undefined ? body.day_of_month : template.day_of_month,
      payment_method:
        body.payment_method !== undefined ? body.payment_method : template.payment_method,
    })
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    schedule = {
      frequency: validated.value.frequency,
      weekday: validated.value.weekday,
      day_of_month: validated.value.day_of_month,
    }
    update.name = validated.value.name
    update.items = validated.value.items
    update.frequency = validated.value.frequency
    update.weekday = validated.value.weekday
    update.day_of_month = validated.value.day_of_month
    update.payment_method = validated.value.payment_method
    changes.schedule = schedule
    changes.items_count = validated.value.items.length
  }

  // ── Dirección ─────────────────────────────────────────────
  if (body.address_id !== undefined) {
    if (body.address_id === null) {
      update.address_id = null
      changes.address_id = null
    } else {
      const parsed = Number(body.address_id)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json({ error: "Dirección inválida" }, { status: 400 })
      }
      const { data: addr } = await supabase
        .from("addresses")
        .select("id")
        .eq("id", parsed)
        .eq("user_id", template.user_id)
        .is("deleted_at", null)
        .maybeSingle()
      if (!addr) {
        return NextResponse.json(
          { error: "La dirección no pertenece a ese cliente" },
          { status: 400 }
        )
      }
      update.address_id = parsed
      changes.address_id = parsed
    }
  }

  // ── Reanudar (o reprogramar una activa) con fecha vencida ──
  const todayKey = dayKeyOf(DEFAULT_TIMEZONE)
  const becomesActive = nextStatus === "active" && template.status !== "active"
  if ((becomesActive || (touchesSchedule && nextStatus === "active")) && template.next_run_on < todayKey) {
    update.next_run_on = computeInitialNextRun(schedule, todayKey)
    changes.next_run_on = update.next_run_on
  } else if (touchesSchedule && nextStatus === "active") {
    // Reprogramada y activa con fecha futura: la fecha se
    // recalcula para que el nuevo día elegido mande.
    update.next_run_on = computeInitialNextRun(schedule, todayKey)
    changes.next_run_on = update.next_run_on
  }

  const { data, error } = await supabase
    .from("recurring_orders")
    .update(update)
    .eq("id", id)
    .select("*")
    .single()

  if (error) {
    logger.error("[admin/recurring-orders] error editando la plantilla", error)
    return NextResponse.json({ error: "No se pudo guardar la recurrencia" }, { status: 500 })
  }

  await logAdminAction(supabase, {
    actorId: admin?.id ?? null,
    actorEmail: admin?.email ?? null,
    action: "recurring_order_update",
    entity: "recurring_order",
    entityId: id,
    detail: changes,
  })

  return NextResponse.json({ template: data as RecurringOrderRow })
}
