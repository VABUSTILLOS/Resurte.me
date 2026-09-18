// ============================================================
// Moderación de restaurantes FoodOS: quién puede publicar.
//
// Espejo en TypeScript de supabase/migrations/00168_foodos_restaurant_moderation.sql
//
// El problema que resuelve: `foodos_restaurants.status` es la única puerta a
// `/r/[slug]`, y la política RLS del dueño (`00023_foodos.sql`) le da `FOR ALL
// USING (auth.uid() = user_id)`. Es decir: hasta `00168` cualquier cuenta podía
// publicar su restaurante con un PATCH de una columna, sin revisión, sin menú y
// sin que nadie de Resurte.me lo viera. No era una fuga de datos — era la
// ausencia de control editorial sobre el catálogo público.
//
// La regla que se congela aquí: **`active` no lo escribe el dueño, nunca.**
// El dueño puede solicitar, retirar la solicitud y pausar; publicar es una
// decisión de Resurte.me.
//
// Las transiciones del dueño:
//
//   draft ──(solicitar)──▶ pending_review ──(admin: aprobar)──▶ active
//     ▲                          │                                 │
//     └──────(retirar)───────────┘                    (dueño: pausar)
//                                                                │
//                            pending_review ◀──(solicitar)── paused
//
// Y el corte de publicación: **≥1 platillo**. Un restaurante sin un solo
// platillo no es un restaurante, es una promesa. (Las sucursales NO bloquean:
// el único restaurante real de producción tiene 0 sucursales y 1 platillo. Una
// precondición que contradice los datos de producción no es rigor, es una
// trampa.)
//
// La base de datos es la autoridad, no este archivo. El trigger
// `foodos_restaurant_moderation_guard` levanta `42501` si el dueño intenta
// escribir `active`, y el RPC `foodos_restaurant_review()` es el único camino a
// `active`. Este módulo existe para que la interfaz no ofrezca un botón que la
// base va a rechazar, y para que el mensaje de error sea una frase en lugar del
// texto crudo de Postgres.
// ============================================================

/**
 * Los cuatro estados. Sólo `active` es público.
 *
 * `pending_review` se añadió en `00168`; antes de eso el tipo tenía tres
 * estados y el dueño podía saltar de `draft` a `active` directamente.
 */
export const FOODOS_RESTAURANT_STATUSES = ["draft", "pending_review", "active", "paused"] as const

export type FoodosRestaurantStatus = (typeof FOODOS_RESTAURANT_STATUSES)[number]

/** El único estado que sirve una página pública. */
export const FOODOS_PUBLIC_STATUS = "active" satisfies FoodosRestaurantStatus

/** Lo mínimo para que una página sea un restaurante y no una promesa. */
export const MIN_MENU_ITEMS_TO_PUBLISH = 1

/**
 * Las transiciones que el dueño puede provocar. Todo lo que no esté aquí lo
 * rechaza `checkOwnerTransition`, y `active` lo rechaza además la base.
 */
const TRANSICIONES_DEL_DUENO: Record<FoodosRestaurantStatus, readonly FoodosRestaurantStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["draft"],
  paused: ["pending_review"],
  active: ["paused"],
}

/** Por qué una transición no es válida. El mensaje lo pone `ownerStatusErrorMessage`. */
export type OwnerStatusError =
  | "estado_desconocido"
  | "solo_admin"
  | "sin_cambio"
  | "transicion_invalida"

export type OwnerTransition = { ok: true } | { ok: false; code: OwnerStatusError }

/** La acción que la interfaz debe ofrecer para el estado actual. */
export type OwnerStatusAction = "solicitar" | "retirar" | "pausar"

/** La decisión del administrador, tal como viaja a `foodos_restaurant_review()`. */
export type ReviewDecision = "approve" | "reject" | "pause"

export const REVIEW_DECISIONS = ["approve", "reject", "pause"] as const

export function isFoodosStatus(value: string): value is FoodosRestaurantStatus {
  return (FOODOS_RESTAURANT_STATUSES as readonly string[]).includes(value)
}

export function isReviewDecision(value: string): value is ReviewDecision {
  return (REVIEW_DECISIONS as readonly string[]).includes(value)
}

/** Los destinos válidos desde un estado. Vacío si el estado no se reconoce. */
export function ownerAllowedTargets(from: string): readonly FoodosRestaurantStatus[] {
  return isFoodosStatus(from) ? TRANSICIONES_DEL_DUENO[from] : []
}

/**
 * ¿Puede el dueño mover el restaurante de `from` a `to`?
 *
 * `active` se rechaza **antes** de mirar la tabla de transiciones: no es que no
 * sea una transición permitida, es que no es una transición del dueño en
 * absoluto. El mensaje tiene que decir eso, no «transición inválida».
 */
