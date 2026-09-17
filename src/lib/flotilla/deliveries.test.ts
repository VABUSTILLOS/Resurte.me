import { describe, expect, it, vi } from "vitest"

// La capa de servidor de la Flotilla fija tres invariantes que cuestan caro
// si se rompen:
//
//   1. La entrega es idempotente por `order_id` (un reintento no duplica).
//   2. Sin destino no se inventa una dirección ni se cobra una entrega.
//   3. Un fallo de red o de base devuelve un resultado, nunca lanza: un
//      pedido ya confirmado no se cae porque falle la logística.

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  advanceDelivery,
  assignCourier,
  autoAssignDelivery,
  deliverWithPin,
  ensureCourierToken,
  ensureDeliveryForOrder,
  getFlotillaSummary,
  listActiveDeliveries,
  listCourierJobs,
  listCouriersWithLoad,
  loadCourierByToken,
  loadDeliveryZones,
  quoteDelivery,
  revokeCourierToken,
} from "./deliveries"

const RESTAURANT_ID = "rest-1"
const BRANCH_ID = "branch-1"
const DELIVERY_ID = "del-1"

interface Config {
  [key: string]: unknown
}

interface Calls {
  upserts: { table: string; payload: Record<string, unknown>; options?: unknown }[]
  inserts: { table: string; payload: Record<string, unknown> }[]
  updates: { table: string; payload: Record<string, unknown> }[]
  limits: number[]
}

/**
 * Cliente falso con respuestas por tabla.
 *
 * Convenciones:
 * - `config[tabla]` es un array → lo consume un `await` de lista (`then`).
 * - `config.__single[tabla]` → lo consume `maybeSingle()`.
 * - `config.__error[tabla]` → la tabla responde con error (para probar la
 *   degradación de las lecturas y el resultado de error de las escrituras).
 * - `config.__upsertDelivery` → fila que devuelve el `upsert` de entregas
 *   (`null` simula que ya existía, que es como se ve la idempotencia).
 */
function fakeClient(config: Config) {
  const calls: Calls = { upserts: [], inserts: [], updates: [], limits: [] }
  const errorFor = (table: string) =>
    (config.__error as Record<string, unknown> | undefined)?.[table] ?? null

  const client = {
    from(table: string) {
      let mode: "read" | "insert" | "update" | "upsert" = "read"
      const builder: Record<string, unknown> = {}
      for (const method of [
        "select",
        "eq",
        "neq",
        "gte",
        "lte",
        "in",
        "order",
        "ilike",
        "is",
        "filter",
      ]) {
        builder[method] = () => builder
      }
      builder.limit = (value: number) => {
        calls.limits.push(value)
        return builder
      }
      builder.insert = (payload: Record<string, unknown>) => {
        mode = "insert"
        calls.inserts.push({ table, payload })
        return builder
      }
      builder.update = (payload: Record<string, unknown>) => {
        mode = "update"
        calls.updates.push({ table, payload })
        return builder
      }
      builder.upsert = (payload: Record<string, unknown>, options?: unknown) => {
        mode = "upsert"
        calls.upserts.push({ table, payload, options })
        return builder
      }
      builder.maybeSingle = async () => {
        if (mode === "upsert" && table === "foodos_deliveries") {
          return {
            data: "__upsertDelivery" in config ? config.__upsertDelivery : { id: DELIVERY_ID },
            error: errorFor(table),
          }
        }
        const overrides = config.__single as Record<string, unknown> | undefined
        if (overrides && table in overrides) {
          return { data: overrides[table], error: null }
        }
        const value = config[table]
        // Una tabla con array no tiene fila única: `maybeSingle` no la usa.
        if (Array.isArray(value)) return { data: null, error: null }
        return { data: value ?? null, error: errorFor(table) }
      }
      builder.single = async () => ({ data: config[table] ?? null, error: errorFor(table) })
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: config[table] ?? [], error: errorFor(table) }).then(resolve)
      return builder
    },
  }
  return { client: client as never, calls }
}

function zoneRow(over: Record<string, unknown> = {}) {
  return {
    id: "zone-1",
    name: "Centro",
    branch_id: null,
    is_active: true,
    center_lat: "19.4326",
    center_lng: "-99.1332",
    radius_km: "3",
    fee: "35",
    min_order: "0",
    eta_minutes: 30,
    payout_mode: "per_km",
    payout_value: "5",
    sort_order: 1,
    ...over,
  }
}

function branchRow(over: Record<string, unknown> = {}) {
  return {
    id: BRANCH_ID,
    name: "Sucursal Centro",
    address: "Av. Reforma 1",
    lat: "19.4326",
    lng: "-99.1332",
    phone: "5555555555",
    ...over,
  }
}

