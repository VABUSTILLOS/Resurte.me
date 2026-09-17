// ============================================================
// Flotilla de reparto de FoodOS (núcleo puro)
// ============================================================
// Módulo SIN dependencias de servidor, de React ni de red: recibe zonas,
// repartidores y entregas y devuelve decisiones. Toda la aritmética de
// tarifas, ETA, asignación y payout vive aquí, y las server actions solo
// leen y escriben.
//
// Por qué importa: el reparto es la parte del negocio donde un cálculo mal
// hecho se paga en efectivo. La tarifa que se le cobra al comensal y el
// pago que recibe el repartidor tienen que ser reproducibles y auditables,
// no el resultado de una cadena de condicionales repartida por la UI.
//
// DECISIÓN: la tarifa se decide en el SERVIDOR al crear el pedido, nunca en
// el navegador. El cliente solo muestra lo que el servidor calculó.
// ============================================================

import { dayKeyOf, isWithinShift, minutesOfDay } from "@/lib/local-date"

// ------------------------------------------------------------
// Estados de una entrega
// ------------------------------------------------------------

export type DeliveryStatus =
  | "pending"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "failed"
  | "cancelled"

/** Orden del camino feliz. Se usa para mostrar la línea de tiempo. */
export const DELIVERY_FLOW: readonly DeliveryStatus[] = [
  "pending",
  "assigned",
  "picked_up",
  "delivered",
]

/** Estados en los que la entrega sigue viva (alguien tiene que actuar). */
export const ACTIVE_DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  "pending",
  "assigned",
  "picked_up",
]

export const TERMINAL_DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  "delivered",
  "failed",
  "cancelled",
]

const DELIVERY_STATUS_SET = new Set<string>([
  "pending",
  "assigned",
  "picked_up",
  "delivered",
  "failed",
  "cancelled",
])

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === "string" && DELIVERY_STATUS_SET.has(value)
}

export function isDeliveryTerminal(status: DeliveryStatus): boolean {
  return TERMINAL_DELIVERY_STATUSES.includes(status)
}

export function isDeliveryActive(status: DeliveryStatus): boolean {
  return ACTIVE_DELIVERY_STATUSES.includes(status)
}

const DELIVERY_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  // Aún sin repartidor. Puede asignarse, o morir si el restaurante cancela.
  pending: ["assigned", "cancelled", "failed"],
  // Asignada. Se puede recoger, reasignar (volver a `pending` para soltar al
  // repartidor), o morir.
  assigned: ["picked_up", "pending", "cancelled", "failed"],
  // Ya salió. Solo puede llegar o fallar en la calle.
  picked_up: ["delivered", "failed"],
  delivered: [],
  failed: [],
  cancelled: [],
}

/** ¿Es legal mover una entrega de `from` a `to`? (puro) */
export function canTransitionDelivery(
  from: DeliveryStatus,
  to: DeliveryStatus
): boolean {
  if (from === to) return false
  return DELIVERY_TRANSITIONS[from].includes(to)
}

/**
 * Siguiente paso del camino feliz, o `null` si ya es terminal.
 *
 * Es el "botón único" del repartidor: sin menús, un toque avanza el estado.
 * `assigned` vuelve a `pending` cuando el restaurante suelta al repartidor
 * a propósito, así que no forma parte de esta secuencia.
 */
export function nextDeliveryStatus(status: DeliveryStatus): DeliveryStatus | null {
  switch (status) {
    case "pending":
      return "assigned"
    case "assigned":
      return "picked_up"
    case "picked_up":
      return "delivered"
    default:
      return null
  }
}

// ------------------------------------------------------------
// Vehículos
// ------------------------------------------------------------

export type CourierVehicle = "moto" | "bici" | "auto" | "a_pie"

export const COURIER_VEHICLES: readonly CourierVehicle[] = [
  "moto",
  "bici",
  "auto",
  "a_pie",
]

export function isCourierVehicle(value: unknown): value is CourierVehicle {
  return (
    typeof value === "string" &&
    (value === "moto" || value === "bici" || value === "auto" || value === "a_pie")
  )
}

