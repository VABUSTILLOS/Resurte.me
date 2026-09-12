"use client"

import { useEffect, useRef } from "react"

export interface PollingOptions {
  /** Intervalo entre ejecuciones exitosas. */
  intervalMs: number
  /**
   * Intervalo tras un error. Default: intervalMs * 2 (backoff suave).
   * `null` detiene el polling ante el primer error.
   */
  errorIntervalMs?: number | null
  enabled?: boolean
}

/**
 * Loop de polling con setTimeout encadenado (a diferencia de setInterval no
 * solapa ejecuciones si el tick tarda más que el intervalo). `tick` devuelve
 * true cuando ya no hace falta seguir (p.ej. el pedido llegó a estado final);
 * si lanza, se reintenta con errorIntervalMs.
 */
export function usePolling(tick: () => Promise<boolean>, options: PollingOptions): void {
  const { intervalMs, errorIntervalMs = intervalMs * 2, enabled = true } = options
  const tickRef = useRef(tick)
  useEffect(() => {
    tickRef.current = tick
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(run, ms)
    }

    async function run() {
      try {
        const done = await tickRef.current()
        if (!done) schedule(intervalMs)
      } catch {
        if (errorIntervalMs !== null) schedule(errorIntervalMs)
      }
    }

    void run()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, intervalMs, errorIntervalMs])
}
