"use client"

import { useEffect } from "react"

/**
 * Instalabilidad del panel (Ola 7): se monta solo en /admin.
 *
 * Dos cosas, ambas progresivas (si fallan, el panel funciona
 * como siempre):
 *
 * 1. Sustituye la liga del manifest: el layout raíz trae la de
 *    la tienda (`/manifest.json`, alcance /) y aquí se apunta al
 *    manifest del panel (`/admin/manifest.webmanifest`, alcance
 *    /admin) para que «Instalar» / «Agregar a pantalla de inicio»
 *    cree la app del panel, no la de la tienda. Queda UNA sola
 *    liga en el DOM, con el href cambiado.
 * 2. Registra el service worker del panel (`/admin/sw.js`,
 *    alcance /admin): network-first para el panel, caché solo
 *    de estáticos. El SW público (alcance /) sigue mandando en
 *    la tienda; en /admin manda el de alcance más específico.
 *
 * También apunta el `apple-touch-icon` al icono del panel:
 * iOS lo lee del DOM al agregar a la pantalla de inicio.
 */
export function AdminPwa() {
  useEffect(() => {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (manifestLink) {
      manifestLink.setAttribute("href", "/admin/manifest.webmanifest")
    } else {
      const link = document.createElement("link")
      link.rel = "manifest"
      link.href = "/admin/manifest.webmanifest"
      document.head.appendChild(link)
    }

    let appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    if (!appleIcon) {
      appleIcon = document.createElement("link")
      appleIcon.rel = "apple-touch-icon"
      document.head.appendChild(appleIcon)
    }
    appleIcon.setAttribute("href", "/admin-apple-touch-icon.png")

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin" }).catch(() => {
        // Sin SW el panel funciona como siempre: es mejora progresiva.
      })
    }
  }, [])

  return null
}
