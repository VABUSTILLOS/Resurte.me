import { Suspense } from "react"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { BitacorasClient } from "./bitacoras-client"

/**
 * Bitácoras del panel (auditoría, errores, emails) en pestañas.
 *
 * `BitacorasClient` lee `?tab=` con useSearchParams: el boundary Suspense
 * permite prerender del shell y CSR solo de la parte dinámica (patrón del repo).
 */
export default function AdminBitacorasPage() {
  return (
    <Suspense fallback={<PageSkeleton titleWidth="w-36" cards={2} className="max-w-7xl py-6" />}>
      <BitacorasClient />
    </Suspense>
  )
}
