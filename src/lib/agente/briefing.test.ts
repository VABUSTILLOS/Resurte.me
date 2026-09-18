import { beforeEach, describe, expect, it, vi } from "vitest"

// El briefing del agente y el dinero (Ronda 18, F6).
//
// Lo que se fija aquí es una sola regla, y es la que más fácil se rompe porque
// el lenguaje la empuja: **no declarado no es cero**. `pipelineAbierto` es
// anulable a propósito, y la plantilla determinista —la que se usa cuando no hay
// IA configurada, que es el caso por omisión— tiene que decir «sin valor
// declarado» en lugar de «$0». Un briefing que anuncia `$0` le dice al vendedor
// que su pipeline no vale nada cuando lo que pasa es que nadie lo ha valorado.

const mocks = vi.hoisted(() => ({
  requireSellerOrAdminAction: vi.fn(),
  createServiceClient: vi.fn(),
  chatCompletion: vi.fn(),
}))

vi.mock("@/lib/roles", () => ({ requireSellerOrAdminAction: mocks.requireSellerOrAdminAction }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock("./llm", () => ({ chatCompletion: mocks.chatCompletion }))

import { generateAgentMessage, getDailyBriefing } from "./actions"

const SELLER = "seller-111"

type Call = { table: string; select: unknown[] }

interface Fixture {
  /** Filas crudas de `estimated_value` del pipeline **abierto**. */
  pipeline?: unknown[]
  pipelineError?: unknown
  /** Toques de hoy, como `{ type }`. */
  activities?: unknown[]
  overdue?: number
  drafts?: number
  /** Fila cruda que devuelve el lector de prospectos, si se pide una. */
  prospect?: Record<string, unknown>
}

/**
 * Cliente falso que despacha por tabla.
 *
 * `getDailyBriefing` consulta cuatro tablas y dos veces `crm_prospects` (el
 * conteo de vencidos y la suma del pipeline), así que un doble de una sola
 * respuesta mentiría sobre una de las dos. Se distingue por el `select`.
 */
function fakeClient(fixture: Fixture) {
  const calls: Call[] = []

  const from = (table: string) => {
    const state: { select: unknown[] } = { select: [] }
    const builder: Record<string, unknown> = {}
    const record = (op: string) => (...args: unknown[]) => {
      if (op === "select") state.select = args
      return builder
    }
    for (const op of [
      "select",
      "eq",
      "in",
      "is",
      "not",
      "gte",
      "lt",
      "lte",
      "neq",
      "order",
      "limit",
      "range",
    ]) {
      builder[op] = record(op)
    }

    const resolve = () => {
      calls.push({ table, select: state.select })
      if (table === "crm_activities") return { data: fixture.activities ?? [], error: null }
      if (table === "crm_agent_messages") {
        return { data: null, count: fixture.drafts ?? 0, error: null }
      }
      if (table === "crm_prospects") {
        // Tres consultas distintas caen en esta tabla: el pipeline pide
        // `estimated_value`, los conteos piden `id` con `count`/`head`, y el
        // lector pide la escalera de columnas.
        if (state.select[0] === "estimated_value") {
          return { data: fixture.pipeline ?? [], error: fixture.pipelineError ?? null }
        }
        const head = state.select[1] as { count?: string } | undefined
        if (head?.count) return { data: null, count: fixture.overdue ?? 0, error: null }
        return { data: fixture.prospect ? [fixture.prospect] : [], error: null }
      }
      return { data: null, error: null }
    }

    builder.then = (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled)
    builder.maybeSingle = async () => ({ data: { full_name: "Ana" }, error: null })
    builder.single = async () => ({ data: { id: 1 }, error: null })
    builder.insert = () => builder
    return builder
  }

  return { client: { from }, calls }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSellerOrAdminAction.mockResolvedValue({ userId: SELLER, role: "seller" })
  mocks.chatCompletion.mockResolvedValue(null)
})

describe("getDailyBriefing — el dinero del pipeline abierto", () => {
  it("suma solo lo abierto y lo publica en las estadísticas", async () => {
    const { client, calls } = fakeClient({ pipeline: [{ estimated_value: 4000 }, { estimated_value: "500" }] })
    mocks.createServiceClient.mockResolvedValue(client as never)

    const briefing = await getDailyBriefing()

    expect(briefing.stats.pipelineAbierto).toBe(4500)
    expect(briefing.stats.pipelineValorados).toBe(2)
    expect(briefing.stats.pipelineTruncado).toBe(false)

    // El filtro de estados cerrados viaja en la consulta del pipeline: sumar el
    // alcance entero inflaría la cifra con tratos ya ganados o perdidos.
    expect(calls.some((c) => c.table === "crm_prospects" && c.select[0] === "estimated_value")).toBe(
      true
    )
  })

  it("sin ningún valor declarado dice «sin valor declarado», nunca $0", async () => {
    const { client } = fakeClient({ pipeline: [] })
    mocks.createServiceClient.mockResolvedValue(client as never)

    const briefing = await getDailyBriefing()

    expect(briefing.stats.pipelineAbierto).toBeNull()
    expect(briefing.stats.pipelineValorados).toBe(0)
    expect(briefing.text).toContain("Sin valor declarado")
    expect(briefing.text).not.toContain("$0")
  })

  it("con valor declarado publica la cifra", async () => {
    const { client } = fakeClient({ pipeline: [{ estimated_value: 12500 }] })
    mocks.createServiceClient.mockResolvedValue(client as never)

    const briefing = await getDailyBriefing()

    expect(briefing.stats.pipelineAbierto).toBe(12500)
    expect(briefing.text).toContain("Pipeline abierto")
    expect(briefing.text).not.toContain("Sin valor declarado")
  })

  it("si la ventana se quedó corta, el texto lo presenta como mínimo", async () => {
    // 5001 filas con el techo en 5000: la última solo delata el corte.
    const pipeline = Array.from({ length: 5001 }, () => ({ estimated_value: 1 }))
    const { client } = fakeClient({ pipeline })
    mocks.createServiceClient.mockResolvedValue(client as never)

    const briefing = await getDailyBriefing()

    expect(briefing.stats.pipelineTruncado).toBe(true)
    expect(briefing.text).toContain("≥")
  })

  it("usa la plantilla determinista cuando no hay IA", async () => {
    const { client } = fakeClient({ pipeline: [{ estimated_value: 10 }] })
    mocks.createServiceClient.mockResolvedValue(client as never)

    const briefing = await getDailyBriefing()

    expect(briefing.fromAI).toBe(false)
  })
})

describe("generateAgentMessage — los cuatro campos de segmentación", () => {
  it("llegan al prompt: el agente deja de razonar sobre null", async () => {
    const { client } = fakeClient({
      pipeline: [],
      prospect: {
        id: 7,
        user_id: null,
        seller_id: SELLER,
        name: "Ana",
        phone: "5512345678",
        restaurant_name: "Tacos Ana",
        zone: null,
        tier: null,
        status: "nuevo",
        notes: null,
        tags: null,
        next_follow_up_at: null,
        last_contact_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        employees: 12,
        instagram: "@tacosana",
        weekly_volume_min: 3000,
        weekly_volume_max: 6000,
        estimated_value: null,
        loss_reason: null,
        closed_at: null,
      },
    })
    mocks.createServiceClient.mockResolvedValue(client as never)
    mocks.chatCompletion.mockResolvedValue({ text: "Hola Ana", model: "test" })

    await generateAgentMessage(7, "primer_contacto")

    const prompt = mocks.chatCompletion.mock.calls[0]?.[1] as string
    expect(prompt).toContain("Empleados: 12")
    expect(prompt).toContain("@tacosana")
    expect(prompt).toContain("3,000")
    expect(prompt).toContain("6,000")
  })
})
