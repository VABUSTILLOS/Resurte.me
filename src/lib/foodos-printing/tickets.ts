// ============================================================
// Armado de tickets: puro, sin DOM y sin base de datos.
//
// Entra un pedido + contexto del restaurante, sale un `TicketDocument`.
// Aquí no se recalcula ningún total: el pedido ya viene calculado por
// `createFoodosOrder`, que es el único productor de totales de FoodOS.
// Volver a sumar en el ticket sería el segundo productor de totales.
// ============================================================

import type { FoodosOrderItem } from "@/types/foodos"
import type {
  TicketContext,
  TicketDocument,
  TicketLine,
  TicketOrderInput,
  TicketPayment,
  TicketPaymentPart,
} from "./types"

/**
 * Etiquetas en español a propósito: el ticket es un objeto físico que lee el
 * personal y el comensal en el local, no una pantalla con selector de idioma.
 * Es el mismo criterio que ya usa `/panel/foodos/pedidos/[id]/print`.
 */
const PAYMENT_LABEL: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  branch: "Pago en sucursal",
  whatsapp: "Coordinar por WhatsApp",
  mixed: "Combinado",
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente de pago",
  processing: "Pago en proceso",
  paid: "Pagado",
  failed: "Pago fallido",
  expired: "Pago expirado",
  refunded: "Reembolsado",
}

const FULFILLMENT_LABEL: Record<string, string> = {
  delivery: "Domicilio",
  pickup: "Para llevar",
  dine_in: "En mesa",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "En preparación",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
}

export function paymentLabel(method: string | null | undefined): string {
  if (!method) return "Sin especificar"
  return PAYMENT_LABEL[method] ?? method
}

export function paymentStatusLabel(status: string | null | undefined): string {
  if (!status) return "Sin especificar"
  return PAYMENT_STATUS_LABEL[status] ?? status
}

export function fulfillmentLabel(fulfillment: string | null | undefined): string {
  if (!fulfillment) return "Sin especificar"
  return FULFILLMENT_LABEL[fulfillment] ?? fulfillment
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Sin especificar"
  return STATUS_LABEL[status] ?? status
}

/**
 * Fecha del ticket en hora de Ciudad de México, igual que el folio
 * (`foodos_next_folio` usa `America/Mexico_City`). Si el ticket se imprimiera
 * en la zona del navegador, un pedido de las 23:50 podría salir con la fecha
 * del día siguiente y no cuadraría con su folio.
 */
export function formatTicketDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

/** Folio consecutivo si existe; los pedidos previos al POS caen al id corto. */
export function resolveFolio(order: Pick<TicketOrderInput, "id" | "folio">): string {
  const folio = order.folio?.trim()
  if (folio) return folio
  return order.id.slice(0, 8).toUpperCase()
}

/** Convierte las líneas del pedido en líneas de ticket, sin recalcular precios. */
export function buildTicketLines(items: FoodosOrderItem[]): TicketLine[] {
  return items.map((item) => ({
    qty: item.qty,
    name: item.name,
    unitPrice: item.price,
    amount: item.price * item.qty,
    modifiers: (item.modifiers ?? []).map((mod) => ({
      name: mod.value_name,
      priceDelta: mod.price_delta,
    })),
  }))
}

/**
 * Resuelve el bloque de pago. Prioridad:
 *  1. el desglose que manda la caja (pago combinado con cambio capturado),
 *  2. el `payment_breakdown` guardado en el pedido,
 *  3. `payment_method` a secas.
 */
export function resolvePayment(
  order: Pick<TicketOrderInput, "payment_method" | "payment_status"> &
    Partial<Pick<TicketOrderInput, "payment_breakdown">>,
  override?: TicketPayment | null,
): TicketPayment {
  if (override) return override

  const breakdown = order.payment_breakdown
  const rawParts = breakdown?.parts ?? []
  const parts: TicketPaymentPart[] = rawParts
    .filter((part) => part.amount !== 0)
    .map((part) => ({
      method: part.method,
      label: paymentLabel(part.method),
      amount: part.amount,
    }))

  const method = order.payment_method ?? null
  const resolvedParts: TicketPaymentPart[] =
    parts.length > 0
      ? parts
      : method
        ? [{ method, label: paymentLabel(method), amount: 0 }]
        : []

  // "Combinado" sólo si de verdad sobrevivió más de una forma de pago: un
  // cobro marcado como mixto donde la tarjeta quedó en cero es, en los hechos,
  // un pago en efectivo y así debe leerse en el ticket.
  const label =
    parts.length > 1 ? "Combinado" : parts.length === 1 ? parts[0]?.label ?? paymentLabel(method) : paymentLabel(method)

  return {
    label,
    status: paymentStatusLabel(order.payment_status),
    parts: resolvedParts,
    received: breakdown?.received ?? null,
    change: breakdown?.change ?? null,
  }
}

