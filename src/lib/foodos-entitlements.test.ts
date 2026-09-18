import { describe, expect, it } from "vitest"
import type { CashbackTier } from "@/types"
import {
  asCashbackTier,
  canUseFeature,
  PUBLIC_TIER_LADDER,
  QUALIFYING_WEEK_MIN,
  effectiveTier,
  earnedTierFromOrders,
  FEATURE_MIN_TIER,
  FOODOS_FEATURES,
  FOODOS_FEATURE_ORDER,
  featuresForTier,
  featuresUnlockedByNextTier,
  hasFeature,
  isCashbackTier,
  lockedFeatures,
  lockedTierFor,
  minTierFor,
  nextTier,
  summarizeEntitlements,
  TIER_LABEL_KEY,
  TIER_RANK,
  type FoodosFeature,
} from "@/lib/foodos-entitlements"

const ALL_TIERS: CashbackTier[] = ["Verde", "Plata", "Oro", "Diamante"]
const ALL_FEATURES = Object.keys(FEATURE_MIN_TIER) as FoodosFeature[]

describe("FEATURE_MIN_TIER", () => {
  it("cada capacidad declara un nivel conocido", () => {
    for (const feature of ALL_FEATURES) {
      expect(isCashbackTier(FEATURE_MIN_TIER[feature])).toBe(true)
    }
  })

  it("respeta la regla del producto: Plata marketing, Oro cobrar y operar, Diamante el resto", () => {
    expect(FEATURE_MIN_TIER.marketing_ia).toBe("Plata")
    // Oro es "el restaurante cobra y opera": flotilla, POS de mostrador y comandero.
    expect(FEATURE_MIN_TIER.flotilla).toBe("Oro")
    expect(FEATURE_MIN_TIER.pos_mostrador).toBe("Oro")
    expect(FEATURE_MIN_TIER.comandero).toBe("Oro")
    for (const feature of ALL_FEATURES) {
      if (
        feature === "marketing_ia" ||
        feature === "flotilla" ||
        feature === "pos_mostrador" ||
        feature === "comandero"
      ) {
        continue
      }
      expect(FEATURE_MIN_TIER[feature]).toBe("Diamante")
    }
  })

  it("lo caro de operar no se desbloquea antes de Diamante", () => {
    // El costo real (IA de salón, sitio, integraciones ajenas) sigue arriba.
    for (const feature of ["mesero_ia", "sitio_ia", "pos_integraciones"] as FoodosFeature[]) {
      expect(FEATURE_MIN_TIER[feature]).toBe("Diamante")
    }
  })

  it("ninguna capacidad se desbloquea en Verde", () => {
    expect(featuresForTier("Verde")).toEqual([])
    expect(lockedFeatures("Verde")).toHaveLength(ALL_FEATURES.length)
  })

  it("FOODOS_FEATURES cubre exactamente las capacidades declaradas", () => {
    expect(Object.keys(FOODOS_FEATURES).sort()).toEqual([...ALL_FEATURES].sort())
    for (const feature of ALL_FEATURES) {
      const info = FOODOS_FEATURES[feature]
      expect(info.feature).toBe(feature)
      expect(info.labelKey).toMatch(/^foodos\.entitlements\./)
      expect(info.descriptionKey).toMatch(/^foodos\.entitlements\./)
      expect(info.minTier).toBe(FEATURE_MIN_TIER[feature])
    }
  })

  it("las claves i18n de features y niveles son únicas", () => {
    const keys = [
      ...ALL_FEATURES.flatMap((f) => [
        FOODOS_FEATURES[f].labelKey,
        FOODOS_FEATURES[f].descriptionKey,
      ]),
      ...ALL_TIERS.map((t) => TIER_LABEL_KEY[t]),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe("TIER_LABEL_KEY", () => {
  it("cubre los 4 niveles", () => {
    for (const tier of ALL_TIERS) {
      expect(TIER_LABEL_KEY[tier]).toBe(`foodos.entitlements.tier${tier}`)
    }
  })
})

describe("TIER_RANK", () => {
  it("ordena los 4 niveles de forma estrictamente creciente", () => {
    expect(ALL_TIERS.map((t) => TIER_RANK[t])).toEqual([1, 2, 3, 4])
  })
})

describe("hasFeature", () => {
  it("es monótono: subir de nivel nunca quita capacidades", () => {
    for (let i = 1; i < ALL_TIERS.length; i++) {
      const lower = featuresForTier(ALL_TIERS[i - 1]!)
      const higher = featuresForTier(ALL_TIERS[i]!)
      for (const f of lower) expect(higher).toContain(f)
      expect(higher.length).toBeGreaterThan(lower.length)
    }
  })

  it("Diamante tiene todo", () => {
    for (const feature of ALL_FEATURES) {
      expect(hasFeature("Diamante", feature)).toBe(true)
    }
    expect(lockedFeatures("Diamante")).toEqual([])
  })

  it("Plata abre marketing pero no flotilla ni mesero IA", () => {
    expect(hasFeature("Plata", "marketing_ia")).toBe(true)
    expect(hasFeature("Plata", "flotilla")).toBe(false)
    expect(hasFeature("Plata", "mesero_ia")).toBe(false)
  })

  it("Oro abre flotilla, POS de mostrador y comandero, pero no mesero IA", () => {
    expect(hasFeature("Oro", "flotilla")).toBe(true)
    expect(hasFeature("Oro", "pos_mostrador")).toBe(true)
    expect(hasFeature("Oro", "comandero")).toBe(true)
    expect(hasFeature("Oro", "mesero_ia")).toBe(false)
    // Lo que se apoya en volumen ya probado sigue en Diamante.
    expect(hasFeature("Oro", "sitio_ia")).toBe(false)
  })
})

describe("FOODOS_FEATURE_ORDER", () => {
  it("ordena por nivel ascendente y cubre todas las capacidades sin repetir", () => {
    expect(FOODOS_FEATURE_ORDER).toHaveLength(ALL_FEATURES.length)
    expect(new Set(FOODOS_FEATURE_ORDER).size).toBe(ALL_FEATURES.length)
    const ranks = FOODOS_FEATURE_ORDER.map((f) => TIER_RANK[minTierFor(f)])
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]!).toBeGreaterThanOrEqual(ranks[i - 1]!)
    }
  })
})

describe("nextTier", () => {
  it("escala Verde→Plata→Oro→Diamante y tope en Diamante", () => {
    expect(nextTier("Verde")).toBe("Plata")
    expect(nextTier("Plata")).toBe("Oro")
    expect(nextTier("Oro")).toBe("Diamante")
    expect(nextTier("Diamante")).toBeNull()
  })
})

describe("featuresUnlockedByNextTier", () => {
  it("Verde→Plata abre solo marketing", () => {
    expect(featuresUnlockedByNextTier("Verde")).toEqual(["marketing_ia"])
  })

  it("Plata→Oro abre lo que hace cobrar y operar", () => {
    expect(featuresUnlockedByNextTier("Plata")).toEqual([
      "flotilla",
      "pos_mostrador",
      "comandero",
    ])
  })

  it("Oro→Diamante abre todo lo que queda", () => {
    const unlocked = featuresUnlockedByNextTier("Oro")
    expect(unlocked).toEqual(lockedFeatures("Oro"))
    expect(unlocked).not.toContain("marketing_ia")
    expect(unlocked).not.toContain("flotilla")
    expect(unlocked).not.toContain("pos_mostrador")
    expect(unlocked).not.toContain("comandero")
    expect(unlocked).toContain("mesero_ia")
  })

  it("en el tope no promete nada", () => {
    expect(featuresUnlockedByNextTier("Diamante")).toEqual([])
  })
})

describe("asCashbackTier / isCashbackTier", () => {
  it("acepta los 4 niveles y normaliza lo desconocido a Verde", () => {
    for (const tier of ALL_TIERS) {
      expect(asCashbackTier(tier)).toBe(tier)
      expect(isCashbackTier(tier)).toBe(true)
    }
    expect(asCashbackTier("platino")).toBe("Verde")
    expect(asCashbackTier(null)).toBe("Verde")
    expect(asCashbackTier(undefined)).toBe("Verde")
    expect(asCashbackTier("")).toBe("Verde")
    expect(isCashbackTier(3)).toBe(false)
  })
})

describe("summarizeEntitlements", () => {
  it("particiona available + locked sin traslape y expone el siguiente nivel", () => {
    for (const tier of ALL_TIERS) {
      const summary = summarizeEntitlements(tier)
      expect(summary.tier).toBe(tier)
      expect(summary.available.length + summary.locked.length).toBe(ALL_FEATURES.length)
      for (const f of summary.available) expect(summary.locked).not.toContain(f)
      expect(summary.nextTier).toBe(nextTier(tier))
      expect(summary.unlocksNext).toEqual(featuresUnlockedByNextTier(tier))
    }
  })
})

// ============================================================
// Nivel ganado por compras (puro, con `now` inyectado)
// ============================================================

// Martes 27 de enero de 2026, 12:00 en CDMX -> semana ISO 2026-W05.
const NOW = new Date("2026-01-27T18:00:00Z")
const QUALIFYING = 2500

/** Orden pagada en la fecha dada, a las 12:00 hora de CDMX. */
function order(day: string, total: number) {
  return { created_at: `${day}T18:00:00Z`, total }
}

describe("earnedTierFromOrders", () => {
  it("sin compras se queda en Verde", () => {
    const { tier, progress } = earnedTierFromOrders([], NOW)
    expect(tier).toBe("Verde")
    expect(progress.qualifyingWeeksThisMonth).toBe(0)
  })

  it("una sola semana calificante todavía es Verde", () => {
    const { tier } = earnedTierFromOrders([order("2026-01-27", QUALIFYING)], NOW)
    expect(tier).toBe("Verde")
  })

  it("dos semanas calificantes dan Plata", () => {
    const { tier } = earnedTierFromOrders(
      [order("2026-01-20", QUALIFYING), order("2026-01-27", QUALIFYING)],
      NOW
    )
    expect(tier).toBe("Plata")
  })

  it("tres semanas calificantes dan Oro", () => {
    const { tier } = earnedTierFromOrders(
      [
        order("2026-01-13", QUALIFYING),
        order("2026-01-20", QUALIFYING),
        order("2026-01-27", QUALIFYING),
      ],
      NOW
    )
    expect(tier).toBe("Oro")
  })

  it("cuatro semanas calificantes dan Diamante", () => {
    const { tier, progress } = earnedTierFromOrders(
      [
        order("2026-01-06", QUALIFYING),
        order("2026-01-13", QUALIFYING),
        order("2026-01-20", QUALIFYING),
        order("2026-01-27", QUALIFYING),
      ],
      NOW
    )
    expect(tier).toBe("Diamante")
    expect(progress.weeksToNextTier).toBeNull()
  })

  it("varias compras pequeñas en la misma semana no califican", () => {
    const { tier } = earnedTierFromOrders(
      [
        order("2026-01-06", 600),
        order("2026-01-07", 600),
        order("2026-01-13", 600),
        order("2026-01-14", 600),
        order("2026-01-20", 600),
        order("2026-01-21", 600),
        order("2026-01-27", 600),
        order("2026-01-28", 600),
      ],
      NOW
    )
    expect(tier).toBe("Verde")
  })

  it("las compras del mes anterior no cuentan para las semanas de este mes", () => {
    const { tier } = earnedTierFromOrders(
      [
        order("2025-12-02", QUALIFYING),
        order("2025-12-09", QUALIFYING),
        order("2025-12-16", QUALIFYING),
        order("2025-12-23", QUALIFYING),
      ],
      NOW
    )
    expect(tier).toBe("Verde")
  })
})

describe("effectiveTier", () => {
  it("sin override devuelve el nivel ganado", () => {
    expect(effectiveTier("Plata", null, NOW)).toEqual({ tier: "Plata", overridden: false })
    expect(effectiveTier("Plata", undefined, NOW)).toEqual({
      tier: "Plata",
      overridden: false,
    })
  })

  it("un override vigente gana sobre el nivel ganado", () => {
    expect(effectiveTier("Verde", { tier: "Oro", expires_at: null }, NOW)).toEqual({
      tier: "Oro",
      overridden: true,
    })
  })

  it("un override vencido se ignora", () => {
    expect(
      effectiveTier("Plata", { tier: "Diamante", expires_at: "2026-01-01T00:00:00Z" }, NOW)
    ).toEqual({ tier: "Plata", overridden: false })
  })

  it("un override que expira justo ahora se ignora", () => {
    expect(
      effectiveTier("Plata", { tier: "Diamante", expires_at: NOW.toISOString() }, NOW)
    ).toEqual({ tier: "Plata", overridden: false })
  })

  it("un override sin fecha no expira", () => {
    expect(effectiveTier("Verde", { tier: "Diamante" }, NOW)).toEqual({
      tier: "Diamante",
      overridden: true,
    })
  })

  it("un override a Verde no degrada el nivel ganado", () => {
    expect(effectiveTier("Oro", { tier: "Verde" }, NOW)).toEqual({
      tier: "Oro",
      overridden: false,
    })
  })

  it("un tier de override desconocido no degrada el nivel ganado", () => {
    expect(effectiveTier("Oro", { tier: "platino" }, NOW)).toEqual({
      tier: "Oro",
      overridden: false,
    })
  })
})

describe("PUBLIC_TIER_LADDER", () => {
  it("publica los cuatro niveles en orden ascendente", () => {
    expect(PUBLIC_TIER_LADDER.map((t) => t.tier)).toEqual(["Verde", "Plata", "Oro", "Diamante"])
  })

  it("los requisitos coinciden con el escalón de recompensas", () => {
    expect(PUBLIC_TIER_LADDER.map((t) => t.weeks)).toEqual([0, 2, 3, 4])
  })

  it("el cashback coincide con el del nivel, no con el de las capacidades", () => {
    expect(PUBLIC_TIER_LADDER.map((t) => t.cashbackPct)).toEqual([5, 10, 15, 20])
  })

  it("las capacidades de cada nivel coinciden con featuresForTier", () => {
    for (const entry of PUBLIC_TIER_LADDER) {
      expect(entry.features).toEqual(featuresForTier(entry.tier))
    }
  })

  it("Verde no abre ninguna capacidad premium", () => {
    const verde = PUBLIC_TIER_LADDER[0]
    expect(verde?.features).toEqual([])
  })

  it("Diamante abre todo el catálogo", () => {
    const diamante = PUBLIC_TIER_LADDER[3]
    expect(diamante?.features).toEqual(FOODOS_FEATURE_ORDER)
  })

  it("el mínimo que califica una semana se re-exporta desde utils", () => {
    expect(QUALIFYING_WEEK_MIN).toBe(2500)
  })
})

describe("canUseFeature / lockedTierFor", () => {
  // Invariante "ver vs usar": el nivel decide si se puede USAR, nunca si se
  // ve. La capa de presentación renderiza la herramienta completa en cualquier
  // nivel y solo consulta estos dos predicados al ejecutar una escritura.
  it("coincide con hasFeature para un restaurantero", () => {
    for (const tier of ALL_TIERS) {
      for (const feature of FOODOS_FEATURE_ORDER) {
        expect(canUseFeature(tier, feature)).toBe(hasFeature(tier, feature))
      }
    }
  })

  it("el admin de plataforma puede usar todo, incluso en Verde", () => {
    for (const feature of FOODOS_FEATURE_ORDER) {
      expect(canUseFeature("Verde", feature, { isAdmin: true })).toBe(true)
    }
  })

  it("isAdmin explícito en false no abre nada extra", () => {
    expect(canUseFeature("Verde", "comandero", { isAdmin: false })).toBe(false)
    expect(canUseFeature("Diamante", "comandero", { isAdmin: false })).toBe(true)
  })

  it("lockedTierFor devuelve el nivel que falta", () => {
    expect(lockedTierFor("Verde", "comandero")).toBe("Oro")
    expect(lockedTierFor("Verde", "pos_mostrador")).toBe("Oro")
    expect(lockedTierFor("Verde", "flotilla")).toBe("Oro")
    expect(lockedTierFor("Verde", "mesero_ia")).toBe("Diamante")
    expect(lockedTierFor("Plata", "marketing_ia")).toBeNull()
  })

  it("lockedTierFor es null para el admin en cualquier nivel", () => {
    for (const feature of FOODOS_FEATURE_ORDER) {
      expect(lockedTierFor("Verde", feature, { isAdmin: true })).toBeNull()
    }
  })

  it("en Verde, ninguna capacidad premium es usable sin ser admin", () => {
    for (const feature of FOODOS_FEATURE_ORDER) {
      expect(canUseFeature("Verde", feature)).toBe(false)
      expect(lockedTierFor("Verde", feature)).not.toBeNull()
    }
  })
})
