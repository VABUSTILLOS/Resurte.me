import { OrderDetailClient } from "./order-detail-client"

// Next 16: un segmento dinámico sin muestra cae a SSR por request. El detalle
// es un componente cliente puro (lee orderId con useParams y carga el pedido
// tras montar), así que la shell estática es idéntica para cualquier orderId;
// una sola muestra basta para que el CDN la sirva sin CPU de función.
export const revalidate = 300

export function generateStaticParams() {
  return [{ slug: "chihuahua", orderId: "shell" }]
}

export default function OrderDetailPage() {
  return <OrderDetailClient />
}
