import { describe, expect, it } from "vitest"
import {
  FOODOS_PUBLIC_STATUS,
  FOODOS_RESTAURANT_STATUSES,
  MAX_REVIEW_NOTE_LENGTH,
  MIN_MENU_ITEMS_TO_PUBLISH,
  REVIEW_DECISIONS,
  canPublish,
  checkOwnerTransition,
  isFoodosStatus,
  isReviewDecision,
  ownerActionTarget,
  ownerAllowedTargets,
  ownerStatusAction,
  ownerStatusErrorMessage,
  publishBlocker,
  reviewDecisionTarget,
  validateReviewInput,
  type FoodosRestaurantStatus,
  type OwnerStatusError,
} from "./foodos-moderation"

/**
 * El contrato que estos tests congelan:
 *
 *   **`active` no lo escribe el dueño, nunca.**
 *
 * `foodos_restaurants.status` es la única puerta a `/r/[slug]`
 * (`fetchPublicRestaurantBySlug` filtra `.eq("status", "active")`). Antes de
 * `00168` la política RLS del dueño (`00023_foodos.sql`, `FOR ALL USING
 * (auth.uid() = user_id)`) más la lista blanca de columnas de `00160` le
 * permitían publicarse a sí mismo con un PATCH. La regla ahora vive en la base
 * (trigger `foodos_restaurant_moderation_guard` + RPC
 * `foodos_restaurant_review()`); este módulo es su espejo, y estos tests son la
 * parte que se puede comprobar sin base de datos.
 *
 * El caso que más importa es `checkOwnerTransition(<cualquier estado>,
 * "active")`: tiene que fallar con `solo_admin` desde los cuatro orígenes, y
 * con ese motivo exacto, porque el mensaje que ve el dueño es distinto del de
 * «transición inválida». Si alguna vez devuelve `ok: true`, la moderación dejó
 * de existir y la pantalla volvería a ofrecer el botón que la base rechaza.
 */

const ESTADOS = FOODOS_RESTAURANT_STATUSES
const MOTIVOS: OwnerStatusError[] = [
  "estado_desconocido",
  "solo_admin",
  "sin_cambio",
  "transicion_invalida",
]

describe("vocabulario de estados", () => {
  it("hay cuatro estados y `active` es el único público", () => {
    expect(ESTADOS).toEqual(["draft", "pending_review", "active", "paused"])
    expect(FOODOS_PUBLIC_STATUS).toBe("active")
    expect(ESTADOS.filter((s) => s === FOODOS_PUBLIC_STATUS)).toHaveLength(1)
  })

  it("`isFoodosStatus` reconoce los cuatro y rechaza lo demás", () => {
    for (const estado of ESTADOS) expect(isFoodosStatus(estado)).toBe(true)
    expect(isFoodosStatus("published")).toBe(false)
    expect(isFoodosStatus("")).toBe(false)
    expect(isFoodosStatus("Active")).toBe(false)
  })

  it("`isReviewDecision` reconoce las tres decisiones y rechaza lo demás", () => {
    expect(REVIEW_DECISIONS).toEqual(["approve", "reject", "pause"])
    for (const d of REVIEW_DECISIONS) expect(isReviewDecision(d)).toBe(true)
    expect(isReviewDecision("aprobar")).toBe(false)
    expect(isReviewDecision("APPROVE")).toBe(false)
  })
})

describe("la regla central: el dueño no publica", () => {
  it("`checkOwnerTransition` rechaza `active` desde los CUATRO estados con `solo_admin`", () => {
    for (const from of ESTADOS) {
      const result = checkOwnerTransition(from, "active")
      expect(result).toEqual({ ok: false, code: "solo_admin" })
    }
  })

  it("`active` se rechaza como `solo_admin`, no como `transicion_invalida`", () => {
    // El motivo cambia el mensaje. Si esto se degradara a `transicion_invalida`,
    // el dueño leería «recarga la página» cuando la verdad es «no te toca».
    const result = checkOwnerTransition("draft", "active")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("solo_admin")
      expect(result.code).not.toBe("transicion_invalida")
    }
  })

  it("`active` como destino se rechaza incluso si el origen no se reconoce", () => {
    // El orden importa: la comprobación de `active` va antes que la del origen.
    expect(checkOwnerTransition("estado-que-no-existe", "active")).toEqual({
      ok: false,
      code: "solo_admin",
    })
  })

  it("ningún destino permitido del dueño es `active`", () => {
    for (const from of ESTADOS) {
      expect(ownerAllowedTargets(from)).not.toContain("active")
    }
  })

  it("ninguna acción del dueño lleva a `active`", () => {
    const acciones = ESTADOS.map((from) => ownerStatusAction(from)).filter(
      (a): a is NonNullable<typeof a> => a !== null
    )
    expect(acciones.length).toBeGreaterThan(0)
    for (const accion of acciones) {
      expect(ownerActionTarget(accion)).not.toBe("active")
    }
  })
})

