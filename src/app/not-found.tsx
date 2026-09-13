import Link from "next/link"
import { MapPin, Search, MessageCircle, HelpCircle } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-brand-600 mb-4">404</h1>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Página no encontrada
      </h2>
      <p className="text-gray-600 mb-8 max-w-md">
        La página que buscas no existe. Puede que la ciudad no esté disponible
        todavía o que el enlace sea incorrecto.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-semibold rounded-full hover:bg-brand-700 transition-colors"
      >
        <MapPin className="w-4 h-4" />
        Seleccionar ciudad
      </Link>

      {/* Rutas de escape: un 404 sin salida es sesión perdida; ofrecemos las
          tres acciones más probables (buscar producto, ayuda, WhatsApp). */}
      <nav aria-label="Opciones alternativas" className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
        <Link
          href="/catalogo/chihuahua"
          className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-medium"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
          Explorar el catálogo
        </Link>
        <Link
          href="/faq"
          className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-medium"
        >
          <HelpCircle className="w-4 h-4" aria-hidden="true" />
          Preguntas frecuentes
        </Link>
        <a
          href={`https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486").replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-medium"
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
          Ayuda por WhatsApp
        </a>
      </nav>
    </div>
  )
}
