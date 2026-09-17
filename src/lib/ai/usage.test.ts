import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Observabilidad del consumo de IA. La parte pura (`summarizeAiUsage`) es la
 * que decide qué ve el dueño; la parte de I/O (`loadAiUsage`) solo tiene que
 * leer bien y degradar a `null` sin lanzar.
 */

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: mocks.loggerWarn, error: vi.fn() },
}))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))

import { DEFAULT_DAILY_TOKEN_CAP } from "@/lib/ai/budget"
import {
  NEAR_CAP_RATIO,
  USAGE_HISTORY_DAYS,
  loadAiUsage,
  summarizeAiUsage,
  type AiUsageRow,
} from "./usage"

const TODAY = "2026-02-10"

function row(day: string, tokens: number, calls = 1, fallbacks = 0): AiUsageRow {
  return { day, tokens_used: tokens, calls, fallbacks }
}

/** Query builder falso: encadenable y `await`-able como el de supabase-js. */
function query(result: { data?: unknown; error?: unknown }) {
  const seen: Array<[string, unknown, unknown?]> = []
  const builder: Record<string, unknown> = { seen }
  for (const method of ["select", "eq", "order", "limit"]) {
    builder[method] = (a: unknown, b?: unknown) => {
      seen.push([method, a, b])
      return builder
    }
  }
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolved).then(resolve)
  return builder
}

type UsageClient = Parameters<typeof loadAiUsage>[0]

/** El cliente falso solo necesita `from`; el resto de la forma no se usa. */
function asClient(value: unknown): UsageClient {
  return value as UsageClient
}

