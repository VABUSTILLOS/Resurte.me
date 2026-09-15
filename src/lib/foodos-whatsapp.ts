// ============================================================
// WhatsApp Business por restaurante (FoodOS).
// Cifrado de tokens (AES-GCM), verificación de la conexión y
// builders de catálogo: selección + ORDEN elegido por el
// restaurante (lo que take.app no permite).
// ============================================================

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { WhatsAppConfig, WhatsAppProduct } from "@/lib/whatsapp"
import type { FoodosMenuCategory, FoodosMenuItem } from "@/types/foodos"

const GRAPH_BASE = "https://graph.facebook.com/v21.0"

// --- Cifrado del access token (AES-256-GCM) ------------------

function encryptionKey(): Buffer {
  const secret =
    process.env.FOODOS_WA_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("Falta FOODOS_WA_ENCRYPTION_KEY")
  return createHash("sha256").update(secret).digest()
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`
}

export function decryptToken(payload: string): string {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"))
  if (!iv || !tag || !data) throw new Error("Token cifrado inválido")
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}

// --- Config por restaurante -----------------------------------

/**
 * Devuelve la config de WhatsApp del restaurante (token descifrado) o null
 * si no tiene conexión. SOLO servidor (service role).
 */
export async function getRestaurantWhatsAppConfig(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<WhatsAppConfig | null> {
  const { data: conn } = await supabase
    .from("foodos_whatsapp_connections")
    .select("phone_number_id, waba_id, access_token_enc, status")
    .eq("restaurant_id", restaurantId)
    .maybeSingle()
  if (!conn) return null
  return {
    accessToken: decryptToken(conn.access_token_enc),
    phoneNumberId: conn.phone_number_id,
    wabaId: conn.waba_id,
  }
}

/** Verifica las credenciales contra Graph API (/{phone_number_id}). */
export async function verifyWhatsAppConnection(
  config: WhatsAppConfig
): Promise<{ ok: boolean; displayPhone: string | null; detail: string | null }> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${config.phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } }
    )
    const body = await res.json()
    if (!res.ok) {
      return { ok: false, displayPhone: null, detail: body?.error?.message ?? `Error ${res.status}` }
    }
    return { ok: true, displayPhone: body.display_phone_number ?? null, detail: null }
  } catch (e) {
    return { ok: false, displayPhone: null, detail: e instanceof Error ? e.message : "Error de red" }
  }
}

// --- Builders de catálogo (selección + orden del restaurante) ---

/**
 * Platillos visibles en WhatsApp, en el orden exacto de la curaduría
 * (whatsapp_position; los sin posición van al final por sort_order).
 */
export function orderedWhatsAppItems(items: FoodosMenuItem[]): FoodosMenuItem[] {
  return items
    .filter((i) => i.whatsapp_visible && i.is_available)
    .sort((a, b) => {
      const pa = a.whatsapp_position ?? Number.MAX_SAFE_INTEGER
      const pb = b.whatsapp_position ?? Number.MAX_SAFE_INTEGER
      if (pa !== pb) return pa - pb
      return a.sort_order - b.sort_order
    })
}

/** Mapea la curaduría a productos de WhatsApp Commerce. */
export function buildCatalogProducts(items: FoodosMenuItem[]): WhatsAppProduct[] {
  return orderedWhatsAppItems(items).map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description ?? undefined,
    image_url: i.image_url ?? undefined,
    price: Number(i.price),
    currency: "MXN",
  }))
}

export interface ProductListSection {
  title: string
  product_items: { product_retailer_id: string }[]
}

/**
 * Secciones del mensaje interactivo product_list (máx 30 ítems por mensaje,
 * agrupados por categoría). El ORDEN es 100% el de la curaduría — a
 * diferencia del catálogo nativo de Meta, aquí no lo reordena nadie.
 */
export function buildProductListSections(
  items: FoodosMenuItem[],
  categories: FoodosMenuCategory[]
): ProductListSection[] {
  const ordered = orderedWhatsAppItems(items).slice(0, 30)
  const catName = new Map(categories.map((c) => [c.id, c.name]))
  const sections: ProductListSection[] = []
  const byCat = new Map<string, { product_retailer_id: string }[]>()

  for (const item of ordered) {
    const title = (item.category_id && catName.get(item.category_id)) || "Menú"
    const list = byCat.get(title) ?? []
    list.push({ product_retailer_id: item.id })
    byCat.set(title, list)
  }
  for (const [title, product_items] of byCat) {
    sections.push({ title: title.slice(0, 24), product_items })
  }
  return sections
}

// --- Envío de catálogo ordenado (product_list) ----------------

const GRAPH_MESSAGES = (phoneNumberId: string) => `${GRAPH_BASE}/${phoneNumberId}/messages`

/**
 * Envía el catálogo como mensaje interactivo `product_list`: secciones por
 * categoría con el ORDEN EXACTO de la curaduría (Meta no lo reordena).
 * Requiere que los productos ya estén en el catálogo nativo (sync Fase 1).
 */
export async function sendCatalogProductList(params: {
  config: WhatsAppConfig
  to: string
  sections: ProductListSection[]
  headerText?: string
  bodyText?: string
  catalogId?: string // catalog_id de la WABA (default: waba_id)
}): Promise<{ id: string | null }> {
  const { config, to, sections } = params
  const res = await fetch(GRAPH_MESSAGES(config.phoneNumberId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "product_list",
        header: { type: "text", text: params.headerText ?? "Nuestro menú" },
        body: { text: params.bodyText ?? "Elige tus platillos favoritos:" },
        footer: { text: "Pedidos por WhatsApp" },
        action: {
          catalog_id: params.catalogId ?? config.wabaId,
          sections,
        },
      },
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `WhatsApp API error ${res.status}`)
  }
  return { id: body?.messages?.[0]?.id ?? null }
}
