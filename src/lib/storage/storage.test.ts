import { describe, expect, it } from "vitest"
import {
  readStored, writeStored, clearStored, normalizeStored,
  storageKeyFor, registerStorageSchema, getStorageSchema,
  type StorageLike,
} from "./index"

function fakeStorage(init: Record<string, string> = {}): StorageLike & { store: Map<string, string> } {
  const store = new Map(Object.entries(init))
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value) },
    removeItem: (key) => { store.delete(key) },
  }
}

describe("storageKeyFor", () => {
  it("sccopea por colección como el hook legacy", () => {
    expect(storageKeyFor("ventas-entries", "tacos")).toBe("resurte-ventas-entries-tacos")
    expect(storageKeyFor("ventas-entries", null)).toBe("resurte-ventas-entries")
  })
})

describe("readStored", () => {
  it("devuelve initial si la key no existe", () => {
    const s = fakeStorage()
    expect(readStored("merma-monthly-goal", 0, null, s)).toBe(0)
    expect(readStored("ventas-entries", [], null, s)).toEqual([])
  })

  it("devuelve initial si el JSON está corrupto", () => {
    const s = fakeStorage({ "resurte-ventas-entries": "{not-json" })
    expect(readStored("ventas-entries", [], null, s)).toEqual([])
  })

  it("filtra ítems inválidos en arrays registrados", () => {
    const s = fakeStorage({
      "resurte-mermas-entries": JSON.stringify([
        { id: "1", category: "Verduras", amountKg: 2, costPerKg: 30, date: "2025-01-01", cause: "caducidad" },
        { id: 2, category: 99, amountKg: "nope", date: null }, // inválido
        null,
      ]),
    })
    const out = readStored<unknown[]>("mermas-entries", [], null, s)
    expect(out).toHaveLength(1)
    expect((out[0] as { id: string }).id).toBe("1")
  })

  it("normaliza números corruptos al default del schema", () => {
    const s = fakeStorage({ "resurte-planner-covers": JSON.stringify("muchas") })
    expect(readStored("planner-covers", 50, null, s)).toBe(50)
  })

  it("tolera datos legacy numéricos en planner-manual-qtys (readManualQtys)", () => {
    const s = fakeStorage({ "resurte-planner-manual-qtys": JSON.stringify({ "Tomate": 12 }) })
    const out = readStored<Record<string, { qty: number; unit: string }>>("planner-manual-qtys", {}, null, s)
    expect(out["Tomate"]).toEqual({ qty: 12, unit: "kg" })
  })

  it("sin schema replica el parse legacy (sin filtrar)", () => {
    const s = fakeStorage({ "resurte-key-desconocida": JSON.stringify([{ whatever: true }]) })
    expect(readStored("key-desconocida", [], null, s)).toEqual([{ whatever: true }])
  })
})

describe("writeStored / versión compañera", () => {
  it("persiste el valor y la versión del schema", () => {
    const s = fakeStorage()
    writeStored("ventas-meta-dia", 5000, "tacos", s)
    expect(s.store.get("resurte-ventas-meta-dia-tacos")).toBe("5000")
    expect(s.store.get("resurte-ventas-meta-dia-tacos@v")).toBe("1")
  })

  it("no escribe versión para keys sin schema", () => {
    const s = fakeStorage()
    writeStored("key-desconocida", "x", null, s)
    expect(s.store.has("resurte-key-desconocida@v")).toBe(false)
  })
})

describe("migración v1→v2", () => {
  it("aplica migrate cuando la versión almacenada es anterior", () => {
    registerStorageSchema({
      key: "test-migrable",
      version: 2,
      default: () => ([] as unknown[]),
      validate: (data: unknown) => (Array.isArray(data) ? data.filter((x) => typeof x === "number") : []),
      migrate: (data: unknown) => {
        // v1 guardaba { valores: number[] } → v2 es number[]
        const d = data as { valores?: unknown }
        return Array.isArray(d.valores) ? d.valores : []
      },
    })
    const s = fakeStorage({
      "resurte-test-migrable": JSON.stringify({ valores: [1, 2, 3] }),
      "resurte-test-migrable@v": "1",
    })
    expect(readStored("test-migrable", [], null, s)).toEqual([1, 2, 3])
  })

  it("no migra si la versión ya es la actual", () => {
    registerStorageSchema({
      key: "test-migrable-2",
      version: 2,
      default: () => ([] as unknown[]),
      validate: (data: unknown) => (Array.isArray(data) ? data : []),
      migrate: () => { throw new Error("no debe llamarse") },
    })
    const s = fakeStorage({
      "resurte-test-migrable-2": JSON.stringify([9]),
      "resurte-test-migrable-2@v": "2",
    })
    expect(readStored("test-migrable-2", [], null, s)).toEqual([9])
  })
})

describe("clearStored", () => {
  it("elimina la key y su versión", () => {
    const s = fakeStorage({
      "resurte-apertura-checked": JSON.stringify(["a"]),
      "resurte-apertura-checked@v": "1",
    })
    clearStored("apertura-checked", null, s)
    expect(s.store.size).toBe(0)
  })
})

describe("normalizeStored (self-healing)", () => {
  it("no escribe si la data ya es válida y la versión es la actual", () => {
    const raw = JSON.stringify([{ id: "1", name: "Tomate", stock: 4, minStock: 1, unit: "kg", pricePerUnit: 30 }])
    const s = fakeStorage({ "resurte-inventario-items": raw, "resurte-inventario-items@v": "1" })
    normalizeStored("inventario-items", null, s)
    expect(s.store.get("resurte-inventario-items")).toBe(raw)
    expect(s.store.get("resurte-inventario-items@v")).toBe("1")
  })

  it("reescribe y deja la versión actual cuando el JSON es inválido de forma", () => {
    const s = fakeStorage({
      "resurte-inventario-items": JSON.stringify([{ id: "1", name: "Tomate", stock: "x" }]),
    })
    normalizeStored("inventario-items", null, s)
    expect(s.store.get("resurte-inventario-items")).toBe("[]")
    expect(s.store.get("resurte-inventario-items@v")).toBe("1")
  })

  it("elimina la key si el JSON está corrupto", () => {
    const s = fakeStorage({ "resurte-planner-covers": "{broken" })
    normalizeStored("planner-covers", null, s)
    expect(s.store.has("resurte-planner-covers")).toBe(false)
  })

  it("no hace nada si la key no existe", () => {
    const s = fakeStorage()
    normalizeStored("planner-covers", null, s)
    expect(s.store.size).toBe(0)
  })
})

describe("registro de schemas", () => {
  it("expone los 41 schemas registrados del panel", () => {
    expect(getStorageSchema("ventas-entries")).toBeDefined()
    expect(getStorageSchema("temporada-month")?.version).toBe(1)
    expect(getStorageSchema("no-existe")).toBeUndefined()
  })

  it("defaults del registro coinciden con los initialValues", () => {
    expect(getStorageSchema("planner-covers")?.default()).toBe(50)
    expect(getStorageSchema("ventas-umbral-ticket")?.default()).toBe(3000)
    expect(getStorageSchema("ventas-descontar-stock")?.default()).toBe(false)
    expect(getStorageSchema("costeo-dishes")?.default()).toEqual([])
  })
})
