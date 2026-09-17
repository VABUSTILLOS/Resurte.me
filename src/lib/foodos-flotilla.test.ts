import { describe, expect, it } from "vitest"
import {
  ACTIVE_DELIVERY_STATUSES,
  COURIER_VEHICLES,
  DELIVERY_FLOW,
  TERMINAL_DELIVERY_STATUSES,
  VEHICLE_SPEED_KMH,
  canTransitionDelivery,
  computeCourierPayout,
  courierAvailability,
  estimateEtaMinutes,
  haversineKm,
  isCourierVehicle,
  isDeliveryActive,
  isDeliveryStatus,
  isDeliveryTerminal,
  isGeoPoint,
  matchZone,
  nextDeliveryStatus,
  pickCourier,
  resolveDeliveryFee,
  round2,
  summarizeFlotilla,
  zoneGeometry,
  type CourierLike,
  type DeliveryLike,
  type DeliveryZoneLike,
  type GeoPoint,
} from "@/lib/foodos-flotilla"

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------

function zone(over: Partial<DeliveryZoneLike> = {}): DeliveryZoneLike {
  return {
    id: "z1",
    name: "Centro",
    branch_id: null,
    center_lat: 19.4326,
    center_lng: -99.1332,
    radius_km: 3,
    fee: 35,
    min_order: 100,
    eta_minutes: 30,
    payout_mode: "fixed",
    payout_value: 20,
    is_active: true,
    sort_order: 0,
    ...over,
  }
}

function courier(over: Partial<CourierLike> = {}): CourierLike {
  return {
    id: "c1",
    name: "Ana",
    phone: "5512345678",
    vehicle: "moto",
    capacity: 1,
    shift_start: null,
    shift_end: null,
    is_active: true,
    ...over,
  }
}

function delivery(over: Partial<DeliveryLike> = {}): DeliveryLike {
  return {
    id: "d1",
    status: "delivered",
    courier_id: "c1",
    fee: 35,
    courier_payout: 20,
    created_at: "2026-03-15T18:00:00Z",
    picked_up_at: "2026-03-15T18:10:00Z",
    delivered_at: "2026-03-15T18:40:00Z",
    ...over,
  }
}

const CDMX: GeoPoint = { lat: 19.4326, lng: -99.1332 }

// ------------------------------------------------------------
// Estados
// ------------------------------------------------------------

describe("estados de una entrega", () => {
  it("reconoce solo los seis estados válidos", () => {
    for (const status of [
      "pending",
      "assigned",
      "picked_up",
      "delivered",
      "failed",
      "cancelled",
    ]) {
      expect(isDeliveryStatus(status)).toBe(true)
    }
    expect(isDeliveryStatus("en_camino")).toBe(false)
    expect(isDeliveryStatus(null)).toBe(false)
    expect(isDeliveryStatus(7)).toBe(false)
  })

  it("separa activos de terminales sin huecos ni solapes", () => {
    const all = [...ACTIVE_DELIVERY_STATUSES, ...TERMINAL_DELIVERY_STATUSES]
    expect(new Set(all).size).toBe(6)
    for (const status of ACTIVE_DELIVERY_STATUSES) {
      expect(isDeliveryActive(status)).toBe(true)
      expect(isDeliveryTerminal(status)).toBe(false)
    }
    for (const status of TERMINAL_DELIVERY_STATUSES) {
      expect(isDeliveryTerminal(status)).toBe(true)
      expect(isDeliveryActive(status)).toBe(false)
    }
  })

  it("el camino feliz es pending → assigned → picked_up → delivered", () => {
    expect(DELIVERY_FLOW).toEqual(["pending", "assigned", "picked_up", "delivered"])
    expect(nextDeliveryStatus("pending")).toBe("assigned")
    expect(nextDeliveryStatus("assigned")).toBe("picked_up")
    expect(nextDeliveryStatus("picked_up")).toBe("delivered")
    expect(nextDeliveryStatus("delivered")).toBeNull()
    expect(nextDeliveryStatus("failed")).toBeNull()
    expect(nextDeliveryStatus("cancelled")).toBeNull()
  })

  it("permite soltar al repartidor (assigned → pending) pero no resucitar una entrega", () => {
    expect(canTransitionDelivery("assigned", "pending")).toBe(true)
    expect(canTransitionDelivery("delivered", "picked_up")).toBe(false)
    expect(canTransitionDelivery("failed", "assigned")).toBe(false)
    expect(canTransitionDelivery("cancelled", "pending")).toBe(false)
  })

  it("no permite quedarse en el mismo estado ni retroceder el camino feliz", () => {
    expect(canTransitionDelivery("pending", "pending")).toBe(false)
    expect(canTransitionDelivery("picked_up", "assigned")).toBe(false)
    expect(canTransitionDelivery("pending", "picked_up")).toBe(false)
  })

  it("una entrega ya recogida solo puede entregarse o fallar", () => {
    expect(canTransitionDelivery("picked_up", "delivered")).toBe(true)
    expect(canTransitionDelivery("picked_up", "failed")).toBe(true)
    expect(canTransitionDelivery("picked_up", "cancelled")).toBe(false)
  })
})

