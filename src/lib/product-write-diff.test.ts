import { describe, it, expect } from "vitest"
import {
  adoptTheirs,
  describeWriteConflict,
  summarizeWriteConflict,
  type WriteConflictInput,
} from "./product-write-diff"

const T1 = "2026-01-01T10:00:00.000Z"
const T2 = "2026-01-01T10:05:00.000Z"

/**
 * Escenario base: el formulario leyó la fila (precio 100, 10 unidades) y va a
 * guardar un precio de 120. El otro usuario movió el precio a 90.
 */
const loaded = {
  name: "Arroz",
  price: 100,
  stock_quantity: 10,
  stock_status: "in_stock",
  is_visible: true,
  updated_at: T1,
}
const payload = {
  name: "Arroz",
  price: 120,
  stock_quantity: 10,
  stock_status: "in_stock",
  is_visible: true,
  created_at: null,
}
const theirs = { ...loaded, price: 90, updated_at: T2 }

function summarize(current: Record<string, unknown> | null) {
  return summarizeWriteConflict({ loaded, payload, current })
}

describe("summarizeWriteConflict", () => {
  it("sin fila leída o sin fila vigente no inventa un diff", () => {
    expect(summarizeWriteConflict({ loaded: null, payload, current: loaded })).toEqual({
      changes: [],
      untouched: [],
    })
    expect(summarize(null)).toEqual({ changes: [], untouched: [] })
  })

  it("marca como choque el campo que ambos cambiaron", () => {
    const out = summarize(theirs)
    expect(out.changes).toEqual([
      { field: "price", label: "Precio", theirs: "$90", mine: "$120" },
    ])
    expect(out.untouched).toEqual([])
  })

  it("separa el cambio ajeno que este formulario no tocó", () => {
    const out = summarize({ ...loaded, stock_quantity: 0, stock_status: "out_of_stock" })
    expect(out.changes).toEqual([])
    expect(out.untouched.map((r) => r.field)).toEqual(["stock_quantity"])
    expect(out.untouched[0]?.mine).toBe("10")
    expect(out.untouched[0]?.theirs).toBe("0")
  })

  it("ignora las columnas que la fila vigente no devuelve", () => {
    // `description` viaja en el cuerpo pero no en la fila del 409: sin contra
    // qué comparar, no se reporta.
    const out = summarizeWriteConflict({
      loaded,
      payload: { ...payload, description: "nueva" },
      current: theirs,
    })
    expect(out.changes.map((r) => r.field)).toEqual(["price"])
    expect(out.untouched).toEqual([])
  })

  it("no reporta choque cuando el valor vigente es el mismo con otra forma", () => {
    // Postgres puede mandar `numeric` como texto.
    const out = summarize({ ...loaded, price: "100", updated_at: T2 })
    expect(out.changes).toEqual([])
    expect(out.untouched).toEqual([])
  })

  it("no confunde una fecha equivalente escrita distinto", () => {
    const out = summarizeWriteConflict({
      loaded: { ...loaded, sale_starts_at: T1 },
      payload: { ...payload, sale_starts_at: T1 },
      current: { ...loaded, sale_starts_at: "2026-01-01T10:00:00+00:00" },
    })
    expect(out.changes).toEqual([])
    expect(out.untouched).toEqual([])
  })

  it("sí detecta una fecha de oferta distinta", () => {
    const out = summarizeWriteConflict({
      loaded: { ...loaded, sale_starts_at: T1 },
      payload: { ...payload, sale_starts_at: T1 },
      current: { ...loaded, sale_starts_at: T2 },
    })
    expect(out.untouched.map((r) => r.field)).toEqual(["sale_starts_at"])
  })

  it("omite el estado de stock cuando el servidor lo deriva de las unidades", () => {
    // El otro usuario bajó el stock a 0 y el servidor recalculó el estado; el
    // formulario no tocó ninguno de los dos. Se reporta el stock, no el estado
    // derivado (que solo duplicaría la misma noticia).
    const out = summarize({ ...loaded, stock_quantity: 0, stock_status: "out_of_stock" })
    expect(out.untouched.map((r) => r.field)).toEqual(["stock_quantity"])
  })

  it("sí compara el estado de stock cuando se eligió a mano (sin unidades)", () => {
    const out = summarizeWriteConflict({
      loaded: { ...loaded, stock_quantity: null, stock_status: "in_stock" },
      payload: { ...payload, stock_quantity: null, stock_status: "low_stock" },
      current: { ...loaded, stock_quantity: null, stock_status: "out_of_stock" },
    })
    expect(out.changes).toEqual([
      { field: "stock_status", label: "Estado de stock", theirs: "Agotado", mine: "Stock bajo" },
    ])
  })

  it("compara listas por contenido y no por identidad", () => {
    const base = { tags: ["a", "b"] }
    const same = summarizeWriteConflict({
      loaded: base,
      payload: { tags: ["a", "b"] },
      current: { tags: ["a", "b"] },
    })
    expect(same.changes).toEqual([])
    expect(same.untouched).toEqual([])

    const reordered = summarizeWriteConflict({
      loaded: base,
      payload: { tags: ["a", "b"] },
      current: { tags: ["b", "a"] },
    })
    expect(reordered.untouched.map((r) => r.field)).toEqual(["tags"])
  })

  it("muestra booleanos y listas legibles", () => {
    const out = summarizeWriteConflict({
      loaded: { is_visible: true, tags: [] },
      payload: { is_visible: false, tags: ["oferta"] },
      current: { is_visible: false, tags: ["oferta", "nuevo"] },
    })
    expect(out.changes).toEqual([
      { field: "is_visible", label: "Publicado", theirs: "No", mine: "No" },
      { field: "tags", label: "Etiquetas", theirs: "oferta, nuevo", mine: "oferta" },
    ])
  })
})

