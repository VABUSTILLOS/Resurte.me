"use client"

import { useEffect, useRef, useState } from "react"

export type ScrollDirection = "up" | "down"

interface UseScrollDirectionOptions {
  /** Mínimo de px de delta para cambiar de dirección (evita jitter). */
  threshold?: number
  /** Zona superior donde siempre se reporta "up" (barras visibles). */
  topGrace?: number
  /** Cuando es true (p.ej. un overlay/modal abierto), fuerza dirección "up". */
  forceVisible?: boolean
}

/**
 * Detecta la dirección de scroll para patrones de auto-hide: la barra se
 * oculta al bajar ("down") y reaparece al subir ("up"). Usa rAF + umbral
 * para no re-renderizar en cada pixel, y respeta prefers-reduced-motion
 * reportando siempre "up" (sin ocultamiento animado).
 */
export function useScrollDirection({
  threshold = 8,
  topGrace = 64,
  forceVisible = false,
}: UseScrollDirectionOptions = {}): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>("up")
  const lastY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    lastY.current = window.scrollY

    function update() {
      ticking.current = false
      const y = window.scrollY
      if (y <= topGrace) {
        setDirection("up")
      } else {
        const delta = y - lastY.current
        if (Math.abs(delta) >= threshold) {
          setDirection(delta > 0 ? "down" : "up")
        }
      }
      lastY.current = y
    }

    function onScroll() {
      if (!ticking.current) {
        ticking.current = true
        requestAnimationFrame(update)
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [threshold, topGrace, forceVisible])

  return direction
}
