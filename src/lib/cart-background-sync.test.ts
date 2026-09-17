import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CART_SYNC_DB_NAME,
  CART_SYNC_KEY,
  CART_SYNC_MAX_AGE_MS,
  CART_SYNC_STORE,
  CART_SYNC_TAG,
  CART_SYNC_URL,
  buildCartSyncEntry,
  cartSyncBody,
  isCartSyncEntryUsable,
  parseCartSyncEntry,
  serializeCartSyncEntry,
  shouldFlushCartSync,
  shouldQueueCartSync,
} from "@/lib/cart-background-sync"
import type { AppliedCoupon, CartItem } from "@/types"

const item = (id: number, quantity = 1): CartItem => ({
  product_id: id,
  name: `Producto ${id}`,
  slug: `producto-${id}`,
  image_url: "",
  brand: "Marca",
  price: 100,
  sale_price: null,
  quantity,
  stock_status: "in_stock",
})

const coupon: AppliedCoupon = {
  code: "VERANO10",
  discount_type: "percentage",
  discount_value: 10,
  min_order: 200,
}

const NOW = 1_700_000_000_000

describe("shouldQueueCartSync", () => {
  it("encola cuando fetch lanzó (sin red)", () => {
    expect(shouldQueueCartSync({ threw: true })).toBe(true)
  })

  it("encola errores 5xx del servidor", () => {
    expect(shouldQueueCartSync({ status: 500 })).toBe(true)
    expect(shouldQueueCartSync({ status: 503 })).toBe(true)
  })

  it("no encola 4xx: reintentar daría el mismo resultado", () => {
    expect(shouldQueueCartSync({ status: 400 })).toBe(false)
    expect(shouldQueueCartSync({ status: 401 })).toBe(false)
    expect(shouldQueueCartSync({ status: 422 })).toBe(false)
  })

  it("no encola un fallo sin información de estado", () => {
    expect(shouldQueueCartSync({})).toBe(false)
  })
})

describe("buildCartSyncEntry", () => {
  it("guarda el snapshot con su marca de tiempo", () => {
    const entry = buildCartSyncEntry([item(1, 2)], coupon, NOW)
    expect(entry.queuedAt).toBe(NOW)
    expect(entry.payload.items).toHaveLength(1)
    expect(entry.payload.coupon?.code).toBe("VERANO10")
  })

  it("acepta carrito sin cupón", () => {
    expect(buildCartSyncEntry([item(1)], null, NOW).payload.coupon).toBeNull()
  })
})

describe("isCartSyncEntryUsable", () => {
  it("rechaza null", () => {
    expect(isCartSyncEntryUsable(null, NOW)).toBe(false)
  })

  it("rechaza carrito vacío", () => {
    expect(isCartSyncEntryUsable(buildCartSyncEntry([], null, NOW), NOW)).toBe(false)
  })

  it("rechaza timestamp no finito", () => {
    expect(isCartSyncEntryUsable({ payload: { items: [item(1)], coupon: null }, queuedAt: NaN }, NOW)).toBe(false)
  })

  it("acepta un snapshot dentro de la ventana", () => {
    const entry = buildCartSyncEntry([item(1)], null, NOW - CART_SYNC_MAX_AGE_MS + 1)
    expect(isCartSyncEntryUsable(entry, NOW)).toBe(true)
  })

  it("rechaza un snapshot caducado", () => {
    const entry = buildCartSyncEntry([item(1)], null, NOW - CART_SYNC_MAX_AGE_MS - 1)
    expect(isCartSyncEntryUsable(entry, NOW)).toBe(false)
  })

  it("shouldFlushCartSync delega en la misma regla", () => {
    const fresh = buildCartSyncEntry([item(1)], null, NOW)
    expect(shouldFlushCartSync(fresh, NOW)).toBe(true)
    expect(shouldFlushCartSync(null, NOW)).toBe(false)
  })
})

