import { NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * Manifest de la PWA del panel (Ola 7).
 *
 * El panel es una app SEPARADA de la tienda pública: su propio
 * manifest, con `start_url` y `scope` en /admin, para que al
 * instalarla abra directo en el panel y no en la tienda. La
 * liga la pone el componente `AdminPwa` (el layout raíz trae la
 * del manifest de la tienda y este la sustituye solo dentro de
 * /admin). Los iconos salen del logo de la tienda
 * (public/icon-512.png) en los tamaños estándar.
 */
export async function GET() {
  return NextResponse.json(
    {
      name: "Resurte · Panel de administración",
      short_name: "Panel Resurte",
      description: "Panel de administración de Resurte.me: pedidos, productos y entregas.",
      id: "/admin",
      start_url: "/admin",
      scope: "/admin",
      display: "standalone",
      background_color: "#F7F5F0",
      theme_color: "#0E7A0E",
      orientation: "portrait-primary",
      lang: "es-MX",
      dir: "ltr",
      icons: [
        { src: "/admin-icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/admin-icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/admin-icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    }
  )
}
