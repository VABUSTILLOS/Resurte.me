import { describe, expect, it } from "vitest"
import { CHANNELS, STATUS_META, entryTime, fmtTime, nowMs, type SaleEntryLike } from "./comanda-shared"

const venta = (over: Partial<SaleEntryLike> = {}): SaleEntryLike => ({
  id: "mmcdg280abcd",
  dishId: "d1",
  dishName: "Taco",
  quantity: 1,
  date: "2026-03-04",
  unitPrice: 20,
  unitCost: 8,
  ...over,
})

describe("entryTime — hora de la comanda", () => {
  it("prefiere createdAt cuando es una fecha válida", () => {
    const e = venta({ createdAt: "2026-03-04T18:30:00.000Z" })
    expect(entryTime(e)).toBe(Date.parse("2026-03-04T18:30:00.000Z"))
  })

  it("ignora un createdAt ilegible y cae al id", () => {
    const e = venta({ createdAt: "no es una fecha" })
    // El id codifica base36(Date.now()) seguido de 4 caracteres aleatorios.
    expect(entryTime(e)).toBe(Date.parse("2026-03-04T18:30:00.000Z"))
  })

  it("ignora un createdAt vacío y cae al id", () => {
    expect(entryTime(venta({ createdAt: "" }))).toBe(Date.parse("2026-03-04T18:30:00.000Z"))
  })

  it("descifra el instante codificado en el id", () => {
    const ts = Date.parse("2026-01-15T09:05:00.000Z")
    const id = ts.toString(36) + "zzzz"
    expect(entryTime(venta({ id }))).toBe(ts)
  })

  it("devuelve 0 cuando el id está vacío", () => {
    expect(entryTime(venta({ id: "" }))).toBe(0)
  })

  it("nunca devuelve NaN, ni siquiera con un id no descifrable", () => {
    // `parseInt("…", 36)` corta en el primer carácter inválido y devuelve un
    // número diminuto en vez de NaN: la comanda degrada a una hora absurda pero
    // el orden de la lista sigue siendo determinista. Documentamos el contrato.
    for (const id of ["---", "sale-1", "!!!", "0"]) {
      const t = entryTime(venta({ id }))
      expect(Number.isFinite(t)).toBe(true)
      expect(t).toBeGreaterThanOrEqual(0)
    }
  })

  it("ordena de más antigua a más reciente", () => {
    const vieja = venta({ createdAt: "2026-03-04T10:00:00.000Z" })
    const nueva = venta({ createdAt: "2026-03-04T11:00:00.000Z" })
    expect(entryTime(vieja)).toBeLessThan(entryTime(nueva))
  })
})

describe("fmtTime — hora mostrada en cocina", () => {
  const esperado = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  it("formatea en 24 horas con dos dígitos por campo", () => {
    const ts = new Date(2026, 2, 4, 9, 5).getTime()
    expect(fmtTime(ts)).toBe("09:05")
    expect(fmtTime(ts)).toBe(esperado(ts))
  })

  it("no usa AM/PM ni recorta los ceros a la izquierda", () => {
    const ts = new Date(2026, 2, 4, 0, 0).getTime()
    expect(fmtTime(ts)).toBe("00:00")
  })

  it("usa la hora local del restaurante, no UTC", () => {
    const ts = new Date(2026, 2, 4, 23, 59).getTime()
    expect(fmtTime(ts)).toBe("23:59")
  })
})

describe("nowMs", () => {
  it("devuelve un instante plausible", () => {
    const antes = Date.now()
    const t = nowMs()
    expect(t).toBeGreaterThanOrEqual(antes)
    expect(t).toBeLessThanOrEqual(Date.now())
  })
})

describe("STATUS_META — paridad con los estados de la comanda", () => {
  it("declara metadatos para los tres estados que la comanda puede tomar", () => {
    const estados: Array<keyof typeof STATUS_META> = ["pendiente", "en-cocina", "listo"]
    for (const e of estados) {
      expect(STATUS_META[e].label).toBeTruthy()
      expect(STATUS_META[e].color).toBeTruthy()
      expect(STATUS_META[e].bg).toBeTruthy()
      expect(STATUS_META[e].border).toBeTruthy()
    }
    expect(Object.keys(STATUS_META).sort()).toEqual([...estados].sort())
  })

  it("no repite etiquetas entre estados", () => {
    const labels = Object.values(STATUS_META).map((m) => m.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe("CHANNELS — canales de venta de la comanda", () => {
  it("declara los cuatro canales con clave y etiqueta únicas", () => {
    expect(CHANNELS.length).toBe(4)
    expect(new Set(CHANNELS.map((c) => c.key)).size).toBe(CHANNELS.length)
    expect(new Set(CHANNELS.map((c) => c.label)).size).toBe(CHANNELS.length)
    for (const c of CHANNELS) {
      expect(c.key).toMatch(/^[a-z-]+$/)
      expect(c.icon).toBeTruthy()
    }
  })
})
