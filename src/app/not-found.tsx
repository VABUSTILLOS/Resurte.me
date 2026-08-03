import Link from "next/link"
import { MapPin } from "lucide-react"

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
    </div>
  )
}