// ------------------------------------------------------------
// Geometría
// ------------------------------------------------------------

describe("haversineKm", () => {
  it("devuelve 0 para el mismo punto", () => {
    expect(haversineKm(CDMX, CDMX)).toBe(0)
  })

  it("mide distancias reales de CDMX con error menor al 2%", () => {
    // Zócalo → Aeropuerto (Benito Juárez), ~6.4 km en línea recta.
    const airport = { lat: 19.4361, lng: -99.0719 }
    const km = haversineKm(CDMX, airport)
    expect(km).toBeGreaterThan(6.3)
    expect(km).toBeLessThan(6.6)
  })

  it("es simétrica", () => {
    const a = { lat: 19.4, lng: -99.1 }
    const b = { lat: 19.5, lng: -99.3 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10)
  })

  it("valida puntos geográficos", () => {
    expect(isGeoPoint({ lat: 19.4, lng: -99.1 })).toBe(true)
    expect(isGeoPoint({ lat: 91, lng: 0 })).toBe(false)
    expect(isGeoPoint({ lat: 0, lng: 181 })).toBe(false)
    expect(isGeoPoint({ lat: "19", lng: 0 })).toBe(false)
    expect(isGeoPoint(null)).toBe(false)
    expect(isGeoPoint({ lat: Number.NaN, lng: 0 })).toBe(false)
  })

  it("redondea a 2 decimales", () => {
    expect(round2(35.005)).toBe(35.01)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(20)).toBe(20)
  })
})

describe("zoneGeometry", () => {
  it("acepta coordenadas como texto (NUMERIC llega string por PostgREST)", () => {
    const geometry = zoneGeometry(
      zone({ center_lat: "19.4326", center_lng: "-99.1332", radius_km: "3.00" })
    )
    expect(geometry).toEqual({ center: { lat: 19.4326, lng: -99.1332 }, radiusKm: 3 })
  })

  it("sin radio o sin centro la zona no sirve para emparejar", () => {
    expect(zoneGeometry(zone({ radius_km: null }))).toBeNull()
    expect(zoneGeometry(zone({ radius_km: 0 }))).toBeNull()
    expect(zoneGeometry(zone({ center_lat: null }))).toBeNull()
  })
})

