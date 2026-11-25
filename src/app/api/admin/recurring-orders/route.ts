import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { logAdminAction } from "@/lib/audit-log"
import { dayKeyOf, DEFAULT_TIMEZONE } from "@/lib/local-date"
import { logger } from "@/lib/logger"
import {
  computeInitialNextRun,
  describeRecurringSchedule,
  validateRecurringTemplateInput,
  validateRecurringItems,
  type RecurringOrderRow,
} from "@/lib/recurring-orders"
import { isMissingRelationError } from "@/lib/sale-window"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

/**
 * Plantillas de pedidos recurrentes (Ola 5, migración 00234).
 *
 * GET  — todas las plantillas con el nombre del cliente y de
 *        cada producto, para la pantalla /admin/recurrentes.
 *        Sin la migración responde `available: false`.
 * POST — alta de una plantilla: valida cliente, dirección (si
 *        viene, debe ser de ese cliente) y el cuerpo con las
 *        reglas puras de src/lib/recurring-orders.ts; la primera
 *        fecha se calcula con el día local de la tienda.
 */

export async function GET() {
  const { response: adminDenied } = await requireAdmin({ permission: "clientes" })
  if (adminDenied) return adminDenied

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from("recurring_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({ available: false, templates: [] })
    }
    logger.error("[admin/recurring-orders] error listando plantillas", error)
    return NextResponse.json({ error: "No se pudieron leer las recurrencias" }, { status: 500 })
  }

  const rows = (data ?? []) as RecurringOrderRow[]
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const productIds = [
    ...new Set(rows.flatMap((r) => validateRecurringItems(r.items).map((i) => i.product_id))),
  ]

  const nameByUser = new Map<string, { name: string | null; phone: string | null }>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", userIds)
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; phone: string | null }>) {
      nameByUser.set(p.id, { name: p.full_name, phone: p.phone })
    }
  }
  const nameByProduct = new Map<number, string>()
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name")
      .in("id", productIds)
    for (const p of (products ?? []) as Array<{ id: number; name: string }>) {
      nameByProduct.set(p.id, p.name)
    }
  }

  return NextResponse.json({
    available: true,
    templates: rows.map((r) => ({
      ...r,
      items: validateRecurringItems(r.items).map((i) => ({
        ...i,
        product_name: nameByProduct.get(i.product_id) ?? null,
      })),
      customer_name: nameByUser.get(r.user_id)?.name ?? null,
      customer_phone: nameByUser.get(r.user_id)?.phone ?? null,
      schedule_text: describeRecurringSchedule(r),
    })),
  })
}

export async function POST(request: NextRequest) {
  const { user: admin, response: adminDenied } = await requireAdmin({ permission: "clientes" })
  if (adminDenied) return adminDenied

  const bodyResult = await readJsonBody<{
    user_id?: unknown
    address_id?: unknown
    name?: unknown
    items?: unknown
    frequency?: unknown
    weekday?: unknown
    day_of_month?: unknown
    payment_method?: unknown
  }>(request)
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status })
  }
  const body = bodyResult.data

  const userId = typeof body.user_id === "string" ? body.user_id : ""
  if (!userId) {
    return NextResponse.json({ error: "Falta el cliente (user_id)" }, { status: 400 })
  }

  const validated = validateRecurringTemplateInput(body)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle()
  if (!profile) {
    return NextResponse.json({ error: "El cliente no existe" }, { status: 400 })
  }

  let addressId: number | null = null
  if (body.address_id !== undefined && body.address_id !== null) {
    const parsed = Number(body.address_id)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "Dirección inválida" }, { status: 400 })
    }
    const { data: addr } = await supabase
      .from("addresses")
      .select("id")
      .eq("id", parsed)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle()
    if (!addr) {
      return NextResponse.json(
        { error: "La dirección no pertenece a ese cliente" },
        { status: 400 }
      )
    }
    addressId = parsed
  }

  const todayKey = dayKeyOf(DEFAULT_TIMEZONE)
  const { data, error } = await supabase
    .from("recurring_orders")
    .insert({
      user_id: userId,
      name: validated.value.name,
      items: validated.value.items,
      frequency: validated.value.frequency,
      weekday: validated.value.weekday,
      day_of_month: validated.value.day_of_month,
      address_id: addressId,
      payment_method: validated.value.payment_method,
      status: "active",
      next_run_on: computeInitialNextRun(validated.value, todayKey),
      created_by: admin?.id ?? null,
    })
    .select("*")
    .single()

  if (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json(
        { error: "La migración 00234 aún no se aplica: no hay recurrencias todavía" },
        { status: 409 }
      )
    }
    logger.error("[admin/recurring-orders] error creando la plantilla", error)
    return NextResponse.json({ error: "No se pudo crear la recurrencia" }, { status: 500 })
  }

  const row = data as RecurringOrderRow
  await logAdminAction(supabase, {
    actorId: admin?.id ?? null,
    actorEmail: admin?.email ?? null,
    action: "recurring_order_create",
    entity: "recurring_order",
    entityId: row.id,
    detail: {
      user_id: userId,
      frequency: row.frequency,
      schedule: describeRecurringSchedule(row),
      items: row.items,
      next_run_on: row.next_run_on,
    },
  })

  return NextResponse.json({ template: row }, { status: 201 })
}
