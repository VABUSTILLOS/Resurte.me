import { describe, expect, it } from "vitest"
import { FEATURE_MIN_TIER } from "@/lib/foodos-entitlements"
import {
  describeLeadDiagnosis,
  isLeadChannel,
  isLeadPain,
  LEAD_CHANNELS,
  LEAD_PAINS,
  normalizeLeadAnswers,
  qualifyLead,
  type LeadAnswers,
} from "@/lib/lead-qualification"

const HOT: LeadAnswers = {
  weeklyOrders: 250,
  averageTicket: 300,
  channels: ["apps_delivery", "whatsapp"],
  biggestPain: "comisiones",
  usesDeliveryApp: true,
}

describe("normalizeLeadAnswers", () => {
  it("devuelve un lead vacío ante entrada ausente", () => {
    expect(normalizeLeadAnswers(null)).toEqual({
      weeklyOrders: 0,
      averageTicket: 0,
      channels: [],
      biggestPain: "ninguno",
      usesDeliveryApp: false,
    })
    expect(normalizeLeadAnswers({})).toEqual(normalizeLeadAnswers(null))
  })

  it("descarta canales desconocidos y duplicados", () => {
    const result = normalizeLeadAnswers({
      channels: ["whatsapp", "whatsapp", "tiktok", "telefono", 7] as never,
    })
    expect(result.channels).toEqual(["whatsapp", "telefono"])
  })

  it("cae a 'ninguno' con un dolor desconocido", () => {
    expect(normalizeLeadAnswers({ biggestPain: "hackear" as never }).biggestPain).toBe("ninguno")
  })

  it("trunca a entero y acota a los límites", () => {
    const result = normalizeLeadAnswers({
      weeklyOrders: 999_999,
      averageTicket: 12.9,
    })
    expect(result.weeklyOrders).toBe(20_000)
    expect(result.averageTicket).toBe(12)
    expect(normalizeLeadAnswers({ weeklyOrders: -4 }).weeklyOrders).toBe(0)
  })

  it("respeta el flag explícito de app de delivery", () => {
    expect(normalizeLeadAnswers({ usesDeliveryApp: true }).usesDeliveryApp).toBe(true)
    expect(normalizeLeadAnswers({ usesDeliveryApp: false }).usesDeliveryApp).toBe(false)
  })

  it("infiere 'vende por app' del canal cuando el flag no viene", () => {
    expect(normalizeLeadAnswers({ channels: ["apps_delivery"] }).usesDeliveryApp).toBe(true)
    expect(normalizeLeadAnswers({ channels: ["mostrador"] }).usesDeliveryApp).toBe(false)
    expect(normalizeLeadAnswers({}).usesDeliveryApp).toBe(false)
  })

  it("un canal descartado no infiere nada", () => {
    expect(normalizeLeadAnswers({ channels: ["tiktok"] as never }).usesDeliveryApp).toBe(false)
  })
})

describe("guardas de tipo", () => {
  it("reconoce solo canales y dolores del catálogo", () => {
    for (const channel of LEAD_CHANNELS) expect(isLeadChannel(channel)).toBe(true)
    for (const pain of LEAD_PAINS) expect(isLeadPain(pain)).toBe(true)
    expect(isLeadChannel("tiktok")).toBe(false)
    expect(isLeadPain("comisiones_altas")).toBe(false)
    expect(isLeadChannel(1)).toBe(false)
    expect(isLeadPain(null)).toBe(false)
  })
})

describe("qualifyLead — puntaje y segmento", () => {
  it("un restaurante con volumen y comisión alta es segmento A", () => {
    const lead = qualifyLead(HOT)
    expect(lead.score).toBe(86)
    expect(lead.segment).toBe("A")
  })

  it("un restaurante chico y sin dolor declarado es segmento C", () => {
    const lead = qualifyLead({ weeklyOrders: 5, averageTicket: 80 })
    expect(lead.score).toBe(12)
    expect(lead.segment).toBe("C")
  })

  it("un restaurante mediano con dolor de reparto es segmento B", () => {
    const lead = qualifyLead({
      weeklyOrders: 100,
      averageTicket: 200,
      channels: ["propio"],
      biggestPain: "reparto",
    })
    expect(lead.score).toBe(56)
    expect(lead.segment).toBe("B")
  })

  it("sin respuestas el puntaje es 0 y el segmento C", () => {
    const lead = qualifyLead(null)
    expect(lead.score).toBe(0)
    expect(lead.segment).toBe("C")
    expect(lead.reasons).toEqual([])
  })

  it("con todas las casillas marcadas toca el techo de la escala (96) y nunca lo pasa", () => {
    const lead = qualifyLead({
      weeklyOrders: 500,
      averageTicket: 1_000,
      channels: [...LEAD_CHANNELS],
      biggestPain: "comisiones",
      usesDeliveryApp: true,
    })
    expect(lead.score).toBe(96)
    expect(lead.score).toBeLessThanOrEqual(100)
  })

  it("es determinista", () => {
    expect(qualifyLead(HOT)).toEqual(qualifyLead(HOT))
  })
})