/** Zona sin coordenadas del repartidor ni del cliente: caso base. */
function baseConfig(over: Config = {}): Config {
  return {
    foodos_delivery_zones: [],
    foodos_branches: branchRow(),
    ...over,
  }
}

const DROPOFF = { dropoffAddress: "Calle 1 #2, Colonia Centro" }

// ------------------------------------------------------------
// Zonas y cotización
// ------------------------------------------------------------

describe("loadDeliveryZones", () => {
  it("normaliza los NUMERIC que PostgREST devuelve como texto", async () => {
    const { client } = fakeClient(baseConfig({ foodos_delivery_zones: [zoneRow()] }))
    const zones = await loadDeliveryZones(client, RESTAURANT_ID)

    expect(zones).toHaveLength(1)
    expect(zones[0]?.radius_km).toBe(3)
    expect(zones[0]?.fee).toBe(35)
    expect(zones[0]?.center_lat).toBeCloseTo(19.4326, 4)
    expect(zones[0]?.eta_minutes).toBe(30)
    expect(zones[0]?.payout_mode).toBe("per_km")
    expect(zones[0]?.payout_value).toBe(5)
  })

  it("degrada a lista vacía si la consulta falla", async () => {
    const { client } = fakeClient(
      baseConfig({ __error: { foodos_delivery_zones: { message: "boom" } } })
    )
    await expect(loadDeliveryZones(client, RESTAURANT_ID)).resolves.toEqual([])
  })
})

describe("quoteDelivery", () => {
  it("sin zonas usables cae a la tarifa plana de la sucursal", async () => {
    const { client } = fakeClient(baseConfig())
    const quote = await quoteDelivery(client, {
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      branchFee: 45,
      subtotal: 200,
      point: null,
    })

    expect(quote.reason).toBe("branch")
    expect(quote.fee).toBe(45)
    expect(quote.zone).toBeNull()
  })

  it("con un punto dentro de una zona usa la tarifa y la ETA de la zona", async () => {
    const { client } = fakeClient(baseConfig({ foodos_delivery_zones: [zoneRow()] }))
    const quote = await quoteDelivery(client, {
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      branchFee: 45,
      subtotal: 200,
      point: { lat: 19.4326, lng: -99.1332 },
    })

    expect(quote.reason).toBe("zone")
    expect(quote.fee).toBe(35)
    expect(quote.etaMinutes).toBe(30)
    expect(quote.zone?.name).toBe("Centro")
  })

  it("reporta below_minimum cuando el subtotal no alcanza el mínimo de la zona", async () => {
    const { client } = fakeClient(
      baseConfig({ foodos_delivery_zones: [zoneRow({ min_order: "300" })] })
    )
    const quote = await quoteDelivery(client, {
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      branchFee: 45,
      subtotal: 100,
      point: { lat: 19.4326, lng: -99.1332 },
    })

    expect(quote.reason).toBe("below_minimum")
    expect(quote.shortfall).toBe(200)
  })
})

// ------------------------------------------------------------
// Creación de la entrega
// ------------------------------------------------------------