export function checkOwnerTransition(from: string, to: string): OwnerTransition {
  if (!isFoodosStatus(to)) return { ok: false, code: "estado_desconocido" }
  if (to === FOODOS_PUBLIC_STATUS) return { ok: false, code: "solo_admin" }
  if (!isFoodosStatus(from)) return { ok: false, code: "estado_desconocido" }
  if (from === to) return { ok: false, code: "sin_cambio" }
  if (!TRANSICIONES_DEL_DUENO[from].includes(to)) return { ok: false, code: "transicion_invalida" }
  return { ok: true }
}

/**
 * La única acción de estado que la interfaz debe ofrecer. `null` cuando el
 * estado no se reconoce, para que la pantalla no invente un botón.
 */
export function ownerStatusAction(from: string): OwnerStatusAction | null {
  switch (from) {
    case "draft":
    case "paused":
      return "solicitar"
    case "pending_review":
      return "retirar"
    case "active":
      return "pausar"
    default:
      return null
  }
}

/** El destino de cada acción del dueño. */
export function ownerActionTarget(action: OwnerStatusAction): FoodosRestaurantStatus {
  switch (action) {
    case "solicitar":
      return "pending_review"
    case "retirar":
      return "draft"
    case "pausar":
      return "paused"
  }
}

/** ¿Tiene el restaurante lo mínimo para publicarse? */
export function canPublish(menuItemCount: number): boolean {
  return Number.isFinite(menuItemCount) && menuItemCount >= MIN_MENU_ITEMS_TO_PUBLISH
}

/** Qué le falta para publicarse. `null` si no le falta nada. */
export function publishBlocker(menuItemCount: number): "sin_menu" | null {
  return canPublish(menuItemCount) ? null : "sin_menu"
}

/** A qué estado lleva cada decisión del administrador. */
export function reviewDecisionTarget(decision: ReviewDecision): FoodosRestaurantStatus {
  switch (decision) {
    case "approve":
      return "active"
    case "reject":
      return "draft"
    case "pause":
      return "paused"
  }
}

/**
 * El mensaje que ve el dueño. Se escribe aquí y no en la acción para que sea
 * una función pura y comprobable, y para que los cuatro motivos estén en un
 * solo sitio en lugar de repartidos por los `catch` de la pantalla.
 */
export function ownerStatusErrorMessage(code: OwnerStatusError): string {
  switch (code) {
    case "estado_desconocido":
      return "Ese estado no existe. Recarga la página."
    case "solo_admin":
      return "Publicar tu restaurante lo decide Resurte.me. Solicita la revisión y te avisamos."
    case "sin_cambio":
      return "El restaurante ya está en ese estado."
    case "transicion_invalida":
      return "Ese cambio de estado no es posible desde donde está tu restaurante. Recarga la página."
  }
}

// ---------------------------------------------------------------------------
// La decisión del administrador
// ---------------------------------------------------------------------------
// La entrada de la ruta admin se valida aquí y no en el formulario porque un
// formulario no es una garantía: es la misma razón por la que la precondición
// de publicación vive en el RPC y no en la pantalla.

/** Longitud máxima del motivo. Cabe en una notificación y en una tarjeta. */
export const MAX_REVIEW_NOTE_LENGTH = 500

export type ReviewInput = {
  restaurantId: unknown
  decision: unknown
  reason: unknown
}

export type ReviewInputResult =
  | { ok: true; value: { restaurantId: string; decision: ReviewDecision; reason: string | null } }
  | { ok: false; error: string }

/**
 * Valida `{ restaurantId, decision, reason }`.
 *
 * Un **rechazo exige motivo**. Sin él, el dueño ve «Resurte.me pidió cambios» y
 * no sabe qué cambiar: eso convierte la moderación en una puerta cerrada. Las
 * otras dos decisiones no lo exigen — aprobar se explica solo, y pausar desde
 * el admin ya lleva el motivo de la fila anterior.
 */
export function validateReviewInput(input: ReviewInput): ReviewInputResult {
  const restaurantId =
    typeof input.restaurantId === "string" ? input.restaurantId.trim() : ""
  if (restaurantId.length < 10) {
    return { ok: false, error: "Falta el restaurante." }
  }

  const decision = typeof input.decision === "string" ? input.decision.trim() : ""
  if (!isReviewDecision(decision)) {
    return { ok: false, error: "Decisión inválida." }
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : ""
  if (reason.length > MAX_REVIEW_NOTE_LENGTH) {
    return { ok: false, error: `El motivo no puede pasar de ${MAX_REVIEW_NOTE_LENGTH} caracteres.` }
  }
  if (decision === "reject" && reason.length === 0) {
    return { ok: false, error: "Escribe qué tiene que cambiar el dueño para poder publicarlo." }
  }

  return { ok: true, value: { restaurantId, decision, reason: reason.length > 0 ? reason : null } }
}
