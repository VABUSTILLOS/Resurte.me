import type { AdminOrder } from "@/app/admin/actions"
import {
  STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/order-labels"

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Fase 4 — Exporta los pedidos (normalmente los ya filtrados en pantalla) a
 * un CSV compatible con Excel (BOM UTF-8 + separador `;` para locale es-MX).
 */
export function exportOrdersCsv(orders: AdminOrder[], filename?: string): void {
  const headers = [
    "Pedido",
    "Fecha",
    "Cliente",
    "Estado",
    "Estado de pago",
    "Método de pago",
    "Subtotal",
    "Envío",
    "Descuento",
    "Cupón",
    "Total",
    "Ciudad",
    "Fuente",
  ]

  const rows = orders.map((o) => [
    `#${o.id}`,
    new Date(o.created_at).toLocaleString("es-MX"),
    o.customer_name ?? "",
    STATUS_LABEL[o.status] ?? o.status,
    PAYMENT_STATUS_LABEL[o.payment_status] ?? o.payment_status,
    o.payment_method
      ? PAYMENT_METHOD_LABEL[o.payment_method] ?? o.payment_method
      : "",
    o.subtotal.toFixed(2),
    o.delivery_fee.toFixed(2),
    (o.discount ?? 0).toFixed(2),
    o.coupon_code ?? "",
    o.total.toFixed(2),
    o.address?.city ?? "",
    o.source,
  ])

  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(";"))
    .join("\r\n")

  // BOM para que Excel respete UTF-8 (acentos, signos de pesos)
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = filename ?? `pedidos-resurte-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
