import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth"
import { formatMoney } from "@/lib/foodos"
import type { FoodosBranch, FoodosOrder, FoodosRestaurant } from "@/types/foodos"
import { PrintButton } from "./print-button"

export const dynamic = "force-dynamic"

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "En preparación",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
}

const FULFILLMENT_LABEL: Record<string, string> = {
  pickup: "Para llevar",
  delivery: "A domicilio",
  dine_in: "En el local",
}

/**
 * /panel/foodos/pedidos/[id]/print — comanda imprimible del pedido FoodOS
 * (80mm friendly). Lee con la sesión del dueño (RLS), no con service role.
 */
export default async function FoodosPrintOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { supabase } = await requireAuth()
  const { id } = await params

  const { data: order } = await supabase
    .from("foodos_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!order) notFound()

  const o = order as FoodosOrder

  const [restaurantRes, branchRes] = await Promise.all([
    supabase.from("foodos_restaurants").select("name").eq("id", o.restaurant_id).maybeSingle(),
    o.branch_id
      ? supabase.from("foodos_branches").select("name").eq("id", o.branch_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const restaurantName = (restaurantRes.data as Pick<FoodosRestaurant, "name"> | null)?.name ?? "Restaurante"
  const branchName = (branchRes.data as Pick<FoodosBranch, "name"> | null)?.name ?? null

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <style>{`@media print { @page { margin: 8mm; } .no-print { display: none !important; } }`}</style>
      <div className="max-w-sm mx-auto bg-white shadow-lg print:shadow-none rounded-lg print:rounded-none p-6 font-mono text-sm text-gray-900">
        {/* Encabezado */}
        <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
          <p className="font-bold text-base">{restaurantName}</p>
          {branchName && <p className="text-xs text-gray-500">{branchName}</p>}
          <p className="text-xs text-gray-500 mt-1">
            #{o.id.slice(0, 8).toUpperCase()} ·{" "}
            {new Date(o.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
          </p>
          <p className="text-xs font-bold mt-1">
            {FULFILLMENT_LABEL[o.fulfillment] ?? o.fulfillment}
            {o.table_number ? ` · MESA ${o.table_number}` : ""}
            {" · "}
            {STATUS_LABEL[o.status] ?? o.status}
          </p>
        </div>

        {/* Items */}
        <div className="space-y-2 border-b border-dashed border-gray-300 pb-4 mb-4">
          {o.items.map((item, idx) => (
            <div key={idx}>
              <div className="flex justify-between">
                <span>
                  <strong>{item.qty}×</strong> {item.name}
                </span>
                <span>{formatMoney(item.price * item.qty)}</span>
              </div>
              {item.modifiers?.map((m) => (
                <p key={m.value_id} className="pl-6 text-xs text-gray-600">
                  └ {m.value_name}
                  {Number(m.price_delta) > 0 ? ` (+${formatMoney(Number(m.price_delta))})` : ""}
                </p>
              ))}
            </div>
          ))}
        </div>

        {/* Cliente */}
        {(o.customer_name || o.customer_phone) && (
          <div className="text-xs border-b border-dashed border-gray-300 pb-4 mb-4">
            <p>
              <strong>Cliente:</strong> {o.customer_name ?? "—"} {o.customer_phone ? `· ${o.customer_phone}` : ""}
            </p>
          </div>
        )}

        {/* Nota */}
        {o.note && (
          <div className="text-xs border-b border-dashed border-gray-300 pb-4 mb-4">
            <p>
              <strong>Nota:</strong> {o.note}
            </p>
          </div>
        )}

        {/* Totales */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatMoney(o.subtotal)}</span>
          </div>
          {o.discount > 0 && (
            <div className="flex justify-between">
              <span>Descuento</span>
              <span>-{formatMoney(o.discount)}</span>
            </div>
          )}
          {o.delivery_fee > 0 && (
            <div className="flex justify-between">
              <span>Envío</span>
              <span>{formatMoney(o.delivery_fee)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-2 border-t border-dashed border-gray-300">
            <span>TOTAL</span>
            <span>{formatMoney(o.total)}</span>
          </div>
          <p className="text-center text-gray-500 pt-1">
            {o.payment_method === "card" ? "Tarjeta" : "Pago en sucursal"} ·{" "}
            {o.payment_status === "paid" ? "PAGADO" : "PENDIENTE DE PAGO"}
          </p>
        </div>

        <div className="no-print mt-6 flex justify-center">
          <PrintButton />
        </div>
      </div>
    </div>
  )
}