describe("qualifyLead — capacidades recomendadas", () => {
  it("el dolor de comisiones abre la app de marca", () => {
    const lead = qualifyLead({ biggestPain: "comisiones" })
    expect(lead.recommendedFeatures).toContain("app_marca")
  })

  it("los pedidos perdidos abren Mesero IA", () => {
    const lead = qualifyLead({ biggestPain: "pedidos_perdidos" })
    expect(lead.recommendedFeatures).toContain("mesero_ia")
  })

  it("WhatsApp ya en uso recomienda Mesero IA sin cambiar de canal", () => {
    const lead = qualifyLead({ channels: ["whatsapp"] })
    expect(lead.recommendedFeatures).toContain("mesero_ia")
  })

  it("un restaurante sin señales recibe al menos el sitio con SEO local", () => {
    const lead = qualifyLead({ weeklyOrders: 1 })
    expect(lead.recommendedFeatures).toEqual(["sitio_ia"])
  })

  it("las capacidades salen en orden ascendente de nivel", () => {
    const lead = qualifyLead({
      weeklyOrders: 300,
      averageTicket: 300,
      channels: ["whatsapp", "propio"],
      biggestPain: "marketing",
      usesDeliveryApp: true,
    })
    const ranks = lead.recommendedFeatures.map((f) => FEATURE_MIN_TIER[f])
    expect(ranks[0]).toBe("Plata")
    // El orden debe ser no decreciente en nivel.
    const ORDER = { Verde: 0, Plata: 1, Oro: 2, Diamante: 3 } as const
    const values = ranks.map((r) => ORDER[r])
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })

  it("no repite capacidades", () => {
    const lead = qualifyLead({
      channels: ["whatsapp", "telefono"],
      biggestPain: "pedidos_perdidos",
    })
    expect(lead.recommendedFeatures).toEqual([...new Set(lead.recommendedFeatures)])
  })

  it("el nivel recomendado es el mínimo que desbloquea la primera capacidad", () => {
    const marketingOnly = qualifyLead({ biggestPain: "marketing" })
    expect(marketingOnly.recommendedFeatures).toEqual(["marketing_ia"])
    expect(marketingOnly.recommendedTier).toBe("Plata")

    const flotillaOnly = qualifyLead({ biggestPain: "reparto" })
    expect(flotillaOnly.recommendedFeatures).toEqual(["flotilla"])
    expect(flotillaOnly.recommendedTier).toBe("Oro")

    const posOnly = qualifyLead({ biggestPain: "operacion" })
    expect(posOnly.recommendedFeatures).toEqual(["pos_integraciones"])
    expect(posOnly.recommendedTier).toBe("Diamante")
  })

  it("toma el nivel MÁS ALTO de las capacidades recomendadas, no el más bajo", () => {
    const lead = qualifyLead({
      weeklyOrders: 300,
      averageTicket: 300,
      channels: ["whatsapp"],
      biggestPain: "marketing",
    })
    expect(lead.recommendedFeatures).toEqual(["marketing_ia", "mesero_ia"])
    expect(lead.recommendedTier).toBe("Diamante")
  })

  it("nunca recomienda un nivel sin capacidades que lo justifiquen", () => {
    const lead = qualifyLead({ weeklyOrders: 250, averageTicket: 300, biggestPain: "comisiones" })
    for (const feature of lead.recommendedFeatures) {
      expect(FEATURE_MIN_TIER[feature]).toBe(lead.recommendedTier)
    }
  })
})

describe("qualifyLead — motivos", () => {
  it("los motivos solo listan señales con puntos", () => {
    const lead = qualifyLead({ weeklyOrders: 250, averageTicket: 300, biggestPain: "comisiones" })
    expect(lead.reasons.length).toBeGreaterThan(0)
    for (const reason of lead.reasons) expect(reason.length).toBeGreaterThan(10)
  })

  it("un lead vacío no lista el motivo de 'no declaró'", () => {
    const lead = qualifyLead(null)
    expect(lead.reasons).not.toContain("No declaró un problema concreto.")
  })

  it("explica el problema declarado", () => {
    const lead = qualifyLead({ biggestPain: "reparto" })
    expect(lead.reasons.some((r) => r.includes("reparto propio"))).toBe(true)
  })
})

describe("describeLeadDiagnosis", () => {
  it("resume segmento, puntaje, nivel y capacidades en una línea", () => {
    const lead = qualifyLead(HOT)
    const line = describeLeadDiagnosis(lead)
    expect(line).toBe("Segmento A (86/100) · nivel Diamante · mesero_ia, app_marca")
  })
})