describe("ensureDeliveryForOrder", () => {
  it("no inventa una entrega si no hay dirección ni coordenadas", async () => {
    const { client, calls } = fakeClient(baseConfig())
    const result = await ensureDeliveryForOrder(client, {
      orderId: "order-1",
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      dropoffAddress: "   ",
      dropoffLat: null,
      dropoffLng: null,
      dropoffNotes: null,
      fee: 35,
    })

    expect(result).toEqual({ ok: false, reason: "no_address" })
    expect(calls.upserts).toHaveLength(0)
  })

  it("sin coordenadas no asigna zona y estima solo con la preparación", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ foodos_delivery_zones: [zoneRow()] })
    )
    const result = await ensureDeliveryForOrder(client, {
      orderId: "order-1",
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      dropoffLat: null,
      dropoffLng: null,
      dropoffNotes: null,
      fee: 35,
      ...DROPOFF,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.created).toBe(true)
    expect(result.distanceKm).toBeNull()
    expect(result.etaMinutes).toBe(15)
    expect(result.zoneName).toBeNull()
    expect(result.courierPayout).toBe(0)

    const payload = calls.upserts[0]?.payload ?? {}
    expect(payload.dropoff_address).toBe(DROPOFF.dropoffAddress)
    expect(payload.zone_id).toBeNull()
    expect(payload.zone_name).toBeNull()
    expect(payload.pickup_address).toBe("Av. Reforma 1")
    expect(payload.provider).toBe("in_house")
    expect(payload.status).toBe("pending")
    expect(calls.upserts[0]?.options).toEqual({
      onConflict: "order_id",
      ignoreDuplicates: true,
    })
  })

  it("usa la ETA de la zona cuando la sucursal no tiene coordenadas", async () => {
    const { client } = fakeClient(
      baseConfig({
        foodos_delivery_zones: [zoneRow()],
        foodos_branches: branchRow({ lat: null, lng: null }),
        __single: { foodos_delivery_zones: zoneRow() },
      })
    )
    const result = await ensureDeliveryForOrder(client, {
      orderId: "order-1",
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      dropoffAddress: "Calle 1 #2",
      dropoffLat: 19.45,
      dropoffLng: -99.15,
      dropoffNotes: null,
      fee: 35,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.zoneName).toBe("Centro")
    expect(result.distanceKm).toBeNull()
    expect(result.etaMinutes).toBe(30)
  })

  it("con coordenadas mide distancia, estima ETA y paga por km", async () => {
    const { client } = fakeClient(
      baseConfig({
        foodos_delivery_zones: [zoneRow()],
        __single: { foodos_delivery_zones: zoneRow() },
      })
    )
    const result = await ensureDeliveryForOrder(client, {
      orderId: "order-1",
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      dropoffAddress: "Calle 1 #2",
      dropoffLat: 19.45,
      dropoffLng: -99.15,
      dropoffNotes: "Portón azul",
      fee: 35,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.distanceKm).toBeGreaterThan(2.5)
    expect(result.distanceKm).toBeLessThan(2.8)
    // 15 min de preparación + ~6.3 min de moto ≈ 22.
    expect(result.etaMinutes).toBe(22)
    // per_km 5 × ~2.62 km.
    expect(result.courierPayout).toBeCloseTo(13.1, 1)
  })

  it("usa las coordenadas como dirección cuando el comensal no escribió una", async () => {
    const { client, calls } = fakeClient(baseConfig())
    const result = await ensureDeliveryForOrder(client, {
      orderId: "order-1",
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      dropoffAddress: null,
      dropoffLat: 19.45,
      dropoffLng: -99.15,
      dropoffNotes: null,
      fee: 35,
    })

    expect(result.ok).toBe(true)
    expect(calls.upserts[0]?.payload.dropoff_address).toBe("19.45, -99.15")
  })

  it("es idempotente: sin fila devuelta no crea ni bitacoriza de nuevo", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ __upsertDelivery: null, foodos_delivery_zones: [zoneRow()] })
    )
    const result = await ensureDeliveryForOrder(client, {
      orderId: "order-1",
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      dropoffLat: null,
      dropoffLng: null,
      dropoffNotes: null,
      fee: 35,
      ...DROPOFF,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.created).toBe(false)
    expect(result.deliveryId).toBeNull()
    expect(calls.upserts).toHaveLength(1)
    expect(calls.inserts.filter((i) => i.table === "foodos_delivery_events")).toHaveLength(0)
  })

  it("registra la bitácora de apertura con la zona", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        foodos_delivery_zones: [zoneRow()],
        __single: { foodos_delivery_zones: zoneRow() },
      })
    )
    await ensureDeliveryForOrder(client, {
      orderId: "order-1",
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      dropoffAddress: "Calle 1 #2",
      dropoffLat: 19.45,
      dropoffLng: -99.15,
      dropoffNotes: null,
      fee: 35,
    })

    const event = calls.inserts.find((i) => i.table === "foodos_delivery_events")
    expect(event?.payload).toMatchObject({
      delivery_id: DELIVERY_ID,
      restaurant_id: RESTAURANT_ID,
      status: "pending",
      actor: "system",
      note: "Zona Centro",
    })
  })

  it("nunca guarda una tarifa negativa", async () => {
    const { client, calls } = fakeClient(baseConfig())
    const result = await ensureDeliveryForOrder(client, {
      orderId: "order-1",
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      dropoffLat: null,
      dropoffLng: null,
      dropoffNotes: null,
      fee: -50,
      ...DROPOFF,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(calls.upserts[0]?.payload.fee).toBe(0)
    expect(result.courierPayout).toBe(0)
  })

  it("devuelve un resultado de error si el upsert falla, sin lanzar", async () => {
    const { client } = fakeClient(
      baseConfig({ __error: { foodos_deliveries: { message: "duplicate key" } } })
    )
    const result = await ensureDeliveryForOrder(client, {
      orderId: "order-1",
      restaurantId: RESTAURANT_ID,
      branchId: BRANCH_ID,
      dropoffLat: null,
      dropoffLng: null,
      dropoffNotes: null,
      fee: 35,
      ...DROPOFF,
    })

    expect(result).toMatchObject({ ok: false, reason: "error" })
  })

  it("tolera que la sucursal no exista", async () => {
    const { client, calls } = fakeClient(baseConfig({ foodos_branches: null }))
    const result = await ensureDeliveryForOrder(client, {
      orderId: "order-1",
      restaurantId: RESTAURANT_ID,
      branchId: null,
      dropoffLat: null,
      dropoffLng: null,
      dropoffNotes: null,
      fee: 35,
      ...DROPOFF,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(calls.upserts[0]?.payload.pickup_address).toBeNull()
    expect(result.distanceKm).toBeNull()
  })
})

// ------------------------------------------------------------
// Asignación y avance
// ------------------------------------------------------------

describe("assignCourier", () => {
  const delivery = (over: Record<string, unknown> = {}) => ({
    id: DELIVERY_ID,
    status: "pending",
    courier_id: null,
    fee: 35,
    distance_km: null,
    zone_id: null,
    ...over,
  })

  it("rechaza una entrega inexistente", async () => {
    const { client } = fakeClient(baseConfig())
    const result = await assignCourier(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      courierId: "courier-1",
    })
    expect(result).toEqual({ ok: false, error: "Entrega no encontrada" })
  })

  it("rechaza una entrega ya cerrada", async () => {
    const { client } = fakeClient(
      baseConfig({
        __single: { foodos_deliveries: delivery({ status: "delivered" }) },
      })
    )
    const result = await assignCourier(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      courierId: "courier-1",
    })
    expect(result).toEqual({ ok: false, error: "La entrega ya está cerrada" })
  })

  it("rechaza un repartidor de otro restaurante", async () => {
    const { client } = fakeClient(
      baseConfig({ __single: { foodos_deliveries: delivery() } })
    )
    const result = await assignCourier(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      courierId: "courier-1",
    })
    expect(result).toEqual({ ok: false, error: "Repartidor no encontrado" })
  })

  it("rechaza un repartidor inactivo", async () => {
    const { client } = fakeClient(
      baseConfig({
        __single: {
          foodos_deliveries: delivery(),
          foodos_couriers: { id: "courier-1", is_active: false },
        },
      })
    )
    const result = await assignCourier(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      courierId: "courier-1",
    })
    expect(result).toEqual({ ok: false, error: "El repartidor está inactivo" })
  })

  it("asigna, marca la hora y bitacoriza", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        __single: {
          foodos_deliveries: delivery(),
          foodos_couriers: { id: "courier-1", is_active: true },
        },
      })
    )
    const result = await assignCourier(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      courierId: "courier-1",
    })

    expect(result).toEqual({ ok: true, status: "assigned" })
    const update = calls.updates.find((u) => u.table === "foodos_deliveries")
    expect(update?.payload).toMatchObject({ courier_id: "courier-1", status: "assigned" })
    expect(typeof update?.payload.assigned_at).toBe("string")
    expect(calls.inserts.find((i) => i.table === "foodos_delivery_events")?.payload).toMatchObject({
      status: "assigned",
      actor: "restaurant",
    })
  })

  it("devuelve un error legible si la escritura falla", async () => {
    const { client } = fakeClient(
      baseConfig({
        __single: {
          foodos_deliveries: delivery(),
          foodos_couriers: { id: "courier-1", is_active: true },
        },
        __error: { foodos_deliveries: { message: "boom" } },
      })
    )
    const result = await assignCourier(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      courierId: "courier-1",
    })
    expect(result).toEqual({ ok: false, error: "No se pudo asignar el repartidor" })
  })
})

