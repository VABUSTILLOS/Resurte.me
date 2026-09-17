import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  DEAD_SUBSCRIPTION_STATUSES,
  PUSHABLE_ORDER_STATUSES,
  buildOrderStatusPushPayload,
  isDeadSubscriptionStatus,
  isPushConfigured,
  isPushableOrderStatus,
  orderPushTag,
  pushSubscriptionToRow,
  urlBase64ToUint8Array,
  vapidPublicKey,
} from "@/lib/push"
import { EMAILED_STATUSES } from "@/lib/order-emails"

/**
 * W9 — avisos push de estado de pedido.
 *
 * Además de las reglas puras, se comprueban tres contratos que no tienen
 * compilador que los vigile:
 *  1. `PUSHABLE_ORDER_STATUSES` == `EMAILED_STATUSES`: si divergen, el correo
 *     avisa de un hito del que el push calla (o al revés) sin que nada falle.
 *  2. `public/sw.js` muestra el aviso y lo enfoca al tocarlo. Es un archivo
 *     estático: no puede importar de `src/`, así que la única garantía es leer
 *     su texto (mismo patrón que W10).
 *  3. La migración 00134 deja la tabla con escritura solo por service_role.
 */

const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8")
const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "00134_push_subscriptions.sql"),
  "utf8"
)

/** Quita los comentarios `--` para no dar por buena una regla solo comentada. */
function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
}

const SQL = withoutComments(migration)

const ORIGINAL_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

afterEach(() => {
  if (ORIGINAL_VAPID === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = ORIGINAL_VAPID
})

describe("estados que ameritan push", () => {
  it("son exactamente los mismos que notifican por correo", () => {
    expect([...PUSHABLE_ORDER_STATUSES]).toEqual([...EMAILED_STATUSES])
  })

  it("reconoce los hitos logísticos", () => {
    for (const status of PUSHABLE_ORDER_STATUSES) {
      expect(isPushableOrderStatus(status)).toBe(true)
    }
  })

  it("calla en los estados que no son hito", () => {
    // "pending" es el estado de entrada: el cliente acaba de hacer el pedido.
    for (const status of ["pending", "cancelled", "preparing", "ready", ""]) {
      expect(isPushableOrderStatus(status)).toBe(false)
    }
  })
})

describe("etiqueta del aviso", () => {
  it("es una por pedido, no por estado", () => {
    // Clave: con la misma tag, "en camino" REEMPLAZA a "confirmado" en vez de
    // apilarse. Si fuera por estado, el cliente acumularía tarjetas obsoletas.
    expect(orderPushTag(42)).toBe("order-42")
    expect(orderPushTag(42)).toBe(orderPushTag(42))
    expect(orderPushTag(42)).not.toBe(orderPushTag(43))
  })
})

describe("buildOrderStatusPushPayload", () => {
  const base = { orderId: 7, status: "confirmed", title: "Pedido #7: Confirmado", body: "Va" }

  it("arma el payload con la copia que le pasan", () => {
    expect(buildOrderStatusPushPayload(base)).toEqual({
      title: "Pedido #7: Confirmado",
      body: "Va",
      url: "/recompensas",
      tag: "order-7",
    })
  })

  it("usa el enlace de seguimiento cuando existe", () => {
    const payload = buildOrderStatusPushPayload({ ...base, url: "/cdmx/pedido/7?t=abc" })
    expect(payload?.url).toBe("/cdmx/pedido/7?t=abc")
  })

  it("ignora un enlace vacío y cae al destino por defecto", () => {
    expect(buildOrderStatusPushPayload({ ...base, url: "   " })?.url).toBe("/recompensas")
    expect(buildOrderStatusPushPayload({ ...base, url: null })?.url).toBe("/recompensas")
  })

  it("no manda push de un estado que no es hito", () => {
    expect(buildOrderStatusPushPayload({ ...base, status: "pending" })).toBeNull()
    expect(buildOrderStatusPushPayload({ ...base, status: "cancelled" })).toBeNull()
  })

  it("no manda push sin título", () => {
    // Un aviso sin título es una tarjeta vacía: mejor no notificar.
    expect(buildOrderStatusPushPayload({ ...base, title: "" })).toBeNull()
    expect(buildOrderStatusPushPayload({ ...base, title: "   " })).toBeNull()
  })

  it("tolera un cuerpo ausente", () => {
    expect(buildOrderStatusPushPayload({ ...base, body: undefined as unknown as string })?.body).toBe(
      ""
    )
  })
})

describe("suscripciones muertas", () => {
  it("404 y 410 son definitivas (el navegador ya no existe)", () => {
    expect(DEAD_SUBSCRIPTION_STATUSES).toEqual([404, 410])
    expect(isDeadSubscriptionStatus(404)).toBe(true)
    expect(isDeadSubscriptionStatus(410)).toBe(true)
  })

  it("un 5xx o un 429 no borran la suscripción", () => {
    // Borrar ante un fallo pasajero obligaría al cliente a volver a activar
    // los avisos sin motivo.
    for (const status of [400, 401, 403, 413, 429, 500, 502, 503]) {
      expect(isDeadSubscriptionStatus(status)).toBe(false)
    }
  })
})

describe("clave VAPID pública", () => {
  it("devuelve la clave configurada", () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BFakeKey_123"
    expect(vapidPublicKey()).toBe("BFakeKey_123")
    expect(isPushConfigured()).toBe(true)
  })

  it("trata vacío y espacios como no configurado", () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "   "
    expect(vapidPublicKey()).toBeNull()
    expect(isPushConfigured()).toBe(false)

    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    expect(vapidPublicKey()).toBeNull()
    expect(isPushConfigured()).toBe(false)
  })
})

