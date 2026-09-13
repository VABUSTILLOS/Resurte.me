"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"

/**
 * OfflineBanner — aviso persistente cuando el dispositivo pierde conexión.
 * En un marketplace B2B el usuario suele pedir desde la cocina (WiFi/celular
 * inestable): saber que está offline explica por qué el catálogo o el
 * checkout no responden y evita pedidos duplicados por reintentos a ciegas.
 * Se oculta solo al recuperar la red.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="alert"
      className="fixed top-[calc(var(--header-top-offset)+0.5rem)] left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2 rounded-full bg-[#343538] text-white text-xs font-medium shadow-lg animate-slide-up"
    >
      <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
      Sin conexión — tus datos se guardan en este dispositivo
    </div>
  )
}
