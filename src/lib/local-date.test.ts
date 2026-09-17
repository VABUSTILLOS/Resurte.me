import { describe, expect, it } from "vitest"

import {
  DEFAULT_TIMEZONE,
  dayKeyOf,
  isWithinShift,
  localDateParts,
  minutesOfDay,
  minutesWithinHour,
  parseHhMm,
  toDatetimeLocalValue,
} from "./local-date"

/**
 * Red de seguridad del helper canónico de día local.
 *
 * Todo se ancla en instantes fijos y con la zona explícita: el resultado no
 * puede depender de la zona de la máquina que corre las pruebas. El caso que
 * más importa es el cruce de medianoche, porque es justo el que falla cuando
 * alguien deriva el día con `toISOString()`.
 */

// 01:00 UTC del 18 de septiembre = 19:00 del 17 en México (UTC-6).
const TARDE_MX = new Date("2026-09-18T01:00:00Z")
// 06:00 UTC del 18 = medianoche exacta del 18 en México.
const MEDIANOCHE_MX = new Date("2026-09-18T06:00:00Z")

describe("localDateParts", () => {
  it("da el día local, no el día UTC, a ambos lados de la medianoche", () => {
    expect(localDateParts("America/Mexico_City", TARDE_MX)).toEqual({
      year: 2026,
      month: 9,
      day: 17,
      hour: 19,
    })
    expect(localDateParts("America/Mexico_City", MEDIANOCHE_MX)).toEqual({
      year: 2026,
      month: 9,
      day: 18,
      hour: 0,
    })
  })

  it("normaliza la medianoche a hora 0 aunque el ICU devuelva 24", () => {
    // `hour12: false` puede devolver 24 para medianoche; el módulo lo corrige.
    expect(localDateParts("America/Mexico_City", MEDIANOCHE_MX).hour).toBe(0)
    expect(localDateParts("UTC", new Date("2026-09-18T00:00:00Z")).hour).toBe(0)
  })

  it("respeta zonas al este de UTC", () => {
    // 20:00 UTC del 17 = 05:00 del 18 en Tokio (UTC+9).
    expect(localDateParts("Asia/Tokyo", new Date("2026-09-17T20:00:00Z"))).toEqual({
      year: 2026,
      month: 9,
      day: 18,
      hour: 5,
    })
  })

  it("cae a partes UTC si la zona es inválida, sin lanzar", () => {
    expect(localDateParts("No/Existe", TARDE_MX)).toEqual({
      year: 2026,
      month: 9,
      day: 18,
      hour: 1,
    })
  })

  it("usa la zona por defecto cuando no se declara ninguna", () => {
    for (const vacia of [null, undefined, "", "   "]) {
      expect(localDateParts(vacia, TARDE_MX)).toEqual(
        localDateParts(DEFAULT_TIMEZONE, TARDE_MX)
      )
    }
    expect(localDateParts(null, TARDE_MX).day).toBe(17)
  })
})

