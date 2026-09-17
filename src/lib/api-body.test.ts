import { describe, expect, it } from "vitest"
import { readJsonBody } from "./api-body"

function requestWith(body: BodyInit | null): Request {
  return new Request("http://localhost/api/test", { method: "POST", body })
}

describe("readJsonBody", () => {
  it("devuelve el objeto cuando el JSON es válido", async () => {
    const result = await readJsonBody<{ productId: number }>(
      requestWith(JSON.stringify({ productId: 7 }))
    )

    expect(result).toEqual({ ok: true, data: { productId: 7 } })
  })

  it("acepta un objeto vacío (la validación de campos es de cada ruta)", async () => {
    expect(await readJsonBody(requestWith("{}"))).toEqual({ ok: true, data: {} })
  })

  it("rechaza con 400 un body ausente", async () => {
    const result = await readJsonBody(requestWith(null))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
    expect(result.error).toMatch(/inválido/i)
  })

  it("rechaza con 400 un JSON malformado", async () => {
    const result = await readJsonBody(requestWith("{"))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
  })

  it("rechaza con 400 un body que no es objeto", async () => {
    for (const raw of ["null", "[]", '"texto"', "42", "true"]) {
      const result = await readJsonBody(requestWith(raw))
      expect(result.ok, raw).toBe(false)
      if (result.ok) continue
      expect(result.status, raw).toBe(400)
    }
  })
})
