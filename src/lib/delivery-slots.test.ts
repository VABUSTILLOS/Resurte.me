import { describe, expect, it } from "vitest"
import {
  ALL_DELIVERY_SLOT_IDS,
  DEFAULT_DELIVERY_SLOTS_CONFIG,
  DELIVERY_SLOTS,
  availableSlotsForDay,
  buildDeliveryAvailability,
  findDeliverySlotByStart,
  firstSlotForSystemOrder,
  isDefaultDeliverySlotsConfig,
  normalizeDeliverySlotsConfig,
  slotTakenKey,
  slotUnavailableReason,
  slotsForDayKey,
  weekdayOfDayKey,
  type DeliverySlotsConfig,
} from "@/lib/delivery-slots"

// Las etiquetas históricas de la web (DELIVERY_TIMES): la fuente
// única nueva tiene que producir EXACTAMENTE las mismas.
const HISTORICAL_LABELS = [
  "8:00 AM — 10:00 AM",
  "10:00 AM — 12:00 PM",
  "12:00 PM — 2:00 PM",
  "2:00 PM — 4:00 PM",
  "4:00 PM — 6:00 PM",
  "6:00 PM — 8:00 PM",
]

// 2026-11-25 es miércoles; 2026-11-22, domingo.
const WEDNESDAY = "2026-11-25"
const SUNDAY = "2026-11-22"
const at = (day: string, time: string) => new Date(`${day}T${time}:00-06:00`)

const configWith = (patch: Partial<DeliverySlotsConfig>): DeliverySlotsConfig => ({
  ...structuredClone(DEFAULT_DELIVERY_SLOTS_CONFIG),
  ...patch,
})

describe("DELIVERY_SLOTS — la lista histórica", () => {
  it("conserva las 6 etiquetas y horas de siempre", () => {
    expect(DELIVERY_SLOTS.map((s) => s.label)).toEqual(HISTORICAL_LABELS)
    expect(DELIVERY_SLOTS.map((s) => s.start)).toEqual([
      "08:00",
      "10:00",
      "12:00",
      "14:00",
      "16:00",
      "18:00",
    ])
    expect(findDeliverySlotByStart("12:00")?.id).toBe("12-14")
    expect(findDeliverySlotByStart("09:30")).toBeUndefined()
  })
})

describe("normalizeDeliverySlotsConfig", () => {
  it("basura → la configuración histórica", () => {
    expect(normalizeDeliverySlotsConfig(null)).toEqual(DEFAULT_DELIVERY_SLOTS_CONFIG)
    expect(normalizeDeliverySlotsConfig("x")).toEqual(DEFAULT_DELIVERY_SLOTS_CONFIG)
    expect(normalizeDeliverySlotsConfig({})).toEqual(DEFAULT_DELIVERY_SLOTS_CONFIG)
  })

  it("descarta ids desconocidos, deduplica y reordena por la lista", () => {
    const config = normalizeDeliverySlotsConfig({
      week: [["12-14", "08-10", "12-14", "no-existe"], [], null, "x", [], [], []],
    })
    expect(config.week[0]).toEqual(["08-10", "12-14"])
    expect(config.week[1]).toEqual([])
    // Un día ausente o ilegible se lee como «todas» (forma corta tolerante).
    expect(config.week[2]).toEqual([...ALL_DELIVERY_SLOT_IDS])
    expect(config.week[3]).toEqual([...ALL_DELIVERY_SLOT_IDS])
  })

  it("valida la hora de corte y acota la capacidad", () => {
    expect(normalizeDeliverySlotsConfig({ cutoffTime: "14:30" }).cutoffTime).toBe("14:30")
    expect(normalizeDeliverySlotsConfig({ cutoffTime: "25:00" }).cutoffTime).toBeNull()
    expect(normalizeDeliverySlotsConfig({ cutoffTime: 14 }).cutoffTime).toBeNull()
    expect(normalizeDeliverySlotsConfig({ capacityPerSlot: 7 }).capacityPerSlot).toBe(7)
    expect(normalizeDeliverySlotsConfig({ capacityPerSlot: 0 }).capacityPerSlot).toBe(1)
    expect(normalizeDeliverySlotsConfig({ capacityPerSlot: 9999 }).capacityPerSlot).toBe(200)
    expect(normalizeDeliverySlotsConfig({ capacityPerSlot: "7" }).capacityPerSlot).toBeNull()
  })
})