describe("advanceDelivery", () => {
  const delivery = (over: Record<string, unknown> = {}) => ({
    id: DELIVERY_ID,
    status: "assigned",
    courier_id: "courier-1",
    fee: 35,
    distance_km: null,
    zone_id: null,
    ...over,
  })

  it("rechaza una entrega inexistente", async () => {
    const { client } = fakeClient(baseConfig())
    const result = await advanceDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      status: "picked_up",
    })
    expect(result).toEqual({ ok: false, error: "Entrega no encontrada" })
  })

  it("rechaza una transición inválida sin tocar la base", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ __single: { foodos_deliveries: delivery({ status: "pending" }) } })
    )
    const result = await advanceDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      status: "delivered",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain("pending")
    expect(result.error).toContain("delivered")
    expect(calls.updates).toHaveLength(0)
  })

  it("marca picked_up_at al recoger", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ __single: { foodos_deliveries: delivery() } })
    )
    const result = await advanceDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      status: "picked_up",
      actor: "courier",
    })

    expect(result).toEqual({ ok: true, status: "picked_up" })
    expect(typeof calls.updates[0]?.payload.picked_up_at).toBe("string")
    expect(calls.inserts[0]?.payload.actor).toBe("courier")
  })

  it("exige motivo cuando falla", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ __single: { foodos_deliveries: delivery({ status: "picked_up" }) } })
    )
    await advanceDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      status: "failed",
      note: "   ",
    })

    expect(calls.updates[0]?.payload.failed_reason).toBe("Sin motivo indicado")
  })

  it("guarda el motivo y la posición cuando los hay", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ __single: { foodos_deliveries: delivery({ status: "picked_up" }) } })
    )
    await advanceDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      status: "failed",
      note: "Nadie en el domicilio",
      lat: 19.44,
      lng: -99.14,
    })

    expect(calls.updates[0]?.payload).toMatchObject({
      failed_reason: "Nadie en el domicilio",
      last_lat: 19.44,
      last_lng: -99.14,
    })
    expect(typeof calls.updates[0]?.payload.last_ping_at).toBe("string")
  })

  it("no toca la posición si no se envía", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ __single: { foodos_deliveries: delivery({ status: "picked_up" }) } })
    )
    await advanceDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      status: "delivered",
    })

    expect(calls.updates[0]?.payload).not.toHaveProperty("last_lat")
    expect(typeof calls.updates[0]?.payload.delivered_at).toBe("string")
  })

  it("devuelve un error legible si la escritura falla", async () => {
    const { client } = fakeClient(
      baseConfig({
        __single: { foodos_deliveries: delivery() },
        __error: { foodos_deliveries: { message: "boom" } },
      })
    )
    const result = await advanceDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      status: "picked_up",
    })
    expect(result).toEqual({ ok: false, error: "No se pudo actualizar la entrega" })
  })
})

