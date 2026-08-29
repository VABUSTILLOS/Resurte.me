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
  const { city, isLoading, isDetecting, detectionError, requestBrowserLocation } = useCity()
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
    <div className="city-detector fixed bottom-6 inset-x-0 flex flex-col items-center gap-2 z-40 px-4 pointer-events-none">
      {detectionError && (
        <div className="pointer-events-auto max-w-sm rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-center shadow-lg">
          <p className="text-xs font-medium text-red-700 leading-snug">{detectionError}</p>
        </div>
      )}
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
