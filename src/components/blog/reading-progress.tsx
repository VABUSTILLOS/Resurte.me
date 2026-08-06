"use client"

import { useEffect, useState } from "react"

/**
 * Barra de progreso de lectura fija en la parte superior del post.
 * Llena con el verde de marca (brand) conforme el lector avanza.
 */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let rafId = 0

    const update = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const value =
        max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      setProgress(value)
    }

    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        update()
      })
    }

    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  return (
    <div
      role="progressbar"
      aria-label="Progreso de lectura"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className="fixed inset-x-0 top-0 z-[60] h-1 bg-warm-200/60"
    >
      <div
        aria-hidden="true"
        className="h-full w-full origin-left rounded-r-full bg-gradient-to-r from-brand-500 to-brand-600 shadow-[0_1px_4px_rgba(16,137,16,0.35)] will-change-transform transition-transform duration-150 ease-out"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  )
}
