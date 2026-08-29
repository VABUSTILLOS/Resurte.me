export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "Preparando",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
}

export const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  preparing: "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery: "bg-orange-50 text-orange-700 border-orange-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  failed: "Fallido",
  refunded: "Reembolsado",
  amount_mismatch: "Monto incorrecto",
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "Tarjeta",
  stripe: "Stripe",
  spei: "SPEI",
  oxxo: "OXXO",
  cash_on_delivery: "Efectivo",
  mercado_pago: "Mercado Pago",
  codi: "CoDi",
}
