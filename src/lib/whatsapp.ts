/**
 * WhatsApp Cloud API Client
 * ==========================
 * Wrapper for Meta's WhatsApp Business Platform (Graph API v21.0)
 * 
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api
 * 
 * Operations:
 *  - Catalog management (create, update, delete products, get catalog status)
 *  - Template messaging (send approved message templates)
 *  - Media upload (for product images)
 *  - Webhook verification
 */

// ============================================================
// Types
// ============================================================

export interface WhatsAppConfig {
  accessToken: string
  phoneNumberId: string
  wabaId: string
  businessId?: string
}

export interface WhatsAppProduct {
  id: string  // WhatsApp product ID (retailer_id)
  name: string
  description?: string
  image_url?: string
  price: number
  currency?: string
  sale_price?: number | null
}

export interface SendTemplateParams {
  to: string          // Recipient phone number
  templateName: string // Template name registered with Meta
  languageCode?: string // e.g., "es_MX"
  components?: TemplateComponent[] // Header/body/button parameters
}

export interface TemplateComponent {
  type: "header" | "body" | "button"
  parameters: TemplateParameter[]
}

export interface TemplateParameter {
  type: "text" | "currency" | "date_time" | "image" | "document" | "video"
  text?: string
  currency?: { fallback_value: string; code: string; amount_1000: number }
  date_time?: { fallback_value: string }
}

export interface SendTextParams {
  to: string
  text: string
  preview_url?: boolean
}

export interface BroadcastParams {
  recipients: string[]
  templateName: string
  languageCode?: string
  components?: TemplateComponent[]
}

// ============================================================
// Configuration
// ============================================================

function getConfig(): WhatsAppConfig {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    wabaId: process.env.WHATSAPP_WABA_ID || "",
    businessId: process.env.WHATSAPP_BUSINESS_ID || "",
  }
}

function checkConfig(config: WhatsAppConfig): void {
  if (!config.accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN is not configured")
  if (!config.phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not configured")
}

const API_VERSION = "v21.0"
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`

// ============================================================
// HTTP helper
// ============================================================

async function waFetch(
  path: string,
  options: RequestInit = {},
  config?: WhatsAppConfig
): Promise<Response> {
  const cfg = config || getConfig()
  checkConfig(cfg)

  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`WhatsApp API error ${res.status}: ${body}`)
  }

  return res
}

// ============================================================
// Catalog Management
// ============================================================

/**
 * Create or update a product in the WhatsApp Commerce catalog.
 * Uses the WABA-level catalog API.
 */
export async function upsertCatalogProduct(
  product: WhatsAppProduct,
  config?: WhatsAppConfig
): Promise<{ id: string }> {
  const cfg = config || getConfig()

  // WhatsApp catalog uses retailer_id for idempotency
  const body = {
    name: product.name,
    description: product.description || product.name,
    retailer_id: product.id,
    images: product.image_url ? [product.image_url] : [],
    ...(product.currency ? { currency: product.currency } : {}),
  }

  // Try to update existing product first, create if not found
  const res = await waFetch(
    `/${cfg.wabaId}/products`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    cfg
  )

  return res.json()
}

/**
 * Set the price for a product in the WhatsApp catalog.
 * Price API is separate from product creation in WhatsApp Commerce.
 */
export async function setProductPrice(
  productId: string,
  price: number,
  currency: string = "MXN",
  salePrice?: number | null,
  config?: WhatsAppConfig
): Promise<void> {
  const cfg = config || getConfig()

  const body: Record<string, unknown> = {
    price: Math.round(price * 100), // WhatsApp uses cents
    currency,
  }

  if (salePrice) {
    body.sale_price = Math.round(salePrice * 100)
    body.sale_price_start_date = new Date().toISOString().split("T")[0]
  }

  await waFetch(
    `/${productId}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    cfg
  )
}

/**
 * Delete a product from the WhatsApp Commerce catalog.
 */
export async function deleteCatalogProduct(
  productId: string,
  config?: WhatsAppConfig
): Promise<void> {
  const cfg = config || getConfig()
  await waFetch(`/${productId}`, { method: "DELETE" }, cfg)
}

/**
 * Get all products currently in the WhatsApp catalog.
 */
export async function getCatalogProducts(config?: WhatsAppConfig): Promise<{
  data: { id: string; name: string; retailer_id: string }[]
}> {
  const cfg = config || getConfig()
  const res = await waFetch(`/${cfg.wabaId}/products`, {}, cfg)
  return res.json()
}

