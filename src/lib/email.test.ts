import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { escapeHtml, sendEmail } from "@/lib/email"

/**
 * El comportamiento crítico aquí es el de producción sin credencial: antes
 * `sendEmail` devolvía `ok: true` con id "dev-logged", lo que hacía que
 * `email_logs` registrara "sent", que la bitácora admin mostrara el correo
 * como enviado y que el dedupe bloqueara el reintento para siempre.
 */
describe("sendEmail", () => {
  const payload = { to: "cliente@x.mx", subject: "Hola", html: "<p>Hola</p>" }

  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("en producción sin RESEND_API_KEY falla, no simula éxito", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("RESEND_API_KEY", "")
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    const result = await sendEmail(payload)

    expect(result.ok).toBe(false)
    expect(result.error).toBe("email_not_configured")
    expect(result.id).toBeUndefined()
    // Sin credencial no se intenta ninguna llamada de red.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("en desarrollo sin RESEND_API_KEY conserva el registro en consola", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("RESEND_API_KEY", "")

    const result = await sendEmail(payload)

    expect(result).toEqual({ ok: true, id: "dev-logged" })
  })

  it("con credencial envía y devuelve el id del proveedor", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key")
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "re_123" }),
    })
    vi.stubGlobal("fetch", fetchSpy)

    const result = await sendEmail(payload)

    expect(result).toEqual({ ok: true, id: "re_123" })
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it("con credencial propaga el error del proveedor", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: "domain not verified" }),
      })
    )

    const result = await sendEmail(payload)

    expect(result).toEqual({ ok: false, error: "domain not verified" })
  })
})

describe("escapeHtml", () => {
  it("neutraliza los caracteres peligrosos en plantillas", () => {
    expect(escapeHtml(`<script>alert("x")&'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;&lt;/script&gt;"
    )
  })
})