// ------------------------------------------------------------
// Lectura
// ------------------------------------------------------------

describe("listCouriersWithLoad", () => {
  it("cuenta la carga y normaliza cada repartidor", async () => {
    const { client } = fakeClient(
      baseConfig({
        foodos_couriers: [
          {
            id: "courier-1",
            name: "Ana",
            phone: "5555",
            vehicle: "bici",
            capacity: "3",
            shift_start: "09:00:00",
            shift_end: "18:00:00",
            is_active: true,
            notes: null,
          },
          { id: "courier-2", name: "Beto", vehicle: "globo", capacity: null },
        ],
        foodos_deliveries: [
          { courier_id: "courier-1" },
          { courier_id: "courier-1" },
          { courier_id: null },
        ],
      })
    )

    const couriers = await listCouriersWithLoad(client, RESTAURANT_ID)
    expect(couriers).toHaveLength(2)
    expect(couriers[0]).toMatchObject({
      id: "courier-1",
      name: "Ana",
      vehicle: "bici",
      capacity: 3,
      load: 2,
      is_active: true,
    })
    // Vehículo desconocido → moto; capacidad ausente → 1; activo por defecto.
    expect(couriers[1]).toMatchObject({ vehicle: "moto", capacity: 1, load: 0, is_active: true })
  })

  it("degrada a lista vacía si la consulta falla", async () => {
    const { client } = fakeClient(
      baseConfig({ __error: { foodos_couriers: { message: "boom" } } })
    )
    await expect(listCouriersWithLoad(client, RESTAURANT_ID)).resolves.toEqual([])
  })
})

describe("listActiveDeliveries", () => {
  it("acota el límite al rango permitido", async () => {
    const { client, calls } = fakeClient(baseConfig({ foodos_deliveries: [] }))
    await listActiveDeliveries(client, RESTAURANT_ID, 9999)
    expect(calls.limits).toContain(200)

    const { client: other, calls: otherCalls } = fakeClient(
      baseConfig({ foodos_deliveries: [] })
    )
    await listActiveDeliveries(other, RESTAURANT_ID, -5)
    expect(otherCalls.limits).toContain(1)
  })

  it("degrada a lista vacía si la consulta falla", async () => {
    const { client } = fakeClient(
      baseConfig({ __error: { foodos_deliveries: { message: "boom" } } })
    )
    await expect(listActiveDeliveries(client, RESTAURANT_ID)).resolves.toEqual([])
  })
})

