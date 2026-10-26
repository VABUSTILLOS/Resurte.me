import { describe, expect, it } from "vitest"
import {
  CHIHUAHUA_DELIVERY_ZONES,
  LOCAL_CITY_NAME,
  LOCAL_COVERAGE_SCOPE,
  LOCAL_MODEL_PROSE,
  LOCAL_OPERATION_PROSE,
  getLocalFaq,
  getLocalFaqSchema,
} from "./local-content"
import { BUSINESS_LOCATION_LABEL, HOME_CITY } from "./business"
import { DELIVERY_COVERAGE_PROSE, MIN_ORDER_MXN, formatMxn } from "./commercial-facts"

describe("local-content", () => {
  it("declara Chihuahua como ciudad de operación", () => {
    expect(LOCAL_CITY_NAME).toBe("Chihuahua")
    expect(LOCAL_CITY_NAME).toBe(HOME_CITY.name)
    expect(BUSINESS_LOCATION_LABEL).toBe("Chihuahua, Chihuahua, México")
  })

  it("no deja la prosa local sin la ciudad ni sin la cobertura real", () => {
    expect(LOCAL_OPERATION_PROSE).toContain(BUSINESS_LOCATION_LABEL)
    expect(LOCAL_OPERATION_PROSE).toContain(DELIVERY_COVERAGE_PROSE)
    expect(LOCAL_MODEL_PROSE).toContain(formatMxn(MIN_ORDER_MXN))
  })

  it("declara cobertura de toda la ciudad, no solo de las colonias listadas", () => {
    // La lista de colonias es una muestra: si el texto la presenta como el
    // límite del servicio, se subestima la cobertura real y se pierde la
    // consulta "entrega en mi colonia" de cualquier colonia no listada.
    expect(LOCAL_COVERAGE_SCOPE).toContain("toda la ciudad")
    expect(LOCAL_COVERAGE_SCOPE).toContain(LOCAL_CITY_NAME)
    expect(LOCAL_OPERATION_PROSE).toContain("toda la ciudad")
  })

  it("responde la pregunta de colonias con cobertura total", () => {
    const answer = getLocalFaq().find((item) =>
      item.question.includes("colonias")
    )?.answer
    expect(answer).toBeDefined()
    expect(answer).toContain("toda la ciudad")
    expect(answer?.toLowerCase()).toContain("no hay colonias excluidas")
  })

  it("publica zonas de entrega sin duplicados ni entradas vacías", () => {
    expect(CHIHUAHUA_DELIVERY_ZONES.length).toBeGreaterThan(0)
    const unique = new Set(CHIHUAHUA_DELIVERY_ZONES)
    expect(unique.size).toBe(CHIHUAHUA_DELIVERY_ZONES.length)
    for (const zone of CHIHUAHUA_DELIVERY_ZONES) {
      expect(zone.trim()).toBe(zone)
      expect(zone.length).toBeGreaterThan(0)
    }
  })

  it("responde cada pregunta local sin remitir a otra página", () => {
    const faq = getLocalFaq()
    expect(faq.length).toBeGreaterThan(0)
    for (const item of faq) {
      expect(item.question.endsWith("?")).toBe(true)
      // Una respuesta que solo enlaza no se puede citar como snippet.
      expect(item.answer.length).toBeGreaterThan(40)
      expect(item.answer).not.toMatch(/^(ver|consulta|lee)\b/i)
    }
  })

  it("menciona Chihuahua en la primera pregunta, que es la de entidad", () => {
    const first = getLocalFaq()[0]
    expect(first?.question).toContain("Dónde opera")
    expect(first?.answer).toContain("Chihuahua")
  })

  it("emite un FAQPage válido con una Question por cada respuesta", () => {
    const schema = getLocalFaqSchema("https://resurte.me")
    expect(schema["@type"]).toBe("FAQPage")
    expect(schema["@id"]).toBe("https://resurte.me#faq")
    expect(schema.inLanguage).toBe("es-MX")
    expect(schema.mainEntity).toHaveLength(getLocalFaq().length)
    for (const question of schema.mainEntity) {
      expect(question["@type"]).toBe("Question")
      expect(question.acceptedAnswer["@type"]).toBe("Answer")
      expect(question.acceptedAnswer.text.length).toBeGreaterThan(0)
    }
  })
})
