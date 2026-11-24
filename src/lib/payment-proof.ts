/**
 * Comprobante de PAGO del marketplace: validación y rutas de objeto.
 *
 * Espejo deliberado de `src/lib/delivery-proof.ts` (comprobante de
 * ENTREGA): mismo bucket privado, mismas reglas de archivo —lo que una
 * cámara de teléfono produce—, pero prefijo y columnas propios, porque
 * la foto de la transferencia y la foto de la entrega son evidencias
 * distintas y una no debe pisar a la otra. Las decisiones de diseño
 * están en `00228_whatsapp_flujo_pago.sql`.
 *
 * Módulo puro e isomorfo, como su espejo: lo importa el flujo de
 * WhatsApp en el servidor y lo puede importar el panel sin arrastrar
 * código de servidor.
 */

import {
  DELIVERY_PROOF_BUCKET,
  DELIVERY_PROOF_MAX_BYTES,
  DELIVERY_PROOF_MIME_EXT,
} from "@/lib/delivery-proof"

/** Mismo bucket privado que la ruta de comprobantes de pedidos (`entregas`). */
export const PAYMENT_PROOF_BUCKET = DELIVERY_PROOF_BUCKET

/** Prefijo propio: no colisiona con entregas (`marketplace/`) ni con FoodOS. */
export const PAYMENT_PROOF_PREFIX = "marketplace-pagos"

export const PAYMENT_PROOF_MAX_BYTES = DELIVERY_PROOF_MAX_BYTES

/** Mismo conjunto aceptado que el comprobante de entrega: JPG, PNG o WebP. */
export const PAYMENT_PROOF_MIME_EXT = DELIVERY_PROOF_MIME_EXT

export type PaymentProofValidation = { ok: true } | { ok: false; error: string }

/**
 * Valida el archivo antes de tocar Storage, con las mismas reglas que
 * el comprobante de entrega: lista blanca de tipos (nunca
 * `startsWith("image/")`, que dejaría pasar un SVG) y tope de peso.
 * Aquí el "archivo" es lo que Meta reporta de la imagen recibida
 * (mime_type y tamaño), no un File del navegador.
 */
export function validatePaymentProofFile(file: {
  type: string
  size: number
}): PaymentProofValidation {
  if (!PAYMENT_PROOF_MIME_EXT[file.type]) {
    return { ok: false, error: "Formato no válido. Manda la foto como imagen JPG, PNG o WebP." }
  }
  if (file.size <= 0) {
    return { ok: false, error: "La imagen llegó vacía." }
  }
  if (file.size > PAYMENT_PROOF_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return { ok: false, error: `La imagen pesa ${mb} MB. El máximo es 5 MB.` }
  }
  return { ok: true }
}

/**
 * Ruta del objeto. Lleva un UUID para que dos comprobantes del mismo
 * pedido no se pisen (reenviar la foto no depende de borrar primero).
 */
export function paymentProofPath(
  orderId: number,
  mimeType: string,
  uuid: string = crypto.randomUUID()
): string {
  const ext = PAYMENT_PROOF_MIME_EXT[mimeType] ?? "jpg"
  return `${PAYMENT_PROOF_PREFIX}/${orderId}/${uuid}.${ext}`
}

/** `true` si la ruta pertenece al espacio de comprobantes de pago. */
export function isPaymentProofPath(path: string): boolean {
  return path.startsWith(`${PAYMENT_PROOF_PREFIX}/`)
}