function fakeClient(result: { data?: unknown; error?: unknown } = {}) {
  const q = query(result)
  return {
    seen: q.seen as Array<[string, unknown, unknown?]>,
    client: asClient({
      from(table: string) {
        expect(table).toBe("foodos_ai_usage")
        return q
      },
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("summarizeAiUsage", () => {
  it("sin filas devuelve el día en ceros, no un error", () => {
    const snap = summarizeAiUsage([], { today: TODAY })
    expect(snap.day).toBe(TODAY)
    expect(snap.tokensUsed).toBe(0)
    expect(snap.calls).toBe(0)
    expect(snap.fallbacks).toBe(0)
    expect(snap.cap).toBe(DEFAULT_DAILY_TOKEN_CAP)
    expect(snap.remaining).toBe(DEFAULT_DAILY_TOKEN_CAP)
    expect(snap.ratio).toBe(0)
    expect(snap.nearCap).toBe(false)
    expect(snap.history).toEqual([])
  })

  it("toma el consumo del día en curso y calcula lo que queda", () => {
    const snap = summarizeAiUsage([row(TODAY, 15_000, 12, 2)], {
      today: TODAY,
      cap: 60_000,
    })
    expect(snap.tokensUsed).toBe(15_000)
    expect(snap.calls).toBe(12)
    expect(snap.fallbacks).toBe(2)
    expect(snap.remaining).toBe(45_000)
    expect(snap.ratio).toBeCloseTo(0.25)
    expect(snap.nearCap).toBe(false)
  })

  it("ignora filas de otros días al calcular hoy", () => {
    const snap = summarizeAiUsage([row("2026-02-09", 50_000)], {
      today: TODAY,
      cap: 60_000,
    })
    expect(snap.tokensUsed).toBe(0)
    expect(snap.nearCap).toBe(false)
    // …pero sí aparecen en el historial.
    expect(snap.history.map((d) => d.day)).toEqual(["2026-02-09"])
  })

  it("avisa justo en el umbral del 80 %", () => {
    const at = summarizeAiUsage([row(TODAY, 800)], { today: TODAY, cap: 1000 })
    const below = summarizeAiUsage([row(TODAY, 799)], { today: TODAY, cap: 1000 })
    expect(NEAR_CAP_RATIO).toBe(0.8)
    expect(at.nearCap).toBe(true)
    expect(below.nearCap).toBe(false)
  })

  it("no deja el restante en negativo si se rebasa el tope", () => {
    const snap = summarizeAiUsage([row(TODAY, 75_000)], { today: TODAY, cap: 60_000 })
    expect(snap.remaining).toBe(0)
    expect(snap.ratio).toBeGreaterThan(1)
    expect(snap.nearCap).toBe(true)
  })

  it("con tope 0 no divide por cero ni avisa", () => {
    const snap = summarizeAiUsage([row(TODAY, 500)], { today: TODAY, cap: 0 })
    expect(snap.ratio).toBe(0)
    expect(snap.remaining).toBe(0)
    expect(snap.nearCap).toBe(false)
  })

  it("ordena el historial del día más reciente al más viejo y lo acota", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(`2026-02-${String(i + 1).padStart(2, "0")}`, 100)
    )
    const snap = summarizeAiUsage(rows, { today: TODAY, days: 3 })
    expect(snap.history).toHaveLength(3)
    expect(snap.history.map((d) => d.day)).toEqual(["2026-02-10", "2026-02-09", "2026-02-08"])
  })

  it("por defecto trae una semana de historial", () => {
    expect(USAGE_HISTORY_DAYS).toBe(7)
    const rows = Array.from({ length: 12 }, (_, i) => row(`2026-01-${String(i + 1).padStart(2, "0")}`, 10))
    expect(summarizeAiUsage(rows, { today: TODAY }).history).toHaveLength(7)
  })

  it("descarta filas sin día y normaliza contadores basura a 0", () => {
    const snap = summarizeAiUsage(
      [
        { day: "", tokens_used: 999, calls: 1, fallbacks: 0 },
        { day: TODAY, tokens_used: null, calls: -5, fallbacks: Number.NaN },
      ] as AiUsageRow[],
      { today: TODAY, cap: 1000 }
    )
    expect(snap.history).toHaveLength(1)
    expect(snap.tokensUsed).toBe(0)
    expect(snap.calls).toBe(0)
    expect(snap.fallbacks).toBe(0)
  })
})

describe("loadAiUsage", () => {
  it("filtra por restaurante, ordena por día descendente y acota", async () => {
    const { client, seen } = fakeClient({ data: [row(TODAY, 1_000, 3)] })
    const snap = await loadAiUsage(client, "r-1", { today: TODAY, cap: 5_000, days: 4 })

    expect(snap?.tokensUsed).toBe(1_000)
    expect(seen).toEqual([
      ["select", "day, tokens_used, calls, fallbacks", undefined],
      ["eq", "restaurant_id", "r-1"],
      ["order", "day", { ascending: false }],
      ["limit", 4, undefined],
    ])
  })

  it("sin filas devuelve el resumen en ceros, no null", async () => {
    const { client } = fakeClient({ data: [] })
    const snap = await loadAiUsage(client, "r-1", { today: TODAY })
    expect(snap).not.toBeNull()
    expect(snap?.tokensUsed).toBe(0)
    expect(snap?.history).toEqual([])
  })

  it("degrada a null con error de lectura y lo registra", async () => {
    const { client } = fakeClient({ error: { message: "permission denied" } })
    const snap = await loadAiUsage(client, "r-1", { today: TODAY })
    expect(snap).toBeNull()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "ai-usage.read",
      expect.objectContaining({ restaurantId: "r-1", message: "permission denied" })
    )
  })

  it("degrada a null si el cliente lanza", async () => {
    const client = asClient({
      from() {
        throw new Error("sin red")
      },
    })
    const snap = await loadAiUsage(client, "r-1", { today: TODAY })
    expect(snap).toBeNull()
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })

  it("usa el tope por defecto si no se le pasa uno", async () => {
    const { client } = fakeClient({ data: [] })
    const snap = await loadAiUsage(client, "r-1", { today: TODAY })
    expect(snap?.cap).toBe(DEFAULT_DAILY_TOKEN_CAP)
  })
})