describe("matchZone", () => {
  it("devuelve null sin domicilio geolocalizado", () => {
    expect(matchZone([zone()], null)).toBeNull()
    expect(matchZone([zone()], undefined)).toBeNull()
  })

  it("devuelve null si el domicilio queda fuera de todos los círculos", () => {
    const lejos = { lat: 20.9, lng: -99.5 }
    expect(matchZone([zone()], lejos)).toBeNull()
  })

  it("gana el círculo más pequeño que contiene el punto", () => {
    const grande = zone({ id: "grande", name: "Metropolitana", radius_km: 15 })
    const chica = zone({ id: "chica", name: "Centro", radius_km: 3 })
    expect(matchZone([grande, chica], CDMX)?.id).toBe("chica")
    // El orden de entrada no debe importar.
    expect(matchZone([chica, grande], CDMX)?.id).toBe("chica")
  })

  it("ignora zonas inactivas", () => {
    const activa = zone({ id: "activa", radius_km: 15 })
    const inactiva = zone({ id: "inactiva", radius_km: 3, is_active: false })
    expect(matchZone([inactiva, activa], CDMX)?.id).toBe("activa")
  })

  it("respeta la sucursal y admite zonas globales", () => {
    const deOtra = zone({ id: "otra", branch_id: "b2", radius_km: 1 })
    const global = zone({ id: "global", branch_id: null, radius_km: 5 })
    expect(matchZone([deOtra], CDMX, "b1")).toBeNull()
    expect(matchZone([deOtra, global], CDMX, "b1")?.id).toBe("global")
    expect(matchZone([deOtra, global], CDMX, "b2")?.id).toBe("otra")
  })

  it("el empate por radio se rompe por sort_order y luego por nombre", () => {
    const primera = zone({ id: "primera", name: "Centro", radius_km: 3, sort_order: 1 })
    const segunda = zone({ id: "segunda", name: "Centro", radius_km: 3, sort_order: 2 })
    expect(matchZone([segunda, primera], CDMX)?.id).toBe("primera")

    const alfa = zone({ id: "alfa", name: "Alfa", radius_km: 3, sort_order: 1 })
    const beta = zone({ id: "beta", name: "Beta", radius_km: 3, sort_order: 1 })
    expect(matchZone([beta, alfa], CDMX)?.id).toBe("alfa")
  })

  it("es determinista entre corridas", () => {
    const zones = [zone({ id: "x", radius_km: 4 }), zone({ id: "y", radius_km: 4 })]
    expect(matchZone(zones, CDMX)?.id).toBe(matchZone(zones, CDMX)?.id)
  })
})

// ------------------------------------------------------------
// Tarifa
// ------------------------------------------------------------

describe("resolveDeliveryFee", () => {
  it("sin zonas configuradas usa la tarifa plana de la sucursal", () => {
    const decision = resolveDeliveryFee({
      zones: [],
      point: CDMX,
      branchFee: 45,
      subtotal: 200,
    })
    expect(decision).toMatchObject({ fee: 45, reason: "branch", zone: null })
  })

  it("sin domicilio geolocalizado también cae a la tarifa plana", () => {
    const decision = resolveDeliveryFee({
      zones: [zone()],
      point: null,
      branchFee: 45,
      subtotal: 200,
    })
    expect(decision.reason).toBe("branch")
    expect(decision.fee).toBe(45)
  })

  it("con zonas configuradas pero domicilio fuera, no hay servicio", () => {
    const decision = resolveDeliveryFee({
      zones: [zone()],
      point: { lat: 20.9, lng: -99.5 },
      branchFee: 45,
      subtotal: 200,
    })
    expect(decision.reason).toBe("unavailable")
    expect(decision.fee).toBe(0)
  })

  it("cobra la tarifa de la zona que cubre el domicilio", () => {
    const decision = resolveDeliveryFee({
      zones: [zone({ fee: 29, eta_minutes: 25 })],
      point: CDMX,
      branchFee: 45,
      subtotal: 200,
    })
    expect(decision.reason).toBe("zone")
    expect(decision.fee).toBe(29)
    expect(decision.etaMinutes).toBe(25)
    expect(decision.shortfall).toBe(0)
  })

  it("avisa cuánto falta para el mínimo de la zona", () => {
    const decision = resolveDeliveryFee({
      zones: [zone({ min_order: 150 })],
      point: CDMX,
      branchFee: 45,
      subtotal: 100,
    })
    expect(decision.reason).toBe("below_minimum")
    expect(decision.minOrder).toBe(150)
    expect(decision.shortfall).toBe(50)
  })

  it("justo en el mínimo ya se puede entregar", () => {
    const decision = resolveDeliveryFee({
      zones: [zone({ min_order: 150 })],
      point: CDMX,
      branchFee: 45,
      subtotal: 150,
    })
    expect(decision.reason).toBe("zone")
    expect(decision.shortfall).toBe(0)
  })

  it("ignora zonas inactivas o sin geometría al decidir si hay servicio", () => {
    const decision = resolveDeliveryFee({
      zones: [zone({ is_active: false }), zone({ id: "z2", radius_km: null })],
      point: CDMX,
      branchFee: 45,
      subtotal: 200,
    })
    expect(decision.reason).toBe("branch")
    expect(decision.fee).toBe(45)
  })

  it("no deja que una zona de otra sucursal decida la tarifa", () => {
    const decision = resolveDeliveryFee({
      zones: [zone({ branch_id: "b2", fee: 99 })],
      point: CDMX,
      branchId: "b1",
      branchFee: 45,
      subtotal: 200,
    })
    expect(decision.reason).toBe("branch")
    expect(decision.fee).toBe(45)
  })

  it("acepta tarifas como texto sin producir NaN", () => {
    const decision = resolveDeliveryFee({
      zones: [zone({ fee: "29.50", min_order: "100.00" })],
      point: CDMX,
      branchFee: 45,
      subtotal: 200,
    })
    expect(decision.fee).toBe(29.5)
  })

  it("nunca devuelve una tarifa negativa", () => {
    const decision = resolveDeliveryFee({
      zones: [zone({ fee: -10 })],
      point: CDMX,
      branchFee: -5,
      subtotal: 200,
    })
    expect(decision.fee).toBe(0)
  })
})