/**
 * Sync entire curated product catalog to WhatsApp.
 * Compares current WhatsApp catalog with desired products, adds/removes as needed.
 */
export async function syncCatalog(
  desiredProducts: WhatsAppProduct[],
  config?: WhatsAppConfig
): Promise<{ added: number; removed: number }> {
  const cfg = config || getConfig()
  const current = await getCatalogProducts(cfg)

  const desiredRetailerIds = new Set(desiredProducts.map((p) => p.id))
  const currentMap = new Map(
    current.data.map((p) => [p.retailer_id, p.id])
  )

  let added = 0
  let removed = 0

  // Add/update products
  for (const product of desiredProducts) {
    await upsertCatalogProduct(product, cfg)
    const wpProductId = currentMap.get(product.id) || product.id
    await setProductPrice(wpProductId, product.price, "MXN", product.sale_price, cfg)
    added++
  }

  // Remove products no longer desired
  for (const [retailerId, wpId] of currentMap) {
    if (!desiredRetailerIds.has(retailerId)) {
      await deleteCatalogProduct(wpId, cfg)
      removed++
    }
  }

  return { added, removed }
}

// ============================================================
// Messaging — Send Templates
// ============================================================

/**
 * Send a WhatsApp message template to a recipient.
 * Templates must be pre-approved by Meta.
 */
export async function sendTemplate(
  params: SendTemplateParams,
  config?: WhatsAppConfig
): Promise<{ messaging_product: string; messages: { id: string }[] }> {
  const cfg = config || getConfig()

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: {
        code: params.languageCode || "es_MX",
      },
    },
  }

  if (params.components && params.components.length > 0) {
    ;(body.template as Record<string, unknown>).components = params.components
  }

  const res = await waFetch(
    `/${cfg.phoneNumberId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    cfg
  )

  return res.json()
}

/**
 * Send a plain text message via WhatsApp.
 */
export async function sendTextMessage(
  params: SendTextParams,
  config?: WhatsAppConfig
): Promise<{ messaging_product: string; messages: { id: string }[] }> {
  const cfg = config || getConfig()

  const res = await waFetch(
    `/${cfg.phoneNumberId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.to,
        type: "text",
        text: {
          body: params.text,
          preview_url: params.preview_url ?? false,
        },
      }),
    },
    cfg
  )

  return res.json()
}

/**
 * Send a broadcast: same template to multiple recipients.
 * WhatsApp rate limiting: ~250 messages/second for business accounts.
 */
export async function sendBroadcast(
  params: BroadcastParams,
  config?: WhatsAppConfig
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const cfg = config || getConfig()

  let sent = 0
  let failed = 0
  const errors: string[] = []

  // Send sequentially to respect rate limits
  for (const recipient of params.recipients) {
    try {
      await sendTemplate(
        {
          to: recipient,
          templateName: params.templateName,
          languageCode: params.languageCode || "es_MX",
          components: params.components,
        },
        cfg
      )
      sent++
    } catch (err) {
      failed++
      errors.push(`${recipient}: ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }

  return { sent, failed, errors }
}

// ============================================================
// Webhook
// ============================================================

/**
 * Verify the webhook subscription challenge from Meta.
 * Called when Meta sends a GET request to the webhook endpoint
 * to verify ownership.
 */
export function verifyWebhook(
  mode: string,
  token: string,
  challenge: string,
  verifyToken: string
): string | null {
  if (mode === "subscribe" && token === verifyToken) {
    return challenge
  }
  return null
}

// ============================================================
// Automation Helpers
// ============================================================

export const AUTOMATION_TEMPLATE_MAP: Record<string, { name: string; description: string }> = {
  payment_recovery: {
    name: "payment_recovery_1h",
    description: "Recordatorio de pago pendiente — 1 hora, 24h, 48h",
  },
  cart_abandonment: {
    name: "cart_abandonment_2h",
    description: "Carrito abandonado — 2 horas después",
  },
  birthday: {
    name: "birthday_coupon_15",
    description: "Feliz cumpleaños con cupón 15% descuento",
  },
  reactivation: {
    name: "reactivation_30d",
    description: "Reactivación de clientes inactivos 30 días — $50 MXN",
  },
  post_delivery_rating: {
    name: "post_delivery_rating",
    description: "Solicitud de calificación 24h post-entrega",
  },
  onboarding: {
    name: "onboarding_coupon_10",
    description: "Onboarding post-primer pedido — 10% descuento",
  },
}
