/**
 * Validadores de input para el CRUD admin de marketing (bump_rules y
 * cupones). Extraídos de las rutas para poder testearlos sin levantar
 * el contexto de Next.js.
 */

export const BUMP_TRIGGER_TYPES = ["perishables", "snacks_drinks", "subtotal_threshold"] as const

export interface BumpRuleInput {
  trigger_type: (typeof BUMP_TRIGGER_TYPES)[number]
  category_slugs: string[]
  subtotal_min: number | null
  product_id: number
  title: string
  description: string
  discount_pct: number
  is_active: boolean
  display_order: number
}

export function validateBumpRuleInput(
  body: Record<string, unknown>,
): { ok: true; value: BumpRuleInput } | { ok: false; error: string } {
  const triggerType = body.trigger_type
  if (typeof triggerType !== "string" || !BUMP_TRIGGER_TYPES.includes(triggerType as never)) {
    return { ok: false, error: `trigger_type inválido (${BUMP_TRIGGER_TYPES.join(", ")})` }
  }
  const productId = Number(body.product_id)
  if (!Number.isInteger(productId) || productId <= 0) {
    return { ok: false, error: "product_id debe ser un entero positivo" }
  }
  const title = typeof body.title === "string" ? body.title.trim() : ""
  if (!title) return { ok: false, error: "title es obligatorio" }
  const description = typeof body.description === "string" ? body.description.trim() : ""
  if (!description) return { ok: false, error: "description es obligatoria" }

  const categorySlugs = Array.isArray(body.category_slugs)
    ? body.category_slugs.filter((s): s is string => typeof s === "string")
    : []
  if (triggerType !== "subtotal_threshold" && categorySlugs.length === 0) {
    return { ok: false, error: "category_slugs es obligatorio para este trigger" }
  }

  let subtotalMin: number | null = null
  if (triggerType === "subtotal_threshold") {
    subtotalMin = Number(body.subtotal_min)
    if (!Number.isFinite(subtotalMin) || subtotalMin <= 0) {
      return { ok: false, error: "subtotal_min debe ser un número positivo" }
    }
  }

  const discountPct = body.discount_pct === undefined ? 0 : Number(body.discount_pct)
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 1) {
    return { ok: false, error: "discount_pct debe estar entre 0 y 1" }
  }

  return {
    ok: true,
    value: {
      trigger_type: triggerType as BumpRuleInput["trigger_type"],
      category_slugs: categorySlugs,
      subtotal_min: subtotalMin,
      product_id: productId,
      title,
      description,
      discount_pct: discountPct,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
      display_order:
        body.display_order === undefined
          ? 0
          : Math.max(0, Math.trunc(Number(body.display_order) || 0)),
    },
  }
}

export interface CouponInput {
  code: string
  discount_type: "percentage" | "fixed_amount"
  discount_value: number
  min_order: number
  max_uses: number
  expires_at: string | null
}

export function validateCouponInput(
  body: Record<string, unknown>,
): { ok: true; value: CouponInput } | { ok: false; error: string } {
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : ""
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return { ok: false, error: "code: 3-32 caracteres alfanuméricos (A-Z, 0-9, -, _)" }
  }
  const discountType = body.discount_type
  if (discountType !== "percentage" && discountType !== "fixed_amount") {
    return { ok: false, error: "discount_type debe ser percentage o fixed_amount" }
  }
  const discountValue = Number(body.discount_value)
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return { ok: false, error: "discount_value debe ser positivo" }
  }
  if (discountType === "percentage" && discountValue > 100) {
    return { ok: false, error: "discount_value porcentual no puede exceder 100" }
  }
  const minOrder = body.min_order === undefined ? 0 : Number(body.min_order)
  if (!Number.isFinite(minOrder) || minOrder < 0) {
    return { ok: false, error: "min_order inválido" }
  }
  const maxUses = body.max_uses === undefined ? 0 : Math.trunc(Number(body.max_uses))
  if (!Number.isFinite(maxUses) || maxUses < 0) {
    return { ok: false, error: "max_uses inválido (0 = ilimitado)" }
  }
  let expiresAt: string | null = null
  if (body.expires_at) {
    const d = new Date(String(body.expires_at))
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "expires_at inválido" }
    }
    expiresAt = d.toISOString()
  }

  return {
    ok: true,
    value: {
      code,
      discount_type: discountType,
      discount_value: discountValue,
      min_order: minOrder,
      max_uses: maxUses,
      expires_at: expiresAt,
    },
  }
}
