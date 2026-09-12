"use client"

import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"

/**
 * BackToTop — botón flotante "volver arriba" para páginas largas (landing,
 * catálogo, blog). Aparece tras 600px de scroll. Se posiciona sobre el rail
 * flotante (--floating-bottom-offset) y se oculta cuando la app de
 * Recompensas muestra su BottomTabBar (body.has-bottom-tab) o cuando el
 * banner de cookies está visible (regla CSS en globals.css), igual que el
 * FAB de WhatsApp, para no colisionar con la navegación inferior.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setVisible(window.scrollY > 600)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const handleClick = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
  }

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Volver arriba"
      className="back-to-top fixed right-4 sm:right-6 bottom-[calc(var(--floating-bottom-offset)+3.75rem)] z-40 p-3 rounded-full bg-white/95 backdrop-blur border border-[#E8E9EB] shadow-lg text-[#343538] hover:bg-[#F7F5F0] hover:shadow-xl transition-all touch-target"
    >
      <ArrowUp className="w-5 h-5" aria-hidden="true" />
    </button>
  )
}