describe("parseCartSyncEntry", () => {
  it("sobrevive a un registro corrupto", () => {
    expect(parseCartSyncEntry(null)).toBeNull()
    expect(parseCartSyncEntry("no-json")).toBeNull()
    expect(parseCartSyncEntry({})).toBeNull()
    expect(parseCartSyncEntry({ queuedAt: "ayer", payload: { items: [] } })).toBeNull()
    expect(parseCartSyncEntry({ queuedAt: NOW, payload: null })).toBeNull()
    expect(parseCartSyncEntry({ queuedAt: NOW, payload: { items: "no-array" } })).toBeNull()
  })

  it("descarta un cupón inválido pero conserva los items", () => {
    const parsed = parseCartSyncEntry({
      queuedAt: NOW,
      payload: { items: [item(1)], coupon: { code: "", discount_type: "nope" } },
    })
    expect(parsed?.payload.items).toHaveLength(1)
    expect(parsed?.payload.coupon).toBeNull()
  })

  it("normaliza min_order ausente a 0", () => {
    const parsed = parseCartSyncEntry({
      queuedAt: NOW,
      payload: {
        items: [item(1)],
        coupon: { code: "X", discount_type: "fixed_amount", discount_value: 50 },
      },
    })
    expect(parsed?.payload.coupon).toEqual({
      code: "X",
      discount_type: "fixed_amount",
      discount_value: 50,
      min_order: 0,
    })
  })

  it("hace round-trip de lo serializado", () => {
    const entry = buildCartSyncEntry([item(1, 3)], coupon, NOW)
    expect(parseCartSyncEntry(JSON.parse(serializeCartSyncEntry(entry)))).toEqual(entry)
  })
})

describe("cartSyncBody", () => {
  it("manda exactamente lo que espera PUT /api/cart", () => {
    expect(JSON.parse(cartSyncBody({ items: [item(1)], coupon }))).toEqual({
      items: [item(1)],
      coupon,
    })
  })
})

/**
 * Contrato con el service worker. `public/sw.js` es un archivo estático: no
 * puede importar `src/lib/cart-background-sync.ts`, así que duplica el tag, el
 * nombre de la base, el store y la URL. Esta prueba es lo que evita que se
 * desincronicen en silencio (un tag distinto = el flush nunca corre).
 */
describe("contrato con public/sw.js", () => {
  const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8")

  it("declara las mismas constantes que el cliente", () => {
    expect(sw).toContain(`const CART_SYNC_TAG = "${CART_SYNC_TAG}"`)
    expect(sw).toContain(`const CART_SYNC_DB_NAME = "${CART_SYNC_DB_NAME}"`)
    expect(sw).toContain(`const CART_SYNC_STORE = "${CART_SYNC_STORE}"`)
    expect(sw).toContain(`const CART_SYNC_KEY = "${CART_SYNC_KEY}"`)
    expect(sw).toContain(`const CART_SYNC_URL = "${CART_SYNC_URL}"`)
    // El SW lo escribe como producto de constantes (más legible); se evalúa la
    // aritmética para comparar el valor real y no el texto.
    const age = sw.match(/const CART_SYNC_MAX_AGE_MS = ([\d\s*]+)/)
    expect(age).not.toBeNull()
    const factors = (age?.[1] ?? "").split("*").map((n) => Number(n.trim()))
    expect(factors.length).toBeGreaterThan(1)
    expect(factors.reduce((a, b) => a * b, 1)).toBe(CART_SYNC_MAX_AGE_MS)
  })

  it("escucha el tag de background sync", () => {
    expect(sw).toContain('self.addEventListener("sync"')
    expect(sw).toContain("event.tag !== CART_SYNC_TAG")
  })

  it("reintenta con PUT y borra el pendiente cuando el resultado es definitivo", () => {
    expect(sw).toContain('method: "PUT"')
    expect(sw).toContain("clearCartSync()")
  })

  it("no empieza a cachear rutas privadas (invariante del SW)", () => {
    expect(sw).toContain('const NEVER_CACHE_PREFIXES = ["/api/", "/auth/", "/admin/", "/panel/"]')
  })
})