/**
 * Velocidad media urbana por vehículo, en km/h. Son valores deliberadamente
 * conservadores: es mejor prometer 40 minutos y llegar en 30 que al revés.
 * La bici y el auto empatan casi porque en ciudad el auto pierde en estacionar.
 */
export const VEHICLE_SPEED_KMH: Record<CourierVehicle, number> = {
  moto: 25,
  bici: 12,
  auto: 22,
  a_pie: 5,
}

// ------------------------------------------------------------
// Geometría
// ------------------------------------------------------------

export interface GeoPoint {
  lat: number
  lng: number
}

export function isGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== "object") return false
  const p = value as { lat?: unknown; lng?: unknown }
  return (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  )
}

const EARTH_RADIUS_KM = 6371
const toRad = (deg: number) => (deg * Math.PI) / 180

/**
 * Distancia en línea recta entre dos puntos, en km (fórmula de haversine).
 *
 * Es a propósito la distancia en línea recta y no la de manejo: sin un
 * proveedor de ruteo no tenemos la segunda, y sobreestimar con el tiempo
 * de preparación es más honesto que inventar una ruta.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Redondea a 2 decimales sin arrastrar el error binario de `toFixed`. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// ------------------------------------------------------------
// Zonas de reparto
// ------------------------------------------------------------

export interface DeliveryZoneLike {
  id: string
  name: string
  branch_id: string | null
  center_lat: number | string | null
  center_lng: number | string | null
  radius_km: number | string | null
  fee: number | string
  min_order: number | string
  eta_minutes: number
  payout_mode: string
  payout_value: number | string
  is_active: boolean
  sort_order: number
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Centro y radio utilizables de una zona, o `null` si le falta geometría. */
export function zoneGeometry(
  zone: DeliveryZoneLike
): { center: GeoPoint; radiusKm: number } | null {
  const lat = num(zone.center_lat)
  const lng = num(zone.center_lng)
  const radiusKm = num(zone.radius_km)
  if (lat === null || lng === null || radiusKm === null || radiusKm <= 0) return null
  const center = { lat, lng }
  return isGeoPoint(center) ? { center, radiusKm } : null
}

/**
 * Zona que cubre el punto dado, o `null` si ninguna lo cubre.
 *
 * Reglas:
 *  - Solo zonas activas, con geometría, y de la sucursal o globales
 *    (`branch_id === null`).
 *  - Gana el círculo **más pequeño** que contiene el punto: una zona
 *    "Centro" de 3 km es más específica que una "Zona metropolitana" de 15
 *    km, aunque las dos cubran el domicilio.
 *  - El empate se rompe por `sort_order` y luego por nombre, para que el
 *    resultado sea estable entre corridas.
 */