describe("isDefaultDeliverySlotsConfig", () => {
  it("la histórica sí; cualquier toque, no", () => {
    expect(isDefaultDeliverySlotsConfig(DEFAULT_DELIVERY_SLOTS_CONFIG)).toBe(true)
    expect(isDefaultDeliverySlotsConfig(configWith({ cutoffTime: "14:00" }))).toBe(false)
    expect(isDefaultDeliverySlotsConfig(configWith({ capacityPerSlot: 5 }))).toBe(false)
    const closedSunday = configWith({})
    closedSunday.week[0] = []
    expect(isDefaultDeliverySlotsConfig(closedSunday)).toBe(false)
  })
})

describe("weekdayOfDayKey / slotsForDayKey", () => {
  it("resuelve el día de la semana sin zona", () => {
    expect(weekdayOfDayKey(SUNDAY)).toBe(0)
    expect(weekdayOfDayKey(WEDNESDAY)).toBe(3)
  })

  it("un día cerrado no ofrece franjas", () => {
    const closedSunday = configWith({})
    closedSunday.week[0] = []
    expect(slotsForDayKey(closedSunday, SUNDAY)).toEqual([])
    expect(slotsForDayKey(closedSunday, WEDNESDAY)).toHaveLength(6)
  })
})

describe("slotUnavailableReason", () => {
  const slot12 = DELIVERY_SLOTS[2]! // 12:00 — 14:00

  it("con la configuración histórica NADA se corta, ni hoy a las 19:00", () => {
    expect(
      slotUnavailableReason(DEFAULT_DELIVERY_SLOTS_CONFIG, {
        dayKey: WEDNESDAY,
        slot: DELIVERY_SLOTS[0]!,
        now: at(WEDNESDAY, "19:00"),
        applyStartedRule: true,
      })
    ).toBeNull()
  })

  it("franja no ofrecida ese día → not_offered", () => {
    const closedSunday = configWith({})
    closedSunday.week[0] = []
    expect(
      slotUnavailableReason(closedSunday, { dayKey: SUNDAY, slot: slot12, now: at(SUNDAY, "09:00") })
    ).toBe("not_offered")
  })

  it("con corte: a la hora de corte o después, hoy ya no se entrega", () => {
    const config = configWith({ cutoffTime: "14:00" })
    expect(
      slotUnavailableReason(config, { dayKey: WEDNESDAY, slot: slot12, now: at(WEDNESDAY, "14:00") })
    ).toBe("cutoff_day")
    expect(
      slotUnavailableReason(config, { dayKey: WEDNESDAY, slot: slot12, now: at(WEDNESDAY, "13:59") })
    ).toBeNull()
    // Mañana no se corta aunque ya pasó la hora de hoy.
    expect(
      slotUnavailableReason(config, { dayKey: "2026-11-26", slot: slot12, now: at(WEDNESDAY, "15:00") })
    ).toBeNull()
  })

  it("con corte: la franja de hoy que ya empezó está cortada solo si se pide la regla", () => {
    const config = configWith({ cutoffTime: "18:00" })
    const now = at(WEDNESDAY, "15:00")
    expect(
      slotUnavailableReason(config, { dayKey: WEDNESDAY, slot: slot12, now, applyStartedRule: true })
    ).toBe("slot_started")
    expect(slotUnavailableReason(config, { dayKey: WEDNESDAY, slot: slot12, now })).toBeNull()
    // La franja que aún no empieza no se corta.
    expect(
      slotUnavailableReason(config, {
        dayKey: WEDNESDAY,
        slot: DELIVERY_SLOTS[4]!,
        now,
        applyStartedRule: true,
      })
    ).toBeNull()
  })

  it("capacidad llena → slot_full; sin conteo no bloquea", () => {
    const config = configWith({ capacityPerSlot: 2 })
    const taken = new Map([[slotTakenKey(WEDNESDAY, slot12.id), 2]])
    expect(
      slotUnavailableReason(config, { dayKey: WEDNESDAY, slot: slot12, now: at(WEDNESDAY, "09:00"), taken })
    ).toBe("slot_full")
    expect(
      slotUnavailableReason(config, { dayKey: WEDNESDAY, slot: slot12, now: at(WEDNESDAY, "09:00") })
    ).toBeNull()
  })
})

