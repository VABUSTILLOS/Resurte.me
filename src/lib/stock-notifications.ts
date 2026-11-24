// ============================================================
// Avisos de inventario (migración 00230)
// ============================================================
// Dos avisos que salen solos cuando cambia el stock:
//
// 1. **Inventario bajo → staff.** Cuando el stock de un producto
//    queda en o bajo su umbral (el de `products.low_stock_threshold`
//    o el global de stock.ts), se avisa UNA vez al número del
//    negocio por WhatsApp — el mismo canal y destino que usa
//    `notifyStaffNewOrder` de workflows.ts. La fila en
//    `low_stock_alert_state` es la memoria de «ya avisado»: se
//    crea al avisar y se borra cuando el stock se repone por
//    encima del umbral (rearme). Sin fila duplicada = sin spam.
//
// 2. **Back in stock → suscriptores.** Quien dejó su WhatsApp en
//    la ficha de un producto agotado («Avísame cuando haya»,
//    tabla `stock_notifications`) recibe un aviso cuando el stock
//    vuelve a ser > 0, y su suscripción se marca avisada.
//
// LIMITACIÓN del aviso al cliente: sale como texto libre, que
// Meta solo entrega dentro de la ventana de 24 h desde el último
// mensaje del cliente. Fuera de ventana el envío falla y la
// suscripción QUEDA pendiente (se reintenta en el siguiente
// procesamiento). Cuando exista una plantilla aprobada, basta
// poner su nombre en `WHATSAPP_BACK_IN_STOCK_TEMPLATE`
// (whatsapp-order-config.ts) y el aviso sale por plantilla.
//
// Todo el módulo es best-effort: nunca lanza. Los puntos de
// enganche (crear pedido web/WhatsApp, editar stock en el panel,
// reabasto, cancelaciones que devuelven stock y el barrido del
// cron diario) lo llaman sin bloquear su propio flujo, y degrada
// en silencio si la migración 00230 aún no se aplica (42P01).

import { WHATSAPP_NUMBER } from "@/lib/business"
import { DEFAULT_CITY_SLUG } from "@/lib/cities"
import { logger } from "@/lib/logger"
import { isMissingRelationError } from "@/lib/sale-window"
import { resolveLowStockThreshold } from "@/lib/stock"
import { sendTemplate, sendTextMessage } from "@/lib/whatsapp"
import { WHATSAPP_BACK_IN_STOCK_TEMPLATE } from "@/lib/whatsapp-order-config"
import type { createServiceClient } from "@/lib/supabase/service"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/** Foto mínima de un producto para decidir avisos. */
export interface StockProductSnapshot {
  id: number
  name: string
  slug: string
  stock_quantity: number | null
  low_stock_threshold: number | null
}

// ============================================================
// Planificadores puros (la máquina de estados, sin I/O)
// ============================================================

export type LowStockAction =
  | { type: "alert"; productId: number; threshold: number; stock: number }
  | { type: "rearm"; productId: number }
  | { type: "none"; productId: number }

/**
 * Decide qué hacer con la alerta de inventario bajo de un producto:
 * - stock desconocido (null) → nada (no se puede afirmar un cruce).
 * - stock ≤ umbral y sin alerta activa → alertar (y registrar).
 * - stock ≤ umbral con alerta activa → nada (ya se avisó: sin spam).
 * - stock > umbral con alerta activa → rearmar (borrar el registro).
 */
export function planLowStockAction(
  product: StockProductSnapshot,
  alertActive: boolean
): LowStockAction {
  const qty = product.stock_quantity
  if (qty === null) return { type: "none", productId: product.id }
  const threshold = resolveLowStockThreshold(product.low_stock_threshold)
  if (qty <= threshold) {
    return alertActive
      ? { type: "none", productId: product.id }
      : { type: "alert", productId: product.id, threshold, stock: qty }
  }
  return alertActive
    ? { type: "rearm", productId: product.id }
    : { type: "none", productId: product.id }
}

export interface PendingSubscription {
  id: string
  phone: string
}

/**
 * Suscriptores a avisar de un producto: solo si el stock volvió a
 * ser positivo. Con stock en 0 o desconocido, nadie se avisa y las
 * suscripciones quedan pendientes.
 */
export function planBackInStock(
  product: StockProductSnapshot,
  pending: readonly PendingSubscription[]
): PendingSubscription[] {
  if (product.stock_quantity === null || product.stock_quantity <= 0) return []
  return [...pending]
}

/**
 * Normaliza un teléfono mexicano al formato que espera la API de
 * WhatsApp (521 + 10 dígitos, el formato con el que Meta entrega
 * los mensajes). Acepta 10 dígitos, 52+10 y 521+10. Null si no es
 * un número MX plausible.
 */
