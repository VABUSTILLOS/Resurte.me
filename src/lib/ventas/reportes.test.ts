import { describe, expect, it } from "vitest"
import {
  buildClientesLines,
  buildCorteLines,
  buildGerencialLines,
  buildHorasLines,
  buildResumenLines,
} from "./reportes"
import { Cliente, Comparison, DayStats, FichajesHoy, Mesa, SaleEntry, TopSeller } from "@/components/panel/ventas/ventas-shared"

const clientes: Cliente[] = [
  { id: "c1", nombre: "Ana", telefono: "555-0101", puntos: 120, visitas: 4, totalGastado: 5600, createdAt: "2025-01-01" },
  { id: "c2", nombre: "Luis", puntos: 40, visitas: 1, totalGastado: 900, createdAt: "2025-01-02" },
]

const mesas: Mesa[] = [
  { id: "m1", nombre: "Mesa 1", capacidad: 4 },
  { id: "m2", nombre: "Barra", capacidad: 2 },
]

const entries: SaleEntry[] = [
  {
    id: "e1",
    dishId: "d1",
    dishName: "Tacos",
    quantity: 2,
    date: "2025-01-10",
    unitPrice: 50,
    unitCost: 20,
    paymentMethod: "efectivo",
    channel: "comedor",
    clienteId: "c1",
    mesaId: "m1",
  },
  {
    id: "e2",
    dishId: "d2",
    dishName: "Quesadilla",
    quantity: 1,
    date: "2025-01-10",
    unitPrice: 40,
    unitCost: 15,
    paymentMethod: "tarjeta",
    channel: "domicilio",
    modificadores: [{ nombre: "Extra queso", precio: 10 }],
  },
]

const dayStats: DayStats = {
  revenue: 140,
  cost: 55,
  margin: 85,
  units: 3,
  orders: 2,
  foodCost: 39.3,
  avgTicket: 70,
  discount: 0,
}

const topSellers: TopSeller[] = [
  { name: "Tacos", qty: 2, revenue: 100 },
  { name: "Quesadilla", qty: 1, revenue: 40 },
]

const comparison: Comparison = {
  cur: { revenue: 140, orders: 2, avgTicket: 70 },
  prev: { revenue: 100, orders: 2, avgTicket: 50 },
  revenueDelta: 40,
  ordersDelta: 0,
  avgDelta: 40,
}

const fichajesHoy: FichajesHoy = {
  rows: [
    { nombre: "Juan", rol: "chef", tarifa: 60, minutos: 90, fichajes: 1, abierto: false },
    { nombre: "Mery", tarifa: 50, minutos: 45, fichajes: 1, abierto: true },
  ],
  totalMin: 135,
  totalCosto: 127.5,
}

describe("buildHorasLines", () => {
  it("formatea filas, total y pie de página", () => {
    const lines = buildHorasLines({ collectionName: "Taquería", dateLabel: "vie 10 ene", fichajesHoy })
    expect(lines[0]).toBe("⏰ Reporte de horas — vie 10 ene (Taquería)")
    expect(lines[1]).toBe("Juan (chef): 1h 30min — $90")
    expect(lines[2]).toBe("Mery: 0h 45min — $38 (en curso)")
    expect(lines[3]).toBe("Total: 2h 15min — $128")
    expect(lines.at(-1)).toBe("📈 Registrado en resurte.me")
  })
})

describe("buildClientesLines", () => {
  it("arma header y líneas por cliente", () => {
    const lines = buildClientesLines({ collectionName: "Taquería", clientes })
    expect(lines[0]).toBe("👥 Clientes frecuentes — Taquería")
    expect(lines[1]).toBe("Ana · 555-0101 · 120 pts · 4 visitas · $5600")
    expect(lines[2]).toBe("Luis · 40 pts · 1 visitas · $900")
  })
})