// ------------------------------------------------------------
// ETA
// ------------------------------------------------------------

describe("estimateEtaMinutes", () => {
  it("suma preparación y viaje en moto", () => {
    // 5 km a 25 km/h = 12 min; + 20 de cocina = 32.
    expect(estimateEtaMinutes({ prepMinutes: 20, distanceKm: 5, vehicle: "moto" })).toBe(32)
  })

  it("la bici tarda más que la moto y el auto menos que la bici", () => {
    const moto = estimateEtaMinutes({ prepMinutes: 15, distanceKm: 5, vehicle: "moto" })
    const bici = estimateEtaMinutes({ prepMinutes: 15, distanceKm: 5, vehicle: "bici" })
    const auto = estimateEtaMinutes({ prepMinutes: 15, distanceKm: 5, vehicle: "auto" })
    expect(bici).toBeGreaterThan(auto)
    expect(auto).toBeGreaterThan(moto)
  })

  it("un vehículo desconocido cae a moto en vez de romper", () => {
    const conBasura = estimateEtaMinutes({
      prepMinutes: 20,
      distanceKm: 5,
      vehicle: "patineta" as never,
    })
    expect(conBasura).toBe(32)
  })

  it("sin distancia solo cuenta la preparación", () => {
    expect(estimateEtaMinutes({ prepMinutes: 25, distanceKm: null })).toBe(25)
  })

  it("se acota a 5..240 minutos", () => {
    expect(estimateEtaMinutes({ prepMinutes: 0, distanceKm: 0 })).toBe(5)
    expect(estimateEtaMinutes({ prepMinutes: 900, distanceKm: 100 })).toBe(240)
  })

  it("conoce la velocidad de cada vehículo soportado", () => {
    for (const vehicle of COURIER_VEHICLES) {
      expect(VEHICLE_SPEED_KMH[vehicle]).toBeGreaterThan(0)
      expect(isCourierVehicle(vehicle)).toBe(true)
    }
    expect(isCourierVehicle("avion")).toBe(false)
  })
})

// ------------------------------------------------------------
// Repartidores
// ------------------------------------------------------------