describe("adoptTheirs", () => {
  const input: WriteConflictInput = {
    loaded,
    payload,
    current: { ...loaded, stock_quantity: 0, stock_status: "out_of_stock", price: 90 },
  }

  it("conserva el cambio ajeno en lo que no se editó", () => {
    expect(adoptTheirs(input).stock_quantity).toBe(0)
  })

  it("no pisa lo que el admin sí editó", () => {
    // `price` cambió en ambos lados: se respeta la decisión de guardar lo mío.
    expect(adoptTheirs(input).price).toBe(120)
  })

  it("no muta el cuerpo original", () => {
    const copy = { ...payload }
    adoptTheirs(input)
    expect(payload).toEqual(copy)
  })

  it("sin filas que comparar devuelve el cuerpo tal cual", () => {
    expect(adoptTheirs({ loaded: null, payload, current: null })).toBe(payload)
  })
})

describe("describeWriteConflict", () => {
  it("cuenta los choques y explica qué pasa con el resto", () => {
    const notice = describeWriteConflict(summarize(theirs), T2)
    expect(notice.title).toBe("1 campo en conflicto")
    expect(notice.detail).toContain("se conservan los campos que no editaste")
  })

  it("con varios choques usa el plural", () => {
    const notice = describeWriteConflict(
      summarizeWriteConflict({
        loaded,
        payload: { ...payload, name: "Arroz integral" },
        current: { ...loaded, price: 90, name: "Arroz 1 kg" },
      }),
      T2
    )
    expect(notice.title).toBe("2 campos en conflicto")
  })

  it("avisa cuando nadie tocó lo editado", () => {
    const notice = describeWriteConflict(
      summarize({ ...loaded, stock_quantity: 0, stock_status: "out_of_stock" }),
      T2
    )
    expect(notice.title).toBe("Nadie tocó lo que editaste")
    expect(notice.detail).toContain("se conservan los suyos")
  })

  it("sin diff comparable no promete nada", () => {
    const notice = describeWriteConflict({ changes: [], untouched: [] }, null)
    expect(notice.title).toBe("Otro usuario guardó este producto primero")
    expect(notice.detail).toContain("se sobrescribe su versión")
  })

  it("menciona la antigüedad de la edición ajena", () => {
    const notice = describeWriteConflict(summarize(theirs), T2, Date.parse(T2) + 120000)
    expect(notice.detail).toContain("hace 2 min")
  })
})
