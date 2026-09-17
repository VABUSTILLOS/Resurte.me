import { describe, it, expect } from "vitest"
import {
  buildCityPerformance,
  buildCityTips,
  deltaPct,
  medianAov,
  needsCatalogAttention,
  rankCities,
  scoreCity,
  tierOf,
  type CatalogAvailabilityInput,
  type CityOrderRow,
  type CityPerformanceRow,
  type CityRow,
  type TipContext,
} from "./admin-city-performance"

const CITY_ROWS: CityRow[] = [
  { id: 1, name: "Ciudad de México", is_active: true },
  { id: 2, name: "Guadalajara", is_active: true },
  { id: 3, name: "Monterrey", is_active: true },
  { id: 4, name: "Puebla", is_active: true },
]

/** Pedido pagado y entregado: el caso "bueno" por defecto. */
function order(overrides: Partial<CityOrderRow> & { city_id: number }): CityOrderRow {
  return {
    total: 500,
    status: "delivered",
    payment_status: "paid",
    source: "web",
    ...overrides,
  }
}

function orders(cityId: number, count: number, overrides: Partial<CityOrderRow> = {}): CityOrderRow[] {
  return Array.from({ length: count }, () => order({ ...overrides, city_id: cityId }))
}

describe("deltaPct", () => {
  it("calcula el cambio porcentual con un decimal", () => {
    expect(deltaPct(150, 100)).toBe(50)
    expect(deltaPct(50, 100)).toBe(-50)
    expect(deltaPct(100, 100)).toBe(0)
    expect(deltaPct(100, 300)).toBe(-66.7)
  })

  it("no inventa base cuando el periodo anterior está vacío", () => {
    expect(deltaPct(100, 0)).toBeNull()
    expect(deltaPct(0, 0)).toBeNull()
  })
})

describe("medianAov", () => {
  it("devuelve 0 sin ventas", () => {
    expect(medianAov([])).toBe(0)
    expect(medianAov([0, 0])).toBe(0)
  })

  it("ignora los ceros y promedia el centro en listas pares", () => {
    expect(medianAov([100, 0, 300, 200])).toBe(200)
    expect(medianAov([100, 200, 300])).toBe(200)
    expect(medianAov([100, 201])).toBe(150.5)
  })
})

describe("scoreCity", () => {
  const best = { revenue: 1000, orders: 10 }

  it("da 0 a una ciudad sin pedidos aunque tenga ingresos raros", () => {
    expect(
      scoreCity({ orders: 0, revenue: 0, revenueDeltaPct: null, cancellationRate: 0 }, best)
    ).toBe(0)
  })

  it("puntúa alto a la mejor ciudad del periodo cuando no hay tendencia", () => {
    // 0.4 + 0.25 + 0.1 (tendencia neutra) + 0.15 (sin cancelaciones) = 0.9
    expect(
      scoreCity(
        { orders: 10, revenue: 1000, revenueDeltaPct: null, cancellationRate: 0 },
        best
      )
    ).toBe(90)
  })

  it("castiga la caída de ingresos y las cancelaciones", () => {
    const estable = scoreCity(
      { orders: 5, revenue: 500, revenueDeltaPct: 0, cancellationRate: 0 },
      best
    )
    const enCaida = scoreCity(
      { orders: 5, revenue: 500, revenueDeltaPct: -50, cancellationRate: 30 },
      best
    )
    expect(enCaida).toBeLessThan(estable)
    // 0.4*0.5 + 0.25*0.5 + 0.2*0 + 0.15*0 = 0.325
    expect(enCaida).toBe(33)
  })

  it("acota la tendencia a los extremos de la escala", () => {
    const extremo = scoreCity(
      { orders: 1, revenue: 100, revenueDeltaPct: 500, cancellationRate: 0 },
      best
    )
    const tope = scoreCity(
      { orders: 1, revenue: 100, revenueDeltaPct: 50, cancellationRate: 0 },
      best
    )
    expect(extremo).toBe(tope)
  })

  it("no divide entre cero cuando nadie vendió", () => {
    expect(
      scoreCity(
        { orders: 1, revenue: 0, revenueDeltaPct: null, cancellationRate: 0 },
        { revenue: 0, orders: 0 }
      )
    ).toBeGreaterThanOrEqual(0)
  })
})

describe("tierOf", () => {
  it("marca sin_pedidos por encima del score", () => {
    expect(tierOf(0, 0)).toBe("sin_pedidos")
  })

  it("respeta los cortes de los tiers", () => {
    expect(tierOf(5, 70)).toBe("top")
    expect(tierOf(5, 69)).toBe("estable")
    expect(tierOf(5, 45)).toBe("estable")
    expect(tierOf(5, 44)).toBe("atencion")
  })
})

