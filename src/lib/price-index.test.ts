import { describe, expect, it } from "vitest"
import {
  describeMuestra,
  filterByCiudad,
  filterByInsumo,
  formatFecha,
  formatPrecio,
  getIsoWeekMonday,
  promedio,
  summarizeCiudades,
  summarizeInsumos,
  toPriceIndexCsv,
  variacionPct,
  type PricePoint,
} from "./price-index"

/** Primer elemento, con error explícito si la lista está vacía. */
function first<T>(list: T[]): T {
  const item = list[0]
  if (!item) throw new Error("lista vacía")
  return item
}

function punto(overrides: Partial<PricePoint> = {}): PricePoint {
  return {
    fecha: "2026-03-02",
    insumo: "Jitomate saladette",
    insumoSlug: "jitomate-saladette",
    unidad: "kg",
    precio: 28.5,
    precioMin: 24,
    precioMax: 33,
    precioCatalogo: 30,
    moneda: "MXN",
    ciudad: "Chihuahua",
    ciudadSlug: "chihuahua",
    categoria: "Frutas y verduras",
    categoriaSlug: "frutas-y-verduras",
    muestra: 4,
    actualizadoEn: "2026-03-02T12:00:00Z",
    ...overrides,
  }
}

describe("getIsoWeekMonday", () => {
  it("devuelve el lunes de la misma semana", () => {
    // 2026-03-04 es miércoles.
    expect(getIsoWeekMonday(new Date("2026-03-04T15:00:00Z"))).toBe("2026-03-02")
  })

  it("un lunes se devuelve a sí mismo", () => {
    expect(getIsoWeekMonday(new Date("2026-03-02T00:00:00Z"))).toBe("2026-03-02")
  })

  it("el domingo pertenece a la semana que empieza el lunes anterior", () => {
    expect(getIsoWeekMonday(new Date("2026-03-08T23:00:00Z"))).toBe("2026-03-02")
  })

  it("cruza el fin de año hacia el año anterior", () => {
    // 2026-01-01 es jueves: su semana ISO empezó el lunes 2025-12-29.
    expect(getIsoWeekMonday(new Date("2026-01-01T08:00:00Z"))).toBe("2025-12-29")
  })

  it("devuelve siempre una fecha YYYY-MM-DD", () => {
    const valor = getIsoWeekMonday(new Date("2026-12-31T23:59:59Z"))
    expect(valor).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("summarizeInsumos", () => {
  it("agrupa por insumo y cuenta ciudades distintas", () => {
    const resumen = summarizeInsumos([
      punto({ ciudadSlug: "chihuahua", ciudad: "Chihuahua", precio: 28 }),
      punto({ ciudadSlug: "juarez", ciudad: "Ciudad Juárez", precio: 31 }),
    ])
    expect(resumen).toHaveLength(1)
    expect(first(resumen).ciudades).toBe(2)
    expect(first(resumen).precioMin).toBe(28)
    expect(first(resumen).precioMax).toBe(31)
  })

  it("toma el precio de la ciudad con la muestra más grande", () => {
    const resumen = summarizeInsumos([
      punto({ ciudadSlug: "chihuahua", precio: 28, muestra: 1 }),
      punto({ ciudadSlug: "juarez", ciudad: "Ciudad Juárez", precio: 31, muestra: 9 }),
    ])
    expect(first(resumen).precio).toBe(31)
  })

  it("desempata por ciudad alfabética para ser determinista", () => {
    const resumen = summarizeInsumos([
      punto({ ciudadSlug: "torreon", ciudad: "Torreón", precio: 40, muestra: 3 }),
      punto({ ciudadSlug: "chihuahua", ciudad: "Chihuahua", precio: 20, muestra: 3 }),
    ])
    expect(first(resumen).precio).toBe(20)
  })

  it("ordena los insumos más surtidos primero", () => {
    const resumen = summarizeInsumos([
      punto({ insumoSlug: "a", insumo: "A", ciudadSlug: "chihuahua", muestra: 1 }),
      punto({ insumoSlug: "b", insumo: "B", ciudadSlug: "chihuahua", muestra: 1 }),
      punto({ insumoSlug: "b", insumo: "B", ciudadSlug: "juarez", muestra: 1 }),
    ])
    expect(resumen.map((i) => i.insumoSlug)).toEqual(["b", "a"])
  })

  it("suma las muestras de todas las ciudades", () => {
    const resumen = summarizeInsumos([
      punto({ ciudadSlug: "chihuahua", muestra: 3 }),
      punto({ ciudadSlug: "juarez", muestra: 5 }),
    ])
    expect(first(resumen).muestra).toBe(8)
  })

  it("devuelve una lista vacía sin puntos", () => {
    expect(summarizeInsumos([])).toEqual([])
  })
})

describe("summarizeCiudades", () => {
  it("agrupa por ciudad y cuenta categorías distintas", () => {
    const resumen = summarizeCiudades([
      punto({ categoriaSlug: "frutas-y-verduras" }),
      punto({ insumoSlug: "aceite", categoriaSlug: "abarrotes", precio: 40 }),
    ])
    expect(resumen).toHaveLength(1)
    expect(first(resumen).insumos).toBe(2)
    expect(first(resumen).categorias).toBe(2)
    expect(first(resumen).precioMin).toBe(28.5)
    expect(first(resumen).precioMax).toBe(40)
  })

  it("ignora categorías nulas al contarlas", () => {
    const resumen = summarizeCiudades([
      punto({ categoriaSlug: null, categoria: null }),
      punto({ insumoSlug: "aceite", categoriaSlug: null, categoria: null }),
    ])
    expect(first(resumen).categorias).toBe(0)
  })

  it("ordena las ciudades con más insumos primero", () => {
    const resumen = summarizeCiudades([
      punto({ ciudadSlug: "juarez", ciudad: "Ciudad Juárez" }),
      punto({ ciudadSlug: "chihuahua", insumoSlug: "aceite" }),
      punto({ ciudadSlug: "chihuahua", insumoSlug: "jitomate" }),
    ])
    expect(resumen.map((c) => c.ciudadSlug)).toEqual(["chihuahua", "juarez"])
  })
})

describe("filterByInsumo", () => {
  it("devuelve solo el insumo pedido, del más barato al más caro", () => {
    const filtrado = filterByInsumo(
      [
        punto({ ciudadSlug: "juarez", ciudad: "Ciudad Juárez", precio: 31 }),
        punto({ ciudadSlug: "chihuahua", precio: 28 }),
        punto({ insumoSlug: "aceite", insumo: "Aceite", precio: 40 }),
      ],
      "jitomate-saladette"
    )
    expect(filtrado.map((p) => p.precio)).toEqual([28, 31])
  })

  it("devuelve vacío si el insumo no existe", () => {
    expect(filterByInsumo([punto()], "no-existe")).toEqual([])
  })
})

describe("filterByCiudad", () => {
  it("devuelve solo la ciudad pedida, alfabético por insumo", () => {
    const filtrado = filterByCiudad(
      [
        punto({ insumoSlug: "jitomate", insumo: "Jitomate" }),
        punto({ insumoSlug: "aceite", insumo: "Aceite" }),
        punto({ ciudadSlug: "juarez", ciudad: "Ciudad Juárez" }),
      ],
      "chihuahua"
    )
    expect(filtrado.map((p) => p.insumo)).toEqual(["Aceite", "Jitomate"])
  })

  it("devuelve vacío si la ciudad no existe", () => {
    expect(filterByCiudad([punto()], "no-existe")).toEqual([])
  })
})

describe("toPriceIndexCsv", () => {
  it("emite el encabezado congelado y una fila por punto", () => {
    const csv = toPriceIndexCsv([punto()])
    const [header, fila] = csv.split("\n")
    expect(header).toBe(
      "fecha,insumo,insumo_slug,unidad,precio,precio_min,precio_max,precio_catalogo,moneda,ciudad,ciudad_slug,categoria,categoria_slug,muestra,actualizado_en"
    )
    expect(fila).toBe(
      "2026-03-02,Jitomate saladette,jitomate-saladette,kg,28.5,24,33,30,MXN,Chihuahua,chihuahua,Frutas y verduras,frutas-y-verduras,4,2026-03-02T12:00:00Z"
    )
  })

  it("sin puntos solo devuelve el encabezado", () => {
    const csv = toPriceIndexCsv([])
    expect(csv.split("\n")).toHaveLength(2)
    expect(csv.startsWith("fecha,insumo")).toBe(true)
  })

  it("termina en newline (CSV POSIX)", () => {
    expect(toPriceIndexCsv([]).endsWith("\n")).toBe(true)
    expect(toPriceIndexCsv([punto()]).endsWith("\n")).toBe(true)
  })

  it("cita los valores con coma y escapa las comillas dobles", () => {
    const csv = toPriceIndexCsv([
      punto({ insumo: 'Jitomate "bola", primera', unidad: null }),
    ])
    const fila = csv.split("\n")[1]
    expect(fila).toContain('"Jitomate ""bola"", primera"')
    // La unidad nula queda como celda vacía, sin comillas.
    expect(fila).toContain("jitomate-saladette,,28.5,24,")
  })

  it("deja vacías las celdas nulas en vez de imprimir null", () => {
    const csv = toPriceIndexCsv([
      punto({ precioMin: null, precioMax: null, precioCatalogo: null, actualizadoEn: null }),
    ])
    const fila = csv.split("\n")[1]
    expect(fila).not.toContain("null")
    expect(fila).not.toContain("undefined")
  })
})

describe("formatPrecio", () => {
  it("omite los decimales cuando el precio es entero", () => {
    expect(formatPrecio(30)).not.toContain(",00")
  })

  it("conserva dos decimales cuando el precio los tiene", () => {
    expect(formatPrecio(28.5)).toMatch(/28[.,]50/)
  })

  it("incluye el símbolo de peso", () => {
    expect(formatPrecio(30)).toContain("$")
  })
})

describe("formatFecha", () => {
  it("formatea en español sin desfase de zona horaria", () => {
    const formateado = formatFecha("2026-03-02")
    expect(formateado).toContain("2026")
    expect(formateado).toContain("2")
  })

  it("no retrocede un día por la zona horaria local", () => {
    // Un Date.UTC(2026, 2, 2) siempre cae el 2 de marzo en UTC.
    expect(formatFecha("2026-03-02")).not.toContain("1 de")
  })

  it("devuelve la entrada tal cual si no es una fecha válida", () => {
    expect(formatFecha("no-es-fecha")).toBe("no-es-fecha")
  })
})

describe("describeMuestra", () => {
  it("explica la muestra 0 como precio de catálogo", () => {
    expect(describeMuestra(0)).toContain("catálogo")
  })

  it("advierte que una muestra de 1 no es promedio de mercado", () => {
    expect(describeMuestra(1)).toContain("no es un promedio de mercado")
  })

  it("declara la mediana cuando hay varias tiendas", () => {
    expect(describeMuestra(7)).toBe("Mediana de 7 tiendas.")
  })

  it("trata valores negativos como ausencia de muestra", () => {
    expect(describeMuestra(-1)).toContain("catálogo")
  })
})

describe("variacionPct", () => {
  it("calcula la variación entre el primer y el último punto", () => {
    expect(variacionPct([{ precio: 100 }, { precio: 110 }])).toBeCloseTo(10)
  })

  it("devuelve negativo cuando el precio baja", () => {
    expect(variacionPct([{ precio: 100 }, { precio: 80 }])).toBeCloseTo(-20)
  })

  it("devuelve null con menos de dos puntos", () => {
    expect(variacionPct([])).toBeNull()
    expect(variacionPct([{ precio: 100 }])).toBeNull()
  })

  it("devuelve null si el precio inicial es cero", () => {
    expect(variacionPct([{ precio: 0 }, { precio: 10 }])).toBeNull()
  })
})

describe("promedio", () => {
  it("promedia los puntos de la serie", () => {
    expect(promedio([{ precio: 10 }, { precio: 20 }])).toBe(15)
  })

  it("devuelve null con la serie vacía", () => {
    expect(promedio([])).toBeNull()
  })
})
