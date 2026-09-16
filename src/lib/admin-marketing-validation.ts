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

/**
 * Kind de un par de afinidad entre productos:
 * - `curated`: par escrito a mano por el admin (gana sobre el recetario).
 * - `recipe`: par derivado del recetario al sembrar la tabla.
 */
export const AFFINITY_KINDS = ["curated", "recipe"] as const

export interface AffinityPairInput {
  source_product_id: number
  target_product_id: number
  kind: (typeof AFFINITY_KINDS)[number]
  weight: number
  is_active: boolean
}

/**
 * Valida un par de afinidad ("si el carrito trae A, sugiere B").
 * Rechaza el auto-par: un producto no puede sugerirse a sí mismo.
 */
export function validateAffinityPairInput(
  body: Record<string, unknown>,
): { ok: true; value: AffinityPairInput } | { ok: false; error: string } {
  const sourceId = Number(body.source_product_id)
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return { ok: false, error: "source_product_id debe ser un entero positivo" }
  }
  const targetId = Number(body.target_product_id)
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return { ok: false, error: "target_product_id debe ser un entero positivo" }
  }
  if (sourceId === targetId) {
    return { ok: false, error: "Un producto no puede ser afín consigo mismo" }
  }
  const kind = body.kind === undefined ? "curated" : body.kind
  if (typeof kind !== "string" || !AFFINITY_KINDS.includes(kind as never)) {
    return { ok: false, error: `kind inválido (${AFFINITY_KINDS.join(", ")})` }
  }
  const weight = body.weight === undefined ? 1 : Number(body.weight)
  if (!Number.isInteger(weight) || weight < 0) {
    return { ok: false, error: "weight debe ser un entero >= 0" }
  }
  return {
    ok: true,
    value: {
      source_product_id: sourceId,
      target_product_id: targetId,
      kind: kind as AffinityPairInput["kind"],
      weight,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    },
  }
}

export interface AffinityPairPatch {
  kind?: AffinityPairInput["kind"]
  weight?: number
  is_active?: boolean
}

/** Actualización parcial de un par de afinidad (peso, kind, on/off). */
export function validateAffinityPairPatch(
  body: Record<string, unknown>,
): { ok: true; value: AffinityPairPatch } | { ok: false; error: string } {
  const patch: AffinityPairPatch = {}
  if ("kind" in body) {
    const kind = body.kind
    if (typeof kind !== "string" || !AFFINITY_KINDS.includes(kind as never)) {
      return { ok: false, error: `kind inválido (${AFFINITY_KINDS.join(", ")})` }
    }
    patch.kind = kind as AffinityPairInput["kind"]
  }
  if ("weight" in body) {
    const weight = Number(body.weight)
    if (!Number.isInteger(weight) || weight < 0) {
      return { ok: false, error: "weight debe ser un entero >= 0" }
    }
    patch.weight = weight
  }
  if ("is_active" in body) patch.is_active = Boolean(body.is_active)
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Sin campos para actualizar" }
  }
  return { ok: true, value: patch }
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

export interface CouponPatch {
  discount_value?: number
  min_order?: number
  max_uses?: number
  expires_at?: string | null
}

/**
 * Fase 11 — valida una actualización parcial de cupón (PATCH). Mismas
 * reglas que validateCouponInput pero todos los campos opcionales;
 * expires_at admite null explícito (quitar expiración).
 */
export function validateCouponPatch(
  body: Record<string, unknown>,
): { ok: true; value: CouponPatch } | { ok: false; error: string } {
  const patch: CouponPatch = {}
  if ("discount_value" in body) {
    const v = Number(body.discount_value)
    if (!Number.isFinite(v) || v <= 0) {
      return { ok: false, error: "discount_value debe ser positivo" }
    }
    patch.discount_value = v
  }
  if ("min_order" in body) {
    const v = Number(body.min_order)
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, error: "min_order inválido" }
    }
    patch.min_order = v
  }
  if ("max_uses" in body) {
    const v = Math.trunc(Number(body.max_uses))
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, error: "max_uses inválido" }
    }
    patch.max_uses = v
  }
  if ("expires_at" in body) {
    if (body.expires_at === null) {
      patch.expires_at = null
    } else {
      const d = new Date(String(body.expires_at))
      if (Number.isNaN(d.getTime())) {
        return { ok: false, error: "expires_at inválido" }
      }
      patch.expires_at = d.toISOString()
    }
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Sin campos para actualizar" }
  }
  return { ok: true, value: patch }
}

/**
 * Sugiere un código para duplicar un cupón: "<CODE>-COPIA" (o -COPIA2,
 * -COPIA3…) recortado al máximo de 32 caracteres del validador.
 */
export function suggestDuplicateCode(code: string, existing: string[]): string {
  const upper = code.toUpperCase()
  const taken = new Set(existing.map((c) => c.toUpperCase()))
  for (let n = 1; n <= 99; n++) {
    const suffix = n === 1 ? "-COPIA" : `-COPIA${n}`
    const candidate = `${upper.slice(0, 32 - suffix.length)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return `${upper.slice(0, 28)}-C${Date.now() % 100}`
}