describe("courierAvailability / pickCourier", () => {
  const NOW = new Date("2026-03-15T18:00:00Z") // 12:00 en CDMX

  it("un repartidor inactivo nunca está disponible", () => {
    const list = courierAvailability([courier({ is_active: false })], {}, { now: NOW })
    expect(list[0]?.available).toBe(false)
    expect(pickCourier([courier({ is_active: false })], {}, { now: NOW })).toBeNull()
  })

  it("sin turno declarado se asume disponible", () => {
    const list = courierAvailability([courier()], {}, { now: NOW, timezone: "America/Mexico_City" })
    expect(list[0]).toMatchObject({ onShift: true, available: true, load: 0 })
  })

  it("respeta el turno en la zona del restaurante", () => {
    const deManana = courier({ shift_start: "08:00", shift_end: "14:00" })
    // 12:00 en CDMX → dentro.
    expect(
      courierAvailability([deManana], {}, { now: NOW, timezone: "America/Mexico_City" })[0]
        ?.onShift
    ).toBe(true)
    // 18:00 en CDMX → fuera.
    expect(
      courierAvailability([deManana], {}, {
        now: new Date("2026-03-16T00:00:00Z"),
        timezone: "America/Mexico_City",
      })[0]?.onShift
    ).toBe(false)
  })

  it("soporta turnos que cruzan medianoche", () => {
    const nocturno = courier({ shift_start: "22:00", shift_end: "02:00" })
    const at = (iso: string) =>
      courierAvailability([nocturno], {}, { now: new Date(iso), timezone: "America/Mexico_City" })[0]
        ?.onShift
    // 23:00 CDMX = 05:00Z del día siguiente.
    expect(at("2026-03-16T05:00:00Z")).toBe(true)
    // 01:00 CDMX = 07:00Z.
    expect(at("2026-03-16T07:00:00Z")).toBe(true)
    // 03:00 CDMX = 09:00Z.
    expect(at("2026-03-16T09:00:00Z")).toBe(false)
  })

  it("un repartidor lleno no está disponible", () => {
    const list = courierAvailability([courier({ capacity: 1 })], { c1: 1 }, { now: NOW })
    expect(list[0]).toMatchObject({ load: 1, hasRoom: false, available: false })
  })

  it("elige al que trae menos encima", () => {
    const ana = courier({ id: "ana" })
    const beto = courier({ id: "beto" })
    const elegido = pickCourier([ana, beto], { ana: 1, beto: 0 }, { now: NOW })
    expect(elegido?.id).toBe("beto")
  })

  it("desempata por mayor capacidad y luego por id, de forma estable", () => {
    const chico = courier({ id: "b", capacity: 1 })
    const grande = courier({ id: "a", capacity: 3 })
    expect(pickCourier([chico, grande], {}, { now: NOW })?.id).toBe("a")

    const x = courier({ id: "x", capacity: 2 })
    const y = courier({ id: "y", capacity: 2 })
    expect(pickCourier([y, x], {}, { now: NOW })?.id).toBe("x")
  })

  it("ignora a quien está fuera de turno al elegir", () => {
    const fuera = courier({ id: "fuera", shift_start: "08:00", shift_end: "10:00" })
    const dentro = courier({ id: "dentro", shift_start: "08:00", shift_end: "20:00" })
    const elegido = pickCourier([fuera, dentro], {}, {
      now: NOW,
      timezone: "America/Mexico_City",
    })
    expect(elegido?.id).toBe("dentro")
  })

  it("sin nadie disponible devuelve null (el restaurante asigna a mano)", () => {
    expect(pickCourier([], {}, { now: NOW })).toBeNull()
    expect(
      pickCourier([courier({ capacity: 1 })], { c1: 5 }, { now: NOW })
    ).toBeNull()
  })
})

// ------------------------------------------------------------
// Payout
// ------------------------------------------------------------

describe("computeCourierPayout", () => {
  it("modo fijo paga el valor de la zona", () => {
    expect(computeCourierPayout({ mode: "fixed", value: 20 })).toBe(20)
  })

  it("modo por km multiplica por la distancia", () => {
    expect(
      computeCourierPayout({ mode: "per_km", value: 6, distanceKm: 4.5 })
    ).toBe(27)
  })

  it("modo porcentaje se aplica a la tarifa cobrada", () => {
    expect(computeCourierPayout({ mode: "percent", value: 60, fee: 35 })).toBe(21)
  })

  it("acota el porcentaje a 100 para no pagar de más por un error de captura", () => {
    expect(computeCourierPayout({ mode: "percent", value: 250, fee: 100 })).toBe(100)
  })

  it("un modo desconocido cae a fijo", () => {
    expect(computeCourierPayout({ mode: "propinas", value: 15 })).toBe(15)
  })

  it("sin datos produce 0, nunca NaN ni negativo", () => {
    expect(computeCourierPayout({ mode: "per_km", value: 6, distanceKm: null })).toBe(0)
    expect(computeCourierPayout({ mode: "percent", value: -5, fee: 35 })).toBe(0)
    expect(computeCourierPayout({ mode: "fixed", value: "-3" })).toBe(0)
  })

  it("acepta el valor como texto (NUMERIC llega string)", () => {
    expect(computeCourierPayout({ mode: "fixed", value: "20.50" })).toBe(20.5)
  })
})

