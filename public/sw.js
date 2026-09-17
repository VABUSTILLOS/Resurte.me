/*
 * Service Worker de Resurte.me — soporte offline conservador.
 *
 * Estrategia:
 * - Estáticos (/_next/static, imágenes, fuentes): cache-first (inmutables).
 * - Navegaciones (HTML): network-first con respaldo en caché → el catálogo
 *   y las páginas públicas abren sin conexión si se visitaron antes.
 * - Nunca cachea: /api, /auth, /admin, /panel, métodos que no sean GET, ni
 *   orígenes de terceros (Stripe, Supabase, analytics) — esos van a la red.
 *
 * Background sync del carrito (W10): si el push a /api/cart falla sin red, el
 * cliente encola el snapshot en IndexedDB y registra el tag CART_SYNC_TAG. Aquí
 * solo se REINTENTA ese PUT; no se cachea nada de /api.
 *
 * Web Push (W9): se muestra el aviso de hito logístico que arma el servidor y
 * se enfoca/abre la ruta indicada al tocarlo. El service worker no decide el
 * contenido — la copia la comparte con la campana persistente.
 *
 * Al cambiar las listas de abajo, subir CACHE_VERSION para invalidar.
 */

const CACHE_VERSION = 1
const STATIC_CACHE = `resurte-static-v${CACHE_VERSION}`
const PAGES_CACHE = `resurte-pages-v${CACHE_VERSION}`
const VALID_CACHES = [STATIC_CACHE, PAGES_CACHE]

const NEVER_CACHE_PREFIXES = ["/api/", "/auth/", "/admin/", "/panel/"]
const STATIC_RE = /^\/_next\/static\/|\.(?:png|jpe?g|webp|svg|ico|gif|woff2?|ttf|otf)$/

/*
 * Background sync del carrito. Estos valores están duplicados desde
 * src/lib/cart-background-sync.ts porque un service worker servido como
 * archivo estático no puede importar módulos del bundle; una prueba de
 * contrato (cart-background-sync.test.ts) falla si se desincronizan.
 */
const CART_SYNC_TAG = "resurte-cart-sync"
const CART_SYNC_DB_NAME = "resurte-offline"
const CART_SYNC_STORE = "cart-sync"
const CART_SYNC_KEY = "pending"
const CART_SYNC_URL = "/api/cart"
const CART_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000

function cartSyncDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CART_SYNC_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CART_SYNC_STORE)) db.createObjectStore(CART_SYNC_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function cartSyncTx(mode, run) {
  return cartSyncDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CART_SYNC_STORE, mode)
        const request = run(tx.objectStore(CART_SYNC_STORE))
        tx.oncomplete = () => {
          db.close()
          resolve(request.result)
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error)
        }
      })
  )
}

function readCartSync() {
  return cartSyncTx("readonly", (store) => store.get(CART_SYNC_KEY)).then((raw) => {
    if (typeof raw !== "string") return null
    try {
      const entry = JSON.parse(raw)
      if (!entry || typeof entry !== "object") return null
      if (typeof entry.queuedAt !== "number") return null
      const payload = entry.payload
      if (!payload || !Array.isArray(payload.items)) return null
      return entry
    } catch {
      return null
    }
  })
}

function clearCartSync() {
  return cartSyncTx("readwrite", (store) => store.delete(CART_SYNC_KEY))
}

/**
 * Reintenta el PUT del carrito pendiente. Lanza si el servidor falla para que
 * el navegador vuelva a intentarlo; un 4xx o un snapshot caducado se descartan
 * (reintentarlos no cambiaría el resultado).
 */
function flushCartSync() {
  return readCartSync().then((entry) => {
    if (!entry) return undefined
    if (Date.now() - entry.queuedAt > CART_SYNC_MAX_AGE_MS) return clearCartSync()
    if (entry.payload.items.length === 0) return clearCartSync()
    return fetch(CART_SYNC_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: entry.payload.items, coupon: entry.payload.coupon ?? null }),
    }).then((res) => {
      if (res.ok || (res.status >= 400 && res.status < 500)) return clearCartSync()
      throw new Error("cart-sync-failed:" + res.status)
    })
  })
}

self.addEventListener("sync", (event) => {
  if (event.tag !== CART_SYNC_TAG) return
  event.waitUntil(flushCartSync())
})

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

/*
 * Web Push (W9). El payload llega ya armado desde el servidor con la misma
 * copia que usa la campana persistente; aquí solo se muestra. `tag` es uno por
 * pedido, así que el hito nuevo REEMPLAZA al anterior en lugar de apilarse.
 */
const PUSH_DEFAULT_URL = "/recompensas"
const PUSH_ICON = "/icon-512.png"

self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload = null
  try {
    payload = event.data.json()
  } catch {
    // Payload no-JSON: se muestra el texto plano en vez de perder el aviso.
    payload = { title: "Resurte.me", body: event.data.text() }
  }

  const title = payload && payload.title ? String(payload.title) : "Resurte.me"
  const body = payload && payload.body ? String(payload.body) : ""
  const url = payload && payload.url ? String(payload.url) : PUSH_DEFAULT_URL
  const tag = payload && payload.tag ? String(payload.tag) : undefined

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      icon: PUSH_ICON,
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const relative =
    (event.notification.data && event.notification.data.url) || PUSH_DEFAULT_URL
  const targetUrl = new URL(relative, self.location.origin).href

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Preferimos la pestaña que ya está en el destino exacto…
        for (const client of clientList) {
          if (client.url === targetUrl && "focus" in client) return client.focus()
        }
        // …y si no, reutilizamos cualquier pestaña del sitio antes de abrir otra.
        for (const client of clientList) {
          if (new URL(client.url).origin === self.location.origin && "focus" in client) {
            if ("navigate" in client) client.navigate(targetUrl)
            return client.focus()
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
        return undefined
      })
  )
})
