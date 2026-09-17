// ============================================================
// Contrato de impresión de FoodOS.
//
// El dominio (un pedido) no sabe nada del dispositivo: aquí sólo se arma un
// `TicketDocument` puro, que se prueba sin impresora. Hoy el único destino es
// el diálogo del navegador (ver `src/app/panel/foodos/pedidos/[id]/print/`).
//
// Hubo un registro de impresoras (`printers.ts`) que declaraba un adaptador
// ESC/POS "no implementado" para que la UI lo mostrara como próximamente. La
// UI nunca lo mostró: `getPrinter`, `availablePrinters`, `printerOptions` y
// `printTicket` no tenían un solo consumidor en la app, y el módulo se
// sostenía únicamente de su propio test. Se eliminó en vez de dejar una
// promesa que nadie ve. Cuando exista la térmica real, el contrato se
// reintroduce junto con la pantalla que lo usa — no antes.
// ============================================================

import type { FoodosOrder } from "@/types/foodos"

/** Ticket de cliente (con precios) o comanda de cocina (sin precios). */
export type TicketKind = "customer" | "kitchen"

export interface TicketLineModifier {
  name: string
  priceDelta: number
}

/** Línea de ticket con el importe por línea ya resuelto en servidor. */
export interface TicketLine {
  qty: number
  name: string
  /** Precio unitario final: base + modificadores. */
  unitPrice: number
  /** `unitPrice × qty`. */
  amount: number
  modifiers: TicketLineModifier[]
}

export interface TicketTotals {
  subtotal: number
  discount: number
  deliveryFee: number
  tip: number
  total: number
}

/** Una forma de pago dentro del ticket. */
export interface TicketPaymentPart {
  method: string
  label: string
  amount: number
}

export interface TicketPayment {
  /** Etiqueta corta: "Efectivo", "Tarjeta", "Combinado". */
  label: string
  status: string
  /** En pago combinado trae una parte por forma; si no, una sola. */
  parts: TicketPaymentPart[]
  /** Efectivo recibido. `null` cuando no aplica o no se capturó. */
  received: number | null
  /** Cambio entregado. `null` cuando no aplica. */
  change: number | null
}

export interface TicketDocument {
  kind: TicketKind
  /** Folio consecutivo (`260214-0007`); si el pedido es previo al POS, el id corto. */
  folio: string
  restaurantName: string
  branchName: string | null
  /** ISO. Se formatea al imprimir, no aquí. */
  issuedAt: string
  /** Estado del pedido en lenguaje de local ("En preparación"). */
  statusLabel: string
  /** ISO del pedido programado; `null` si es inmediato. */
  scheduledFor: string | null
  fulfillmentLabel: string
  tableNumber: string | null
  customerName: string | null
  customerPhone: string | null
  note: string | null
  lines: TicketLine[]
  /** `null` en la comanda de cocina: la cocina no ve precios. */
  totals: TicketTotals | null
  /** `null` en la comanda de cocina. */
  payment: TicketPayment | null
  trackingUrl: string | null
  /** Quién atendió (cajero o mesero). */
  servedBy: string | null
}

/**
 * Datos del pedido que necesita un ticket. Es un subconjunto estructural de
 * `FoodosOrder` para poder armar tickets en pruebas sin inventar un pedido
 * completo.
 */
export type TicketOrderInput = Pick<
  FoodosOrder,
  | "id"
  | "items"
  | "subtotal"
  | "discount"
  | "delivery_fee"
  | "tip"
  | "total"
  | "fulfillment"
  | "status"
  | "payment_method"
  | "payment_status"
  | "table_number"
  | "customer_name"
  | "customer_phone"
  | "note"
  | "created_at"
  | "scheduled_for"
> &
  Partial<Pick<FoodosOrder, "folio" | "payment_breakdown">>

/** Datos que no viven en el pedido: vienen del restaurante, la sucursal o la caja. */
export interface TicketContext {
  restaurantName: string
  branchName?: string | null
  servedBy?: string | null
  trackingUrl?: string | null
  /** Desglose de pago del mostrador. Sin él se usa `payment_method` del pedido. */
  payment?: TicketPayment | null
}