describe("needsCatalogAttention", () => {
  it("no opina si no hay catálogo de referencia", () => {
    expect(needsCatalogAttention(0, 0)).toBe(false)
  })

  it("marca la ciudad que se quedó con menos de 40% del mejor catálogo", () => {
    expect(needsCatalogAttention(30, 100)).toBe(true)
    expect(needsCatalogAttention(40, 100)).toBe(false)
  })

  it("no marca catálogos chicos cuando toda la tienda es chica", () => {
    // 15 de 15 productos: la ciudad está completa, no le falta catálogo.
    expect(needsCatalogAttention(15, 15)).toBe(false)
    // 3 de 100: cae por la regla relativa.
    expect(needsCatalogAttention(3, 100)).toBe(true)
  })

  it("usa el umbral absoluto solo si el catálogo completo da para 20 productos", () => {
    // 18 de 22 es > 40% del máximo, pero el catálogo sigue prácticamente vacío.
    expect(needsCatalogAttention(18, 22)).toBe(true)
    expect(needsCatalogAttention(18, 19)).toBe(false)
  })
})

describe("buildCityTips", () => {
  const context: TipContext = { medianAov: 500, maxCatalogCoverage: 100 }

  function row(overrides: Partial<Omit<CityPerformanceRow, "tips">> = {}): Omit<
    CityPerformanceRow,
    "tips"
  > {
    return {
      cityId: 2,
      name: "Guadalajara",
      isActive: true,
      orders: 10,
      totalOrders: 10,
      cancelled: 0,
      previousOrders: 10,
      revenue: 5000,
      previousRevenue: 5000,
      aov: 500,
      cancellationRate: 0,
      whatsappShare: 50,
      whatsappOrders: 5,
      ordersDeltaPct: 0,
      revenueDeltaPct: 0,
      catalogCoverage: 100,
      score: 80,
      tier: "top",
      ...overrides,
    }
  }

  const ids = (metrics: Omit<CityPerformanceRow, "tips">, ctx = context) =>
    buildCityTips(metrics, ctx).map((tip) => tip.id)

  it("no genera ruido en una ciudad sana", () => {
    expect(ids(row())).toEqual(["referencia"])
  })

  it("ordena las críticas antes que los informativos", () => {
    const tips = buildCityTips(
      row({
        cancellationRate: 40,
        cancelled: 4,
        totalOrders: 10,
        whatsappOrders: 0,
        whatsappShare: 0,
        tier: "atencion",
      }),
      context
    )
    expect(tips.map((tip) => tip.id)).toEqual(["cancelaciones_altas", "sin_whatsapp"])
    expect(tips.map((tip) => tip.severity)).toEqual(["critical", "info"])
  })

  it("marca catálogo incompleto con el deep-link filtrado por ciudad", () => {
    const tips = buildCityTips(row({ catalogCoverage: 10, tier: "atencion" }), context)
    const tip = tips.find((t) => t.id === "sin_catalogo")
    expect(tip?.severity).toBe("critical")
    expect(tip?.href).toBe("/admin/productos?city=2")
  })

  it("omite los tips de catálogo cuando la cobertura es desconocida", () => {
    expect(ids(row({ catalogCoverage: null, tier: "atencion" }))).not.toContain("sin_catalogo")
    expect(
      buildCityTips(row({ catalogCoverage: 5 }), { medianAov: 0, maxCatalogCoverage: null }).map(
        (t) => t.id
      )
    ).not.toContain("sin_catalogo")
  })

  it("distingue una ciudad nueva de una que dejó de vender", () => {
    expect(ids(row({ orders: 0, totalOrders: 0, previousOrders: 0, tier: "sin_pedidos" }))).toEqual([
      "ciudad_sin_pedidos",
    ])
    expect(
      ids(row({ orders: 0, totalOrders: 0, previousOrders: 7, tier: "sin_pedidos" }))
    ).toEqual(["inactividad"])
  })

  it("no reclama a una ciudad inactiva que no vende", () => {
    expect(ids(row({ orders: 0, totalOrders: 0, isActive: false, tier: "sin_pedidos" }))).toEqual([])
  })

  it("exige muestra suficiente antes de hablar de cancelaciones", () => {
    expect(ids(row({ cancellationRate: 50, cancelled: 2, totalOrders: 4 }))).not.toContain(
      "cancelaciones_altas"
    )
    const tips = buildCityTips(row({ cancellationRate: 50, cancelled: 3, totalOrders: 6 }), context)
    expect(tips.find((t) => t.id === "cancelaciones_altas")?.href).toBe(
      "/admin/pedidos?status=cancelled"
    )
  })

  it("avisa la caída de demanda solo cuando hay base de comparación", () => {
    expect(ids(row({ revenueDeltaPct: -40 }))).toContain("demanda_baja")
    expect(ids(row({ revenueDeltaPct: -25 }))).toContain("demanda_baja")
    expect(ids(row({ revenueDeltaPct: -10 }))).not.toContain("demanda_baja")
    expect(ids(row({ revenueDeltaPct: null }))).not.toContain("demanda_baja")
  })

  it("compara el ticket contra la mediana entre ciudades", () => {
    expect(ids(row({ aov: 300 }))).toContain("ticket_bajo")
    expect(ids(row({ aov: 400 }))).not.toContain("ticket_bajo")
  })

  it("pide WhatsApp solo con muestra suficiente y cero pedidos de chat", () => {
    expect(ids(row({ whatsappOrders: 0, whatsappShare: 0, orders: 4 }))).not.toContain("sin_whatsapp")
    expect(ids(row({ whatsappOrders: 0, whatsappShare: 0, orders: 5 }))).toContain("sin_whatsapp")
  })

  it("resume qué replicar de una ciudad top, sin enlace", () => {
    const tip = buildCityTips(row(), context).find((t) => t.id === "referencia")
    expect(tip?.severity).toBe("info")
    expect(tip?.href).toBeNull()
  })

  it("nunca devuelve un href que no sea una ruta admin", () => {
    const tips = buildCityTips(
      row({
        catalogCoverage: 5,
        cancellationRate: 40,
        cancelled: 4,
        totalOrders: 10,
        revenueDeltaPct: -60,
        aov: 100,
        whatsappOrders: 0,
        tier: "atencion",
      }),
      context
    )
    expect(tips.length).toBeGreaterThan(3)
    for (const tip of tips) {
      if (tip.href !== null) expect(tip.href).toMatch(/^\/admin(\/|\?)/)
    }
  })
})