describe("buildDeliveryAvailability", () => {
  it("con la configuración histórica: 7 días × 6 franjas, como siempre", () => {
    const days = buildDeliveryAvailability(DEFAULT_DELIVERY_SLOTS_CONFIG, {
      now: at(WEDNESDAY, "19:30"),
    })
    expect(days).toHaveLength(7)
    expect(days[0]?.value).toBe(WEDNESDAY)
    for (const day of days) {
      expect(day.slots.map((s) => s.label)).toEqual(HISTORICAL_LABELS)
    }
  })

  it("un día cerrado desaparece de la oferta", () => {
    const closedSunday = configWith({})
    closedSunday.week[0] = []
    // Desde el sábado 2026-11-21: la ventana incluye el domingo 22.
    const days = buildDeliveryAvailability(closedSunday, { now: at("2026-11-21", "09:00") })
    expect(days.map((d) => d.value)).not.toContain(SUNDAY)
    expect(days).toHaveLength(6)
  })

  it("con corte, hoy se ofrece solo con las franjas que no han empezado", () => {
    const config = configWith({ cutoffTime: "18:00" })
    const days = buildDeliveryAvailability(config, { now: at(WEDNESDAY, "15:00") })
    expect(days[0]?.value).toBe(WEDNESDAY)
    expect(days[0]?.slots.map((s) => s.id)).toEqual(["16-18", "18-20"])
  })

  it("con corte ya pasado, hoy desaparece y la oferta empieza mañana", () => {
    const config = configWith({ cutoffTime: "14:00" })
    const days = buildDeliveryAvailability(config, { now: at(WEDNESDAY, "15:00") })
    expect(days[0]?.value).toBe("2026-11-26")
    expect(days[0]?.slots).toHaveLength(6)
  })
})

describe("firstSlotForSystemOrder (recurrentes)", () => {
  it("con la configuración histórica es la primera franja del día", () => {
    const slot = firstSlotForSystemOrder(DEFAULT_DELIVERY_SLOTS_CONFIG, {
      dayKey: WEDNESDAY,
      now: at(WEDNESDAY, "06:00"),
    })
    expect(slot?.id).toBe("08-10")
  })

  it("salta la franja llena si hay capacidad configurada", () => {
    const config = configWith({ capacityPerSlot: 3 })
    const taken = new Map([[slotTakenKey(WEDNESDAY, "08-10"), 3]])
    const slot = firstSlotForSystemOrder(config, { dayKey: WEDNESDAY, now: at(WEDNESDAY, "06:00"), taken })
    expect(slot?.id).toBe("10-12")
  })

  it("día cerrado → null (el ciclo no se genera)", () => {
    const closedWednesday = configWith({})
    closedWednesday.week[3] = []
    expect(
      firstSlotForSystemOrder(closedWednesday, { dayKey: WEDNESDAY, now: at(WEDNESDAY, "06:00") })
    ).toBeNull()
  })

  it("con corte ya pasado para hoy → null; para mañana, la primera", () => {
    const config = configWith({ cutoffTime: "07:00" })
    expect(
      firstSlotForSystemOrder(config, { dayKey: WEDNESDAY, now: at(WEDNESDAY, "08:30") })
    ).toBeNull()
    expect(
      firstSlotForSystemOrder(config, { dayKey: "2026-11-26", now: at(WEDNESDAY, "08:30") })?.id
    ).toBe("08-10")
  })

  it("availableSlotsForDay respeta el orden de la lista", () => {
    const slots = availableSlotsForDay(DEFAULT_DELIVERY_SLOTS_CONFIG, { dayKey: WEDNESDAY })
    expect(slots.map((s) => s.id)).toEqual([...ALL_DELIVERY_SLOT_IDS])
  })
})
