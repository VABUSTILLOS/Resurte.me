import { describe, expect, it } from "vitest"
import { RELATED_LIMIT, buildRelatedProducts } from "./related-products"

interface P {
  id: number
  name: string
}

const p = (id: number): P => ({ id, name: `Producto ${id}` })

const available = (...ids: number[]) => new Map(ids.map((id) => [id, p(id)]))

describe("buildRelatedProducts", () => {
  it("prioriza los relacionados explícitos en el orden declarado", () => {
    const out = buildRelatedProducts({
      productId: 1,
      explicitIds: [30, 20],
      availableById: available(1, 20, 30, 40, 50),
      sameCategory: [p(40), p(50)],
      others: [],
    })
    expect(out.map((x) => x.id)).toEqual([30, 20, 40, 50])
  })

  it("completa con misma categoría y luego el resto", () => {
    const out = buildRelatedProducts({
      productId: 1,
      explicitIds: [30],
      availableById: available(1, 30, 40, 60),
      sameCategory: [p(40)],
      others: [p(60)],
    })
    expect(out.map((x) => x.id)).toEqual([30, 40, 60])
  })

  it("descarta explícitos no disponibles en la ciudad", () => {
    const out = buildRelatedProducts({
      productId: 1,
      explicitIds: [99, 20],
      availableById: available(1, 20),
      sameCategory: [],
      others: [],
    })
    expect(out.map((x) => x.id)).toEqual([20])
  })

  it("nunca incluye el producto actual, ni por id explícito", () => {
    const out = buildRelatedProducts({
      productId: 1,
      explicitIds: [1, 20],
      availableById: available(1, 20),
      sameCategory: [p(1)],
      others: [],
    })
    expect(out.map((x) => x.id)).toEqual([20])
  })

  it("no repite un producto que ya venía por id explícito", () => {
    const out = buildRelatedProducts({
      productId: 1,
      explicitIds: [20],
      availableById: available(1, 20, 40),
      sameCategory: [p(20), p(40)],
      others: [p(20)],
    })
    expect(out.map((x) => x.id)).toEqual([20, 40])
  })

  it("respeta el límite de 4 por defecto", () => {
    const out = buildRelatedProducts({
      productId: 1,
      explicitIds: [10, 11, 12],
      availableById: available(1, 10, 11, 12, 13, 14),
      sameCategory: [p(13), p(14)],
      others: [],
    })
    expect(out).toHaveLength(RELATED_LIMIT)
    expect(out.map((x) => x.id)).toEqual([10, 11, 12, 13])
  })

  it("acepta un límite distinto", () => {
    const out = buildRelatedProducts({
      productId: 1,
      explicitIds: [10],
      availableById: available(1, 10, 11),
      sameCategory: [p(11)],
      others: [],
      limit: 2,
    })
    expect(out.map((x) => x.id)).toEqual([10, 11])
  })

  it("cae al comportamiento histórico sin explícitos", () => {
    const out = buildRelatedProducts({
      productId: 1,
      explicitIds: null,
      availableById: available(1, 2, 3, 4, 5),
      sameCategory: [p(2), p(3)],
      others: [p(4), p(5)],
    })
    expect(out.map((x) => x.id)).toEqual([2, 3, 4, 5])
  })

  it("devuelve vacío si no hay candidatos", () => {
    const out = buildRelatedProducts({
      productId: 1,
      explicitIds: [],
      availableById: available(1),
      sameCategory: [],
      others: [],
    })
    expect(out).toEqual([])
  })
})
