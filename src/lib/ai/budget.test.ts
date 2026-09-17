import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createServiceClient = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/service", () => ({ createServiceClient }))

import {
  DEFAULT_DAILY_TOKEN_CAP,
  DEFAULT_TOKEN_ESTIMATE,
  dailyTokenCap,
  reserveAiBudget,
  settleAiBudget,
} from "./budget"

function clientWith(rpc: ReturnType<typeof vi.fn>) {
  return { rpc }
}

/** Argumentos del primer RPC, sin indexado opcional ruidoso. */
function rpcArgs(rpc: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, args] = rpc.mock.calls[0] ?? []
  return args as Record<string, unknown>
}

const originalCap = process.env.AI_DAILY_TOKEN_CAP

beforeEach(() => {
  if (originalCap === undefined) delete process.env.AI_DAILY_TOKEN_CAP
  else process.env.AI_DAILY_TOKEN_CAP = originalCap
  createServiceClient.mockReset()
})

afterEach(() => {
  if (originalCap === undefined) delete process.env.AI_DAILY_TOKEN_CAP
  else process.env.AI_DAILY_TOKEN_CAP = originalCap
})

describe("dailyTokenCap", () => {
  it("usa el default cuando no hay variable", () => {
    delete process.env.AI_DAILY_TOKEN_CAP
    expect(dailyTokenCap()).toBe(DEFAULT_DAILY_TOKEN_CAP)
  })

  it("usa el default con valores inválidos", () => {
    process.env.AI_DAILY_TOKEN_CAP = "muchos"
    expect(dailyTokenCap()).toBe(DEFAULT_DAILY_TOKEN_CAP)
    process.env.AI_DAILY_TOKEN_CAP = "0"
    expect(dailyTokenCap()).toBe(DEFAULT_DAILY_TOKEN_CAP)
    process.env.AI_DAILY_TOKEN_CAP = "-5"
    expect(dailyTokenCap()).toBe(DEFAULT_DAILY_TOKEN_CAP)
  })

  it("respeta un tope válido", () => {
    process.env.AI_DAILY_TOKEN_CAP = "1500"
    expect(dailyTokenCap()).toBe(1500)
  })
})

describe("reserveAiBudget", () => {
  it("pasa sin contador cuando no hay restaurante", async () => {
    const decision = await reserveAiBudget(null)
    expect(decision).toEqual({ allowed: true, enforced: false })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("reserva con el estimado por defecto", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    createServiceClient.mockResolvedValue(clientWith(rpc))

    const decision = await reserveAiBudget("rest-1")

    expect(decision).toEqual({ allowed: true, enforced: true })
    expect(rpc).toHaveBeenCalledWith("foodos_ai_reserve", {
      p_restaurant_id: "rest-1",
      p_estimate: DEFAULT_TOKEN_ESTIMATE,
      p_cap: DEFAULT_DAILY_TOKEN_CAP,
    })
  })

  it("normaliza estimados negativos o fraccionarios", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    createServiceClient.mockResolvedValue(clientWith(rpc))

    await reserveAiBudget("rest-1", -80.7)

    expect(rpcArgs(rpc).p_estimate).toBe(0)
  })

  it("niega la reserva cuando el tope ya se agotó", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }))
    createServiceClient.mockResolvedValue(clientWith(rpc))

    expect(await reserveAiBudget("rest-1", 100)).toEqual({
      allowed: false,
      enforced: true,
    })
    expect(rpc).toHaveBeenCalledWith("foodos_ai_reserve", {
      p_restaurant_id: "rest-1",
      p_estimate: 100,
      p_cap: DEFAULT_DAILY_TOKEN_CAP,
    })
  })

  it("permite la llamada si Supabase devuelve error (best-effort)", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }))
    createServiceClient.mockResolvedValue(clientWith(rpc))

    expect(await reserveAiBudget("rest-1")).toEqual({ allowed: true, enforced: false })
  })

  it("permite la llamada si el cliente de servicio ni siquiera se puede crear", async () => {
    createServiceClient.mockRejectedValue(new Error("faltan credenciales"))

    expect(await reserveAiBudget("rest-1")).toEqual({ allowed: true, enforced: false })
  })
})

describe("settleAiBudget", () => {
  it("no hace nada sin restaurante", async () => {
    await settleAiBudget(undefined, 500)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("no toca la base cuando el consumo real iguala el estimado", async () => {
    await settleAiBudget("rest-1", DEFAULT_TOKEN_ESTIMATE)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("ajusta por la diferencia contra el estimado", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    createServiceClient.mockResolvedValue(clientWith(rpc))

    await settleAiBudget("rest-1", 900)

    expect(rpc).toHaveBeenCalledWith("foodos_ai_settle", {
      p_restaurant_id: "rest-1",
      p_delta: 900 - DEFAULT_TOKEN_ESTIMATE,
      p_fallback: false,
    })
  })

  it("acepta un estimado explícito", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    createServiceClient.mockResolvedValue(clientWith(rpc))

    await settleAiBudget("rest-1", 500, { estimate: 300 })

    expect(rpcArgs(rpc).p_delta).toBe(200)
  })

  it("deja el estimado intacto cuando el proveedor no reporta consumo", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    createServiceClient.mockResolvedValue(clientWith(rpc))

    await settleAiBudget("rest-1", null)

    expect(rpc).not.toHaveBeenCalled()
  })

  it("registra el fallback aunque no haya delta de tokens", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    createServiceClient.mockResolvedValue(clientWith(rpc))

    await settleAiBudget("rest-1", null, { fallback: true })

    expect(rpc).toHaveBeenCalledWith("foodos_ai_settle", {
      p_restaurant_id: "rest-1",
      p_delta: 0,
      p_fallback: true,
    })
  })

  it("traga el error de Supabase sin romper la respuesta al cliente", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }))
    createServiceClient.mockResolvedValue(clientWith(rpc))

    await expect(settleAiBudget("rest-1", 10)).resolves.toBeUndefined()
  })

  it("traga un cliente que no se puede crear", async () => {
    createServiceClient.mockRejectedValue(new Error("faltan credenciales"))

    await expect(settleAiBudget("rest-1", 10)).resolves.toBeUndefined()
  })
})
