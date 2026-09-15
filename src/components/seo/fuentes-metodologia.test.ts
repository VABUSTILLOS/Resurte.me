import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { FuentesMetodologia } from "./fuentes-metodologia"
import { DELIVERY_CITIES, FREE_SHIPPING_MXN, MIN_ORDER_MXN, formatMxn } from "@/lib/commercial-facts"

const html = renderToStaticMarkup(FuentesMetodologia({}))

describe("FuentesMetodologia", () => {
  it("expone un id estable para enlazar y para speakable", () => {
    expect(html).toContain('id="fuentes-y-metodologia"')
    expect(html).toContain('id="fuentes-y-metodologia-titulo"')
    expect(html).toContain('aria-labelledby="fuentes-y-metodologia-titulo"')
  })

  it("declara la fuente de los datos", () => {
    expect(html).toContain("Fuente de los precios")
    expect(html).toContain("mediana")
  })

  it("explica el método, no solo el resultado", () => {
    expect(html).toContain("Cómo se calculan las cifras")
    expect(html).toContain("Actualización")
    expect(html).toContain("Alcance")
  })

  it("usa una lista de definiciones, no párrafos sueltos", () => {
    expect(html).toContain("<dl")
    expect(html).toContain("<dt")
    expect(html).toContain("<dd")
  })

  it("cita las condiciones desde la fuente única de datos comerciales", () => {
    expect(html).toContain(formatMxn(MIN_ORDER_MXN))
    expect(html).toContain(formatMxn(FREE_SHIPPING_MXN))
    expect(html).toContain(String(DELIVERY_CITIES))
  })

  it("enlaza el índice de precios para profundizar", () => {
    expect(html).toContain('href="/precios"')
  })

  it("declara que no es una cotización", () => {
    expect(html).toContain("no una cotización")
  })

  it("acepta un sujeto para que la sección se lea autocontenida", () => {
    const conSujeto = renderToStaticMarkup(
      FuentesMetodologia({ subject: "costos de un restaurante" })
    )
    expect(conSujeto).toContain(
      "Fuentes y metodología: costos de un restaurante"
    )
  })

  it("sin sujeto no deja el separador colgando", () => {
    expect(html).toContain(">Fuentes y metodología</h2>")
    expect(html).not.toContain("Fuentes y metodología:")
  })

  it("propaga la clase contenedora cuando se pasa", () => {
    const conClase = renderToStaticMarkup(
      FuentesMetodologia({ className: "mt-8" })
    )
    expect(conClase).toContain('class="mt-8"')
  })

  it("no filtra marcadores de plantilla sin resolver", () => {
    expect(html).not.toContain("undefined")
    expect(html).not.toContain("[object Object]")
  })
})
