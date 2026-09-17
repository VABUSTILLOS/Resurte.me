import { Info } from "lucide-react"

/**
 * Aviso de datos de ejemplo. Un solo componente para que la frase sea idéntica
 * en Costeo y Rentabilidad: el problema original era que un dato inventado se
 * veía exactamente igual que uno capturado por el dueño.
 *
 * Se renderiza nada cuando no hay nada que advertir — un aviso permanente se
 * vuelve invisible.
 */
export default function ExampleDataBanner({
  message,
  className = "",
}: {
  message: string | null
  className?: string
}) {
  if (!message) return null
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-5 ${className}`}
    >
      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-xs text-amber-800 leading-relaxed">{message}</p>
    </div>
  )
}