describe("getFlotillaSummary", () => {
  it("calcula los KPIs del día en la zona del restaurante", async () => {
    const now = new Date("2026-03-16T18:00:00Z")
    const { client } = fakeClient(
      baseConfig({
        foodos_deliveries: [
          {
            id: "d1",
            status: "picked_up",
            courier_id: "courier-1",
            fee: "35",
            courier_payout: "10",
            created_at: "2026-03-16T17:00:00Z",
            picked_up_at: "2026-03-16T17:10:00Z",
            delivered_at: null,
          },
          {
            id: "d2",
            status: "pending",
            courier_id: null,
            fee: "35",
            courier_payout: "0",
            created_at: "2026-03-16T17:30:00Z",
            picked_up_at: null,
            delivered_at: null,
          },
          {
            id: "d3",
            status: "delivered",
            courier_id: "courier-1",
            fee: "35",
            courier_payout: "10",
            created_at: "2026-03-16T15:00:00Z",
            picked_up_at: "2026-03-16T15:05:00Z",
            delivered_at: "2026-03-16T15:35:00Z",
          },
        ],
      })
    )

    const summary = await getFlotillaSummary(client, RESTAURANT_ID, {
      timezone: "America/Mexico_City",
      now,
    })

    expect(summary).not.toBeNull()
    expect(summary?.active).toBe(2)
    expect(summary?.unassigned).toBe(1)
    expect(summary?.deliveredToday).toBe(1)
    expect(summary?.avgDeliveryMinutes).toBe(30)
  })

  it("devuelve null si la consulta falla", async () => {
    const { client } = fakeClient(
      baseConfig({ __error: { foodos_deliveries: { message: "boom" } } })
    )
    await expect(getFlotillaSummary(client, RESTAURANT_ID)).resolves.toBeNull()
  })
})

// ------------------------------------------------------------
// Auto-asignación
// ------------------------------------------------------------

function courierRow(over: Record<string, unknown> = {}) {
  return {
    id: "courier-1",
    name: "Ana",
    phone: "5555555555",
    vehicle: "moto",
    capacity: 3,
    shift_start: null,
    shift_end: null,
    is_active: true,
    notes: null,
    ...over,
  }
}

function deliveryRow(over: Record<string, unknown> = {}) {
  return {
    id: DELIVERY_ID,
    status: "pending",
    courier_id: null,
    fee: 35,
    distance_km: 2,
    zone_id: null,
    proof_pin: "4321",
    order_id: "order-1",
    ...over,
  }
}

describe("autoAssignDelivery", () => {
  it("elige al repartidor de turno con menos entregas encima", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        __single: {
          foodos_deliveries: deliveryRow(),
          foodos_restaurants: { timezone: "America/Mexico_City" },
          foodos_couriers: courierRow({ id: "courier-2", name: "Beto" }),
        },
        foodos_couriers: [
          courierRow({ id: "courier-1", name: "Ana" }),
          courierRow({ id: "courier-2", name: "Beto" }),
        ],
        // Ana ya trae una entrega activa; Beto va libre.
        foodos_deliveries: [{ courier_id: "courier-1" }],
      })
    )

    const result = await autoAssignDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
    })

    expect(result.ok).toBe(true)
    expect(result.courierId).toBe("courier-2")
    expect(result.courierName).toBe("Beto")
    const assignment = calls.updates.find((u) => u.table === "foodos_deliveries")
    expect(assignment?.payload.courier_id).toBe("courier-2")
    expect(assignment?.payload.status).toBe("assigned")
  })

  it("avisa en vez de fallar en silencio cuando nadie está disponible", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        __single: {
          foodos_deliveries: deliveryRow(),
          foodos_restaurants: { timezone: "America/Mexico_City" },
        },
        foodos_couriers: [courierRow({ is_active: false })],
        foodos_deliveries: [],
      })
    )

    const result = await autoAssignDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Ningún repartidor disponible/)
    expect(calls.updates).toHaveLength(0)
  })

  it("no reasigna una entrega ya cerrada", async () => {
    const { client } = fakeClient(
      baseConfig({ __single: { foodos_deliveries: deliveryRow({ status: "delivered" }) } })
    )
    const result = await autoAssignDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBe("La entrega ya está cerrada")
  })

  it("reporta una entrega inexistente", async () => {
    const { client } = fakeClient(baseConfig({ __single: { foodos_deliveries: null } }))
    const result = await autoAssignDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBe("Entrega no encontrada")
  })
})

// ------------------------------------------------------------
// Prueba de entrega (PIN)
// ------------------------------------------------------------

