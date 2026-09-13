"use client"

import { useEffect, useState } from "react"
import { Download, X, Share } from "lucide-react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISS_KEY = "resurte-install-dismissed"
const SHOW_DELAY_MS = 25_000

/**
 * InstallPrompt — banner de instalación PWA.
 * - Android/Chrome: usa `beforeinstallprompt` nativo.
 * - iOS Safari (sin evento): muestra instrucciones Compartir → "Añadir a
 *   pantalla de inicio".
 * Se muestra una sola vez tras 25 s de engagement y no vuelve a molestar
 * (dismiss persistente). Se oculta si la app ya está instalada (standalone).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return
    } catch { /* storage no disponible */ }
    if (window.matchMedia("(display-mode: standalone)").matches) return
    // iOS en modo web app (navigator.standalone)
    if ((navigator as unknown as { standalone?: boolean }).standalone) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    // Diferido a microtask: ningún setState corre síncrono en el efecto.
    void Promise.resolve().then(() => setIsIos(ios))

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      clearTimeout(t)
    }
  }, [])

  const dismiss = (persist = true) => {
    setVisible(false)
    if (persist) {
      try { localStorage.setItem(DISMISS_KEY, "1") } catch { /* noop */ }
    }
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice.catch(() => null)
    dismiss()
  }

  const canInstall = deferred !== null || isIos
  if (!visible || !canInstall) return null

  return (
    <div
      role="dialog"
      aria-label="Instalar la aplicación"
      className="install-prompt fixed bottom-[calc(var(--floating-bottom-offset)+0.5rem)] left-1/2 -translate-x-1/2 z-[55] w-[calc(100%-2rem)] max-w-sm bg-white rounded-2xl border border-[#E8E9EB] shadow-2xl p-4 animate-slide-up"
    >
      <button
        type="button"
        onClick={() => dismiss()}
        aria-label="Cerrar aviso de instalación"
        className="absolute top-2.5 right-2.5 p-1.5 rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0E7A0E]/10 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-[#0E7A0E]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#242529]">Instala Resurte.me</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
            {isIos
              ? "Pide más rápido: toca Compartir y luego «Añadir a pantalla de inicio»."
              : "Pide más rápido, con acceso directo desde tu pantalla de inicio."}
          </p>
          {isIos ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0E7A0E]">
              <Share className="w-3.5 h-3.5" aria-hidden="true" />
              Compartir → Añadir a inicio
            </p>
          ) : (
            <button
              type="button"
              onClick={install}
              className="mt-2.5 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0E7A0E] text-white text-xs font-bold hover:bg-[#0D720D] transition-colors"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Instalar app
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