export function normalizeMxPhoneForApi(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `521${digits}`
  if (digits.length === 12 && digits.startsWith("52")) return `521${digits.slice(2)}`
  if (digits.length === 13 && digits.startsWith("521")) return digits
  return null
}

// ============================================================
// Ejecutor (I/O, best-effort)
// ============================================================

export interface StockNotificationSummary {
  lowStockAlerted: number[]
  lowStockRearmed: number[]
  backInStockNotified: number
}

const EMPTY_SUMMARY: StockNotificationSummary = {
  lowStockAlerted: [],
  lowStockRearmed: [],
  backInStockNotified: 0,
}

async function sendBackInStockMessage(
  product: StockProductSnapshot,
  phone: string
): Promise<boolean> {
  try {
    if (WHATSAPP_BACK_IN_STOCK_TEMPLATE) {
      await sendTemplate({
        to: phone,
        templateName: WHATSAPP_BACK_IN_STOCK_TEMPLATE,
        languageCode: "es_MX",
        components: [
          { type: "body", parameters: [{ type: "text", text: product.name }] },
        ],
      })
    } else {
      await sendTextMessage({
        to: phone,
        text:
          `¡Buenas noticias! 🎉 Ya tenemos de nuevo *${product.name}* en Resurte.\n\n` +
          `Pídelo aquí: https://resurte.me/${DEFAULT_CITY_SLUG}/producto/${product.slug}`,
        preview_url: true,
      })
    }
    return true
  } catch (err) {
    // Fuera de la ventana de 24 h Meta rechaza el texto libre: la
    // suscripción queda pendiente y se reintenta en el próximo
    // procesamiento (barrido del cron o siguiente cambio de stock).
    logger.warn("[stock-notifications] aviso back-in-stock no enviado", {
      productId: product.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Procesa los avisos de los productos indicados tras un cambio de
 * stock. Nunca lanza; devuelve un resumen para bitácora/pruebas.
 */
export async function processStockNotifications(
  supabase: ServiceClient,
  productIds: readonly number[]
): Promise<StockNotificationSummary> {
  const summary: StockNotificationSummary = {
    lowStockAlerted: [],
    lowStockRearmed: [],
    backInStockNotified: 0,
  }
  const ids = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0)
  if (ids.length === 0) return summary

  try {
    const { data: productRows, error: productsError } = await supabase
      .from("products")
      .select("id, name, slug, stock_quantity, low_stock_threshold")
      .in("id", ids)
    if (productsError) {
      logger.error("[stock-notifications] error leyendo productos", productsError)
      return summary
    }
    const products = (productRows ?? []) as unknown as StockProductSnapshot[]
    if (products.length === 0) return summary

    // Estado de alertas ya avisadas (la tabla puede no existir aún).
    let alertedIds = new Set<number>()
    let alertStateAvailable = true
    const stateRes = await supabase
      .from("low_stock_alert_state")
      .select("product_id")
      .in("product_id", ids)
    if (stateRes.error) {
      if (isMissingRelationError(stateRes.error)) {
        alertStateAvailable = false
      } else {
        logger.error("[stock-notifications] error leyendo estado de alertas", stateRes.error)
        alertStateAvailable = false
      }
    } else {
      alertedIds = new Set(
        ((stateRes.data ?? []) as Array<{ product_id: number }>).map((r) => r.product_id)
      )
    }

    // Suscripciones pendientes de back-in-stock.
    const pendingByProduct = new Map<number, PendingSubscription[]>()
    let subsAvailable = true
    const subsRes = await supabase
      .from("stock_notifications")
      .select("id, product_id, phone")
      .in("product_id", ids)
      .is("notified_at", null)
    if (subsRes.error) {
      if (!isMissingRelationError(subsRes.error)) {
        logger.error("[stock-notifications] error leyendo suscripciones", subsRes.error)
      }
      subsAvailable = false
    } else {
      for (const row of (subsRes.data ?? []) as Array<{
        id: string
        product_id: number
        phone: string
      }>) {
        const list = pendingByProduct.get(row.product_id) ?? []
        list.push({ id: row.id, phone: row.phone })
        pendingByProduct.set(row.product_id, list)
      }
    }

    for (const product of products) {
      // ── Inventario bajo ──
      if (alertStateAvailable) {
        const action = planLowStockAction(product, alertedIds.has(product.id))
        if (action.type === "alert") {
          let sent = false
          try {
            await sendTextMessage({
              to: WHATSAPP_NUMBER,
              text:
                `⚠️ *Inventario bajo* — ${product.name}: quedan *${action.stock}* ` +
                `(umbral ${action.threshold}). Revisa el panel para reponer.`,
            })
            sent = true
          } catch (err) {
            logger.error("[stock-notifications] aviso de inventario bajo falló", err)
          }
          if (sent) {
            const { error: insertError } = await supabase
              .from("low_stock_alert_state")
              .insert({
                product_id: product.id,
                threshold: action.threshold,
                stock_quantity: action.stock,
              })
            if (insertError) {
              logger.error("[stock-notifications] no se pudo registrar la alerta", insertError)
            } else {
              summary.lowStockAlerted.push(product.id)
            }
          }
        } else if (action.type === "rearm") {
          const { error: deleteError } = await supabase
            .from("low_stock_alert_state")
            .delete()
            .eq("product_id", product.id)
          if (deleteError) {
            logger.error("[stock-notifications] no se pudo rearmar la alerta", deleteError)
          } else {
            summary.lowStockRearmed.push(product.id)
          }
        }
      }

      // ── Back in stock ──
      if (subsAvailable) {
        const toNotify = planBackInStock(product, pendingByProduct.get(product.id) ?? [])
        const notifiedIds: string[] = []
        for (const sub of toNotify) {
          if (await sendBackInStockMessage(product, sub.phone)) {
            notifiedIds.push(sub.id)
          }
        }
        if (notifiedIds.length > 0) {
          const { error: markError } = await supabase
            .from("stock_notifications")
            .update({ notified_at: new Date().toISOString() })
            .in("id", notifiedIds)
          if (markError) {
            logger.error("[stock-notifications] no se pudieron marcar suscripciones", markError)
          } else {
            summary.backInStockNotified += notifiedIds.length
          }
        }
      }
    }
  } catch (err) {
    // Best-effort absoluto: un fallo aquí jamás debe tumbar la venta
    // o el ajuste de stock que disparó el procesamiento.
    logger.error("[stock-notifications] fallo inesperado", err)
    return { ...EMPTY_SUMMARY }
  }
  return summary
}

/**
 * Variante para cancelaciones: cuando la cascada de cancelación
 * devuelve el stock de un pedido, los productos de ese pedido
 * pudieron volver a tener existencia (back in stock) o salir de
 * la zona de umbral (rearme). Lee los productos del pedido y los
 * procesa. Best-effort, nunca lanza.
 */
export async function processOrderRestockNotifications(
  supabase: ServiceClient,
  orderId: number
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("order_items")
      .select("product_id")
      .eq("order_id", orderId)
    if (error) {
      logger.error("[stock-notifications] error leyendo items del pedido cancelado", error)
      return
    }
    const productIds = ((data ?? []) as Array<{ product_id: number }>).map((r) => r.product_id)
    if (productIds.length > 0) {
      await processStockNotifications(supabase, productIds)
    }
  } catch (err) {
    logger.error("[stock-notifications] fallo procesando reposición por cancelación", err)
  }
}

/**
 * Barrido del cron diario: red de seguridad para cualquier cambio
 * de stock que no pasó por los puntos de enganche (RPCs directas,
 * importaciones, la puerta de workflows). Procesa los productos
 * con existencia controlada más los que tienen suscripciones
 * pendientes o una alerta activa, en bloques de 100.
 */
export async function sweepStockNotifications(
  supabase: ServiceClient
): Promise<StockNotificationSummary> {
  const total: StockNotificationSummary = {
    lowStockAlerted: [],
    lowStockRearmed: [],
    backInStockNotified: 0,
  }
  try {
    const ids = new Set<number>()
    const { data: controlled, error } = await supabase
      .from("products")
      .select("id")
      .not("stock_quantity", "is", null)
      .limit(1000)
    if (error) {
      logger.error("[stock-notifications] barrido: error leyendo productos", error)
      return total
    }
    for (const row of (controlled ?? []) as Array<{ id: number }>) ids.add(row.id)

    // Productos con algo pendiente aunque su stock no se controle
    // por cantidad (p. ej. suscripción creada y stock manual).
    for (const table of ["stock_notifications", "low_stock_alert_state"] as const) {
      const res = await supabase.from(table).select("product_id").limit(1000)
      if (res.error) {
        if (!isMissingRelationError(res.error)) {
          logger.error(`[stock-notifications] barrido: error leyendo ${table}`, res.error)
        }
        continue
      }
      for (const row of (res.data ?? []) as Array<{ product_id: number }>) {
        ids.add(row.product_id)
      }
    }

    const all = [...ids]
    for (let i = 0; i < all.length; i += 100) {
      const part = await processStockNotifications(supabase, all.slice(i, i + 100))
      total.lowStockAlerted.push(...part.lowStockAlerted)
      total.lowStockRearmed.push(...part.lowStockRearmed)
      total.backInStockNotified += part.backInStockNotified
    }
  } catch (err) {
    logger.error("[stock-notifications] barrido falló", err)
  }
  return total
}