describe("dayKeyOf", () => {
  it("da el día local y no el día UTC", () => {
    expect(dayKeyOf("America/Mexico_City", TARDE_MX)).toBe("2026-09-17")
    expect(dayKeyOf("America/Mexico_City", MEDIANOCHE_MX)).toBe("2026-09-18")
    expect(dayKeyOf("UTC", TARDE_MX)).toBe("2026-09-18")
  })

  it("rellena mes y día con ceros", () => {
    expect(dayKeyOf("UTC", new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05")
    expect(dayKeyOf("UTC", new Date("2026-12-31T12:00:00Z"))).toBe("2026-12-31")
  })

  it("cambia de día en la medianoche local, no en la UTC", () => {
    const unMinutoAntes = new Date("2026-09-18T05:59:00Z")
    const unMinutoDespues = new Date("2026-09-18T06:01:00Z")
    expect(dayKeyOf("America/Mexico_City", unMinutoAntes)).toBe("2026-09-17")
    expect(dayKeyOf("America/Mexico_City", unMinutoDespues)).toBe("2026-09-18")
  })
})

describe("minutesOfDay / minutesWithinHour", () => {
  it("cubre los extremos del día local", () => {
    expect(minutesOfDay("America/Mexico_City", MEDIANOCHE_MX)).toBe(0)
    expect(minutesOfDay("America/Mexico_City", TARDE_MX)).toBe(19 * 60)
    // 05:59 UTC del 19 = 23:59 del 18 en México.
    expect(minutesOfDay("America/Mexico_City", new Date("2026-09-19T05:59:00Z"))).toBe(1439)
  })

  it("lee los minutos de la zona, no los de UTC", () => {
    // Kolkata es UTC+5:30 → 01:37 UTC son las 07:07 locales.
    expect(minutesWithinHour("Asia/Kolkata", new Date("2026-09-18T01:37:00Z"))).toBe(7)
    expect(minutesOfDay("Asia/Kolkata", new Date("2026-09-18T01:37:00Z"))).toBe(7 * 60 + 7)
  })

  it("degrada a los minutos UTC si la zona es inválida", () => {
    expect(minutesWithinHour("No/Existe", new Date("2026-09-18T01:37:00Z"))).toBe(37)
  })
})

describe("isWithinShift", () => {
  it("trata el inicio como inclusivo y el fin como exclusivo", () => {
    expect(isWithinShift("09:00", "17:00", 9 * 60)).toBe(true)
    expect(isWithinShift("09:00", "17:00", 10 * 60)).toBe(true)
    expect(isWithinShift("09:00", "17:00", 17 * 60)).toBe(false)
    expect(isWithinShift("09:00", "17:00", 8 * 60 + 59)).toBe(false)
  })

  it("soporta turnos que cruzan medianoche", () => {
    expect(isWithinShift("22:00", "02:00", 23 * 60)).toBe(true)
    expect(isWithinShift("22:00", "02:00", 1 * 60)).toBe(true)
    expect(isWithinShift("22:00", "02:00", 12 * 60)).toBe(false)
    expect(isWithinShift("22:00", "02:00", 2 * 60)).toBe(false)
  })

  it("considera dentro del turno si no está declarado o es de duración cero", () => {
    expect(isWithinShift(null, "17:00", 12 * 60)).toBe(true)
    expect(isWithinShift("09:00", null, 12 * 60)).toBe(true)
    expect(isWithinShift(null, null, 12 * 60)).toBe(true)
    expect(isWithinShift("09:00", "09:00", 12 * 60)).toBe(true)
    expect(isWithinShift("basura", "17:00", 12 * 60)).toBe(true)
  })
})

describe("parseHhMm", () => {
  it("acepta HH:MM y HH:MM:SS", () => {
    expect(parseHhMm("09:30")).toBe(570)
    expect(parseHhMm("09:30:00")).toBe(570)
    expect(parseHhMm("9:05")).toBe(545)
    expect(parseHhMm("00:00")).toBe(0)
    expect(parseHhMm("23:59")).toBe(1439)
    expect(parseHhMm(" 07:15 ")).toBe(435)
  })

  it("devuelve null cuando no es parseable", () => {
    expect(parseHhMm(null)).toBeNull()
    expect(parseHhMm(undefined)).toBeNull()
    expect(parseHhMm("")).toBeNull()
    expect(parseHhMm("abc")).toBeNull()
    expect(parseHhMm("24:00")).toBeNull()
    expect(parseHhMm("09:60")).toBeNull()
  })
})

describe("toDatetimeLocalValue", () => {
  it("es el inverso exacto de new Date(valor).toISOString()", () => {
    // La ida y vuelta es lo que garantiza que abrir y guardar sin editar un
    // formulario no desplace el instante. Es independiente de la zona de la
    // máquina porque ambos lados usan la misma.
    for (const iso of [
      "2026-09-17T18:30:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:00.000Z",
    ]) {
      expect(new Date(toDatetimeLocalValue(iso)).toISOString()).toBe(iso)
    }
  })

  it("nunca devuelve el reloj UTC cuando la zona no es UTC", () => {
    const iso = "2026-09-17T18:30:00.000Z"
    const valor = toDatetimeLocalValue(iso)
    expect(valor).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    // La hora del valor tiene que coincidir con la hora local de `iso`.
    const local = new Date(iso)
    expect(valor.endsWith(`${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`)).toBe(
      true
    )
  })

  it("rellena mes, día, hora y minuto a dos dígitos", () => {
    expect(toDatetimeLocalValue(new Date(2026, 0, 5, 9, 7))).toBe("2026-01-05T09:07")
  })

  it("acepta Date y string, y devuelve '' si es inválido", () => {
    const d = new Date(2026, 8, 17, 18, 30)
    expect(toDatetimeLocalValue(d)).toBe(toDatetimeLocalValue(d.toISOString()))
    expect(toDatetimeLocalValue("no es fecha")).toBe("")
    expect(toDatetimeLocalValue(new Date("nope"))).toBe("")
  })
})
