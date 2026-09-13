"use client"

import { useEffect } from "react"

/**
 * RegisterSW — registra el service worker (/sw.js) una vez montada la app.
 * Solo en producción: en desarrollo el caché estorba el hot-reload.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW no disponible (preview, CSP estricta en dev) — ignorar */
      })
    }
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [])
  return null
}