// ------------------------------------------------------------
// KPIs
// ------------------------------------------------------------

describe("summarizeFlotilla", () => {
  const TZ = "America/Mexico_City"
  const NOW = new Date("2026-03-15T20:00:00Z") // 14:00 CDMX

  it("cuenta activas y sin asignar", () => {
    const summary = summarizeFlotilla(
      [
        delivery({ id: "a", status: "pending", courier_id: null, delivered_at: null }),
        delivery({ id: "b", status: "assigned" }),
        delivery({ id: "c", status: "picked_up" }),
        delivery({ id: "d", status: "delivered" }),
      ],
      { timezone: TZ, now: NOW }
    )
    expect(summary.active).toBe(3)
    expect(summary.unassigned).toBe(1)
  })

  it("mide el tiempo de entrega desde la recolección, no desde el pedido", () => {
    const summary = summarizeFlotilla([delivery()], { timezone: TZ, now: NOW })
    // 18:10 → 18:40 = 30 min, aunque el pedido se creó a las 18:00.
    expect(summary.avgDeliveryMinutes).toBe(30)
  })

  it("promedia varias entregas y devuelve null si no hay ninguna", () => {
    const summary = summarizeFlotilla(
      [
        delivery({ id: "a", delivered_at: "2026-03-15T18:40:00Z" }), // 30
        delivery({ id: "b", delivered_at: "2026-03-15T18:30:00Z" }), // 20
      ],
      { timezone: TZ, now: NOW }
    )
    expect(summary.avgDeliveryMinutes).toBe(25)
    expect(
      summarizeFlotilla([delivery({ status: "pending" })], { timezone: TZ, now: NOW })
        .avgDeliveryMinutes
    ).toBeNull()
  })

  it("suma tarifas y pagos solo de lo entregado hoy en la zona del restaurante", () => {
    const summary = summarizeFlotilla(
      [
        delivery({ id: "hoy", fee: 35, courier_payout: 20 }),
        // 2026-03-15T05:00Z = 23:00 del 14 de marzo en CDMX → ayer.
        delivery({
          id: "ayer",
          fee: 100,
          courier_payout: 50,
          picked_up_at: "2026-03-15T04:00:00Z",
          delivered_at: "2026-03-15T05:00:00Z",
        }),
      ],
      { timezone: TZ, now: NOW }
    )
    expect(summary.deliveredToday).toBe(1)
    expect(summary.feesToday).toBe(35)
    expect(summary.payoutsToday).toBe(20)
  })

  it("cuenta fallidas y canceladas del día", () => {
    const summary = summarizeFlotilla(
      [
        delivery({ id: "f", status: "failed", delivered_at: null }),
        delivery({ id: "c", status: "cancelled", delivered_at: null }),
      ],
      { timezone: TZ, now: NOW }
    )
    expect(summary.failedToday).toBe(2)
    expect(summary.deliveredToday).toBe(0)
  })

  it("tolera datos incompletos sin romper", () => {
    const summary = summarizeFlotilla(
      [
        delivery({ id: "a", status: "raro" }),
        delivery({ id: "b", status: "delivered", fee: "35.50", delivered_at: null }),
        delivery({ id: "c", status: "delivered", picked_up_at: null }),
      ],
      { timezone: TZ, now: NOW }
    )
    expect(summary.active).toBe(0)
    expect(summary.avgDeliveryMinutes).toBeNull()
  })

  it("acepta un dayKey explícito para pruebas deterministas", () => {
    const summary = summarizeFlotilla([delivery()], {
      timezone: TZ,
      now: NOW,
      dayKey: "2026-03-15",
    })
    expect(summary.deliveredToday).toBe(1)
  })
})
