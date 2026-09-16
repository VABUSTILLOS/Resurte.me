import { Suspense } from "react"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { RecompensasClient } from "./recompensas-client"

/**
 * Programa de créditos del panel: catálogo canjeable + cola de facturas.
 *
 * `RecompensasClient` lee `?tab=` con useSearchParams: el boundary Suspense
 * permite prerender del shell y CSR solo de la parte dinámica (patrón del repo).
 */
export default function AdminRecompensasPage() {
  return (
    <Suspense fallback={<PageSkeleton titleWidth="w-40" cards={2} className="max-w-7xl py-6" />}>
      <RecompensasClient />
    </Suspense>
  )
}
