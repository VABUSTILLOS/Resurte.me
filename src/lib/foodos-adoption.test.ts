import { describe, expect, it } from "vitest"
import {
  ADOPTION_WINDOW_DAYS,
  bucketUsage,
  computeFeatureAdoption,
  summarizeAdoption,
  type FeatureActivity,
  type RestaurantFeatureState,
} from "@/lib/foodos-adoption"
import type { FoodosFeature } from "@/lib/foodos-entitlements"

// Reloj fijo: 2026-02-15T12:00:00Z. La ventana reciente empieza 7 días antes.
const NOW = new Date("2026-02-15T12:00:00.000Z")

function daysAgo(n: number, hours = 0): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000).toISOString()
}

function restaurant(
  id: string,
  unlocked: FoodosFeature[],
  name = `Restaurante ${id}`
): RestaurantFeatureState {
  return { restaurantId: id, name, unlocked }
}

function activity(
  restaurantId: string,
  feature: FoodosFeature,
  partial: Partial<Omit<FeatureActivity, "restaurantId" | "feature">> = {}
): FeatureActivity {
  return {
    restaurantId,
    feature,
    uses: 0,
    usesRecent: 0,
    usesPrior: 0,
    lastUsedAt: null,
    ...partial,
  }
}

describe("ADOPTION_WINDOW_DAYS", () => {
  it("es 7 para que la retención se mida contra la semana anterior", () => {
    expect(ADOPTION_WINDOW_DAYS).toBe(7)
  })
})

describe("bucketUsage", () => {
  it("sin timestamps devuelve todo en cero y sin fecha", () => {
    expect(bucketUsage([], NOW)).toEqual({
      uses: 0,
      usesRecent: 0,
      usesPrior: 0,
      lastUsedAt: null,
    })
  })

  it("cuenta un uso de hoy como reciente", () => {
    const out = bucketUsage([daysAgo(0, 1)], NOW)
    expect(out.uses).toBe(1)
    expect(out.usesRecent).toBe(1)
    expect(out.usesPrior).toBe(0)
    expect(out.lastUsedAt).toBe(daysAgo(0, 1))
  })

  it("cuenta un uso de hace 10 días como previo, no reciente", () => {
    const out = bucketUsage([daysAgo(10)], NOW)
    expect(out.uses).toBe(1)
    expect(out.usesRecent).toBe(0)
    expect(out.usesPrior).toBe(1)
  })

  it("ignora un uso de hace 20 días: queda fuera de las dos ventanas", () => {
    const out = bucketUsage([daysAgo(20)], NOW)
    expect(out.uses).toBe(1)
    expect(out.usesRecent).toBe(0)
    expect(out.usesPrior).toBe(0)
  })

  it("el borde de la ventana reciente entra (justo 7 días)", () => {
    expect(bucketUsage([daysAgo(7)], NOW).usesRecent).toBe(1)
  })

  it("un segundo antes del borde ya es previo", () => {
    const just = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000 - 1000).toISOString()
    expect(bucketUsage([just], NOW).usesRecent).toBe(0)
    expect(bucketUsage([just], NOW).usesPrior).toBe(1)
  })

  it("reparte timestamps mixtos entre las dos ventanas", () => {
    const out = bucketUsage([daysAgo(1), daysAgo(2), daysAgo(9), daysAgo(20)], NOW)
    expect(out.uses).toBe(4)
    expect(out.usesRecent).toBe(2)
    expect(out.usesPrior).toBe(1)
  })

  it("lastUsedAt es el más reciente, no el último de la lista", () => {
    const out = bucketUsage([daysAgo(9), daysAgo(1), daysAgo(4)], NOW)
    expect(out.lastUsedAt).toBe(daysAgo(1))
  })

  it("ignora nulos, undefined y fechas inválidas sin contarlos como uso", () => {
    const out = bucketUsage([null, undefined, "no es fecha", "", daysAgo(1)], NOW)
    expect(out.uses).toBe(1)
    expect(out.usesRecent).toBe(1)
  })
})

