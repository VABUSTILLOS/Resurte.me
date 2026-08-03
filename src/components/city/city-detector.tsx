"use client"

import { useCity } from "@/contexts/city-context"
import { useEffect, useRef } from "react"
import { Navigation, Loader2 } from "lucide-react"

/**
 * Componente que intenta detectar automáticamente la ciudad del usuario
 * mediante el navegador cuando no hay ciudad seleccionada.
 * Se monta en la página de landing.
 */
export function CityDetector() {
  const { city, isLoading, isDetecting, requestBrowserLocation } = useCity()
  const attempted = useRef(false)

  // Auto-detect on first visit if no city is set
  useEffect(() => {
    if (!isLoading && !city && !attempted.current) {
      attempted.current = true
      requestBrowserLocation()
    }
  }, [isLoading, city, requestBrowserLocation])

  if (city || isDetecting || isLoading) return null

  return (
    <div className="fixed bottom-6 inset-x-0 flex justify-center z-40 pointer-events-none">
      <button
        onClick={requestBrowserLocation}
        className="pointer-events-auto flex items-center gap-2 px-5 py-3 bg-gray-900 text-white text-sm font-medium rounded-full shadow-lg hover:bg-gray-800 transition-colors"
      >
        <Navigation className="w-4 h-4" />
        Detectar mi ciudad
        {isDetecting && <Loader2 className="w-4 h-4 animate-spin" />}
      </button>
    </div>
  )
}