describe("deliverWithPin", () => {
  it("cierra la entrega, marca la prueba y sincroniza el pedido", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        __single: {
          foodos_deliveries: deliveryRow({ status: "picked_up" }),
          foodos_orders: { status: "out_for_delivery" },
        },
      })
    )

    const result = await deliverWithPin(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      pin: "4321",
    })

    expect(result.ok).toBe(true)
    const patch = calls.updates.find((u) => u.table === "foodos_deliveries")?.payload
    expect(patch?.status).toBe("delivered")
    expect(patch?.proof_verified).toBe(true)
    expect(patch?.delivered_at).toBeTruthy()
    expect(patch?.proof_at).toBeTruthy()

    const orderPatch = calls.updates.find((u) => u.table === "foodos_orders")?.payload
    expect(orderPatch?.status).toBe("delivered")
    expect(calls.inserts.some((i) => i.table === "foodos_delivery_events")).toBe(true)
  })

  it("rechaza un PIN incorrecto sin tocar la entrega", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ __single: { foodos_deliveries: deliveryRow({ status: "picked_up" }) } })
    )

    const result = await deliverWithPin(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      pin: "0000",
    })

    expect(result).toEqual({ ok: false, error: "PIN incorrecto" })
    expect(calls.updates).toHaveLength(0)
    expect(calls.inserts).toHaveLength(0)
  })

  it("no acepta un pedido sin PIN configurado", async () => {
    const { client } = fakeClient(
      baseConfig({
        __single: { foodos_deliveries: deliveryRow({ status: "picked_up", proof_pin: null }) },
      })
    )
    const result = await deliverWithPin(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      pin: "1234",
    })
    expect(result).toEqual({ ok: false, error: "PIN incorrecto" })
  })

  it("no cierra una entrega que aún no salió a la calle", async () => {
    const { client } = fakeClient(
      baseConfig({ __single: { foodos_deliveries: deliveryRow({ status: "pending" }) } })
    )
    const result = await deliverWithPin(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      pin: "4321",
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/No se puede cerrar desde/)
  })

  it("no reescribe el pedido si ya estaba entregado", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        __single: {
          foodos_deliveries: deliveryRow({ status: "picked_up" }),
          foodos_orders: { status: "delivered" },
        },
      })
    )
    const result = await deliverWithPin(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      pin: "4321",
    })
    expect(result.ok).toBe(true)
    expect(calls.updates.filter((u) => u.table === "foodos_orders")).toHaveLength(0)
  })

  it("sigue siendo un éxito si el pedido no se puede sincronizar", async () => {
    const { client } = fakeClient(
      baseConfig({
        __single: { foodos_deliveries: deliveryRow({ status: "picked_up" }) },
        __error: { foodos_orders: { message: "boom" } },
      })
    )
    const result = await deliverWithPin(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      pin: "4321",
    })
    expect(result.ok).toBe(true)
  })

  it("guarda la ruta de la foto de entrega cuando la hay", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        __single: {
          foodos_deliveries: deliveryRow({ status: "picked_up" }),
          foodos_orders: { status: "out_for_delivery" },
        },
      })
    )
    await deliverWithPin(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      pin: "4321",
      photoPath: "rest-1/order-1/foto.jpg",
    })
    const patch = calls.updates.find((u) => u.table === "foodos_deliveries")?.payload
    expect(patch?.proof_photo_path).toBe("rest-1/order-1/foto.jpg")
  })
})

describe("advanceDelivery sincroniza el pedido", () => {
  it("marca el pedido en camino al recoger", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        __single: {
          foodos_deliveries: deliveryRow({ status: "assigned", courier_id: "courier-1" }),
          foodos_orders: { status: "preparing" },
        },
      })
    )
    const result = await advanceDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      status: "picked_up",
    })
    expect(result.ok).toBe(true)
    expect(calls.updates.find((u) => u.table === "foodos_orders")?.payload.status).toBe(
      "out_for_delivery"
    )
  })

  it("no toca el pedido al cancelar", async () => {
    const { client, calls } = fakeClient(
      baseConfig({
        __single: {
          foodos_deliveries: deliveryRow({ status: "pending" }),
          foodos_orders: { status: "confirmed" },
        },
      })
    )
    await advanceDelivery(client, {
      deliveryId: DELIVERY_ID,
      restaurantId: RESTAURANT_ID,
      status: "cancelled",
      note: "El cliente no contesta",
    })
    expect(calls.updates.filter((u) => u.table === "foodos_orders")).toHaveLength(0)
    const patch = calls.updates.find((u) => u.table === "foodos_deliveries")?.payload
    expect(patch?.cancel_reason).toBe("El cliente no contesta")
  })
})

// ------------------------------------------------------------
// Vista del repartidor
// ------------------------------------------------------------

