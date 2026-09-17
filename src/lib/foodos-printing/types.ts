// ============================================================
// Contrato de impresión de FoodOS.
//
// El dominio (un pedido) no sabe nada del dispositivo. Primero se arma un
// `TicketDocument` puro —el mismo objeto sirve para el diálogo del navegador
// o para una térmica ESC/POS— y después un `TicketPrinter` lo manda al fierro.
// Separar las dos cosas es lo que permite probar el contenido del ticket sin
// una impresora y agregar Bluetooth/USB después sin tocar el dominio.
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

export type TicketPrinterId = "browser" | "escpos"

export type PrintOutcome =
  | { ok: true; printer: TicketPrinterId; via: "browser-dialog" | "escpos" }
  | { ok: false; printer: TicketPrinterId; reason: string }

export interface TicketPrinter {
  id: TicketPrinterId
  label: string
  /**
   * `false` = adaptador declarado pero todavía no implementado. `print`
   * responde que no en vez de fingir que mandó algo a una impresora.
   */
  implemented: boolean
  /** `true` si necesita un navegador con DOM (el diálogo del sistema). */
  requiresBrowser: boolean
  /** Ruta que el cliente debe abrir para imprimir. `null` si no aplica. */
  printPath(doc: TicketDocument, orderId: string): string | null
  print(doc: TicketDocument, orderId: string): Promise<PrintOutcome>
}
