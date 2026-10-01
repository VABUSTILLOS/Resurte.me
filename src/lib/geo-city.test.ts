import { describe, expect, it } from "vitest"

import { detectCityFromHeaders, foldGeoName } from "@/lib/geo-city"

function headers(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe("foldGeoName", () => {
  it("ignora acentos, mayúsculas y espacios sobrantes", () => {
    expect(foldGeoName("  Querétaro ")).toBe("queretaro")
    expect(foldGeoName("León")).toBe("leon")
    expect(foldGeoName("Mérida")).toBe("merida")
  })
})

describe("detectCityFromHeaders", () => {
  it("resuelve la ciudad del visitante por el nombre del edge", () => {
    expect(detectCityFromHeaders(headers({ "x-vercel-ip-city": "Chihuahua" }))).toBe(
      "chihuahua"
    )
    expect(detectCityFromHeaders(headers({ "x-vercel-ip-city": "Mexico City" }))).toBe(
      "cdmx"
    )
  })

  it("decodifica el nombre percent-encoded que envía Vercel", () => {
    expect(
      detectCityFromHeaders(
        headers({ "x-vercel-ip-city": "San%20Luis%20Potos%C3%AD" })
      )
    ).toBe("san-luis-potosi")
  })

  it("cae a la región cuando el nombre de ciudad no está en el mapa", () => {
    expect(
      detectCityFromHeaders(
        headers({
          "x-vercel-ip-city": "Delicias",
          "x-vercel-ip-country": "MX",
          "x-vercel-ip-country-region": "CHH",
        })
      )
    ).toBe("chihuahua")
  })

  it("cae a la ciudad más cercana cuando la región tampoco está mapeada", () => {
    expect(
      detectCityFromHeaders(
        headers({
          "x-vercel-ip-country": "MX",
          "x-vercel-ip-country-region": "XXX",
          "x-vercel-ip-latitude": "28.6353",
          "x-vercel-ip-longitude": "-106.0889",
        })
      )
    ).toBe("chihuahua")
  })

  it("no asigna ciudad mexicana a visitantes de otros países", () => {
    expect(
      detectCityFromHeaders(
        headers({
          "x-vercel-ip-city": "El Paso",
          "x-vercel-ip-country": "US",
          "x-vercel-ip-country-region": "TX",
          "x-vercel-ip-latitude": "31.7587",
          "x-vercel-ip-longitude": "-106.4869",
        })
      )
    ).toBeNull()
  })

  it("devuelve null sin cabeceras de geolocalización (dev local)", () => {
    expect(detectCityFromHeaders(headers({}))).toBeNull()
  })
})
