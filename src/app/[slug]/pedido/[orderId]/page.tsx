import { Suspense } from "react"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { TrackingClient } from "./tracking-client"

/**
 * Seguimiento público del pedido: funciona con sesión o sin ella gracias al
 * token capability (?t=restore_token) que el cliente recibe en la
 * confirmación y en los emails transaccionales.
 *
 * TrackingClient lee ?t= con useSearchParams: el boundary Suspense permite
 * prerender del shell y CSR solo de la parte dinámica (patrón del repo).
 */
export default function OrderTrackingPage() {
  return (
    <Suspense fallback={<PageSkeleton titleWidth="w-52" cards={3} />}>
      <TrackingClient />
    </Suspense>
  )
}
