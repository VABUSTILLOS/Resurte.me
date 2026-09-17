import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  reportClientError,
  resetReportedErrors,
} from "./report-client-error"

/**
 * Los boundaries de `error.tsx` reportan aquí. Lo crítico: NUNCA lanzar
 * (enmascararía el error original) y deduplicar (un boundary en bucle
 * agotaría el rate limit de 30/min del endpoint y perderíamos errores reales).
 */

const g = globalThis as unknown as { window?: unknown }

function installBrowser() {
  g.window = {
    location: {
      pathname: "/admin/pedidos",
      search: "?page=2",
      href: "https://resurte.me/admin/pedidos?page=2",
    },
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetReportedErrors()
  installBrowser()
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  delete g.window
})

describe("reportClientError", () => {
  it("envía el error a /api/log-error con el contrato del endpoint", () => {
    reportClientError(new Error("boom"), {
      context: "admin.error_boundary",
      extra: { section: "/admin/pedidos" },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/log-error")
    expect(init.method).toBe("POST")
    expect(init.keepalive).toBe(true)

    const body = JSON.parse(init.body as string)
    expect(body.message).toBe("[admin.error_boundary] boom")
    expect(body.severity).toBe("error")
    expect(body.source).toBe("client")
    expect(body.url).toBe("https://resurte.me/admin/pedidos?page=2")
    expect(body.context).toMatchObject({
      boundary: "admin.error_boundary",
      path: "/admin/pedidos?page=2",
      section: "/admin/pedidos",
    })
    expect(body.stack).toContain("boom")
  })

  it("deduplica el mismo error: un boundary en bucle no debe spamear", () => {
    const err = new Error("boom")
    reportClientError(err, { context: "admin.error_boundary" })
    reportClientError(err, { context: "admin.error_boundary" })
    reportClientError(err, { context: "admin.error_boundary" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("reporta errores distintos por separado", () => {
    reportClientError(new Error("uno"), { context: "a" })
    reportClientError(new Error("dos"), { context: "a" })
    reportClientError(new Error("uno"), { context: "b" })

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("incluye el digest cuando existe", () => {
    const err = Object.assign(new Error("boom"), { digest: "abc123" })
    reportClientError(err, { context: "admin.error_boundary" })

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string
    )
    expect(body.context.digest).toBe("abc123")
  })

  it("no lanza si fetch rechaza (el boundary debe seguir mostrándose)", () => {
    fetchMock.mockRejectedValue(new Error("offline"))

    expect(() =>
      reportClientError(new Error("boom"), { context: "x" })
    ).not.toThrow()
  })

  it("no lanza si fetch lanza de forma sincrónica", () => {
    fetchMock.mockImplementation(() => {
      throw new Error("sync")
    })

    expect(() =>
      reportClientError(new Error("boom"), { context: "x" })
    ).not.toThrow()
  })

  it("acepta valores que no son Error", () => {
    expect(() => reportClientError("solo texto", { context: "x" })).not.toThrow()

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string
    )
    expect(body.message).toBe("[x] solo texto")
  })

  it("no reporta en SSR (sin window)", () => {
    delete g.window
    reportClientError(new Error("boom"), { context: "x" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("recorta message y stack a los topes del endpoint", () => {
    const err = new Error("x".repeat(6000))
    err.stack = "y".repeat(20000)
    reportClientError(err, { context: "x" })

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string
    )
    expect((body.message as string).length).toBeLessThanOrEqual(5000)
    expect((body.stack as string).length).toBeLessThanOrEqual(10000)
  })

  it("avisa en desarrollo cuando el endpoint rechaza el reporte", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    reportClientError(new Error("boom"), { context: "x" })

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("500"))
    )
    warn.mockRestore()
  })

  it("no avisa en producción (el usuario no debe ver warnings internos)", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    reportClientError(new Error("boom"), { context: "x" })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("no avisa cuando el reporte se acepta", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    reportClientError(new Error("boom"), { context: "x" })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