describe("computeFeatureAdoption", () => {
  it("sin restaurantes toda capacidad queda en cero y sin dividir entre cero", () => {
    const out = computeFeatureAdoption([], [])
    expect(out.length).toBeGreaterThan(0)
    for (const row of out) {
      expect(row.unlocked).toBe(0)
      expect(row.activationRate).toBe(0)
      expect(row.weeklyActiveRate).toBe(0)
      expect(row.retentionRate).toBe(0)
    }
  })

  it("devuelve una fila por capacidad en el orden canónico", () => {
    const out = computeFeatureAdoption([], [])
    const features = out.map((r) => r.feature)
    expect(new Set(features).size).toBe(features.length)
  })

  it("una capacidad que nadie tiene abierta no cuenta como adopción", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["marketing_ia"])],
      [activity("r1", "mesero_ia", { uses: 9, usesRecent: 9 })]
    )
    const mesero = out.find((r) => r.feature === "mesero_ia")
    expect(mesero?.unlocked).toBe(0)
    expect(mesero?.activated).toBe(0)
    expect(mesero?.activationRate).toBe(0)
  })

  it("una capacidad abierta y nunca usada baja la activación", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["marketing_ia"]), restaurant("r2", ["marketing_ia"])],
      [activity("r1", "marketing_ia", { uses: 3, usesRecent: 3, lastUsedAt: daysAgo(1) })]
    )
    const mkt = out.find((r) => r.feature === "marketing_ia")
    expect(mkt?.unlocked).toBe(2)
    expect(mkt?.activated).toBe(1)
    expect(mkt?.activationRate).toBe(50)
    expect(mkt?.weeklyActiveRate).toBe(50)
  })

  it("activación y uso semanal divergen cuando el uso es viejo", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["flotilla"])],
      [activity("r1", "flotilla", { uses: 5, usesRecent: 0, usesPrior: 0, lastUsedAt: daysAgo(30) })]
    )
    const flotilla = out.find((r) => r.feature === "flotilla")
    expect(flotilla?.activationRate).toBe(100)
    expect(flotilla?.weeklyActiveRate).toBe(0)
  })

  it("retención al 100 cuando usó en las dos ventanas", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["wallet_passes"])],
      [
        activity("r1", "wallet_passes", {
          uses: 4,
          usesRecent: 2,
          usesPrior: 2,
          lastUsedAt: daysAgo(1),
        }),
      ]
    )
    const wallet = out.find((r) => r.feature === "wallet_passes")
    expect(wallet?.activeRecent).toBe(1)
    expect(wallet?.retained).toBe(1)
    expect(wallet?.retentionRate).toBe(100)
  })

  it("retención 0 cuando solo usó en la ventana reciente", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["wallet_passes"])],
      [
        activity("r1", "wallet_passes", {
          uses: 2,
          usesRecent: 2,
          usesPrior: 0,
          lastUsedAt: daysAgo(2),
        }),
      ]
    )
    const wallet = out.find((r) => r.feature === "wallet_passes")
    expect(wallet?.activeRecent).toBe(1)
    expect(wallet?.retained).toBe(0)
    expect(wallet?.retentionRate).toBe(0)
  })

  it("retención es 0 sin activos recientes, no NaN", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["pos_integraciones"])],
      [
        activity("r1", "pos_integraciones", {
          uses: 1,
          usesRecent: 0,
          usesPrior: 1,
          lastUsedAt: daysAgo(9),
        }),
      ]
    )
    const pos = out.find((r) => r.feature === "pos_integraciones")
    expect(pos?.activeRecent).toBe(0)
    expect(pos?.retentionRate).toBe(0)
    expect(Number.isNaN(pos?.retentionRate as number)).toBe(false)
  })

  it("suma la actividad de varias fuentes para el mismo restaurante y capacidad", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["mesero_ia"])],
      [
        activity("r1", "mesero_ia", { uses: 3, usesRecent: 2, usesPrior: 1, lastUsedAt: daysAgo(1) }),
        activity("r1", "mesero_ia", { uses: 2, usesRecent: 1, usesPrior: 1, lastUsedAt: daysAgo(3) }),
      ]
    )
    const mesero = out.find((r) => r.feature === "mesero_ia")
    // Sumadas, no pisadas: el segundo registro no borra al primero.
    expect(mesero?.activated).toBe(1)
    expect(mesero?.retained).toBe(1)
    expect(mesero?.usage.current).toBe(3)
    expect(mesero?.usage.previous).toBe(2)
  })

  it("el conteo por restaurante no se duplica aunque haya varias fuentes", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["mesero_ia"]), restaurant("r2", ["mesero_ia"])],
      [
        activity("r1", "mesero_ia", { uses: 1, usesRecent: 1, lastUsedAt: daysAgo(1) }),
        activity("r1", "mesero_ia", { uses: 1, usesRecent: 1, lastUsedAt: daysAgo(2) }),
      ]
    )
    const mesero = out.find((r) => r.feature === "mesero_ia")
    expect(mesero?.unlocked).toBe(2)
    expect(mesero?.activated).toBe(1)
    expect(mesero?.activationRate).toBe(50)
  })

  it("actividad negativa se trata como cero en vez de restar", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["catering"])],
      [
        activity("r1", "catering", {
          uses: -5,
          usesRecent: -2,
          usesPrior: -3,
          lastUsedAt: daysAgo(1),
        }),
      ]
    )
    const catering = out.find((r) => r.feature === "catering")
    expect(catering?.activated).toBe(0)
    expect(catering?.activationRate).toBe(0)
    expect(catering?.usage.current).toBe(0)
  })

  it("redondea a un decimal sin dejar colas de coma flotante", () => {
    const restaurants = [1, 2, 3].map((i) => restaurant(`r${i}`, ["marketing_ia"]))
    const out = computeFeatureAdoption(
      restaurants,
      [activity("r1", "marketing_ia", { uses: 1, usesRecent: 1, lastUsedAt: daysAgo(1) })]
    )
    const mkt = out.find((r) => r.feature === "marketing_ia")
    expect(mkt?.activationRate).toBe(33.3)
    expect(mkt?.weeklyActiveRate).toBe(33.3)
  })

  it("reporta el uso de la ventana contra la previa", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["sitio_ia"])],
      [
        activity("r1", "sitio_ia", {
          uses: 6,
          usesRecent: 4,
          usesPrior: 2,
          lastUsedAt: daysAgo(1),
        }),
      ]
    )
    const sitio = out.find((r) => r.feature === "sitio_ia")
    expect(sitio?.usage.current).toBe(4)
    expect(sitio?.usage.previous).toBe(2)
    expect(sitio?.usage.deltaPct).toBe(100)
    expect(sitio?.usage.direction).toBe("up")
  })

  it("sin base previa el cambio es null, no infinito", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["app_marca"])],
      [activity("r1", "app_marca", { uses: 2, usesRecent: 2, usesPrior: 0, lastUsedAt: daysAgo(1) })]
    )
    const app = out.find((r) => r.feature === "app_marca")
    expect(app?.usage.deltaPct).toBeNull()
  })

  it("sin uso reciente ni previo cuenta el histórico como previo para el cambio", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", ["flotilla"])],
      [
        activity("r1", "flotilla", {
          uses: 3,
          usesRecent: 0,
          usesPrior: 3,
          lastUsedAt: daysAgo(10),
        }),
      ]
    )
    const flotilla = out.find((r) => r.feature === "flotilla")
    expect(flotilla?.usage.current).toBe(0)
    expect(flotilla?.usage.previous).toBe(3)
    expect(flotilla?.usage.direction).toBe("down")
  })

  it("un restaurante con la capacidad abierta pero sin fila de actividad cuenta como no usada", () => {
    const out = computeFeatureAdoption([restaurant("r1", ["marketing_ia"])], [])
    const mkt = out.find((r) => r.feature === "marketing_ia")
    expect(mkt?.unlocked).toBe(1)
    expect(mkt?.activated).toBe(0)
    expect(mkt?.activationRate).toBe(0)
  })

  it("un restaurante con la capacidad cerrada no aparece en su denominador", () => {
    const out = computeFeatureAdoption(
      [restaurant("r1", []), restaurant("r2", ["marketing_ia"])],
      []
    )
    const mkt = out.find((r) => r.feature === "marketing_ia")
    expect(mkt?.unlocked).toBe(1)
  })

  it("el nivel más alto abre más capacidades y por eso infla los denominadores", () => {
    const out = computeFeatureAdoption(
      [
        restaurant("verde", []),
        restaurant("plata", ["marketing_ia"]),
        restaurant("diamante", [
          "marketing_ia",
          "flotilla",
          "mesero_ia",
          "wallet_passes",
          "app_marca",
          "sitio_ia",
          "pos_integraciones",
          "catering",
        ]),
      ],
      []
    )
    const mkt = out.find((r) => r.feature === "marketing_ia")
    const catering = out.find((r) => r.feature === "catering")
    expect(mkt?.unlocked).toBe(2)
    expect(catering?.unlocked).toBe(1)
  })
})

