import { describe, expect, it } from "vitest"
import {
  buildWaMembershipReconcile,
  isReconcileEmpty,
  nextCatalogPosition,
  positionAfter,
  resolveDefaultCatalog,
  summarizeReconcile,
  type WaCatalogLike,
  type WaMembershipRow,
  type WaProductFlag,
} from "./whatsapp-default-catalog"

const catalog = (partial: Partial<WaCatalogLike> = {}): WaCatalogLike => ({
  id: "c1",
  slug: "global",
  name: "Catálogo general",
  is_active: true,
  is_default: false,
  ...partial,
})

const flag = (id: number, show_in_whatsapp: boolean): WaProductFlag => ({ id, show_in_whatsapp })
const row = (product_id: number, position: number, is_visible = true): WaMembershipRow => ({
  product_id,
  position,
  is_visible,
})

describe("resolveDefaultCatalog", () => {
  it("devuelve el catálogo marcado como principal", () => {
    const found = resolveDefaultCatalog([
      catalog({ id: "a", slug: "chihuahua" }),
      catalog({ id: "b", slug: "global", is_default: true }),
    ])
    expect(found?.id).toBe("b")
  })

  it("es estricto: un catálogo activo NO es principal por serlo", () => {
    // Un fallback silencioso haría que el panel nombrara un principal que
    // nadie eligió y que la marca apuntara a un catálogo sin dueño.
    expect(resolveDefaultCatalog([catalog({ is_active: true })])).toBeNull()
  })

  it("sin catálogos devuelve null", () => {
    expect(resolveDefaultCatalog([])).toBeNull()
  })
})

describe("nextCatalogPosition / positionAfter", () => {
  it("arranca en 1 con la curaduría vacía", () => {
    expect(nextCatalogPosition([])).toBe(1)
  })

  it("va al final, sin reutilizar huecos", () => {
    // Un hueco en medio (5 faltante) no se rellena: el orden elegido manda.
    expect(nextCatalogPosition([row(1, 1), row(2, 2), row(3, 7)])).toBe(8)
  })

  it("no renumera: sólo mira la posición máxima", () => {
    expect(nextCatalogPosition([row(9, 42), row(3, 7)])).toBe(43)
  })

  it("positionAfter trata null/undefined como 0", () => {
    expect(positionAfter(null)).toBe(1)
    expect(positionAfter(undefined)).toBe(1)
    expect(positionAfter(0)).toBe(1)
    expect(positionAfter(7)).toBe(8)
  })
})

describe("buildWaMembershipReconcile", () => {
  it("marcado y no curado ⇒ toAdd", () => {
    const diff = buildWaMembershipReconcile([flag(1, true)], [])
    expect(diff.toAdd).toEqual([1])
    expect(diff.toRemove).toEqual([])
    expect(diff.unchanged).toEqual([])
  })

  it("curado y sin marca ⇒ toRemove", () => {
    const diff = buildWaMembershipReconcile([flag(1, false)], [row(1, 1)])
    expect(diff.toRemove).toEqual([1])
    expect(diff.toAdd).toEqual([])
  })

  it("coincidiendo en ambos lados ⇒ unchanged", () => {
    const diff = buildWaMembershipReconcile([flag(1, true)], [row(1, 1)])
    expect(diff.unchanged).toEqual([1])
    expect(isReconcileEmpty(diff)).toBe(true)
  })

  it("una fila oculta cuenta como NO curada", () => {
    // `is_visible = false` significa que el producto no está en el catálogo,
    // así que un producto marcado con fila oculta tiene que re-visibilizarse.
    const diff = buildWaMembershipReconcile([flag(1, true)], [row(1, 1, false)])
    expect(diff.toAdd).toEqual([1])
    expect(diff.unchanged).toEqual([])
  })

  it("un producto sin fila y sin marca no aparece en ninguna lista", () => {
    const diff = buildWaMembershipReconcile([flag(1, false)], [])
    expect(isReconcileEmpty(diff)).toBe(true)
    expect(diff.unchanged).toEqual([])
  })

  it("separa los tres grupos y los ordena (previsualización estable)", () => {
    const flags = [flag(3, true), flag(1, true), flag(2, false), flag(4, true)]
    const curated = [row(2, 1), row(4, 2), row(9, 3)]
    const diff = buildWaMembershipReconcile(flags, curated)
    // 2 está curado pero sin marca ⇒ sale; 9 sólo existe en la curaduría ⇒ sale.
    expect(diff.toAdd).toEqual([1, 3])
    expect(diff.toRemove).toEqual([2, 9])
    expect(diff.unchanged).toEqual([4])
  })

  it("es simétrico: cada id cae en exactamente una lista", () => {
    const flags = [flag(1, true), flag(2, false), flag(3, true)]
    const curated = [row(2, 1), row(3, 2), row(4, 3)]
    const diff = buildWaMembershipReconcile(flags, curated)
    const total = diff.toAdd.length + diff.toRemove.length + diff.unchanged.length
    expect(total).toBe(4)
    expect(new Set([...diff.toAdd, ...diff.toRemove, ...diff.unchanged]).size).toBe(4)
  })
})

describe("summarizeReconcile", () => {
  it("dice que ya coinciden cuando no hay nada que hacer", () => {
    expect(summarizeReconcile({ toAdd: [], toRemove: [], unchanged: [1] })).toBe(
      "Las marcas de la tienda y el catálogo ya coinciden."
    )
  })

  it("nombra las dos direcciones por separado", () => {
    expect(summarizeReconcile({ toAdd: [1, 2], toRemove: [3], unchanged: [] })).toBe(
      "2 se agregarán al catálogo · 1 se quitarán"
    )
  })

  it("con una sola dirección no inventa la otra", () => {
    expect(summarizeReconcile({ toAdd: [1], toRemove: [], unchanged: [] })).toBe(
      "1 se agregarán al catálogo"
    )
  })
})
