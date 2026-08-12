import { getSellerClients, getAssistedOrders } from "@/lib/comercializacion/actions"
import { PedidosPage } from "@/components/comercializacion/pedidos-page"

export default async function PedidosPageServer() {
  const [clients, orders] = await Promise.all([getSellerClients(), getAssistedOrders()])
  return <PedidosPage clients={clients} initialOrders={orders} />
}
