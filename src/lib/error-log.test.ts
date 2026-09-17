import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(),
  createServiceClient: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}))
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: mocks.loggerWarn, error: vi.fn() },
}))

import { describeServerError, reportServerError } from "./error-log"

interface Inserted {
  message: string
  context: Record<string, unknown>
  severity: string
  url: string | null
  stack: string | null
  source: string
}

/** Cliente falso que captura la fila insertada (o falla, si se le pide). */
function fakeClient(options: { insertError?: { message: string } | null } = {}) {
  const inserted: Inserted[] = []
  return {
    inserted,
    client: {
      from(table: string) {
        expect(table).toBe("error_logs")
        return {
          insert(row: Inserted) {
            inserted.push(row)
            return Promise.resolve({ error: options.insertError ?? null })
          },
        }
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isSupabaseConfigured.mockReturnValue(true)
  mocks.createServiceClient.mockResolvedValue(fakeClient().client)
})

describe("describeServerError", () => {
  it("anexa el mensaje del Error original", () => {
    expect(
      describeServerError({ message: "Falló el despacho", error: new Error("timeout") })
    ).toBe("Falló el despacho: timeout")
  })

  it("acepta un error en texto plano", () => {
    expect(describeServerError({ message: "Falló", error: "sin red" })).toBe("Falló: sin red")
  })

  it("serializa un error que no es Error ni string", () => {
    expect(describeServerError({ message: "Falló", error: { code: 502 } })).toBe(
      'Falló: {"code":502}'
    )
  })

  it("sin error solo deja el mensaje", () => {
    expect(describeServerError({ message: "Solo esto" })).toBe("Solo esto")
    expect(describeServerError({ message: "Solo esto", error: null })).toBe("Solo esto")
  })

  it("recorta a 5000 caracteres", () => {
    const long = describeServerError({ message: "x".repeat(6000) })
    expect(long).toHaveLength(5000)
  })
})

describe("reportServerError", () => {
  it("sin Supabase no intenta escribir y lo deja en el log", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false)

    await expect(reportServerError({ message: "algo falló" })).resolves.toBe(false)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "error-log.skipped",
      expect.objectContaining({ reason: "sin-supabase" })
    )
  })

  it("escribe en error_logs con severidad y fuente de servidor", async () => {
    const fake = fakeClient()
    mocks.createServiceClient.mockResolvedValue(fake.client)

    const ok = await reportServerError({
      message: "La IA no pudo completar la llamada",
      context: { feature: "mesero_ia", restaurantId: "rest-1" },
      url: "foodos:ia",
      error: new Error("timeout"),
    })

    expect(ok).toBe(true)
    expect(fake.inserted).toHaveLength(1)
    expect(fake.inserted[0]).toMatchObject({
      message: "La IA no pudo completar la llamada: timeout",
      context: { feature: "mesero_ia", restaurantId: "rest-1" },
      severity: "error",
      url: "foodos:ia",
      source: "server",
    })
    expect(fake.inserted[0]?.stack).toContain("Error: timeout")
  })

  it("respeta la severidad explícita y el contexto vacío", async () => {
    const fake = fakeClient()
    mocks.createServiceClient.mockResolvedValue(fake.client)

    await reportServerError({ message: "Proveedor caído", severity: "warn" })

    expect(fake.inserted[0]).toMatchObject({ severity: "warn", context: {}, url: null, stack: null })
  })

  it("no guarda stack cuando el error no es un Error", async () => {
    const fake = fakeClient()
    mocks.createServiceClient.mockResolvedValue(fake.client)

    await reportServerError({ message: "Falló", error: "sin red" })

    expect(fake.inserted[0]?.stack).toBeNull()
  })

  it("un insert fallido devuelve false sin lanzar", async () => {
    const fake = fakeClient({ insertError: { message: "permission denied" } })
    mocks.createServiceClient.mockResolvedValue(fake.client)

    await expect(reportServerError({ message: "algo falló" })).resolves.toBe(false)
    expect(mocks.loggerWarn).toHaveBeenCalledWith("error-log.insert", {
      message: "permission denied",
    })
  })

  it("un cliente que no se puede crear devuelve false sin lanzar", async () => {
    mocks.createServiceClient.mockRejectedValue(new Error("faltan credenciales"))

    await expect(reportServerError({ message: "algo falló" })).resolves.toBe(false)
    expect(mocks.loggerWarn).toHaveBeenCalledWith("error-log.unexpected", {
      error: "faltan credenciales",
    })
  })
})
