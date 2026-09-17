import { describe, expect, it, vi } from "vitest"

import {
  addRange,
  collectFilteredIds,
  isAllFilteredSelected,
  shiftRange,
  toggleSelected,
} from "@/lib/admin-product-selection"

const PAGE = [10, 11, 12, 13, 14]

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}

/** `fetch` de prueba con una lista de respuestas, una por petición. */
function fetchQueue(responses: Response[]) {
  const calls: string[] = []
  let index = 0
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input))
    const response = responses[index]
    index++
    if (!response) throw new Error("fetch inesperado")
    return response
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe("toggleSelected", () => {
  it("añade un id ausente", () => {
    const next = toggleSelected(new Set([1]), 2)
    expect([...next]).toEqual([1, 2])
  })

  it("quita un id presente", () => {
    const next = toggleSelected(new Set([1, 2]), 1)
    expect([...next]).toEqual([2])
  })

  it("no muta el conjunto anterior", () => {
    const prev = new Set([1])
    toggleSelected(prev, 2)
    expect([...prev]).toEqual([1])
  })
})

describe("shiftRange", () => {
  it("devuelve el rango hacia abajo", () => {
    expect(shiftRange(PAGE, 10, 13)).toEqual({ from: 0, to: 3 })
  })

  it("devuelve el rango hacia arriba invertido", () => {
    expect(shiftRange(PAGE, 13, 10)).toEqual({ from: 0, to: 3 })
  })

  it("devuelve null si el ancla no está en la página", () => {
    expect(shiftRange(PAGE, 99, 12)).toBeNull()
  })

  it("devuelve null si el destino no está en la página", () => {
    expect(shiftRange(PAGE, 10, 99)).toBeNull()
  })

  it("devuelve null con un solo id en página vacía", () => {
    expect(shiftRange([], 1, 2)).toBeNull()
  })
})

describe("addRange", () => {
  it("añade el rango inclusivo por posición", () => {
    const next = addRange(new Set<number>(), PAGE, 1, 3)
    expect([...next]).toEqual([11, 12, 13])
  })

  it("conserva lo ya seleccionado", () => {
    const next = addRange(new Set([10]), PAGE, 4, 4)
    expect([...next].sort((a, b) => a - b)).toEqual([10, 14])
  })

  it("ignora posiciones fuera de la página", () => {
    const next = addRange(new Set<number>(), PAGE, 3, 9)
    expect([...next]).toEqual([13, 14])
  })

  it("no muta el conjunto anterior", () => {
    const prev = new Set([10])
    addRange(prev, PAGE, 1, 2)
    expect([...prev]).toEqual([10])
  })
})

describe("isAllFilteredSelected", () => {
  it("es false sin resultados", () => {
    expect(isAllFilteredSelected(0, 0)).toBe(false)
  })

  it("es false con selección parcial", () => {
    expect(isAllFilteredSelected(10, 9)).toBe(false)
  })

  it("es true con la selección completa", () => {
    expect(isAllFilteredSelected(10, 10)).toBe(true)
  })

  it("es true si la selección supera el total (filtro cambiado a mitad)", () => {
    expect(isAllFilteredSelected(10, 12)).toBe(true)
  })
})

describe("collectFilteredIds", () => {
  it("recorre las páginas hasta cubrir el total", async () => {
    const { impl, calls } = fetchQueue([
      jsonResponse({ ids: [1, 2], total: 3 }),
      jsonResponse({ ids: [3], total: 3 }),
    ])
    const ids = await collectFilteredIds(() => "idsOnly=1", 1000, impl)
    expect(ids).toEqual([1, 2, 3])
    expect(calls).toHaveLength(2)
  })

  it("pide cada página con idsOnly y el tope de ids", async () => {
    const { impl, calls } = fetchQueue([jsonResponse({ ids: [1], total: 1 })])
    await collectFilteredIds(() => "q=mesa", 250, impl)
    expect(calls[0]).toBe("/api/admin/products/list?q=mesa")
  })

  it("pasa page/pageSize/idsOnly al constructor de la query", async () => {
    const buildListQuery = vi.fn(() => "q=")
    const { impl } = fetchQueue([jsonResponse({ ids: [], total: 0 })])
    await collectFilteredIds(buildListQuery, 1000, impl)
    expect(buildListQuery).toHaveBeenCalledWith({ idsOnly: "1", page: "1", pageSize: "1000" })
  })

  it("se detiene si una página falla", async () => {
    const { impl } = fetchQueue([jsonResponse({ ids: [1], total: 3 }), jsonResponse({}, false)])
    const ids = await collectFilteredIds(() => "", 1000, impl)
    expect(ids).toEqual([1])
  })

  it("se detiene ante una página vacía aunque el total diga otra cosa", async () => {
    const { impl } = fetchQueue([jsonResponse({ ids: [], total: 50 })])
    const ids = await collectFilteredIds(() => "", 1000, impl)
    expect(ids).toEqual([])
  })

  it("no entra en bucle si el total es 0", async () => {
    const { impl, calls } = fetchQueue([jsonResponse({ ids: [], total: 0 })])
    await collectFilteredIds(() => "", 1000, impl)
    expect(calls).toHaveLength(1)
  })

  it("tolera una respuesta sin ids", async () => {
    const { impl } = fetchQueue([jsonResponse({ total: 0 })])
    await expect(collectFilteredIds(() => "", 1000, impl)).resolves.toEqual([])
  })

  it("tolera un json inválido sin lanzar", async () => {
    const bad = {
      ok: true,
      json: async () => {
        throw new Error("boom")
      },
    } as unknown as Response
    const { impl } = fetchQueue([bad])
    await expect(collectFilteredIds(() => "", 1000, impl)).resolves.toEqual([])
  })
})
