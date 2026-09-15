import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DatosClave } from "./datos-clave"
import { getCommercialFacts } from "@/lib/commercial-facts"

/**
 * La tabla es la parte de la página que un motor de IA puede citar, así que se
 * verifica el HTML real y no solo los datos.
 */
describe("DatosClave", () => {
  const html = renderToStaticMarkup(DatosClave({}))

  it("expone un id estable para speakable y enlaces profundos", () => {
    expect(html).toContain('id="datos-clave"')
    expect(html).toContain('id="datos-clave-titulo"')
    expect(html).toContain('aria-labelledby="datos-clave-titulo"')
  })

  it("renderiza una tabla real, no una lista de divs", () => {
    expect(html).toContain("<table")
    expect(html).toContain("<tbody>")
    expect(html).toContain("<caption")
  })

  it("usa th con scope=row para que el par etiqueta/valor sea legible", () => {
    const ths = html.match(/<th scope="row"/g) ?? []
    expect(ths.length).toBe(getCommercialFacts().length)
  })

  it("incluye todos los datos clave con su valor", () => {
    for (const fact of getCommercialFacts()) {
      expect(html).toContain(fact.label)
      expect(html).toContain(fact.value)
    }
  })

  it("incluye los datos que más se citan", () => {
    expect(html).toContain("$500 MXN")
    expect(html).toContain("$2,500 MXN")
    expect(html).toContain("CFDI 4.0")
    expect(html).toContain("Sin membresía ni suscripción")
  })

  it("no filtra marcadores de plantilla sin resolver", () => {
    expect(html).not.toContain("undefined")
    expect(html).not.toContain("null")
    expect(html).not.toContain("[object Object]")
  })

  it("acepta un sujeto para contextualizar la tabla", () => {
    const conSujeto = renderToStaticMarkup(
      DatosClave({ subject: "Abarrotes en Chihuahua" })
    )
    expect(conSujeto).toContain("Datos clave: Abarrotes en Chihuahua")
    expect(conSujeto).toContain("para Abarrotes en Chihuahua")
  })

  it("sin sujeto no deja el separador colgando", () => {
    expect(html).toContain(">Datos clave</h2>")
    expect(html).not.toContain("Datos clave:")
  })

  it("no intercala comentarios de React en el texto citable", () => {
    // Un extractor ingenuo leería "Datos clave<!-- -->: Abarrotes" si el
    // encabezado se construyera con varios nodos de texto.
    expect(html).not.toContain("<!--")
  })

  it("propaga la clase contenedora cuando se pasa", () => {
    const conClase = renderToStaticMarkup(DatosClave({ className: "mt-6" }))
    expect(conClase).toContain('class="mt-6"')
  })
})