describe("urlBase64ToUint8Array", () => {
  it("decodifica base64url al arreglo de bytes que exige applicationServerKey", () => {
    // "AQID" (base64url) son los bytes 1,2,3.
    expect(Array.from(urlBase64ToUint8Array("AQID")!)).toEqual([1, 2, 3])
  })

  it("acepta guion y guion bajo (alfabeto base64url)", () => {
    const bytes = urlBase64ToUint8Array("-_8")
    expect(bytes).not.toBeNull()
    expect(bytes!.length).toBe(2)
  })

  it("devuelve null en vez de reventar con texto inválido", () => {
    for (const bad of ["", "!!!", "====", "a", "AQID*"]) {
      expect(urlBase64ToUint8Array(bad)).toBeNull()
    }
  })
})

describe("pushSubscriptionToRow", () => {
  const valid = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } }

  it("normaliza una suscripción completa", () => {
    expect(pushSubscriptionToRow(valid)).toEqual({
      endpoint: "https://push.example/abc",
      p256dh: "p",
      auth: "a",
    })
  })

  it("recorta espacios", () => {
    expect(pushSubscriptionToRow({ endpoint: " e ", keys: { p256dh: " p ", auth: " a " } })).toEqual(
      { endpoint: "e", p256dh: "p", auth: "a" }
    )
  })

  it("rechaza filas incompletas", () => {
    // Una fila sin claves solo produce fallos de cifrado en cada envío.
    expect(pushSubscriptionToRow({ endpoint: "e", keys: { p256dh: "p" } })).toBeNull()
    expect(pushSubscriptionToRow({ endpoint: "e", keys: { auth: "a" } })).toBeNull()
    expect(pushSubscriptionToRow({ endpoint: "", keys: { p256dh: "p", auth: "a" } })).toBeNull()
    expect(pushSubscriptionToRow({ endpoint: "e", keys: null })).toBeNull()
    expect(pushSubscriptionToRow({ endpoint: "   ", keys: { p256dh: "p", auth: "a" } })).toBeNull()
  })
})

describe("contrato con public/sw.js", () => {
  it("escucha el evento push y muestra el aviso", () => {
    expect(sw).toContain('addEventListener("push"')
    expect(sw).toContain("showNotification")
    expect(sw).toContain("event.waitUntil")
  })

  it("usa el payload del servidor en vez de fabricar la copia", () => {
    // La copia vive en order-emails.ts y se comparte con la campana. Si el SW
    // empezara a redactar sus propios textos, campana y push divergirían.
    expect(sw).toContain("payload.title")
    expect(sw).toContain("payload.body")
    expect(sw).toContain("payload.tag")
    expect(sw).toContain("payload.url")
  })

  it("abre la ruta indicada al tocar el aviso, reutilizando una pestaña", () => {
    expect(sw).toContain('addEventListener("notificationclick"')
    expect(sw).toContain("notification.close()")
    // El SW parte las cadenas largas en varias líneas: se compara sin saltos.
    expect(sw.replace(/\s+/g, " ")).toContain("clients .matchAll(")
    expect(sw).toContain("focus()")
    expect(sw).toContain("openWindow")
  })

  it("no deja de excluir del caché las rutas privadas", () => {
    // W9 no debe relajar la estrategia conservadora de W10.
    expect(sw).toContain('const NEVER_CACHE_PREFIXES = ["/api/", "/auth/", "/admin/", "/panel/"]')
  })

  it("sigue reintentando el carrito (W10 intacto)", () => {
    expect(sw).toContain('addEventListener("sync"')
    expect(sw).toContain('const CART_SYNC_TAG = "resurte-cart-sync"')
  })
})

describe("contrato con la migración 00134", () => {
  it("el endpoint es único: una fila por navegador", () => {
    // La clave natural es el endpoint, no el usuario: si un segundo usuario
    // entra en el mismo dispositivo, la fila debe moverse, no duplicarse.
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint\s+ON public\.push_subscriptions \(endpoint\)/i
    )
  })

  it("guarda las claves de cifrado y no el payload", () => {
    for (const col of ["p256dh", "auth", "failure_count", "last_used_at"]) {
      expect(SQL).toContain(col)
    }
  })

  it("activa RLS y deja leer y borrar solo lo propio", () => {
    expect(SQL).toMatch(/ALTER TABLE public\.push_subscriptions ENABLE ROW LEVEL SECURITY/i)
    expect(SQL).toMatch(/FOR SELECT\s+TO authenticated\s+USING \(auth\.uid\(\) = user_id\)/i)
    expect(SQL).toMatch(/FOR DELETE\s+TO authenticated\s+USING \(auth\.uid\(\) = user_id\)/i)
  })

  it("NO permite insertar ni actualizar desde el cliente", () => {
    // Sin política de INSERT, la clave anónima no puede reclamar el endpoint de
    // otra persona en un dispositivo compartido; escribe service_role.
    expect(SQL).not.toMatch(/FOR INSERT/i)
    expect(SQL).not.toMatch(/FOR UPDATE/i)
  })

  it("es idempotente", () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS/i)
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/i)
    expect(SQL).toMatch(/DROP POLICY IF EXISTS/i)
  })
})
