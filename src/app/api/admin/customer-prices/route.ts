import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { logAdminAction } from "@/lib/audit-log"
import {
  getCustomerPrice,
  listCustomerPrices,
  validateCustomerPriceInput,
} from "@/lib/customer-prices"
import { logger } from "@/lib/logger"
import { isMissingRelationError } from "@/lib/sale-window"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

/**
 * Precios especiales por cliente (Ola 5, migración 00234).
 *
 * GET    ?user_id= — la lista del cliente con nombre y precio
 *        público de cada producto. Sin la migración:
 *        `available: false`.
 * POST   { user_id, product_id, price } — asigna o actualiza.
 *        Valida contra `products.cost` cuando el costo existe:
 *        un especial por debajo del costo se rechaza aquí, en
 *        el alta, no en el checkout.
 * DELETE ?user_id=&product_id= — quita el especial; el cliente
 *        vuelve al precio público.
 *
 * Cada cambio queda en la bitácora con el valor anterior.
 */

export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin({ permission: "clientes" })
  if (adminDenied) return adminDenied

  const userId = request.nextUrl.searchParams.get("user_id") ?? ""
  if (!userId) {
    return NextResponse.json({ error: "Falta el cliente (user_id)" }, { status: 400 })
  }
  const supabase = await createServiceClient()
  const { available, rows } = await listCustomerPrices(supabase, userId)
  return NextResponse.json({ available, prices: rows })
}

export async function POST(request: NextRequest) {
  const { user: admin, response: adminDenied } = await requireAdmin({ permission: "clientes" })
  if (adminDenied) return adminDenied

  const bodyResult = await readJsonBody<{
    user_id?: unknown
    product_id?: unknown
    price?: unknown
  }>(request)
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status })
  }
  const body = bodyResult.data

  const userId = typeof body.user_id === "string" ? body.user_id : ""
  const productId = Number(body.product_id)
  if (!userId) {
    return NextResponse.json({ error: "Falta el cliente (user_id)" }, { status: 400 })
  }
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "Producto inválido" }, { status: 400 })
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

  const { data: product } = await supabase
    .from("products")
    .select("id, name, cost")
    .eq("id", productId)
    .maybeSingle()
  if (!product) {
    return NextResponse.json({ error: "El producto no existe" }, { status: 400 })
  }
  const productRow = product as { id: number; name: string; cost: number | null }

  const validated = validateCustomerPriceInput({
    price: body.price,
    cost: productRow.cost !== null && productRow.cost !== undefined ? Number(productRow.cost) : null,
  })
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const previous = await getCustomerPrice(supabase, userId, productId)

  const { data, error } = await supabase
    .from("customer_product_prices")
    .upsert(
      {
        user_id: userId,
        product_id: productId,
        price: validated.price,
        created_by: admin?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,product_id" }
    )
    .select("*")
    .single()

  if (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json(
        { error: "La migración 00234 aún no se aplica: no hay precios especiales todavía" },
        { status: 409 }
      )
    }
    logger.error("[admin/customer-prices] error guardando el precio especial", error)
    return NextResponse.json({ error: "No se pudo guardar el precio especial" }, { status: 500 })
  }

  await logAdminAction(supabase, {
    actorId: admin?.id ?? null,
    actorEmail: admin?.email ?? null,
    action: "customer_price_set",
    entity: "customer_product_price",
    entityId: (data as { id: string }).id,
    detail: {
      user_id: userId,
      product_id: productId,
      product_name: productRow.name,
      price: validated.price,
      previous_price: previous ? Number(previous.price) : null,
    },
  })

  return NextResponse.json({ price: data }, { status: previous ? 200 : 201 })
}

export async function DELETE(request: NextRequest) {
  const { user: admin, response: adminDenied } = await requireAdmin({ permission: "clientes" })
  if (adminDenied) return adminDenied

  const userId = request.nextUrl.searchParams.get("user_id") ?? ""
  const productId = Number(request.nextUrl.searchParams.get("product_id"))
  if (!userId || !Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json(
      { error: "Faltan user_id y product_id válidos" },
      { status: 400 }
    )
  }

  const supabase = await createServiceClient()
  const previous = await getCustomerPrice(supabase, userId, productId)
  if (!previous) {
    return NextResponse.json(
      { error: "Ese cliente no tiene precio especial en ese producto" },
      { status: 404 }
    )
  }

  const { error } = await supabase
    .from("customer_product_prices")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId)
  if (error) {
    logger.error("[admin/customer-prices] error eliminando el precio especial", error)
    return NextResponse.json({ error: "No se pudo eliminar el precio especial" }, { status: 500 })
  }

  await logAdminAction(supabase, {
    actorId: admin?.id ?? null,
    actorEmail: admin?.email ?? null,
    action: "customer_price_delete",
    entity: "customer_product_price",
    entityId: previous.id,
    detail: { user_id: userId, product_id: productId, previous_price: Number(previous.price) },
  })

  return NextResponse.json({ ok: true })
}
