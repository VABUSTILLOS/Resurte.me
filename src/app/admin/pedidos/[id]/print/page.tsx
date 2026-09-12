import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import {
  STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/order-labels"
import { PrintButton } from "./print-button"

export const dynamic = "force-dynamic"

/**
 * /admin/pedidos/[id]/print — ticket imprimible del pedido (80mm friendly).
 * El guard del layout /admin ya restringe el acceso; aquí se lee con
 * service_role tras re-validar requireAdmin (defensa en profundidad).
 */
export default async function PrintOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) notFound()

  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId) || orderId <= 0) notFound()

  const supabase = await createServiceClient()
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, status, subtotal, discount, coupon_code, delivery_fee, total, payment_method, payment_status, created_at, scheduled_for, customer_phone, profiles(full_name), addresses(street, number, interior, neighborhood, city, state, zip_code, references), delivery_drivers(name), order_items(quantity, unit_price, products(name))"
    )
    .eq("id", orderId)
    .maybeSingle()

  if (!order) notFound()

  const unwrap = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)
  const profile = unwrap(order.profiles as { full_name: string | null } | { full_name: string | null }[] | null)
  type Addr = {
    street: string; number: string; interior: string | null; neighborhood: string
    city: string; state: string; zip_code: string; references: string | null
  }
  const address = unwrap(order.addresses as Addr | Addr[] | null)
  const driver = unwrap(order.delivery_drivers as { name: string } | { name: string }[] | null)
  const items = (order.order_items ?? []) as unknown as {
    quantity: number
    unit_price: number
    products: { name: string } | { name: string }[] | null
  }[]

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <style>{`@media print { @page { margin: 8mm; } .no-print { display: none !important; } }`}</style>
      <div className="max-w-sm mx-auto bg-white shadow-lg print:shadow-none rounded-lg print:rounded-none p-6 font-mono text-sm text-gray-900">
        {/* Encabezado */}
        <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
          <p className="text-lg font-bold">Resurte.me</p>
          <p className="text-xs text-gray-500">Central de abastos digital</p>
          <p className="text-xl font-bold mt-2">PEDIDO #{order.id}</p>
          <p className="text-xs text-gray-500">
            {new Date(order.created_at).toLocaleString("es-MX", {
              day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
            })}
          </p>
          <p className="text-xs mt-1 font-semibold">
            {STATUS_LABEL[order.status as keyof typeof STATUS_LABEL] ?? order.status}
          </p>
        </div>

        {/* Cliente */}
        <div className="border-b border-dashed border-gray-300 pb-3 mb-3 text-xs space-y-1">
          <p><span className="text-gray-500">Cliente:</span> {profile?.full_name ?? "Mostrador"}</p>
          {order.customer_phone && <p><span className="text-gray-500">Tel:</span> {order.customer_phone}</p>}
          {address && (
            <p>
              <span className="text-gray-500">Entrega:</span> {address.street} {address.number}
              {address.interior ? ` Int. ${address.interior}` : ""}, Col. {address.neighborhood},
              CP {address.zip_code}, {address.city}
            </p>
          )}
          {address?.references && (
            <p><span className="text-gray-500">Ref:</span> {address.references}</p>
          )}
          {order.scheduled_for && (
            <p>
              <span className="text-gray-500">Programado:</span>{" "}
              {new Date(order.scheduled_for).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
            </p>
          )}
          {driver && <p><span className="text-gray-500">Repartidor:</span> {driver.name}</p>}
        </div>

        {/* Items */}
        <table className="w-full text-xs mb-3">
          <tbody>
            {items.map((item, i) => {
              const product = unwrap(item.products)
              return (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2">{item.quantity}× {product?.name ?? "Producto"}</td>
                  <td className="py-1 text-right whitespace-nowrap">
                    ${(Number(item.unit_price) * item.quantity).toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Totales */}
        <div className="border-t border-dashed border-gray-300 pt-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span><span>${Number(order.subtotal).toFixed(2)}</span>
          </div>
          {order.discount != null && Number(order.discount) > 0 && (
            <div className="flex justify-between">
              <span>Descuento{order.coupon_code ? ` (${order.coupon_code})` : ""}</span>
              <span>−${Number(order.discount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Envío</span><span>${Number(order.delivery_fee).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-bold pt-1 border-t border-gray-300">
            <span>TOTAL</span><span>${Number(order.total).toFixed(2)}</span>
          </div>
          <p className="text-[10px] text-gray-500 pt-1">
            {PAYMENT_METHOD_LABEL[order.payment_method ?? "cash_on_delivery"]} ·{" "}
            {PAYMENT_STATUS_LABEL[order.payment_status as keyof typeof PAYMENT_STATUS_LABEL]}
          </p>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-6">
          ¡Gracias por tu pedido! · resurte.me
        </p>
      </div>

      <div className="no-print text-center mt-6">
        <PrintButton />
      </div>
    </div>
  )
}