describe("rankCities", () => {
  const row = (name: string, score: number, revenue: number) =>
    ({ name, score, revenue }) as CityPerformanceRow

  it("ordena por score y desempata por ingresos", () => {
    const ranked = rankCities([
      row("b", 50, 100),
      row("a", 90, 10),
      row("c", 50, 900),
    ])
    expect(ranked.map((r) => r.name)).toEqual(["a", "c", "b"])
  })

  it("no muta la lista de entrada", () => {
    const input = [row("b", 10, 1), row("a", 90, 1)]
    rankCities(input)
    expect(input.map((r) => r.name)).toEqual(["b", "a"])
  })
})

describe("buildCityPerformance", () => {
  const catalog: CatalogAvailabilityInput = {
    // 95 de 100 productos visibles dejaron de ser globales; solo 5 aplican a
    // todas las ciudades. Guadalajara es la que tiene el catálogo recortado.
    totalProducts: 100,
    restrictedProducts: 95,
    availableByCity: new Map([
      [1, 90],
      [2, 10],
      [3, 88],
      [4, 80],
    ]),
  }

  const input = {
    cities: CITY_ROWS,
    currentOrders: [
      ...orders(1, 20, { total: 1000 }),
      ...orders(2, 8, { total: 1000 }),
      ...orders(3, 3, { total: 400 }),
    ],
    previousOrders: [...orders(1, 10, { total: 1000 }), ...orders(2, 12, { total: 500 })],
    catalog,
  }

  it("rankea las ciudades con pedidos por score y aparta las que no vendieron", () => {
    const result = buildCityPerformance(input)
    expect(result.cities.map((c) => c.name)).toEqual([
      "Ciudad de México",
      "Guadalajara",
      "Monterrey",
    ])
    expect(result.withoutOrders.map((c) => c.name)).toEqual(["Puebla"])
    expect(result.totals).toEqual({ withOrders: 3, withoutOrders: 1, revenue: 29200 })
  })

  it("calcula métricas de la ventana y del periodo anterior", () => {
    const gdl = buildCityPerformance(input).cities.find((c) => c.name === "Guadalajara")!
    expect(gdl.orders).toBe(8)
    expect(gdl.revenue).toBe(8000)
    expect(gdl.aov).toBe(1000)
    expect(gdl.ordersDeltaPct).toBe(-33.3)
    expect(gdl.revenueDeltaPct).toBe(33.3)
    expect(gdl.catalogCoverage).toBe(15)
    expect(gdl.tier).toBe("estable")
  })

  it("excluye cancelados de los pedidos y de los ingresos, pero los cuenta en la tasa", () => {
    const result = buildCityPerformance({
      ...input,
      currentOrders: [
        ...orders(3, 5, { total: 500 }),
        ...orders(3, 3, { status: "cancelled", payment_status: "refunded" }),
      ],
    })
    const mty = result.cities.find((c) => c.name === "Monterrey")!
    expect(mty.orders).toBe(5)
    expect(mty.totalOrders).toBe(8)
    expect(mty.revenue).toBe(2500)
    expect(mty.cancellationRate).toBe(37.5)
  })

  it("solo suma ingresos de pedidos pagados y saca el ticket de esos mismos", () => {
    const result = buildCityPerformance({
      ...input,
      currentOrders: [...orders(3, 4, { total: 500, payment_status: "pending" })],
    })
    const mty = result.cities.find((c) => c.name === "Monterrey")!
    expect(mty.orders).toBe(4)
    expect(mty.revenue).toBe(0)
    expect(mty.aov).toBe(0)
  })

  it("mide la porción de WhatsApp sobre los pedidos válidos", () => {
    const result = buildCityPerformance({
      ...input,
      currentOrders: [
        ...orders(3, 2, { source: "whatsapp" }),
        ...orders(3, 2, { source: "web" }),
        ...orders(3, 1, { source: "whatsapp", status: "cancelled" }),
      ],
    })
    const mty = result.cities.find((c) => c.name === "Monterrey")!
    expect(mty.whatsappOrders).toBe(2)
    expect(mty.whatsappShare).toBe(50)
  })

  it("sin disponibilidad legible la cobertura queda null y no hay tips de catálogo", () => {
    const result = buildCityPerformance({ ...input, catalog: null })
    expect(result.maxCatalogCoverage).toBeNull()
    expect(result.cities.every((c) => c.catalogCoverage === null)).toBe(true)
    expect(result.cities.some((c) => c.tips.some((t) => t.id === "sin_catalogo"))).toBe(false)
  })

  it("la ausencia de filas de disponibilidad significa catálogo global completo", () => {
    const result = buildCityPerformance({
      ...input,
      catalog: { totalProducts: 100, restrictedProducts: 0, availableByCity: new Map() },
    })
    expect(result.cities.every((c) => c.catalogCoverage === 100)).toBe(true)
    expect(result.maxCatalogCoverage).toBe(100)
  })

  it("un producto restringido a otras ciudades no cuenta como disponible aquí", () => {
    const result = buildCityPerformance({
      ...input,
      catalog: { totalProducts: 10, restrictedProducts: 10, availableByCity: new Map([[1, 3]]) },
    })
    const cdmx = result.cities.find((c) => c.name === "Ciudad de México")!
    const gdl = result.cities.find((c) => c.name === "Guadalajara")!
    expect(cdmx.catalogCoverage).toBe(3)
    expect(gdl.catalogCoverage).toBe(0)
  })

  it("arma la lista de trabajo con las ciudades que necesitan atención", () => {
    const result = buildCityPerformance(input)
    const names = result.needsAttention.map((c) => c.name)
    // Monterrey cae por score y Guadalajara por catálogo recortado; CDMX no entra.
    expect(names).toEqual(["Monterrey", "Guadalajara"])
    expect(result.needsAttention.every((c) => c.orders > 0)).toBe(true)
  })

  it("lista las ciudades sin pedidos con las activas primero", () => {
    const result = buildCityPerformance({
      ...input,
      cities: [
        { id: 4, name: "Puebla", is_active: false },
        { id: 5, name: "Aguascalientes", is_active: true },
        { id: 6, name: "Zacatecas", is_active: true },
      ],
      currentOrders: [],
      previousOrders: [],
    })
    expect(result.withoutOrders.map((c) => c.name)).toEqual([
      "Aguascalientes",
      "Zacatecas",
      "Puebla",
    ])
    expect(result.cities).toEqual([])
    expect(result.totals).toEqual({ withOrders: 0, withoutOrders: 3, revenue: 0 })
  })

  it("ignora pedidos de ciudades que ya no existen en el catálogo", () => {
    const result = buildCityPerformance({
      ...input,
      cities: [{ id: 1, name: "Ciudad de México", is_active: true }],
    })
    expect(result.cities).toHaveLength(1)
    expect(result.cities[0]!.revenue).toBe(20000)
  })

  it("no rompe con una ciudad huérfana de pedidos ni con ids inválidos", () => {
    const result = buildCityPerformance({
      ...input,
      currentOrders: [
        { city_id: null, total: 100, status: "delivered", payment_status: "paid", source: "web" },
      ],
    })
    expect(result.totals.withOrders).toBe(0)
    expect(result.totals.withoutOrders).toBe(4)
    expect(result.totals.revenue).toBe(0)
  })
})
