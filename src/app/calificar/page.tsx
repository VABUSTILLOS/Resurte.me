import { Suspense } from "react"
import type { Metadata } from "next"
import { CalificarClient } from "./calificar-client"

export const metadata: Metadata = {
  title: "Califica tu pedido — Resurte.me",
  description: "Cuéntanos cómo estuvo tu pedido: calificación de 1 a 5 estrellas y comentario opcional.",
  robots: { index: false, follow: false },
}

/**
 * /calificar — destino del enlace de la automatización post_delivery_rating
 * (WhatsApp 24 h post-entrega). Admite:
 *   · ?pedido=<id>&t=<restore_token> → invitados (capability URL)
 *   · ?pedido=<id> con sesión        → dueño del pedido
 *   · sin parámetros con sesión      → lista los pedidos entregados del
 *     usuario para elegir cuál calificar
 */
export default function CalificarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-400">
          Cargando…
        </div>
      }
    >
      <CalificarClient />
    </Suspense>
  )
}
