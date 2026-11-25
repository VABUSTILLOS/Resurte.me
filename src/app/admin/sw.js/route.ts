export const runtime = "nodejs"

/**
 * Service worker del panel (Ola 7), servido en /admin/sw.js
 * para que su alcance máximo sea /admin: SOLO controla páginas
 * del panel, nunca la tienda pública (que tiene su propio
 * service worker en /sw.js con alcance /).
 *
 * Estrategia conservadora, a propósito:
 * - Navegaciones del panel: NETWORK-FIRST. Si la red responde,
 *   el panel siempre muestra datos vivos; sin red se responde
 *   una página de «sin conexión» propia — NUNCA una copia
 *   cacheada del panel, que se leería como datos actuales.
 * - /api/**: red directa, sin interceptar y sin caché jamás.
 * - Estáticos (/_next/static, iconos, fuentes, imágenes):
 *   cache-first con caché versionada propia
 *   (`resurte-admin-*`), sin tocar las cachés del SW público.
 * - Todo lo demás: red directa.
 *
 * Si el registro o la instalación fallan, el panel funciona
 * exactamente como antes de la Ola 7: la PWA es una mejora
 * progresiva, no una dependencia.
 */

const SW_SOURCE = `/*
 * Service Worker del panel de Resurte.me — alcance /admin.
 * Ver la cabecera de src/app/admin/sw.js/route.ts para la
 * estrategia. Al cambiarla, sube CACHE_VERSION.
 */
const CACHE_VERSION = 1
const STATIC_CACHE = "resurte-admin-static-v" + CACHE_VERSION

const OFFLINE_HTML =
  "<!doctype html><html lang=\\"es-MX\\"><head><meta charset=\\"utf-8\\">" +
  "<meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1\\">" +
  "<title>Sin conexión · Panel Resurte</title></head>" +
  "<body style=\\"font-family: system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; background: #f7f5f0; color: #343538;\\">" +
  "<main style=\\"max-width: 22rem; padding: 2rem; text-align: center;\\">" +
  "<h1 style=\\"font-size: 1.25rem;\\">Sin conexión</h1>" +
  "<p>El panel necesita internet para mostrar los datos en vivo de tu tienda. " +
  "Revisa tu conexión y vuelve a intentarlo.</p>" +
  "<p><a href=\\"/admin\\" style=\\"color: #0e7a0e; font-weight: 600;\\">Reintentar</a></p>" +
  "</main></body></html>"

const STATIC_RE = /^\\/_next\\/static\\/|\\.(?:png|jpe?g|webp|svg|ico|gif|woff2?|ttf|otf)$/

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith("resurte-admin-") && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Las APIs jamás se cachean ni se responden desde caché.
  if (url.pathname.startsWith("/api/")) return

  // Navegaciones: red primero; sin red, aviso propio (no datos viejos).
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          return new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
        }
      })()
    )
    return
  }

  // Estáticos: caché primero (son inmutables por nombre/versión).
  if (STATIC_RE.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE)
        const hit = await cache.match(request)
        if (hit) return hit
        const response = await fetch(request)
        if (response.ok) await cache.put(request, response.clone())
        return response
      })()
    )
  }
  // Todo lo demás: red directa (sin respondWith).
})
`

export async function GET() {
  return new Response(SW_SOURCE, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // El navegador debe poder detectar cambios del SW: nada de
      // caché larga para el script.
      "Cache-Control": "no-cache",
    },
  })
}
