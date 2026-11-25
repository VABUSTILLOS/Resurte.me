import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"

/** Cadena falsa: la lectura de la config y (si aplica) la de ocupación. */
function serviceWith(configRow: { config: unknown } | null) {
  const configBuilder: Record<string, unknown> = {}
  configBuilder.select = vi.fn().mockReturnValue(configBuilder)
  configBuilder.eq = vi.fn().mockReturnValue(configBuilder)
  configBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: configRow, error: null })

  const ordersBuilder: Record<string, unknown> = {}
  for (const method of ["select", "gte", "lte", "neq", "not", "limit"]) {
    ordersBuilder[method] = vi.fn().mockReturnValue(ordersBuilder)
  }
  ordersBuilder.limit = vi.fn().mockResolvedValue({ data: [], error: null })

  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn((table: string) => (table === "orders" ? ordersBuilder : configBuilder)),
  } as never)
}

describe("/api/delivery-slots", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sin configuración responde lo histórico: 7 días × 6 franjas", async () => {
    serviceWith(null)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.days).toHaveLength(7)
    expect(body.days[0].label).toContain("Hoy")
    for (const day of body.days) {
      expect(day.slots).toHaveLength(6)
    }
    expect(body.days[0].slots[0]).toMatchObject({ id: "08-10", start: "08:00" })
    expect(body.cutoffTime).toBeNull()
    expect(body.capacityPerSlot).toBeNull()
  })

  it("con el domingo cerrado, ese día no aparece en la ventana", async () => {
    const week = Array.from({ length: 7 }, () => [
      "08-10",
      "10-12",
      "12-14",
      "14-16",
      "16-18",
      "18-20",
    ])
    week[0] = []
    serviceWith({ config: { cutoffTime: null, capacityPerSlot: null, week } })
    const res = await GET()
    const body = await res.json()
    const values = body.days.map((d: { value: string }) => d.value) as string[]
    // Ningún día ofrecido puede ser domingo (getUTCDay() === 0).
    for (const value of values) {
      const [y, m, d] = value.split("-").map(Number)
      expect(new Date(Date.UTC(y!, m! - 1, d)).getUTCDay()).not.toBe(0)
    }
    expect(values.length).toBeGreaterThanOrEqual(5)
  })
})
