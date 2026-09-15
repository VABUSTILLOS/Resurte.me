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
  /** ID del catálogo de productos en Meta Commerce (default: env WHATSAPP_CATALOG_ID ?? wabaId). */
  catalogId?: string
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
  /** Disponibilidad en Meta (default: "in stock"). */
  availability?: "in stock" | "out of stock"
}

export interface SendTemplateParams {
  to: string          // Recipient phone number
  templateName: string // Template name registered with Meta
  languageCode?: string // e.g., "es_MX"
  components?: TemplateComponent[] // Header/body/button parameters
}

interface TemplateComponent {
  type: "header" | "body" | "button"
  parameters: TemplateParameter[]
}

interface TemplateParameter {
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
    catalogId: process.env.WHATSAPP_CATALOG_ID || undefined,
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

// Reintentos: rate-limits de Meta (429 y códigos 4/17/32/613/80004) y 5xx.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const RETRYABLE_ERROR_CODES = new Set([4, 17, 32, 613, 80004])
const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 30_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** ¿Error de Meta reintentable? (parsea el cuerpo de error de la Graph API). */
export function isRetryableMetaError(status: number, body: string): boolean {
  if (RETRYABLE_STATUS.has(status)) return true
  try {
    const code = (JSON.parse(body) as { error?: { code?: number } })?.error?.code
    return typeof code === "number" && RETRYABLE_ERROR_CODES.has(code)
  } catch {
    return false
  }
}

/** Backoff exponencial con jitter, honrando Retry-After si viene. */
export function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 60_000)
  const base = 500 * 2 ** attempt
  return Math.min(base + Math.floor(Math.random() * 250), 10_000)
}

