/**
 * Web Push de estado de pedido (W9) — reglas puras.
 *
 * Este módulo NO importa nada del servidor: lo consumen tanto la UI (para
 * pedir permiso y suscribirse) como el emisor (para armar el payload). El
 * envío real vive en `push-server.ts`, que sí importa `web-push`.
 *
 * La copia del aviso NO se duplica aquí: `sendOrderStatusEmail`
 * (order-emails.ts) ya es el productor único del hito —campana + correo— y
 * le pasa a `buildOrderStatusPushPayload` el mismo título y cuerpo que usó
 * para la campana, así los tres canales dicen lo mismo. Lo que sí se fija
 * aquí es QUÉ estados ameritan aviso (`PUSHABLE_ORDER_STATUSES`), y una
 * prueba de contrato verifica que siga siendo idéntico a `EMAILED_STATUSES`.
 */

import type { OrderStatus } from "@/types"

/** Estados que disparan push: los mismos hitos logísticos que el correo. */
export const PUSHABLE_ORDER_STATUSES: OrderStatus[] = [
  "confirmed",
  "out_for_delivery",
  "delivered",
]

/**
 * Códigos con los que el servicio de push declara un endpoint muerto
 * (suscripción revocada por el usuario o navegador desinstalado). Al
 * recibirlos se borra la fila: reintentar no tiene sentido y acumula ruido.
 */
export const DEAD_SUBSCRIPTION_STATUSES = [404, 410]

export function isDeadSubscriptionStatus(status: number): boolean {
  return DEAD_SUBSCRIPTION_STATUSES.includes(status)
}

export function isPushableOrderStatus(status: string): boolean {
  return (PUSHABLE_ORDER_STATUSES as string[]).includes(status)
}

export interface PushPayload {
  title: string
  body: string
  /** Ruta relativa a abrir al tocar el aviso. */
  url: string
  /** Colapsa los avisos del mismo pedido en una sola tarjeta. */
  tag: string
}

/**
 * Etiqueta del aviso: una por pedido, no por estado.
 *
 * Con `order-42`, el aviso "en camino" REEMPLAZA al "confirmado" en lugar de
 * apilarse: el cliente ve siempre el último hito, que es lo único accionable.
 * (La campana persistente sí conserva el historial completo.)
 */
export function orderPushTag(orderId: number): string {
  return `order-${orderId}`
}

/**
 * Arma el payload del aviso a partir de la copia que ya usó la campana.
 * Devuelve null si el estado no amerita push o si falta el título.
 */
export function buildOrderStatusPushPayload(input: {
  orderId: number
  status: string
  title: string
  body: string
  url?: string | null
}): PushPayload | null {
  if (!isPushableOrderStatus(input.status)) return null
  const title = input.title?.trim()
  if (!title) return null
  return {
    title,
    body: input.body ?? "",
    url: input.url && input.url.trim() ? input.url.trim() : "/recompensas",
    tag: orderPushTag(input.orderId),
  }
}

/* ------------------------------------------------------------------ */
/* Capacidad y configuración (cliente)                                 */
/* ------------------------------------------------------------------ */

/**
 * ¿Este navegador puede recibir Web Push?
 *
 * Requiere `serviceWorker` + `PushManager` + `Notification`. iOS Safari solo
 * cumple desde 16.4 y **únicamente** con la app instalada en la pantalla de
 * inicio, así que el resultado es false en la pestaña normal — la UI debe
 * ofrecer "Agregar a inicio" en vez de un botón que no puede funcionar.
 */
export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  )
}

export function pushPermission(): NotificationPermission | null {
  if (typeof Notification === "undefined") return null
  return Notification.permission
}

/** Clave pública VAPID (segura de exponer: es la mitad pública del par). */
export function vapidPublicKey(): string | null {
  const raw = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  return raw && raw.length > 0 ? raw : null
}

/**
 * Sin clave pública no hay suscripción posible; el emisor además necesita la
 * privada. Se comprueban por separado a propósito: la UI solo puede ver la
 * pública, y el emisor es quien debe callar si falta la privada.
 */
export function isPushConfigured(): boolean {
  return vapidPublicKey() !== null
}

/**
 * Convierte la clave VAPID (base64url) al `Uint8Array` que exige
 * `pushManager.subscribe({ applicationServerKey })`. Devuelve null si el
 * texto no es base64url válido, para no reventar con un TypeError opaco.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array | null {
  const normalized = base64.replace(/-/g, "+").replace(/_/g, "/")
  // Vacío no es una clave: devolver un arreglo de 0 bytes haría que
  // `pushManager.subscribe` reventara con un InvalidAccessError opaco.
  if (normalized.length === 0) return null
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Suscripción → fila                                                  */
/* ------------------------------------------------------------------ */

export interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Normaliza una suscripción del navegador al shape de `push_subscriptions`.
 *
 * `toJSON()` es la forma serializable estándar; el camino de objetos
 * (`getKey`) queda como respaldo porque algunos WebViews antiguos no
 * implementan `toJSON`. Devuelve null si falta endpoint o alguna clave: una
 * fila incompleta solo produce fallos de cifrado en cada envío.
 */
export function pushSubscriptionToRow(sub: {
  endpoint?: string | null
  keys?: { p256dh?: string | null; auth?: string | null } | null
}): PushSubscriptionRow | null {
  const endpoint = sub?.endpoint?.trim()
  const p256dh = sub?.keys?.p256dh?.trim()
  const auth = sub?.keys?.auth?.trim()
  if (!endpoint || !p256dh || !auth) return null
  return { endpoint, p256dh, auth }
}
