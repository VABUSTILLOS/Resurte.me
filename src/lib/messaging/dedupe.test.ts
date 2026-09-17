import { describe, expect, it } from "vitest"
import {
  SHARED_INTENTS,
  alreadySentByPlatform,
  alreadySentByRestaurant,
  intentForRestaurantType,
  platformTypeForRestaurantType,
  recipientIdentity,
  restaurantTypesForPlatformType,
  type PlatformSend,
  type RestaurantSend,
} from "@/lib/messaging/dedupe"

const TZ = "America/Mexico_City"

// 2026-02-15 18:00 UTC = 12:00 en CDMX del mismo día.
const NOW = new Date("2026-02-15T18:00:00.000Z")

function send(
  automation_type: string,
  recipient: string,
  created_at: string
): PlatformSend {
  return { automation_type, recipient, created_at }
}

function rsend(
  automation_type: string | null,
  recipient: string | null,
  sent_at: string | null
): RestaurantSend {
  return { automation_type, recipient, sent_at }
}

describe("SHARED_INTENTS", () => {
  it("cubre las cuatro intenciones que existen en los dos motores", () => {
    expect(SHARED_INTENTS.map((s) => s.intent)).toEqual([
      "birthday",
      "abandoned_cart",
      "reactivation",
      "review_request",
    ])
  })

  it("no declara como compartido ningún tipo que solo exista en un motor", () => {
    // `order_confirmation` y `thank_you` son transaccionales del restaurante:
    // la plataforma no manda mensajes de pedidos ajenos.
    for (const s of SHARED_INTENTS) {
      expect(s.restaurantTypes).not.toContain("order_confirmation")
      expect(s.restaurantTypes).not.toContain("thank_you")
    }
  })

  it("cada tipo de restaurante pertenece a una sola intención", () => {
    const seen = SHARED_INTENTS.flatMap((s) => s.restaurantTypes)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it("cada tipo de plataforma pertenece a una sola intención", () => {
    const seen = SHARED_INTENTS.map((s) => s.platformType)
    expect(new Set(seen).size).toBe(seen.length)
  })
})

describe("intentForRestaurantType", () => {
  it("reconoce los cuatro tipos compartidos", () => {
    expect(intentForRestaurantType("birthday")?.intent).toBe("birthday")
    expect(intentForRestaurantType("abandoned_cart")?.intent).toBe("abandoned_cart")
    expect(intentForRestaurantType("winback")?.intent).toBe("reactivation")
    expect(intentForRestaurantType("review_request")?.intent).toBe("review_request")
  })

  it("devuelve null para los tipos que solo existen del lado del restaurante", () => {
    expect(intentForRestaurantType("order_confirmation")).toBeNull()
    expect(intentForRestaurantType("thank_you")).toBeNull()
    expect(intentForRestaurantType("season_promo")).toBeNull()
    expect(intentForRestaurantType("off_hours")).toBeNull()
    expect(intentForRestaurantType("new_product")).toBeNull()
  })

  it("devuelve null sin tipo en vez de lanzar", () => {
    expect(intentForRestaurantType(null)).toBeNull()
    expect(intentForRestaurantType(undefined)).toBeNull()
    expect(intentForRestaurantType("")).toBeNull()
    expect(intentForRestaurantType("   ")).toBeNull()
  })

  it("ignora espacios alrededor del tipo", () => {
    expect(intentForRestaurantType(" birthday ")?.intent).toBe("birthday")
  })

  it("distingue `winback` de `review_request`: no son la misma intención", () => {
    expect(intentForRestaurantType("winback")?.platformType).toBe("reactivation")
    expect(intentForRestaurantType("review_request")?.platformType).toBe("post_delivery_rating")
  })
})

describe("platformTypeForRestaurantType", () => {
  it("mapea al nombre de `whatsapp_automations`", () => {
    expect(platformTypeForRestaurantType("abandoned_cart")).toBe("cart_abandonment")
    expect(platformTypeForRestaurantType("winback")).toBe("reactivation")
    expect(platformTypeForRestaurantType("birthday")).toBe("birthday")
  })

  it("devuelve null cuando no hay equivalente", () => {
    expect(platformTypeForRestaurantType("thank_you")).toBeNull()
  })
})

describe("recipientIdentity", () => {
  it("acepta el número nacional de 10 dígitos tal cual", () => {
    expect(recipientIdentity("5512345678")).toBe("5512345678")
  })

  it("normaliza el prefijo 52 al número nacional", () => {
    expect(recipientIdentity("525512345678")).toBe("5512345678")
  })

  it("normaliza el prefijo 521 (el 1 extra de móvil) al número nacional", () => {
    expect(recipientIdentity("5215512345678")).toBe("5512345678")
  })

  it("las tres formas del mismo número coinciden", () => {
    const forms = ["5512345678", "525512345678", "5215512345678", "+52 1 55 1234 5678"]
    const identities = forms.map((f) => recipientIdentity(f))
    expect(new Set(identities).size).toBe(1)
  })

  it("ignora espacios, guiones y paréntesis", () => {
    expect(recipientIdentity("(55) 1234-5678")).toBe("5512345678")
  })

  it("devuelve null sin dígitos suficientes para afirmar que es la misma persona", () => {
    expect(recipientIdentity("551234")).toBeNull()
    expect(recipientIdentity("")).toBeNull()
    expect(recipientIdentity(null)).toBeNull()
    expect(recipientIdentity(undefined)).toBeNull()
  })

  it("deja pasar un número de otro país sin inventar una equivalencia", () => {
    expect(recipientIdentity("+1 415 555 2671")).toBe("14155552671")
  })

  it("no confunde dos números distintos con el mismo sufijo", () => {
    expect(recipientIdentity("5512345678")).not.toBe(recipientIdentity("5512345679"))
  })

  it("un número con el 1 de móvil pero sin código de país no se recorta", () => {
    // 11 dígitos: no es una de las formas conocidas, así que se compara tal cual.
    expect(recipientIdentity("15512345678")).toBe("15512345678")
  })
})

describe("alreadySentByPlatform", () => {
  it("detecta el envío de la plataforma del mismo día y misma intención", () => {
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5512345678", "2026-02-15T16:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(true)
  })

  it("detecta el envío aunque los teléfonos estén guardados en formatos distintos", () => {
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5215512345678", "2026-02-15T16:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(true)
  })

  it("no bloquea si el envío de la plataforma fue ayer", () => {
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5512345678", "2026-02-14T16:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("usa la zona del restaurante para decidir qué es hoy, no el día UTC", () => {
    // Envío 2026-02-14T23:00Z y reloj 2026-02-15T05:00Z. En CDMX (UTC-6) son
    // las 17:00 y las 23:00 del mismo 14 de febrero; en UTC son días distintos.
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5512345678", "2026-02-14T23:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: TZ,
      now: new Date("2026-02-15T05:00:00.000Z"),
    })
    expect(out).toBe(true)
  })

  it("con el mismo par de fechas, en UTC sí son días distintos", () => {
    // Prueba que la zona cambia la respuesta: sin ella el dedupe fallaría.
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5512345678", "2026-02-14T23:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: "UTC",
      now: new Date("2026-02-15T05:00:00.000Z"),
    })
    expect(out).toBe(false)
  })

  it("no bloquea cuando la intención es distinta", () => {
    const out = alreadySentByPlatform({
      sends: [send("post_delivery_rating", "5512345678", "2026-02-15T16:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("no bloquea cuando el destinatario es otra persona", () => {
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5599999999", "2026-02-15T16:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("no bloquea un tipo del restaurante que la plataforma no manda", () => {
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5512345678", "2026-02-15T16:00:00.000Z")],
      restaurantType: "thank_you",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("reconoce la equivalencia abandonado/winback entre motores", () => {
    expect(
      alreadySentByPlatform({
        sends: [send("cart_abandonment", "5512345678", "2026-02-15T16:00:00.000Z")],
        restaurantType: "abandoned_cart",
        recipient: "5512345678",
        timezone: TZ,
        now: NOW,
      })
    ).toBe(true)
    expect(
      alreadySentByPlatform({
        sends: [send("reactivation", "5512345678", "2026-02-15T16:00:00.000Z")],
        restaurantType: "winback",
        recipient: "5512345678",
        timezone: TZ,
        now: NOW,
      })
    ).toBe(true)
  })

  it("no bloquea si el teléfono del restaurante no es identificable", () => {
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5512345678", "2026-02-15T16:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "123",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("ignora un envío con fecha corrupta en vez de lanzar", () => {
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5512345678", "no es fecha")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("sin envíos no bloquea", () => {
    const out = alreadySentByPlatform({
      sends: [],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("sin zona declarada cae a CDMX en vez de lanzar", () => {
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5512345678", "2026-02-15T16:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: null,
      now: NOW,
    })
    expect(out).toBe(true)
  })

  it("una zona inválida se degrada a UTC en vez de lanzar", () => {
    // `localDateParts` no lanza: cae a UTC. Aquí el envío (15T16:00Z) y el
    // reloj (15T18:00Z) caen el mismo día UTC, así que sí bloquea.
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5512345678", "2026-02-15T16:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: "No/Existe",
      now: NOW,
    })
    expect(out).toBe(true)
  })

  it("una zona inválida no bloquea cuando en UTC tampoco coinciden los días", () => {
    const out = alreadySentByPlatform({
      sends: [send("birthday", "5512345678", "2026-02-14T23:00:00.000Z")],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: "No/Existe",
      now: new Date("2026-02-15T05:00:00.000Z"),
    })
    expect(out).toBe(false)
  })

  it("basta con que uno de varios envíos coincida", () => {
    const out = alreadySentByPlatform({
      sends: [
        send("birthday", "5599999999", "2026-02-15T16:00:00.000Z"),
        send("reactivation", "5512345678", "2026-02-15T16:00:00.000Z"),
        send("birthday", "5512345678", "2026-02-14T16:00:00.000Z"),
        send("birthday", "5512345678", "2026-02-15T17:00:00.000Z"),
      ],
      restaurantType: "birthday",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(true)
  })
})

describe("restaurantTypesForPlatformType", () => {
  it("traduce una intención compartida a los tipos del restaurante", () => {
    expect(restaurantTypesForPlatformType("reactivation")).toEqual(["winback"])
    expect(restaurantTypesForPlatformType("cart_abandonment")).toEqual(["abandoned_cart"])
    expect(restaurantTypesForPlatformType("birthday")).toEqual(["birthday"])
    expect(restaurantTypesForPlatformType("post_delivery_rating")).toEqual(["review_request"])
  })

  it("devuelve vacío para un tipo que solo existe en la plataforma", () => {
    expect(restaurantTypesForPlatformType("payment_recovery")).toEqual([])
    expect(restaurantTypesForPlatformType("onboarding")).toEqual([])
  })
})

describe("alreadySentByRestaurant", () => {
  it("detecta que el restaurante ya mandó la misma intención hoy", () => {
    const out = alreadySentByRestaurant({
      sends: [rsend("winback", "+525512345678", "2026-02-15T17:00:00.000Z")],
      platformType: "reactivation",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(true)
  })

  it("un envío de ayer no bloquea el de hoy", () => {
    const out = alreadySentByRestaurant({
      sends: [rsend("winback", "5512345678", "2026-02-14T18:00:00.000Z")],
      platformType: "reactivation",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("no bloquea si la intención del restaurante es distinta", () => {
    const out = alreadySentByRestaurant({
      sends: [rsend("season_promo", "5512345678", "2026-02-15T17:00:00.000Z")],
      platformType: "reactivation",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("no bloquea si el tipo de la plataforma no tiene gemelo en el restaurante", () => {
    const out = alreadySentByRestaurant({
      sends: [rsend("winback", "5512345678", "2026-02-15T17:00:00.000Z")],
      platformType: "payment_recovery",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("no bloquea a otro destinatario", () => {
    const out = alreadySentByRestaurant({
      sends: [rsend("winback", "5599999999", "2026-02-15T17:00:00.000Z")],
      platformType: "reactivation",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("reconoce el mismo número aunque venga con el 52 y en otro formato", () => {
    const out = alreadySentByRestaurant({
      sends: [rsend("birthday", "52 55 1234 5678", "2026-02-15T17:00:00.000Z")],
      platformType: "birthday",
      recipient: "+525512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(true)
  })

  it("ignora filas incompletas (automatización borrada, sin teléfono o sin fecha)", () => {
    const out = alreadySentByRestaurant({
      sends: [
        rsend(null, "5512345678", "2026-02-15T17:00:00.000Z"),
        rsend("winback", null, "2026-02-15T17:00:00.000Z"),
        rsend("winback", "5512345678", null),
        rsend("winback", "5512345678", "no-es-fecha"),
      ],
      platformType: "reactivation",
      recipient: "5512345678",
      timezone: TZ,
      now: NOW,
    })
    expect(out).toBe(false)
  })

  it("devuelve false sin envíos y con un destinatario inservible", () => {
    expect(
      alreadySentByRestaurant({
        sends: [],
        platformType: "reactivation",
        recipient: "5512345678",
        timezone: TZ,
        now: NOW,
      })
    ).toBe(false)

    expect(
      alreadySentByRestaurant({
        sends: [rsend("winback", "5512345678", "2026-02-15T17:00:00.000Z")],
        platformType: "reactivation",
        recipient: "12345",
        timezone: TZ,
        now: NOW,
      })
    ).toBe(false)
  })

  it("la zona del restaurante decide qué es hoy: 01:00 y 22:00 del mismo día en CDMX caen en días UTC distintos", () => {
    // 2026-02-15 07:00 UTC = 2026-02-15 01:00 en CDMX.
    const sentEarly = "2026-02-15T07:00:00.000Z"
    // 2026-02-16 04:00 UTC = 2026-02-15 22:00 en CDMX.
    const nowLate = new Date("2026-02-16T04:00:00.000Z")

    // En CDMX los dos instantes son el día 15: el envío de hoy bloquea.
    expect(
      alreadySentByRestaurant({
        sends: [rsend("winback", "5512345678", sentEarly)],
        platformType: "reactivation",
        recipient: "5512345678",
        timezone: TZ,
        now: nowLate,
      })
    ).toBe(true)

    // El mismo par de instantes leído en UTC: son días distintos.
    expect(
      alreadySentByRestaurant({
        sends: [rsend("winback", "5512345678", sentEarly)],
        platformType: "reactivation",
        recipient: "5512345678",
        timezone: "UTC",
        now: nowLate,
      })
    ).toBe(false)
  })
})