async function waFetch(
  path: string,
  options: RequestInit = {},
  config?: WhatsAppConfig
): Promise<Response> {
  const cfg = config || getConfig()
  checkConfig(cfg)

  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`

  let lastError: Error | null = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0 && lastError) {
      const retryAfter = (lastError as Error & { retryAfter?: string | null }).retryAfter ?? null
      await sleep(retryDelayMs(attempt - 1, retryAfter))
    }

    let res: Response
    try {
      res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      })
    } catch (err) {
      // Red caída o timeout: reintentable.
      lastError = err instanceof Error ? err : new Error(String(err))
      continue
    }

    if (res.ok) return res

    const body = await res.text()
    if (isRetryableMetaError(res.status, body) && attempt < MAX_ATTEMPTS - 1) {
      const err = new Error(`WhatsApp API error ${res.status}: ${body}`) as Error & { retryAfter?: string | null }
      err.retryAfter = res.headers.get("retry-after")
      lastError = err
      continue
    }
    throw new Error(`WhatsApp API error ${res.status}: ${body}`)
  }

  throw lastError ?? new Error("WhatsApp API error: agotados los reintentos")
}

// ============================================================
// Catalog Management (Meta Catalog API — items_batch)
// ============================================================
// Los productos viven bajo el CATÁLOGO de Meta Commerce
// (`/{catalog_id}/items_batch`), no bajo la WABA. El sync usa
// retailer_id como llave idempotente. El batch es asíncrono:
// Meta devuelve "handles" consultables vía getBatchStatus.
// ============================================================

/** Resuelve el catalog_id de Meta: propio de la config, env, o waba_id. */
export function resolveCatalogId(config: WhatsAppConfig): string {
  return config.catalogId || process.env.WHATSAPP_CATALOG_ID || config.wabaId
}

/** Datos de un item del catálogo (precios en unidades menores: centavos). */
export interface CatalogItemData {
  name: string
  description?: string
  price: number
  currency: string
  sale_price?: number
  sale_price_start_date?: string
  image_url?: string
  availability?: "in stock" | "out of stock"
  url?: string
}

export interface CatalogBatchRequest {
  method: "CREATE" | "UPDATE" | "DELETE"
  retailer_id: string
  data?: CatalogItemData
}

export interface CatalogProductInfo {
  id: string
  name: string
  retailer_id: string
  price?: string
  currency?: string
}

const BATCH_CHUNK_SIZE = 100

/**
 * Mapea productos de la tienda a requests items_batch.
 * Puro y testeable: precios se convierten a centavos aquí.
 */
export function buildCatalogBatchRequests(
  products: WhatsAppProduct[],
  method: "CREATE" | "UPDATE"
): CatalogBatchRequest[] {
  return products.map((p) => {
    const priceCents = Math.round(p.price * 100)
    const saleCents = p.sale_price ? Math.round(p.sale_price * 100) : null
    const data: CatalogItemData = {
      name: p.name,
      description: p.description || p.name,
      price: priceCents,
      currency: p.currency || "MXN",
      availability: p.availability ?? "in stock",
      ...(p.image_url ? { image_url: p.image_url } : {}),
      ...(saleCents && saleCents > 0 && saleCents < priceCents
        ? {
            sale_price: saleCents,
            sale_price_start_date: new Date().toISOString().split("T")[0],
          }
        : {}),
    }
    return { method, retailer_id: p.id, data }
  })
}

export interface BatchResult {
  handles: string[]
  chunks: number
}

/**
 * Envía requests al catálogo en chunks vía items_batch.
 * Devuelve los handles de Meta (procesamiento asíncrono).
 */
export async function batchCatalogItems(
  requests: CatalogBatchRequest[],
  config?: WhatsAppConfig
): Promise<BatchResult> {
  const cfg = config || getConfig()
  if (requests.length === 0) return { handles: [], chunks: 0 }

  const catalogId = resolveCatalogId(cfg)
  const handles: string[] = []
  let chunks = 0

  for (let i = 0; i < requests.length; i += BATCH_CHUNK_SIZE) {
    const chunk = requests.slice(i, i + BATCH_CHUNK_SIZE)
    const res = await waFetch(
      `/${catalogId}/items_batch`,
      {
        method: "POST",
        body: JSON.stringify({
          item_type: "PRODUCT_ITEM",
          allow_upsert: true,
          requests: chunk,
        }),
      },
      cfg
    )
    const body = await res.json()
    if (Array.isArray(body?.handles)) handles.push(...body.handles)
    chunks++
  }

  return { handles, chunks }
}

/** Estado de un batch asíncrono de Meta (respuesta de /{handle}). */
export interface BatchStatusResponse {
  status: string
  errors_total?: number
  errors?: unknown
}

export interface BatchItemError {
  retailer_id: string | null
  message: string
}

/** ¿El batch terminó de procesarse en Meta? */
export function isBatchFinished(status: string): boolean {
  return status.toLowerCase() === "finished"
}

/**
 * Parseo defensivo de los errores de un batch de Meta: el shape del campo
 * `errors` puede variar (array directo, { data: [...] }, campos anidados).
 * Devuelve siempre un array plano { retailer_id, message }.
 */
export function parseBatchErrors(body: BatchStatusResponse | null | undefined): BatchItemError[] {
  if (!body || body.errors == null) return []
  const raw: unknown = Array.isArray(body.errors)
    ? body.errors
    : typeof body.errors === "object" && body.errors !== null && Array.isArray((body.errors as { data?: unknown[] }).data)
      ? (body.errors as { data: unknown[] }).data
      : []
  if (!Array.isArray(raw)) return []

  const result: BatchItemError[] = []
  for (const entry of raw) {
    if (typeof entry === "string") {
      result.push({ retailer_id: null, message: entry })
      continue
    }
    if (typeof entry !== "object" || entry === null) continue
    const e = entry as Record<string, unknown>
    const retailerId =
      typeof e.retailer_id === "string" ? e.retailer_id
      : typeof (e.item as Record<string, unknown> | undefined)?.retailer_id === "string"
        ? (e.item as Record<string, unknown>).retailer_id as string
        : null
    const message =
      typeof e.message === "string" ? e.message
      : typeof e.error === "string" ? e.error
      : typeof (e.error as Record<string, unknown> | undefined)?.message === "string"
        ? (e.error as Record<string, unknown>).message as string
        : JSON.stringify(e).slice(0, 300)
    result.push({ retailer_id: retailerId, message })
  }
  return result
}

/** Estado de un batch asíncrono de Meta (consulta por handle). */
export async function getBatchStatus(
  handle: string,
  config?: WhatsAppConfig
): Promise<BatchStatusResponse> {
  const cfg = config || getConfig()
  const res = await waFetch(`/${handle}?fields=status,errors_total,errors`, {}, cfg)
  return res.json()
}

/**
 * Lista los productos actuales del catálogo de Meta (paginado completo).
 */
export async function getCatalogProducts(
  config?: WhatsAppConfig
): Promise<CatalogProductInfo[]> {
  const cfg = config || getConfig()
  const catalogId = resolveCatalogId(cfg)

  const all: CatalogProductInfo[] = []
  let path: string | null =
    `/${catalogId}/products?fields=id,name,retailer_id,price,currency&limit=500`

  while (path) {
    const res: Response = await waFetch(path, {}, cfg)
    const body: {
      data?: CatalogProductInfo[]
      paging?: { next?: string }
    } = await res.json()
    all.push(...(body.data ?? []))
    path = body.paging?.next ?? null
  }

  return all
}

export interface SyncCatalogResult {
  /** Productos nuevos enviados a Meta (CREATE). */
  added: number
  /** Productos existentes actualizados (UPDATE). */
  updated: number
  /** Productos borrados en Meta (solo si deleteUnknown = true). */
  removed: number
  /** retailer_ids presentes en Meta pero no en la curaduría (NO borrados). */
  stale: string[]
  /** Handles de los batches enviados (procesamiento asíncrono de Meta). */
  handles: string[]
  /** retailer_ids por acción (detalle por producto, WB2). */
  createdIds: string[]
  updatedIds: string[]
  removedIds: string[]
}

/**
 * Sync seguro Tienda → WhatsApp:
 * - CREATE lo nuevo, UPDATE lo existente (vía items_batch).
 * - NUNCA borra en Meta lo que no está en la curaduría salvo que se pida
 *   explícitamente con `deleteUnknown: true`; siempre reporta los `stale`.
 */
export async function syncCatalog(
  desiredProducts: WhatsAppProduct[],
  config?: WhatsAppConfig,
  opts?: { deleteUnknown?: boolean }
): Promise<SyncCatalogResult> {
  const cfg = config || getConfig()
  const current = await getCatalogProducts(cfg)

  const currentRetailerIds = new Set(current.map((p) => p.retailer_id))
  const desiredIds = new Set(desiredProducts.map((p) => p.id))

  const toCreate = desiredProducts.filter((p) => !currentRetailerIds.has(p.id))
  const toUpdate = desiredProducts.filter((p) => currentRetailerIds.has(p.id))
  const stale = current
    .filter((p) => p.retailer_id && !desiredIds.has(p.retailer_id))
    .map((p) => p.retailer_id)

  const handles: string[] = []
  const created = await batchCatalogItems(buildCatalogBatchRequests(toCreate, "CREATE"), cfg)
  const updated = await batchCatalogItems(buildCatalogBatchRequests(toUpdate, "UPDATE"), cfg)
  handles.push(...created.handles, ...updated.handles)

  let removed = 0
  if (opts?.deleteUnknown && stale.length > 0) {
    const deleted = await batchCatalogItems(
      stale.map((retailer_id) => ({ method: "DELETE" as const, retailer_id })),
      cfg
    )
    handles.push(...deleted.handles)
    removed = stale.length
  }

  return {
    added: toCreate.length,
    updated: toUpdate.length,
    removed,
    stale: opts?.deleteUnknown ? [] : stale,
    handles,
    createdIds: toCreate.map((p) => p.id),
    updatedIds: toUpdate.map((p) => p.id),
    removedIds: opts?.deleteUnknown ? stale : [],
  }
}

/** Prueba la conexión a Meta con las credenciales efectivas (WC9). */
export async function testCatalogConnection(
  config?: WhatsAppConfig
): Promise<{ ok: boolean; latencyMs: number; catalogName: string | null; error: string | null }> {
  const cfg = config || getConfig()
  const start = Date.now()
  try {
    const res = await waFetch(`/${resolveCatalogId(cfg)}?fields=id,name`, {}, cfg)
    const body = (await res.json()) as { name?: string }
    return { ok: true, latencyMs: Date.now() - start, catalogName: body?.name ?? null, error: null }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      catalogName: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
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

  const body: {
    messaging_product: string
    recipient_type: string
    to: string
    type: string
    template: {
      name: string
      language: { code: string }
      components?: unknown[]
    }
  } = {
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
    body.template.components = params.components
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

// ============================================================
// Messaging — Catálogo ordenado (product_list interactivo)
// ============================================================

export interface ProductListMessageSection {
  title: string
  product_items: { product_retailer_id: string }[]
}

/**
 * Envía un mensaje interactivo product_list: el orden de las secciones es
 * exactamente el que se recibe (Meta no lo reordena, a diferencia del
 * catálogo nativo).
 */
export async function sendProductListMessage(params: {
  to: string
  sections: ProductListMessageSection[]
  headerText?: string
  bodyText?: string
  footerText?: string
  catalogId?: string // default: waba_id de la config
}, config?: WhatsAppConfig): Promise<{ id: string | null }> {
  const cfg = config || getConfig()
  const res = await waFetch(
    `/${cfg.phoneNumberId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.to,
        type: "interactive",
        interactive: {
          type: "product_list",
          header: { type: "text", text: params.headerText ?? "Catálogo" },
          body: { text: params.bodyText ?? "Elige tus productos:" },
          footer: { text: params.footerText ?? "Resurte.me" },
          action: {
            catalog_id: params.catalogId ?? resolveCatalogId(cfg),
            sections: params.sections,
          },
        },
      }),
    },
    cfg
  )
  const body = await res.json()
  return { id: body?.messages?.[0]?.id ?? null }
}
