import { describe, expect, it } from "vitest"

import {
  IDS_PER_REQUEST,
  MAX_RESTORE_PAGES,
  buildMap,
  chunkIds,
  isNewProduct,
  pagesToRestore,
  productCount,
  timeAgo,
  type AvailabilityRow,
} from "./admin-product-list"

const NOW = Date.parse("2026-06-15T12:00:00.000Z")

describe("timeAgo", () => {
  it("dice 'ahora' por debajo del minuto", () => {
    expect(timeAgo(new Date(NOW - 30_000).toISOString(), NOW)).toBe("ahora")
  })

  it("cuenta minutos, horas y días", () => {
    expect(timeAgo(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("hace 5 min")
    expect(timeAgo(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("hace 3 h")
    expect(timeAgo(new Date(NOW - 4 * 86_400_000).toISOString(), NOW)).toBe("hace 4 d")
  })

  it("cae a fecha absoluta a partir de 30 días", () => {
    const iso = new Date(NOW - 45 * 86_400_000).toISOString()
    expect(timeAgo(iso, NOW)).toBe(new Date(iso).toLocaleDateString("es-MX"))
  })

  it("trata el minuto exacto como minutos, no como 'ahora'", () => {
    expect(timeAgo(new Date(NOW - 60_000).toISOString(), NOW)).toBe("hace 1 min")
  })
})

describe("isNewProduct", () => {
  it("es false sin fecha de creación", () => {
    expect(isNewProduct({ created_at: null }, NOW)).toBe(false)
  })

  it("es true dentro de los 7 días", () => {
    expect(isNewProduct({ created_at: new Date(NOW - 6 * 86_400_000).toISOString() }, NOW)).toBe(true)
  })

  it("es false justo al pasar los 7 días", () => {
    expect(isNewProduct({ created_at: new Date(NOW - 8 * 86_400_000).toISOString() }, NOW)).toBe(false)
  })
})

describe("productCount", () => {
  it("usa el singular con 1", () => {
    expect(productCount(1)).toBe("1 producto")
  })

  it("usa el plural con 0 y con más de 1", () => {
    expect(productCount(0)).toBe("0 productos")
    expect(productCount(12)).toBe("12 productos")
  })
})

describe("buildMap", () => {
  const rows: AvailabilityRow[] = [
    { product_id: 1, city_id: 10, is_available: true },
    { product_id: 1, city_id: 11, is_available: false },
    { product_id: 2, city_id: 10, is_available: true },
  ]

  it("agrupa las celdas por producto y ciudad", () => {
    const map = buildMap(rows)
    expect(map.get(1)?.get(10)).toBe(true)
    expect(map.get(1)?.get(11)).toBe(false)
    expect(map.get(2)?.get(10)).toBe(true)
  })

  it("distingue 'sin filas' (global) de 'no disponible'", () => {
    const map = buildMap(rows)
    // Producto 3 no aparece: sin filas = disponible en todas las ciudades.
    expect(map.has(3)).toBe(false)
    // Producto 1 sí tiene fila para la ciudad 11, y es false.
    expect(map.get(1)?.get(11)).toBe(false)
  })

  it("devuelve un mapa vacío sin filas", () => {
    expect(buildMap([]).size).toBe(0)
  })

  it("deja ganar la última fila si el servidor repite una celda", () => {
    const map = buildMap([
      { product_id: 1, city_id: 10, is_available: true },
      { product_id: 1, city_id: 10, is_available: false },
    ])
    expect(map.get(1)?.get(10)).toBe(false)
  })
})

describe("chunkIds", () => {
  it("devuelve una lista vacía sin ids", () => {
    expect(chunkIds([])).toEqual([])
  })

  it("deja un bloque único por debajo del tope", () => {
    expect(chunkIds([1, 2, 3])).toEqual([[1, 2, 3]])
  })

  it("trocea justo en el tope, sin bloques vacíos", () => {
    const ids = Array.from({ length: IDS_PER_REQUEST * 2 }, (_, i) => i + 1)
    const chunks = chunkIds(ids)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(IDS_PER_REQUEST)
    expect(chunks[1]).toHaveLength(IDS_PER_REQUEST)
  })

  it("deja el resto en el último bloque", () => {
    const ids = Array.from({ length: IDS_PER_REQUEST + 7 }, (_, i) => i + 1)
    const chunks = chunkIds(ids)
    expect(chunks).toHaveLength(2)
    expect(chunks[1]).toHaveLength(7)
    expect(chunks[1]?.[6]).toBe(IDS_PER_REQUEST + 7)
  })

  it("no pierde ni duplica ids al trocear", () => {
    const ids = Array.from({ length: IDS_PER_REQUEST * 2 + 3 }, (_, i) => i + 1)
    expect(chunkIds(ids).flat()).toEqual(ids)
  })
})

describe("pagesToRestore", () => {
  const base = { listKey: "q=&sort=name&dir=asc&pageSize=50", page: 4, initialPage: 1 }

  it("en el primer render respeta el deep-link ?page=N", () => {
    expect(pagesToRestore({ ...base, prevListKey: null, initialPage: 3 })).toBe(3)
  })

  it("con el mismo listado (recarga) conserva la profundidad alcanzada", () => {
    expect(pagesToRestore({ ...base, prevListKey: base.listKey })).toBe(4)
  })

  it("con filtros, orden o tanda nuevos vuelve a la primera tanda", () => {
    expect(pagesToRestore({ ...base, prevListKey: "q=resorte&sort=name&dir=asc&pageSize=50" })).toBe(1)
    expect(pagesToRestore({ ...base, prevListKey: `${base.listKey}`.replace("dir=asc", "dir=desc") })).toBe(1)
    expect(pagesToRestore({ ...base, prevListKey: `${base.listKey}`.replace("pageSize=50", "pageSize=200") })).toBe(1)
  })

  it("acota al tope para que un ?page=999 no dispare cientos de peticiones", () => {
    expect(pagesToRestore({ ...base, prevListKey: null, initialPage: 999 })).toBe(MAX_RESTORE_PAGES)
    expect(pagesToRestore({ ...base, prevListKey: base.listKey, page: 999 })).toBe(MAX_RESTORE_PAGES)
  })

  it("nunca devuelve menos de una tanda, ni con valores corruptos", () => {
    expect(pagesToRestore({ ...base, prevListKey: null, initialPage: -5 })).toBe(1)
    expect(pagesToRestore({ ...base, prevListKey: base.listKey, page: 0 })).toBe(1)
    expect(pagesToRestore({ ...base, prevListKey: base.listKey, page: Number.NaN })).toBe(1)
    expect(pagesToRestore({ ...base, prevListKey: base.listKey, page: 3.9 })).toBe(3)
  })
})