describe("transiciones del dueño", () => {
  it("acepta exactamente las cuatro transiciones declaradas", () => {
    const permitidas: Array<[FoodosRestaurantStatus, FoodosRestaurantStatus]> = [
      ["draft", "pending_review"],
      ["pending_review", "draft"],
      ["paused", "pending_review"],
      ["active", "paused"],
    ]
    for (const [from, to] of permitidas) {
      expect(checkOwnerTransition(from, to)).toEqual({ ok: true })
    }
  })

  it("rechaza el resto de pares con el motivo correcto", () => {
    // `sin_cambio` para el mismo estado, `transicion_invalida` para un salto que
    // la tabla no declara. `active` nunca aparece aquí porque ya se rechazó.
    expect(checkOwnerTransition("draft", "draft")).toEqual({ ok: false, code: "sin_cambio" })
    expect(checkOwnerTransition("draft", "paused")).toEqual({
      ok: false,
      code: "transicion_invalida",
    })
    expect(checkOwnerTransition("pending_review", "paused")).toEqual({
      ok: false,
      code: "transicion_invalida",
    })
    expect(checkOwnerTransition("paused", "draft")).toEqual({
      ok: false,
      code: "transicion_invalida",
    })
  })

  it("rechaza un destino desconocido antes que cualquier otra cosa", () => {
    expect(checkOwnerTransition("draft", "publicado")).toEqual({
      ok: false,
      code: "estado_desconocido",
    })
    expect(checkOwnerTransition("draft", "")).toEqual({ ok: false, code: "estado_desconocido" })
  })

  it("un origen desconocido no habilita nada", () => {
    for (const to of ESTADOS) {
      if (to === "active") continue
      expect(checkOwnerTransition("zzz", to)).toEqual({ ok: false, code: "estado_desconocido" })
    }
    expect(ownerAllowedTargets("zzz")).toEqual([])
  })
})

describe("la acción que ofrece la interfaz", () => {
  it("cada estado ofrece una sola acción, y es la esperada", () => {
    expect(ownerStatusAction("draft")).toBe("solicitar")
    expect(ownerStatusAction("paused")).toBe("solicitar")
    expect(ownerStatusAction("pending_review")).toBe("retirar")
    expect(ownerStatusAction("active")).toBe("pausar")
  })

  it("un estado desconocido no ofrece botón", () => {
    expect(ownerStatusAction("zzz")).toBeNull()
    expect(ownerStatusAction("")).toBeNull()
  })

  it("la acción ofrecida siempre es legal desde su estado", () => {
    // Es la invariante que evita que la pantalla pinte un botón que la base
    // rechaza: acción y transición salen del mismo módulo y no pueden divergir.
    for (const from of ESTADOS) {
      const accion = ownerStatusAction(from)
      expect(accion).not.toBeNull()
      if (accion) {
        expect(checkOwnerTransition(from, ownerActionTarget(accion))).toEqual({ ok: true })
      }
    }
  })

  it("`ownerActionTarget` mapea las tres acciones", () => {
    expect(ownerActionTarget("solicitar")).toBe("pending_review")
    expect(ownerActionTarget("retirar")).toBe("draft")
    expect(ownerActionTarget("pausar")).toBe("paused")
  })
})

describe("la precondición de publicación", () => {
  it("un platillo basta", () => {
    expect(MIN_MENU_ITEMS_TO_PUBLISH).toBe(1)
    expect(canPublish(1)).toBe(true)
    expect(canPublish(25)).toBe(true)
    expect(publishBlocker(1)).toBeNull()
  })

  it("cero platillos bloquea", () => {
    expect(canPublish(0)).toBe(false)
    expect(publishBlocker(0)).toBe("sin_menu")
  })

  it("un conteo no finito bloquea en vez de pasar", () => {
    // Fail-closed: `NaN >= 1` es false, pero un `Number.isFinite` explícito deja
    // claro que es intencional y no una coincidencia del operador.
    expect(canPublish(Number.NaN)).toBe(false)
    expect(canPublish(Number.POSITIVE_INFINITY)).toBe(false)
    expect(publishBlocker(Number.NaN)).toBe("sin_menu")
  })
})

