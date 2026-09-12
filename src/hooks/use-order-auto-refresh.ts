"use client"

import { useEffect, useRef } from "react"

/**
 * Fase 3 — Auto-refresh del panel de pedidos.
 * Ejecuta `onRefresh` cada `intervalMs` mientras la pestaña está visible
 * (se pausa en segundo plano para no quemar cuota de la BD) y también al
 * volver a la pestaña, aunque no haya pasado el intervalo.
 */
export function useOrderAutoRefresh(
  onRefresh: () => void,
  intervalMs = 30_000
): void {
  const savedCallback = useRef(onRefresh)

  useEffect(() => {
    savedCallback.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        savedCallback.current()
      }
    }
    const id = setInterval(tick, intervalMs)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [intervalMs])
}
