/*
 * Service Worker de Resurte.me — soporte offline conservador.
 *
 * Estrategia:
 * - Estáticos (/_next/static, imágenes, fuentes): cache-first (inmutables).
 * - Navegaciones (HTML): network-first con respaldo en caché → el catálogo
 *   y las páginas públicas abren sin conexión si se visitaron antes.
 * - Nunca cachea: /api, /auth, /admin, métodos que no sean GET, ni orígenes
 *   de terceros (Stripe, Supabase, analytics) — esos van directo a la red.
 *
 * Al cambiar las listas de abajo, subir CACHE_VERSION para invalidar.
 */

const CACHE_VERSION = 1
const STATIC_CACHE = `resurte-static-v${CACHE_VERSION}`
const PAGES_CACHE = `resurte-pages-v${CACHE_VERSION}`
const VALID_CACHES = [STATIC_CACHE, PAGES_CACHE]

const NEVER_CACHE_PREFIXES = ["/api/", "/auth/", "/admin/", "/panel/"]
const STATIC_RE = /^\/_next\/static\/|\.(?:png|jpe?g|webp|svg|ico|gif|woff2?|ttf|otf)$/

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !VALID_CACHES.includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (NEVER_CACHE_PREFIXES.some((p) => url.pathname.startsWith(p))) return

  // Estáticos inmutables: cache-first
  if (STATIC_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy))
            }
            return res
          })
      )
    )
    return
  }

  // Navegaciones: network-first, fallback al caché cuando no hay red
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(PAGES_CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then((hit) => hit || caches.match("/"))
        )
    )
  }
})
