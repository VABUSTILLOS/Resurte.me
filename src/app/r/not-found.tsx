import Link from "next/link"
import { MapPin, MessageCircle, Search } from "lucide-react"

/**
 * 404 propio del micrositio.
 *
 * El comensal no llega aquí navegando el sitio: llega desde un enlace
 * compartido por WhatsApp. Por eso conservamos la identidad del micrositio
 * (fondo cálido, verde de marca) en vez de caer al `not-found` raíz, y damos
 * salidas reales en lugar de un callejón sin salida.
 *
 * Vive en `app/r/` y no en `app/r/[slug]/` a propósito: el `notFound()` que
 * decide el 404 lo lanza `app/r/[slug]/layout.tsx`, y según la jerarquía de
 * Next (`not-found.md`: "not-found.js renders between loading.js and page.js")
 * el `not-found` de un segmento se renderiza *dentro* del layout de ese mismo
 * segmento, así que no puede capturar un `notFound()` lanzado por ese layout.
 * Lo captura el boundary ancestro más cercano, que es este. Todo `/r/**` es
 * micrositio, así que el 404 con su identidad cubre exactamente ese perímetro.
 *
 * El título de la pestaña lo sigue aportando el `generateMetadata` de la
 * página del segmento (que sí se resuelve aunque la página llame a
 * `notFound()`); `metadata` aquí no lo usaría Next.
 */
export default function StorefrontNotFound() {
  const whatsapp = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486").replace(/\D/g, "")

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F7F5F0] px-4 py-12 text-center text-[#242529]">
      <h1 className="text-6xl font-bold text-[#0E7A0E]">404</h1>
      <h2 className="mt-4 text-xl font-semibold">Página no encontrada</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-[#5B5F66]">
        El restaurante que buscas no existe, cambió de enlace o ya no está disponible.
        Revisa el enlace que te compartieron o busca otro lugar cerca de ti.
      </p>

      <div className="mt-7 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <Link
          href="/restaurantes"
          className="touch-target inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0E7A0E] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0d6f0d]"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Buscar restaurantes
        </Link>
        <Link
          href="/comer"
          className="touch-target inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#242529]/10 bg-white px-5 text-sm font-semibold text-[#242529] transition-colors hover:border-[#0E7A0E]/40"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Ver opciones por ciudad
        </Link>
      </div>

      <a
        href={`https://wa.me/${whatsapp}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#0E7A0E] hover:underline"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        ¿Te compartieron este enlace? Escríbenos por WhatsApp
      </a>
    </div>
  )
}