describe("decisiones del administrador", () => {
  it("`approve` es el único camino a `active`", () => {
    expect(reviewDecisionTarget("approve")).toBe("active")
    expect(reviewDecisionTarget("reject")).toBe("draft")
    expect(reviewDecisionTarget("pause")).toBe("paused")
  })

  it("sólo una de las tres decisiones publica", () => {
    const destinos = REVIEW_DECISIONS.map((d) => reviewDecisionTarget(d))
    expect(destinos.filter((d) => d === FOODOS_PUBLIC_STATUS)).toHaveLength(1)
  })
})

describe("mensajes al dueño", () => {
  it("hay un mensaje no vacío para cada motivo", () => {
    for (const motivo of MOTIVOS) {
      const mensaje = ownerStatusErrorMessage(motivo)
      expect(mensaje.length).toBeGreaterThan(10)
    }
  })

  it("los mensajes son distintos entre sí", () => {
    const mensajes = MOTIVOS.map((m) => ownerStatusErrorMessage(m))
    expect(new Set(mensajes).size).toBe(MOTIVOS.length)
  })

  it("`solo_admin` manda a solicitar la revisión, no a recargar", () => {
    const mensaje = ownerStatusErrorMessage("solo_admin")
    expect(mensaje).toContain("Resurte.me")
    expect(mensaje.toLowerCase()).toContain("solicita")
    expect(mensaje.toLowerCase()).not.toContain("recarga")
  })
})

describe("validateReviewInput", () => {
  const ID = "2ca52320-70df-4427-a06f-edd4da7d5061"

  it("acepta una aprobación sin motivo y normaliza el motivo a `null`", () => {
    const result = validateReviewInput({ restaurantId: ID, decision: "approve", reason: "" })
    expect(result).toEqual({
      ok: true,
      value: { restaurantId: ID, decision: "approve", reason: null },
    })
  })

  it("recorta el motivo en vez de guardarlo con espacios", () => {
    const result = validateReviewInput({
      restaurantId: ID,
      decision: "reject",
      reason: "  falta el logo  ",
    })
    expect(result).toEqual({
      ok: true,
      value: { restaurantId: ID, decision: "reject", reason: "falta el logo" },
    })
  })

  it("un rechazo SIN motivo no pasa: el dueño no sabría qué cambiar", () => {
    const vacio = validateReviewInput({ restaurantId: ID, decision: "reject", reason: "" })
    expect(vacio.ok).toBe(false)
    const espacios = validateReviewInput({ restaurantId: ID, decision: "reject", reason: "   " })
    expect(espacios.ok).toBe(false)
    const ausente = validateReviewInput({ restaurantId: ID, decision: "reject", reason: null })
    expect(ausente.ok).toBe(false)
  })

  it("pausar tampoco exige motivo", () => {
    const result = validateReviewInput({ restaurantId: ID, decision: "pause", reason: undefined })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.reason).toBeNull()
  })

  it("rechaza un motivo más largo que el tope", () => {
    const largo = "x".repeat(MAX_REVIEW_NOTE_LENGTH + 1)
    const result = validateReviewInput({ restaurantId: ID, decision: "reject", reason: largo })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(String(MAX_REVIEW_NOTE_LENGTH))
  })

  it("acepta un motivo justo en el tope", () => {
    const justo = "x".repeat(MAX_REVIEW_NOTE_LENGTH)
    const result = validateReviewInput({ restaurantId: ID, decision: "reject", reason: justo })
    expect(result.ok).toBe(true)
  })

  it("rechaza un restaurante ausente, vacío o no-string", () => {
    for (const restaurantId of ["", "   ", null, undefined, 42, { id: ID }]) {
      const result = validateReviewInput({ restaurantId, decision: "approve", reason: "" })
      expect(result.ok).toBe(false)
    }
  })

  it("rechaza un id demasiado corto para ser un uuid", () => {
    const result = validateReviewInput({ restaurantId: "abc", decision: "approve", reason: "" })
    expect(result.ok).toBe(false)
  })

  it("rechaza una decisión inventada", () => {
    for (const decision of ["aprobar", "APPROVE", "", null, 7]) {
      const result = validateReviewInput({ restaurantId: ID, decision, reason: "algo" })
      expect(result.ok).toBe(false)
    }
  })

  it("no deja pasar el motivo de un rechazo con sólo espacios como `null` silencioso", () => {
    // El riesgo real: tratar `"   "` como motivo válido y guardar una nota vacía
    // en `review_note`, dejando al dueño sin explicación y al admin creyendo que
    // sí explicó.
    const result = validateReviewInput({ restaurantId: ID, decision: "reject", reason: "\n\t " })
    expect(result.ok).toBe(false)
  })
})
