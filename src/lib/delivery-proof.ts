/**
 * Comprobante de entrega del marketplace: validación y rutas de objeto.
 *
 * Módulo puro e isomorfo — lo importan tanto las rutas de servidor como el
 * panel de admin, así que no puede arrastrar imports de servidor. Las
 * decisiones de diseño están en `00154_marketplace_delivery_proof.sql`; aquí
 * vive solo lo que ambos lados necesitan para coincidir: qué archivo se
 * acepta, cuánto pesa y dónde se guarda.
 */

/** Bucket privado reutilizado de FoodOS (00125). No tiene políticas de lectura. */
export const DELIVERY_PROOF_BUCKET = "entregas"

/** Prefijo propio para no colisionar con las rutas de FoodOS (`<restaurant_id>/…`). */
export const DELIVERY_PROOF_PREFIX = "marketplace"

export const DELIVERY_PROOF_MAX_BYTES = 5 * 1024 * 1024

/** Mismo conjunto que el comprobante de FoodOS: lo que una cámara de teléfono produce. */
export const DELIVERY_PROOF_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

/** Vida de la URL firmada. Una hora alcanza para verla y decidir una disputa. */
export const DELIVERY_PROOF_URL_TTL_SECONDS = 3600

export const DELIVERY_PROOF_ACCEPT_ATTR = Object.keys(DELIVERY_PROOF_MIME_EXT).join(",")

export type ProofValidation = { ok: true } | { ok: false; error: string }

/**
 * Valida el archivo antes de tocar Storage.
 *
 * El tipo se comprueba contra la lista blanca y no contra `startsWith("image/")`:
 * `image/svg+xml` es un vector de XSS si algún día se sirve en línea, y una
 * extensión derivada del nombre del archivo permitiría subir `.svg` declarando
 * `image/png`.
 */
export function validateDeliveryProofFile(file: { type: string; size: number }): ProofValidation {
  if (!DELIVERY_PROOF_MIME_EXT[file.type]) {
    return { ok: false, error: "Formato no válido. Sube una foto JPG, PNG o WebP." }
  }
  if (file.size <= 0) {
    return { ok: false, error: "El archivo está vacío." }
  }
  if (file.size > DELIVERY_PROOF_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return { ok: false, error: `La foto pesa ${mb} MB. El máximo es 5 MB.` }
  }
  return { ok: true }
}

/**
 * Ruta del objeto. Lleva un UUID para que dos subidas del mismo pedido no se
 * pisen (y para que reemplazar el comprobante no dependa de borrar primero).
 */
export function deliveryProofPath(
  orderId: number,
  mimeType: string,
  uuid: string = crypto.randomUUID()
): string {
  const ext = DELIVERY_PROOF_MIME_EXT[mimeType] ?? "jpg"
  return `${DELIVERY_PROOF_PREFIX}/${orderId}/${uuid}.${ext}`
}

/** `true` si la ruta pertenece al prefijo del marketplace (defensa en profundidad al firmar). */
export function isMarketplaceProofPath(path: string): boolean {
  return path.startsWith(`${DELIVERY_PROOF_PREFIX}/`)
}
