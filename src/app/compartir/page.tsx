import { Suspense } from "react"
import type { Metadata } from "next"
import { ShareListClient } from "@/components/share/share-list-client"

export const metadata: Metadata = {
  title: "Lista compartida — Resurte.me",
  description:
    "Convierte una lista de WhatsApp en un pedido: pega tus productos, revisa las coincidencias del catálogo y agrégalos al carrito.",
  robots: { index: false, follow: false },
}

/**
 * Destino del share target de la PWA (`public/manifest.json` → `share_target`).
 *
 * El manifest envía `titulo`, `texto` y `url` por query string, así que la
 * lectura ocurre en el cliente y la ruta sigue siendo prerenderizable.
 */
export default function CompartirPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-400">
          Cargando…
        </div>
      }
    >
      <ShareListClient />
    </Suspense>
  )
}