/**
 * Ticket de cliente: folio, qué se vendió, cuánto y cómo se pagó.
 */
export function buildCustomerTicket(
  order: TicketOrderInput,
  ctx: TicketContext,
): TicketDocument {
  return {
    kind: "customer",
    folio: resolveFolio(order),
    restaurantName: ctx.restaurantName,
    branchName: ctx.branchName ?? null,
    issuedAt: order.created_at,
    statusLabel: statusLabel(order.status),
    scheduledFor: order.scheduled_for ?? null,
    fulfillmentLabel: fulfillmentLabel(order.fulfillment),
    tableNumber: order.table_number ?? null,
    customerName: order.customer_name ?? null,
    customerPhone: order.customer_phone ?? null,
    note: order.note ?? null,
    lines: buildTicketLines(order.items ?? []),
    totals: {
      subtotal: order.subtotal,
      discount: order.discount,
      deliveryFee: order.delivery_fee,
      tip: order.tip,
      total: order.total,
    },
    payment: resolvePayment(order, ctx.payment),
    trackingUrl: ctx.trackingUrl ?? null,
    servedBy: ctx.servedBy ?? null,
  }
}

/** Firma de una línea para consolidar repetidos: nombre + modificadores. */
function lineSignature(line: TicketLine): string {
  const mods = line.modifiers
    .map((mod) => `${mod.name}:${mod.priceDelta}`)
    .sort()
    .join("|")
  return `${line.name}::${mods}`
}

/**
 * Comanda de cocina: sin precios, sin datos de cobro.
 *
 * Consolida líneas idénticas para que la cocina lea "3× Tacos al pastor" en
 * lugar de tres renglones sueltos.
 *
 * Nota: no se agrupa por estación porque el modelo no tiene ese concepto
 * —ni en `foodos_order_items` ni en el menú— y no vamos a inventar una
 * estación falsa. Cuando exista el campo, este es el punto donde se agrupa.
 */
export function buildKitchenTicket(
  order: TicketOrderInput,
  ctx: TicketContext,
): TicketDocument {
  const consolidated = new Map<string, TicketLine>()

  for (const line of buildTicketLines(order.items ?? [])) {
    const key = lineSignature(line)
    const existing = consolidated.get(key)
    if (existing) {
      existing.qty += line.qty
      existing.amount += line.amount
    } else {
      consolidated.set(key, { ...line })
    }
  }

  return {
    kind: "kitchen",
    folio: resolveFolio(order),
    restaurantName: ctx.restaurantName,
    branchName: ctx.branchName ?? null,
    issuedAt: order.created_at,
    statusLabel: statusLabel(order.status),
    scheduledFor: order.scheduled_for ?? null,
    fulfillmentLabel: fulfillmentLabel(order.fulfillment),
    tableNumber: order.table_number ?? null,
    customerName: order.customer_name ?? null,
    customerPhone: null,
    note: order.note ?? null,
    lines: [...consolidated.values()],
    totals: null,
    payment: null,
    trackingUrl: null,
    servedBy: ctx.servedBy ?? null,
  }
}

/** Arma el ticket del tipo pedido. */
export function buildTicket(
  kind: TicketDocument["kind"],
  order: TicketOrderInput,
  ctx: TicketContext,
): TicketDocument {
  return kind === "kitchen" ? buildKitchenTicket(order, ctx) : buildCustomerTicket(order, ctx)
}

/** `?auto=1` lo consume la página de impresión para disparar el diálogo sola. */
export function printPathFor(kind: TicketDocument["kind"], orderId: string, auto: boolean): string {
  const params = new URLSearchParams({ kind })
  if (auto) params.set("auto", "1")
  return `/panel/foodos/pedidos/${orderId}/print?${params.toString()}`
}