export function matchZone(
  zones: readonly DeliveryZoneLike[],
  point: GeoPoint | null | undefined,
  branchId: string | null = null
): DeliveryZoneLike | null {
  if (!point || !isGeoPoint(point)) return null
  const candidates: { zone: DeliveryZoneLike; radiusKm: number }[] = []
  for (const zone of zones) {
    if (!zone.is_active) continue
    if (zone.branch_id !== null && branchId !== null && zone.branch_id !== branchId) {
      continue
    }
    const geometry = zoneGeometry(zone)
    if (!geometry) continue
    if (haversineKm(geometry.center, point) <= geometry.radiusKm) {
      candidates.push({ zone, radiusKm: geometry.radiusKm })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort(
    (a, b) =>
      a.radiusKm - b.radiusKm ||
      a.zone.sort_order - b.zone.sort_order ||
      a.zone.name.localeCompare(b.zone.name)
  )
  return candidates[0]?.zone ?? null
}

// ------------------------------------------------------------
// Tarifa de entrega
// ------------------------------------------------------------

export type DeliveryFeeReason =
  /** Cobra la zona que cubre el domicilio. */
  | "zone"
  /** No hay zonas configuradas: se usa la tarifa plana de la sucursal. */
  | "branch"
  /** Hay zonas, pero ninguna cubre el domicilio. No se puede entregar. */
  | "unavailable"
  /** La zona cubre, pero el subtotal no llega al mínimo. */
  | "below_minimum"

export interface DeliveryFeeDecision {
  fee: number
  reason: DeliveryFeeReason
  zone: DeliveryZoneLike | null
  etaMinutes: number | null
  minOrder: number
  /** Cuánto falta para el mínimo de la zona (0 si ya se alcanzó). */
  shortfall: number
}

export interface DeliveryFeeInput {
  zones: readonly DeliveryZoneLike[]
  point?: GeoPoint | null
  branchId?: string | null
  /** Tarifa plana de la sucursal (`foodos_branches.delivery_fee`). */
  branchFee: number
  subtotal: number
}

/**
 * Decide cuánto cuesta entregar a un domicilio. (puro)
 *
 * Sin coordenadas del domicilio no se puede emparejar zona, así que se cae a
 * la tarifa plana de la sucursal: la Flotilla tiene que funcionar en un
 * restaurante que todavía no carga polígonos.
 *
 * `below_minimum` devuelve igual la tarifa de la zona (el llamador decide si
 * rechaza el pedido o avisa cuánto falta); `unavailable` devuelve 0 porque no
 * hay servicio posible.
 */
export function resolveDeliveryFee(input: DeliveryFeeInput): DeliveryFeeDecision {
  const branchFee = Math.max(0, num(input.branchFee) ?? 0)
  const subtotal = Math.max(0, num(input.subtotal) ?? 0)

  const usable = input.zones.filter(
    (z) =>
      z.is_active &&
      zoneGeometry(z) !== null &&
      (z.branch_id === null || input.branchId == null || z.branch_id === input.branchId)
  )

  // Sin zonas usables (o sin domicilio geolocalizado) → tarifa plana.
  if (usable.length === 0 || !input.point) {
    return {
      fee: round2(branchFee),
      reason: "branch",
      zone: null,
      etaMinutes: null,
      minOrder: 0,
      shortfall: 0,
    }
  }

  const zone = matchZone(usable, input.point, input.branchId ?? null)
  if (!zone) {
    return {
      fee: 0,
      reason: "unavailable",
      zone: null,
      etaMinutes: null,
      minOrder: 0,
      shortfall: 0,
    }
  }

  const fee = Math.max(0, num(zone.fee) ?? 0)
  const minOrder = Math.max(0, num(zone.min_order) ?? 0)
  if (subtotal < minOrder) {
    return {
      fee: round2(fee),
      reason: "below_minimum",
      zone,
      etaMinutes: zone.eta_minutes,
      minOrder: round2(minOrder),
      shortfall: round2(minOrder - subtotal),
    }
  }

  return {
    fee: round2(fee),
    reason: "zone",
    zone,
    etaMinutes: zone.eta_minutes,
    minOrder: round2(minOrder),
    shortfall: 0,
  }
}

// ------------------------------------------------------------
// Tiempo estimado
// ------------------------------------------------------------

export interface EtaInput {
  /** Minutos de preparación en cocina. */
  prepMinutes: number
  distanceKm: number | null | undefined
  vehicle?: CourierVehicle
}

/**
 * ETA en minutos: preparación + viaje. (puro)
 *
 * Se acota a 5..240 minutos para que un dato basura (distancia absurda,
 * vehículo desconocido) no produzca una promesa imposible.
 */
export function estimateEtaMinutes(input: EtaInput): number {
  const prep = Math.max(0, num(input.prepMinutes) ?? 0)
  const distance = num(input.distanceKm) ?? 0
  const vehicle: CourierVehicle = isCourierVehicle(input.vehicle)
    ? input.vehicle
    : "moto"
  const travel = distance > 0 ? (distance / VEHICLE_SPEED_KMH[vehicle]) * 60 : 0
  const total = Math.ceil(prep + travel)
  return Math.min(240, Math.max(5, total))
}

// ------------------------------------------------------------
// Repartidores
// ------------------------------------------------------------

export interface CourierLike {
  id: string
  name: string
  phone: string | null
  vehicle: string
  capacity: number
  shift_start: string | null
  shift_end: string | null
  is_active: boolean
}

export interface CourierAvailability {
  courier: CourierLike
  /** Entregas activas que ya trae encima. */
  load: number
  /** ¿Está de turno ahora mismo? */
  onShift: boolean
  /** ¿Le cabe una entrega más? */
  hasRoom: boolean
  available: boolean
}

/**
 * Disponibilidad de cada repartidor para una entrega nueva. (puro)
 *
 * `timezone` y `now` se pasan explícitamente para que el cálculo sea
 * reproducible en un test y no dependa del reloj del servidor.
 */
export function courierAvailability(
  couriers: readonly CourierLike[],
  loadByCourierId: Readonly<Record<string, number>> = {},
  options: { timezone?: string | null; now?: Date } = {}
): CourierAvailability[] {
  const minutes = minutesOfDay(options.timezone, options.now ?? new Date())
  return couriers.map((courier) => {
    const load = Math.max(0, loadByCourierId[courier.id] ?? 0)
    const onShift = isWithinShift(courier.shift_start, courier.shift_end, minutes)
    const capacity = courier.capacity > 0 ? courier.capacity : 1
    const hasRoom = load < capacity
    return {
      courier,
      load,
      onShift,
      hasRoom,
      available: courier.is_active && onShift && hasRoom,
    }
  })
}

/**
 * Elige al repartidor al que le toca. (puro)
 *
 * Criterio: el que trae menos encima (reparto de carga), desempatando por
 * mayor capacidad y luego por id para que sea determinista. Devuelve `null`
 * si nadie está disponible: en ese caso el restaurante asigna a mano o el
 * proveedor externo se hace cargo.
 */
export function pickCourier(
  couriers: readonly CourierLike[],
  loadByCourierId: Readonly<Record<string, number>> = {},
  options: { timezone?: string | null; now?: Date } = {}
): CourierLike | null {
  const available = courierAvailability(couriers, loadByCourierId, options).filter(
    (a) => a.available
  )
  if (available.length === 0) return null
  available.sort(
    (a, b) =>
      a.load - b.load ||
      b.courier.capacity - a.courier.capacity ||
      a.courier.id.localeCompare(b.courier.id)
  )
  return available[0]?.courier ?? null
}

// ------------------------------------------------------------
// Pago al repartidor
// ------------------------------------------------------------

export interface CourierPayoutInput {
  /** Modo configurado en la zona. Desconocido → `fixed`. */
  mode: string
  /** Valor de la zona: pesos fijos, pesos por km, o porcentaje de la tarifa. */
  value: number | string
  distanceKm?: number | null
  /** Tarifa cobrada al comensal; base del modo `percent`. */
  fee?: number | null
}

/**
 * Cuánto se le paga al repartidor por esta entrega. (puro)
 *
 * El porcentaje se acota a 0..100 y los modos desconocidos caen a `fixed`:
 * una zona mal configurada paga de menos, nunca de más por accidente.
 */
export function computeCourierPayout(input: CourierPayoutInput): number {
  const value = Math.max(0, num(input.value) ?? 0)
  switch (input.mode) {
    case "per_km": {
      const distance = Math.max(0, num(input.distanceKm) ?? 0)
      return round2(value * distance)
    }
    case "percent": {
      const fee = Math.max(0, num(input.fee) ?? 0)
      const pct = Math.min(100, value)
      return round2((fee * pct) / 100)
    }
    default:
      return round2(value)
  }
}

// ------------------------------------------------------------
// KPIs de la flotilla
// ------------------------------------------------------------

export interface DeliveryLike {
  id: string
  status: string
  courier_id: string | null
  fee: number | string
  courier_payout: number | string
  created_at: string
  picked_up_at: string | null
  delivered_at: string | null
}

export interface FlotillaSummary {
  /** Entregas vivas ahora mismo (pending + assigned + picked_up). */
  active: number
  /** Entregas sin repartidor asignado: lo que el restaurante tiene que resolver. */
  unassigned: number
  /** Entregadas en el día local del restaurante. */
  deliveredToday: number
  /** Fallidas o canceladas en el día local. */
  failedToday: number
  /** Minutos promedio entre recolección y entrega, de lo entregado hoy. */
  avgDeliveryMinutes: number | null
  /** Suma de tarifas cobradas hoy (lo que pagó el comensal por el envío). */
  feesToday: number
  /** Suma de pagos a repartidores por lo entregado hoy. */
  payoutsToday: number
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/**
 * KPIs operativos de la Flotilla. (puro)
 *
 * El "hoy" se evalúa en la zona del restaurante, no en UTC: a las 19:00 de
 * CDMX ya es el día siguiente en UTC y los contadores se irían al otro día.
 *
 * El tiempo de entrega se mide desde la recolección y no desde la creación
 * del pedido: así mide al repartidor y no a la cocina.
 */
export function summarizeFlotilla(
  deliveries: readonly DeliveryLike[],
  options: { timezone?: string | null; now?: Date; dayKey?: string } = {}
): FlotillaSummary {
  const today = options.dayKey ?? dayKeyOf(options.timezone, options.now ?? new Date())

  let active = 0
  let unassigned = 0
  let deliveredToday = 0
  let failedToday = 0
  let feesToday = 0
  let payoutsToday = 0
  const durations: number[] = []

  for (const delivery of deliveries) {
    if (isDeliveryStatus(delivery.status)) {
      if (isDeliveryActive(delivery.status)) {
        active += 1
        if (delivery.status === "pending" && !delivery.courier_id) unassigned += 1
      }
    }

    if (delivery.status === "delivered") {
      const at = ms(delivery.delivered_at)
      if (at !== null && dayKeyOf(options.timezone, new Date(at)) === today) {
        deliveredToday += 1
        feesToday += Math.max(0, num(delivery.fee) ?? 0)
        payoutsToday += Math.max(0, num(delivery.courier_payout) ?? 0)
        const pickedUp = ms(delivery.picked_up_at)
        if (pickedUp !== null && at >= pickedUp) {
          durations.push((at - pickedUp) / 60000)
        }
      }
    }

    if (delivery.status === "failed" || delivery.status === "cancelled") {
      const at = ms(delivery.delivered_at) ?? ms(delivery.created_at)
      if (at !== null && dayKeyOf(options.timezone, new Date(at)) === today) {
        failedToday += 1
      }
    }
  }

  const avgDeliveryMinutes =
    durations.length === 0
      ? null
      : Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length)

  return {
    active,
    unassigned,
    deliveredToday,
    failedToday,
    avgDeliveryMinutes,
    feesToday: round2(feesToday),
    payoutsToday: round2(payoutsToday),
  }
}

// ── Prueba de entrega ───────────────────────────────────────
/**
 * Longitud del PIN de entrega. Cuatro dígitos es el punto en el que
 * un repartidor lo teclea de memoria sin equivocarse y sigue siendo
 * 10 000 combinaciones para un intento por pedido.
 */
export const PROOF_PIN_LENGTH = 4

/**
 * Genera el PIN de entrega. `rng` es inyectable para poder testearlo
 * sin depender del azar.
 */
export function generateDeliveryPin(rng: () => number = Math.random): string {
  const raw = rng()
  const value = Number.isFinite(raw) ? Math.floor(raw * 10 ** PROOF_PIN_LENGTH) : 0
  const clamped = Math.min(10 ** PROOF_PIN_LENGTH - 1, Math.max(0, value))
  return String(clamped).padStart(PROOF_PIN_LENGTH, "0")
}

/**
 * Compara el PIN tecleado con el esperado. Se normaliza a dígitos
 * porque el repartidor puede teclearlo con espacios o guiones.
 * Sin PIN esperado nunca hay match: no se puede entregar "en blanco".
 */
export function pinMatches(
  expected: string | null | undefined,
  provided: string | null | undefined
): boolean {
  if (!expected) return false
  const clean = (provided ?? "").replace(/\D/g, "")
  return clean.length === PROOF_PIN_LENGTH && clean === expected
}

/** Enlace móvil del repartidor, con el token de capacidad en la ruta. */
export function courierLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/reparto/${token}`
}
