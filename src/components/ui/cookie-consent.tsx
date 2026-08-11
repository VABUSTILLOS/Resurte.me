"use client"

import { useState, useEffect } from "react"
import { Cookie, X } from "lucide-react"

const STORAGE_KEY = "resurte_cookie_consent"

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      // Small delay so the banner appears after page load
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const acceptAll = () => {
    localStorage.setItem(STORAGE_KEY, "accepted")
    setVisible(false)
  }

  const acceptEssential = () => {
    localStorage.setItem(STORAGE_KEY, "essential")
    setVisible(false)
  }

  // Mientras el banner de cookies está visible, oculta los flotantes del fondo
  // (WhatsApp, StickyCatalogButton, sticky ATC) para que la franja ancha no
  // intercepte taps sobre ellos. El CSS de body.cookie-consent-visible lo hace.
  useEffect(() => {
    if (typeof document === "undefined") return
    if (visible) {
      document.body.classList.add("cookie-consent-visible")
      return () => document.body.classList.remove("cookie-consent-visible")
    }
  }, [visible])

  if (!visible) return null

  return (
    <div className="fixed bottom-[var(--floating-bottom-offset)] left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-[60] animate-slide-up">
      <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.15)] border border-[#ede8df] p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#F7F5F0] flex items-center justify-center shrink-0">
            <Cookie className="w-4 h-4 text-[var(--text-secondary)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#1a1a1a] mb-1">
              Este sitio usa cookies
            </p>
            <p className="text-[13px] text-[#6b6b6b] leading-relaxed">
              Usamos cookies para analizar tráfico (Google Analytics) y medir el rendimiento de nuestros anuncios (Meta Pixel). No compartimos tus datos con terceros.
            </p>
          </div>
          <button
            onClick={acceptAll}
            aria-label="Cerrar"
            className="p-2.5 touch-target rounded-lg hover:bg-[#F7F5F0] text-[var(--text-secondary)] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={acceptEssential}
            className="flex-1 touch-target px-4 py-3 text-sm font-medium text-[var(--text-secondary)] bg-[#F7F5F0] rounded-xl hover:bg-[#EDEAE4] transition-colors"
          >
            Solo necesarias
          </button>
          <button
            onClick={acceptAll}
            className="flex-1 touch-target px-4 py-3 text-sm font-semibold text-white bg-[#0E7A0E] rounded-xl hover:bg-[#0D720D] transition-colors"
          >
            Aceptar todas
          </button>
        </div>
      </div>
    </div>
  )
}
