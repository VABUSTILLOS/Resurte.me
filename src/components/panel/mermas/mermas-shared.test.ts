import { describe, expect, it } from "vitest"
import { CAUSAS, TIPS, WASTE_CATEGORIES, nextWasteId } from "./mermas-shared"

describe("nextWasteId — identificador de cada merma registrada", () => {
  it("nunca repite un id en una ráfaga de registros", () => {
    // Date.now() tiene resolución de milisegundo: sin el contador interno,
    // registrar varias mermas en el mismo ms produciría ids iguales y React
    // reutilizaría filas al renderizar la lista.
    const ids = Array.from({ length: 500 }, () => nextWasteId())
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("el id es estable en formato: prefijo waste- y dos segmentos", () => {
    const id = nextWasteId()
    expect(id.startsWith("waste-")).toBe(true)
    const partes = id.split("-")
    expect(partes).toHaveLength(3)
    expect(Number.isFinite(Number(partes[1]))).toBe(true)
    expect(Number.isFinite(Number(partes[2]))).toBe(true)
  })

  it("el contador es monótono creciente", () => {
    const a = Number(nextWasteId().split("-")[2])
    const b = Number(nextWasteId().split("-")[2])
    const c = Number(nextWasteId().split("-")[2])
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })

  it("el segmento de tiempo no retrocede", () => {
    const tiempos = Array.from({ length: 50 }, () => Number(nextWasteId().split("-")[1]))
    for (let i = 1; i < tiempos.length; i++) {
      expect(tiempos[i]!).toBeGreaterThanOrEqual(tiempos[i - 1]!)
    }
  })
})

describe("taxonomía de mermas — categorías y causas", () => {
  it("hay 6 categorías, todas con etiqueta, icono y porcentaje creíble", () => {
    expect(WASTE_CATEGORIES).toHaveLength(6)
    for (const c of WASTE_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.icon.length).toBeGreaterThan(0)
      expect(c.avgWastePercent).toBeGreaterThan(0)
      expect(c.avgWastePercent).toBeLessThan(50)
    }
  })

  it("no hay claves ni etiquetas repetidas", () => {
    expect(new Set(WASTE_CATEGORIES.map((c) => c.key)).size).toBe(WASTE_CATEGORIES.length)
    expect(new Set(WASTE_CATEGORIES.map((c) => c.label)).size).toBe(WASTE_CATEGORIES.length)
  })

  it("cada categoría tiene consejos de reducción", () => {
    // El panel muestra TIPS[categoría] al registrar una merma; una categoría
    // sin consejos dejaría la sección vacía sin avisar.
    for (const c of WASTE_CATEGORIES) {
      const tips = TIPS[c.key]
      expect(tips, c.key).toBeDefined()
      expect(tips!.length, c.key).toBeGreaterThan(0)
      for (const t of tips!) expect(t.length).toBeGreaterThan(10)
    }
  })

  it("no hay consejos huérfanos de una categoría que ya no existe", () => {
    const claves = new Set(WASTE_CATEGORIES.map((c) => c.key))
    for (const key of Object.keys(TIPS)) expect(claves.has(key), key).toBe(true)
  })

  it("la causa más común (preparación) va primera y la lista no está vacía", () => {
    expect(CAUSAS.length).toBeGreaterThanOrEqual(5)
    expect(CAUSAS[0]?.key).toBe("preparacion")
  })

  it("las causas tienen claves y etiquetas únicas", () => {
    expect(new Set(CAUSAS.map((c) => c.key)).size).toBe(CAUSAS.length)
    expect(new Set(CAUSAS.map((c) => c.label)).size).toBe(CAUSAS.length)
    for (const c of CAUSAS) {
      expect(c.icon.length).toBeGreaterThan(0)
      expect(c.label.length).toBeGreaterThan(0)
    }
  })

  it("'otro' es la última causa: es el cajón de sastre, no la primera opción", () => {
    expect(CAUSAS[CAUSAS.length - 1]?.key).toBe("otro")
  })
})
