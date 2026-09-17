import { describe, expect, it } from "vitest"

import { DEFAULT_TIMEZONE } from "./local-date"
import { DELIVERY_DAY_COUNT, getNextDays } from "./delivery-days"

/**
 * El calendario de entrega tiene que hablar en días locales del restaurante:
 * el servidor ancla la fecha a `-06:00`. Derivar el día con `toISOString()`
 * corría las siete opciones un día entero a partir de las 18:00 locales.
 */

// 01:00 UTC del 18 de septiembre = 19:00 del 17 en México.
const TARDE_MX = new Date("2026-09-18T01:00:00Z")
// 13:00 UTC del 17 = 07:00 del 17 en México.
const MANANA_MX = new Date("2026-09-17T13:00:00Z")

const valores = (now: Date) => getNextDays(DEFAULT_TIMEZONE, now).map((d) => d.value)

describe("getNextDays", () => {
  it("devuelve 7 días consecutivos", () => {
    const days = getNextDays(DEFAULT_TIMEZONE, TARDE_MX)
    expect(days).toHaveLength(DELIVERY_DAY_COUNT)
    expect(days.map((d) => d.value)).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ])
  })

  it("etiqueta como Hoy el día local aunque en UTC ya sea mañana", () => {
    // A las 19:00 locales el día UTC ya es el 18: el bug clásico.
    expect(TARDE_MX.toISOString().slice(0, 10)).toBe("2026-09-18")

    const days = getNextDays(DEFAULT_TIMEZONE, TARDE_MX)
    expect(days[0]!.value).toBe("2026-09-17")
    expect(days[0]!.value).not.toBe("2026-09-18")
    expect(days[0]!.label.startsWith("Hoy")).toBe(true)
    expect(days[1]!.value).toBe("2026-09-18")
    expect(days[1]!.label.startsWith("Mañana")).toBe(true)
  })

  it("no cambia de día de día", () => {
    // A las 07:00 locales el día UTC coincide: aquí el bug estaba dormido.
    const days = getNextDays(DEFAULT_TIMEZONE, MANANA_MX)
    expect(days[0]!.value).toBe("2026-09-17")
    expect(days[0]!.label.startsWith("Hoy")).toBe(true)
    expect(valores(MANANA_MX)).toEqual(valores(TARDE_MX))
  })

  it("mantiene la etiqueta y el value sobre el mismo día", () => {
    for (const day of getNextDays(DEFAULT_TIMEZONE, TARDE_MX)) {
      const diaDelMes = String(Number(day.value.slice(8, 10)))
      expect(day.label).toContain(diaDelMes)
    }
  })

  it("cambia el día local en la medianoche local, no en la UTC", () => {
    expect(valores(new Date("2026-09-18T05:59:00Z"))[0]).toBe("2026-09-17")
    expect(valores(new Date("2026-09-18T06:01:00Z"))[0]).toBe("2026-09-18")
  })

  it("respeta la zona del restaurante", () => {
    expect(getNextDays("UTC", TARDE_MX)[0]!.value).toBe("2026-09-18")
    expect(getNextDays("Asia/Tokyo", TARDE_MX)[0]!.value).toBe("2026-09-18")
  })

  it("usa la zona por defecto cuando no se declara", () => {
    expect(getNextDays(undefined, TARDE_MX)).toEqual(getNextDays(DEFAULT_TIMEZONE, TARDE_MX))
    expect(getNextDays()).toHaveLength(DELIVERY_DAY_COUNT)
  })
})