describe("summarizeAdoption", () => {
  it("sin restaurantes todo en cero", () => {
    expect(summarizeAdoption([], [])).toEqual({
      restaurants: 0,
      activeRestaurants: 0,
      dormantRestaurants: 0,
      averageUnlocked: 0,
    })
  })

  it("cuenta como activos solo los que usaron algo en la ventana reciente", () => {
    const out = summarizeAdoption(
      [restaurant("r1", ["marketing_ia"]), restaurant("r2", ["marketing_ia"])],
      [
        activity("r1", "marketing_ia", { uses: 1, usesRecent: 1, lastUsedAt: daysAgo(1) }),
        activity("r2", "marketing_ia", { uses: 1, usesRecent: 0, usesPrior: 1, lastUsedAt: daysAgo(9) }),
      ]
    )
    expect(out.restaurants).toBe(2)
    expect(out.activeRestaurants).toBe(1)
  })

  it("un restaurante sin uso histórico y con capacidades abiertas está dormido", () => {
    const out = summarizeAdoption(
      [restaurant("r1", ["marketing_ia", "flotilla"]), restaurant("r2", ["marketing_ia"])],
      [activity("r2", "marketing_ia", { uses: 1, usesRecent: 1, lastUsedAt: daysAgo(1) })]
    )
    expect(out.dormantRestaurants).toBe(1)
  })

  it("un restaurante con uso viejo no está dormido: ya adoptó", () => {
    const out = summarizeAdoption(
      [restaurant("r1", ["marketing_ia"])],
      [
        activity("r1", "marketing_ia", {
          uses: 1,
          usesRecent: 0,
          usesPrior: 0,
          lastUsedAt: daysAgo(40),
        }),
      ]
    )
    expect(out.dormantRestaurants).toBe(0)
    expect(out.activeRestaurants).toBe(0)
  })

  it("un restaurante sin ninguna capacidad abierta no está dormido", () => {
    const out = summarizeAdoption([restaurant("r1", [])], [])
    expect(out.dormantRestaurants).toBe(0)
  })

  it("el promedio de capacidades abiertas no es un porcentaje", () => {
    const out = summarizeAdoption(
      [
        restaurant("r1", ["marketing_ia"]),
        restaurant("r2", ["marketing_ia", "flotilla"]),
        restaurant("r3", []),
      ],
      []
    )
    // 3 capacidades abiertas entre 3 restaurantes: 1.0 por restaurante, no 100%.
    expect(out.averageUnlocked).toBe(1)
  })

  it("el promedio de capacidades abiertas se redondea a un decimal", () => {
    const out = summarizeAdoption(
      [
        restaurant("r1", ["marketing_ia", "flotilla", "mesero_ia"]),
        restaurant("r2", ["marketing_ia"]),
        restaurant("r3", []),
      ],
      []
    )
    expect(out.averageUnlocked).toBe(1.3)
  })

  it("el promedio es 0 sin restaurantes en vez de NaN", () => {
    expect(summarizeAdoption([], []).averageUnlocked).toBe(0)
  })
})
