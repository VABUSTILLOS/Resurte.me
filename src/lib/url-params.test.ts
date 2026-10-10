import { describe, expect, it } from "vitest"
import { withoutQueryParams } from "./url-params"

describe("withoutQueryParams", () => {
  it("quita el parámetro y deja la ruta limpia cuando era el único", () => {
    expect(withoutQueryParams("/r/la-taqueria?reorden=abc123", ["reorden"])).toBe(
      "/r/la-taqueria"
    )
  })

  it("conserva los demás parámetros y su orden", () => {
    expect(
      withoutQueryParams("/r/la-taqueria?a=1&reorden=abc&b=2", ["reorden"])
    ).toBe("/r/la-taqueria?a=1&b=2")
    expect(withoutQueryParams("/r/la-taqueria?reorden=abc&mesa=7", ["reorden"])).toBe(
      "/r/la-taqueria?mesa=7"
    )
  })

  it("quita varios parámetros de una sola pasada", () => {
    expect(
      withoutQueryParams(
        "/checkout?payment_intent=pi_1&payment_intent_client_secret=pi_1_secret&redirect_status=succeeded&utm=x",
        ["payment_intent", "payment_intent_client_secret", "redirect_status"]
      )
    ).toBe("/checkout?utm=x")
  })

  it("devuelve el mismo string cuando nada coincide", () => {
    const href = "/r/la-taqueria?mesa=7"
    expect(withoutQueryParams(href, ["reorden"])).toBe(href)
    expect(withoutQueryParams("/r/la-taqueria", ["reorden"])).toBe("/r/la-taqueria")
    expect(withoutQueryParams(href, [])).toBe(href)
  })

  it("conserva el hash y lo que va antes de la query", () => {
    expect(withoutQueryParams("/r/x?reorden=1#menu", ["reorden"])).toBe("/r/x#menu")
    expect(withoutQueryParams("/r/x?reorden=1&mesa=2#menu", ["reorden"])).toBe(
      "/r/x?mesa=2#menu"
    )
    // El `#` corta la query: `reorden` en el hash no es el parámetro de la URL.
    expect(withoutQueryParams("/r/x?a=1#reorden=9", ["reorden"])).toBe("/r/x?a=1#reorden=9")
  })

  it("funciona con URL absoluta y conserva el origen", () => {
    expect(
      withoutQueryParams("https://resurte.me/r/x?reorden=1&mesa=2", ["reorden"])
    ).toBe("https://resurte.me/r/x?mesa=2")
  })

  it("quita el parámetro sin valor y compara la clave decodificada", () => {
    expect(withoutQueryParams("/r/x?reorden&mesa=2", ["reorden"])).toBe("/r/x?mesa=2")
    expect(withoutQueryParams("/r/x?reor%64en=1&mesa=2", ["reorden"])).toBe("/r/x?mesa=2")
  })

  it("no confunde una clave que solo empieza igual", () => {
    expect(withoutQueryParams("/r/x?reorden-id=1", ["reorden"])).toBe("/r/x?reorden-id=1")
  })
})