describe("buildResumenLines", () => {
  it("incluye ingresos, método/canal, top, ventas y pie", () => {
    const lines = buildResumenLines({
      collectionName: "Taquería",
      dateLabel: "vie 10 ene",
      stats: dayStats,
      methods: [
        { key: "efectivo", label: "Efectivo", icon: "💵", revenue: 100, count: 1 },
        { key: "tarjeta", label: "Tarjeta", icon: "💳", revenue: 40, count: 1 },
      ],
      channels: [
        { key: "comedor", label: "Comedor", icon: "🍽️", revenue: 100, count: 1 },
        { key: "domicilio", label: "Domicilio", icon: "🛵", revenue: 40, count: 1 },
      ],
      top: topSellers,
      tipoCambio: 1,
      clientes,
      mesas,
      entries,
    })
    expect(lines[0]).toBe("💰 Resumen de ventas — vie 10 ene (Taquería)")
    expect(lines[1]).toBe("Ingresos: $140")
    expect(lines).toContain("Por método de pago:")
    expect(lines).toContain("💵 Efectivo: $100 (1 venta)")
    expect(lines).toContain("Por canal:")
    expect(lines).toContain("Top ventas:")
    expect(lines).toContain("1. Tacos — 2 pz ($100)")
    expect(lines).toContain("2. Quesadilla [+Extra queso] ×1 — $40")
    expect(lines.at(-1)).toBe("📈 Registrado en resurte.me")
  })

  it("resuelve cliente y mesa en las líneas de venta", () => {
    const lines = buildResumenLines({
      collectionName: "Taquería",
      dateLabel: "vie 10 ene",
      stats: dayStats,
      methods: [],
      channels: [],
      top: [],
      tipoCambio: 1,
      clientes,
      mesas,
      entries,
    })
    expect(lines).toContain("1. Tacos ×2 · Ana · 🪑 Mesa 1 — $100")
    expect(lines).toContain("2. Quesadilla [+Extra queso] ×1 — $40")
  })
})

describe("buildCorteLines", () => {
  it("incluye método, canal, modificadores, total y pie", () => {
    const lines = buildCorteLines({
      collectionName: "Taquería",
      dateLabel: "vie 10 ene",
      stats: { ...dayStats, discount: 5 },
      methods: [
        { key: "efectivo", label: "Efectivo", icon: "💵", revenue: 100, count: 1 },
        { key: "tarjeta", label: "Tarjeta", icon: "💳", revenue: 40, count: 1 },
      ],
      channels: [
        { key: "comedor", label: "Comedor", icon: "🍽️", revenue: 100, count: 1 },
        { key: "domicilio", label: "Domicilio", icon: "🛵", revenue: 40, count: 1 },
      ],
      comisionesHoy: 12,
      mesasOcupadas: 1,
      tipoCambio: 1,
      entries,
    })
    expect(lines[0]).toBe("🧾 Corte de caja — vie 10 ene (Taquería)")
    expect(lines).toContain("💵 Efectivo: $100 (1 venta)")
    expect(lines).toContain("Descuentos otorgados: -$5")
    expect(lines).toContain("Comisiones por canal: -$12")
    expect(lines).toContain("Mesas ocupadas: 1")
    expect(lines).toContain("Quesadilla [+Extra queso] ×1")
    expect(lines).toContain("Total: $140 · 3 platillos")
    expect(lines.at(-1)).toBe("📈 Registrado en resurte.me")
  })
})

describe("buildGerencialLines", () => {
  it("incluye stats, métodos, canales, top y comparativa", () => {
    const lines = buildGerencialLines({
      collectionName: "Taquería",
      periodLabel: "Últimos 7 días",
      stats: {
        revenue: 1400,
        cost: 550,
        margin: 850,
        units: 30,
        orders: 20,
        foodCost: 39.3,
        avgTicket: 70,
        discount: 50,
      },
      comisionesReporte: 30,
      tipoCambio: 18,
      methods: [{ key: "efectivo", label: "Efectivo", icon: "💵", revenue: 1000 }],
      channels: [{ key: "comedor", label: "Comedor", icon: "🍽️", revenue: 1000 }],
      top: topSellers,
      comparison,
    })
    expect(lines[0]).toBe("📊 Reporte gerencial — Últimos 7 días (Taquería)")
    expect(lines[1]).toBe("Ingresos: $1400")
    expect(lines).toContain("Tickets: 20 · Ticket promedio: $70")
    expect(lines).toContain("Descuentos otorgados: -$50")
    expect(lines).toContain("Comisiones por canal: -$30")
    expect(lines).toContain("Aprox. USD: $77.78")
    expect(lines).toContain("Por método de pago:")
    expect(lines).toContain("Top productos:")
    expect(lines).toContain("vs período anterior: ingresos +40% · tickets +0% · ticket prom. +40%")
    expect(lines.at(-1)).toBe("📈 Registrado en resurte.me")
  })
})
