import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { validateBumpRuleInput } from "@/lib/admin-marketing-validation"
import { resolveEffectivePrice } from "@/lib/sale-window"

export const runtime = "nodejs"

/**
 * GET /api/admin/bump-rules — lista todas las reglas (activas e inactivas).
 * POST /api/admin/bump-rules — crea una regla nueva.
 * Requiere sesión admin; escribe con service_role.
 *
 * La lista incluye el estado del producto de cada regla (`product_name`,
 * `product_is_visible`, `product_stock_status`): una regla cuyo producto quedó
 * oculto o agotado dispara pero no puede ofrecer nada, y el panel solo mostraba
 * "Producto #77", así que esa rotura era invisible para quien puede arreglarla.
 */
export async function GET() {
  const { response: adminDenied } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("bump_rules")
      .select("id, trigger_type, category_slugs, subtotal_min, product_id, title, description, discount_pct, is_active, display_order")
      .order("display_order", { ascending: true })
    if (error) throw error

    const rules = data ?? []
    // Dos queries en vez de un embed de PostgREST: el embed depende de que la FK
    // esté en la caché de esquema y, si no lo está, tumba la página entera.
    const productIds = [...new Set(rules.map((r) => r.product_id))]
    const productById = new Map<
      number,
      { name: string; is_visible: boolean; stock_status: string; price: number | null }
    >()
    if (productIds.length > 0) {
      // El precio es lo que permite ver que una regla quedó apuntando a un
      // producto de $4 (el defecto que re-apunta el motor): sin él, el panel
      // mostraba el nombre y nada más. La ventana de oferta (00107) entra en el
      // select porque el precio que se cobra es el efectivo.
      const { data: products } = await supabase
        .from("products")
        .select("id, name, is_visible, stock_status, price, sale_price, sale_starts_at, sale_ends_at")
        .in("id", productIds)
      for (const p of products ?? []) {
        productById.set(p.id, {
          name: p.name,
          is_visible: p.is_visible,
          stock_status: p.stock_status,
          price: resolveEffectivePrice(p),
        })
      }
    }

    return NextResponse.json({
      rules: rules.map((rule) => {
        const product = productById.get(rule.product_id)
        return {
          ...rule,
          product_name: product?.name ?? null,
          product_is_visible: product?.is_visible ?? null,
          product_stock_status: product?.stock_status ?? null,
          product_price: product?.price ?? null,
        }
      }),
    })
  } catch (error) {
    logger.error("[ADMIN-BUMPS] list error:", error)
    return NextResponse.json({ error: "Error al cargar reglas" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { user: adminUser, response: adminDenied } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json()) as Record<string, unknown>
    const parsed = validateBumpRuleInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("bump_rules")
      .insert(parsed.value)
      .select("id")
      .single()
    if (error) throw error

    // discount_pct es un descuento real aplicado en el checkout.
    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "bump_rule_create",
      entity: "bump_rules",
      entityId: data.id,
      detail: {
        trigger_type: parsed.value.trigger_type,
        product_id: parsed.value.product_id,
        discount_pct: parsed.value.discount_pct,
        is_active: parsed.value.is_active,
      },
    })

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error) {
    logger.error("[ADMIN-BUMPS] create error:", error)
    return NextResponse.json({ error: "Error al crear la regla" }, { status: 500 })
  }
}