describe("loadCourierByToken", () => {
  it("ignora tokens demasiado cortos sin consultar la base", async () => {
    const { client, calls } = fakeClient(baseConfig())
    await expect(loadCourierByToken(client, "abc")).resolves.toBeNull()
    expect(calls.upserts).toHaveLength(0)
  })

  it("devuelve la sesión con el restaurante", async () => {
    const { client } = fakeClient(
      baseConfig({
        __single: {
          foodos_couriers: {
            id: "courier-1",
            name: "Ana",
            phone: "5555555555",
            vehicle: "bici",
            capacity: 2,
            is_active: true,
            restaurant_id: RESTAURANT_ID,
          },
          foodos_restaurants: {
            id: RESTAURANT_ID,
            name: "Taquería",
            timezone: "America/Mexico_City",
            logo_url: null,
          },
        },
      })
    )
    const session = await loadCourierByToken(client, "a".repeat(32))
    expect(session?.courier.name).toBe("Ana")
    expect(session?.courier.vehicle).toBe("bici")
    expect(session?.restaurant?.name).toBe("Taquería")
  })

  it("rechaza a un repartidor desactivado", async () => {
    const { client } = fakeClient(
      baseConfig({
        __single: {
          foodos_couriers: {
            id: "courier-1",
            name: "Ana",
            vehicle: "moto",
            capacity: 1,
            is_active: false,
            restaurant_id: RESTAURANT_ID,
          },
        },
      })
    )
    await expect(loadCourierByToken(client, "a".repeat(32))).resolves.toBeNull()
  })
})

describe("listCourierJobs", () => {
  it("nombra al cliente y nunca expone el PIN", async () => {
    const { client } = fakeClient(
      baseConfig({
        foodos_deliveries: [
          {
            id: DELIVERY_ID,
            status: "assigned",
            order_id: "order-1",
            dropoff_address: "Calle 1 #2",
            dropoff_notes: "Tocar el timbre",
            zone_name: "Centro",
            eta_minutes: 25,
            distance_km: "2.4",
            courier_payout: "12.5",
            created_at: "2026-03-15T18:00:00Z",
            proof_verified: false,
          },
        ],
        foodos_orders: [{ id: "order-1", customer_name: "María" }],
      })
    )

    const jobs = await listCourierJobs(client, {
      courierId: "courier-1",
      restaurantId: RESTAURANT_ID,
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.customerName).toBe("María")
    expect(jobs[0]?.distanceKm).toBe(2.4)
    expect(jobs[0]?.courierPayout).toBe(12.5)
    expect(Object.keys(jobs[0] ?? {})).not.toContain("proof_pin")
  })

  it("degrada a lista vacía si la consulta falla", async () => {
    const { client } = fakeClient(
      baseConfig({ __error: { foodos_deliveries: { message: "boom" } } })
    )
    await expect(
      listCourierJobs(client, { courierId: "courier-1", restaurantId: RESTAURANT_ID })
    ).resolves.toEqual([])
  })
})

describe("ensureCourierToken / revokeCourierToken", () => {
  it("reutiliza el token existente", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ __single: { foodos_couriers: { id: "courier-1", access_token: "abc123" } } })
    )
    await expect(
      ensureCourierToken(client, { courierId: "courier-1", restaurantId: RESTAURANT_ID })
    ).resolves.toEqual({ ok: true, token: "abc123" })
    expect(calls.updates).toHaveLength(0)
  })

  it("genera un token de 32 caracteres cuando no tiene", async () => {
    const { client, calls } = fakeClient(
      baseConfig({ __single: { foodos_couriers: { id: "courier-1", access_token: null } } })
    )
    const result = await ensureCourierToken(client, {
      courierId: "courier-1",
      restaurantId: RESTAURANT_ID,
    })
    expect(result.ok).toBe(true)
    const token = result.ok ? result.token : ""
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(calls.updates[0]?.payload.access_token).toBe(token)
  })

  it("avisa si el repartidor no existe", async () => {
    const { client } = fakeClient(baseConfig({ __single: { foodos_couriers: null } }))
    const result = await ensureCourierToken(client, {
      courierId: "courier-x",
      restaurantId: RESTAURANT_ID,
    })
    expect(result).toEqual({ ok: false, error: "Repartidor no encontrado" })
  })

  it("revocar deja el enlace sin token", async () => {
    const { client, calls } = fakeClient(baseConfig())
    const result = await revokeCourierToken(client, {
      courierId: "courier-1",
      restaurantId: RESTAURANT_ID,
    })
    expect(result.ok).toBe(true)
    expect(calls.updates[0]?.payload.access_token).toBeNull()
  })
})
