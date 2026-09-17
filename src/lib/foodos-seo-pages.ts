// ============================================================
// Sitio IA — capa de servidor (Fase 6, nivel Diamante).
// ============================================================
// Decisiones que se ven en este archivo:
//
// 1. Nada se publica solo. `upsertSeoPage` siempre escribe en `draft`: la
//    aprobación es un acto explícito del dueño (`setSeoPageStatus`).
//
// 2. El perfil público (tagline, about, keywords, ficha de Google) vive en
//    `foodos_restaurants`. Es un dato del restaurante, no de una página.
//
// 3. Leer nunca lanza. `listSeoPages` y `loadPublishedSeoPage` degradan a
//    vacío/null: una página que no carga no puede tumbar el micrositio de
//    pedidos, que es el negocio.
//
// 4. Escribir sí devuelve error legible. El dueño tiene que saber por qué no
//    se guardó su texto.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  parseFaq,
  slugifySeo,
  type SeoBranchFacts,
  type SeoFaqItem,
  type SeoHoursFact,
  type SeoRestaurantProfile,
} from "@/lib/foodos-seo"
import { logger } from "@/lib/logger"

type Client = SupabaseClient

export type SeoPageKind = "about" | "faq" | "menu" | "dish" | "city"
export type SeoPageStatus = "draft" | "published"
export type SeoPageSource = "llm" | "template"

const PAGE_KINDS: SeoPageKind[] = ["about", "faq", "menu", "dish", "city"]

export const MAX_TAGLINE_LENGTH = 160
export const MAX_ABOUT_PROFILE_LENGTH = 4000
export const MAX_PAGE_BODY_LENGTH = 20000
export const MAX_KEYWORDS = 12
export const MAX_KEYWORD_LENGTH = 40

export interface SeoPageRow {
  id: string
  kind: SeoPageKind
  slug: string
  title: string
  summary: string | null
  body: string
  faq: SeoFaqItem[]
  status: SeoPageStatus
  source: SeoPageSource
  generated_at: string
  approved_at: string | null
  updated_at: string
}

export interface SeoRating {
  value: number
  count: number
}

export interface SeoProfileContext {
  restaurant: SeoRestaurantProfile & { id: string; description: string | null }
  branches: SeoBranchFacts[]
  hours: SeoHoursFact[]
  rating: SeoRating | null
}

export interface SeoPageInput {
  restaurantId: string
  kind: SeoPageKind
  title: string
  slug?: string | null
  summary?: string | null
  body?: string | null
  faq?: unknown
  source?: SeoPageSource
}

export type SeoPageResult = { ok: true; page: SeoPageRow } | { ok: false; error: string }

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback
}

function isPageKind(value: unknown): value is SeoPageKind {
  return typeof value === "string" && (PAGE_KINDS as string[]).includes(value)
}

function isPageStatus(value: unknown): value is SeoPageStatus {
  return value === "draft" || value === "published"
}

function rowToSeoPage(data: unknown): SeoPageRow | null {
  if (!data || typeof data !== "object") return null
  const row = data as Record<string, unknown>
  const id = text(row.id)
  const title = text(row.title)
  const slug = text(row.slug)
  if (!id || !title || !slug) return null
  const kind = isPageKind(row.kind) ? row.kind : "about"
  const status = isPageStatus(row.status) ? row.status : "draft"
  return {
    id,
    kind,
    slug,
    title,
    summary: text(row.summary),
    body: typeof row.body === "string" ? row.body : "",
    faq: parseFaq(row.faq),
    status,
    source: row.source === "llm" ? "llm" : "template",
    generated_at: text(row.generated_at) ?? new Date(0).toISOString(),
    approved_at: text(row.approved_at),
    updated_at: text(row.updated_at) ?? text(row.generated_at) ?? new Date(0).toISOString(),
  }
}

// ------------------------------------------------------------
// Lectura del contexto (perfil + sucursales + horarios + reseñas)
// ------------------------------------------------------------

const RESTAURANT_COLUMNS =
  "id, name, slug, logo_url, description, theme_color, currency, tagline, about, seo_keywords, google_business_url"

/**
 * Todo lo que necesitan el manifest, los datos estructurados y el checklist de
 * Google. Devuelve `null` solo si el restaurante no existe: el resto degrada.
 */
export async function loadSeoProfile(
  supabase: Client,
  restaurantId: string
): Promise<SeoProfileContext | null> {
  try {
    const { data, error } = await supabase
      .from("foodos_restaurants")
      .select(RESTAURANT_COLUMNS)
      .eq("id", restaurantId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null

    const row = data as Record<string, unknown>
    const slug = text(row.slug)
    const name = text(row.name)
    if (!slug || !name) return null

    const profile: SeoProfileContext["restaurant"] = {
      id: String(row.id ?? restaurantId),
      slug,
      name,
      logo_url: text(row.logo_url),
      description: text(row.description),
      theme_color: text(row.theme_color),
      currency: text(row.currency),
      tagline: text(row.tagline),
      about: text(row.about),
      seo_keywords: Array.isArray(row.seo_keywords)
        ? (row.seo_keywords as unknown[]).map((k) => String(k)).filter(Boolean)
        : [],
      google_business_url: text(row.google_business_url),
    }

    const { data: branchRows } = await supabase
      .from("foodos_branches")
      .select("id, name, city, address, lat, lng, phone, pickup_active, delivery_active, dine_in_active")
      .eq("restaurant_id", restaurantId)
      .order("name")

    const branches: SeoBranchFacts[] = ((branchRows as unknown[]) ?? []).map((entry) => {
      const b = entry as Record<string, unknown>
      return {
        name: text(b.name) ?? "",
        city: text(b.city),
        address: text(b.address),
        lat: num(b.lat),
        lng: num(b.lng),
        phone: text(b.phone),
        pickup_active: bool(b.pickup_active),
        delivery_active: bool(b.delivery_active),
        dine_in_active: bool(b.dine_in_active),
      }
    })

    const branchIds = ((branchRows as unknown[]) ?? [])
      .map((entry) => text((entry as Record<string, unknown>).id))
      .filter((value): value is string => Boolean(value))

    let hours: SeoHoursFact[] = []
    if (branchIds.length) {
      const { data: hourRows } = await supabase
        .from("foodos_branch_hours")
        .select("day_of_week, open_time, close_time, is_closed")
        .in("branch_id", branchIds)
      hours = ((hourRows as unknown[]) ?? []).map((entry) => {
        const h = entry as Record<string, unknown>
        return {
          day_of_week: num(h.day_of_week) ?? 0,
          open_time: text(h.open_time),
          close_time: text(h.close_time),
          is_closed: bool(h.is_closed),
        }
      })
    }

    const { data: reviewRows } = await supabase
      .from("foodos_reviews")
      .select("rating")
      .eq("restaurant_id", restaurantId)
      .eq("is_visible", true)
      .limit(1000)

    const ratings = ((reviewRows as unknown[]) ?? [])
      .map((entry) => num((entry as Record<string, unknown>).rating))
      .filter((value): value is number => value !== null && value > 0)

    const rating: SeoRating | null = ratings.length
      ? {
          value: ratings.reduce((sum, value) => sum + value, 0) / ratings.length,
          count: ratings.length,
        }
      : null

    return { restaurant: profile, branches, hours, rating }
  } catch (err) {
    logger.warn("[Sitio IA] No se pudo cargar el perfil público", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ------------------------------------------------------------
// Páginas
// ------------------------------------------------------------

export async function listSeoPages(
  supabase: Client,
  restaurantId: string,
  limit = 100
): Promise<SeoPageRow[]> {
  try {
    const { data, error } = await supabase
      .from("foodos_seo_pages")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 300))
    if (error) throw error
    return ((data as unknown[]) ?? [])
      .map(rowToSeoPage)
      .filter((page): page is SeoPageRow => page !== null)
  } catch (err) {
    logger.warn("[Sitio IA] No se pudieron listar las páginas", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

export async function listPublishedSeoPages(
  supabase: Client,
  restaurantId: string,
  limit = 100
): Promise<SeoPageRow[]> {
  try {
    const { data, error } = await supabase
      .from("foodos_seo_pages")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 300))
    if (error) throw error
    return ((data as unknown[]) ?? [])
      .map(rowToSeoPage)
      .filter((page): page is SeoPageRow => page !== null)
  } catch {
    return []
  }
}

export async function loadPublishedSeoPage(
  supabase: Client,
  restaurantId: string,
  slug: string
): Promise<SeoPageRow | null> {
  const cleanSlug = slugifySeo(slug)
  if (!cleanSlug) return null
  try {
    const { data, error } = await supabase
      .from("foodos_seo_pages")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("slug", cleanSlug)
      .eq("status", "published")
      .maybeSingle()
    if (error) throw error
    return rowToSeoPage(data)
  } catch {
    return null
  }
}

/**
 * Crea o actualiza el borrador de una página.
 *
 * El slug se deriva del título si no viene: el dueño escribe "Sobre nosotros"
 * y la URL sale sola. Reintentar la generación actualiza el mismo borrador
 * (`ON CONFLICT (restaurant_id, kind, slug)`) en vez de acumular duplicados.
 */
export async function upsertSeoPage(
  supabase: Client,
  input: SeoPageInput
): Promise<SeoPageResult> {
  const title = input.title?.trim() ?? ""
  if (!title) return { ok: false, error: "La página necesita un título" }
  if (title.length > 160) return { ok: false, error: "El título es demasiado largo" }
  if (!isPageKind(input.kind)) return { ok: false, error: "Tipo de página no válido" }

  const slug = slugifySeo(input.slug?.trim() || title)
  if (!slug) return { ok: false, error: "El título necesita letras o números" }

  const body = input.body ?? ""
  if (body.length > MAX_PAGE_BODY_LENGTH) {
    return { ok: false, error: "El contenido es demasiado largo" }
  }

  const faq = parseFaq(input.faq)

  try {
    const { data, error } = await supabase
      .from("foodos_seo_pages")
      .upsert(
        {
          restaurant_id: input.restaurantId,
          kind: input.kind,
          slug,
          title,
          summary: text(input.summary),
          body,
          faq,
          source: input.source === "llm" ? "llm" : "template",
          // Regenerar devuelve la página a borrador: el texto cambió y nadie
          // lo ha vuelto a leer. Publicar sin revisar es lo que hay que evitar.
          status: "draft",
          approved_at: null,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "restaurant_id,kind,slug" }
      )
      .select("*")
      .single()

    if (error) throw error
    const page = rowToSeoPage(data)
    if (!page) return { ok: false, error: "No se pudo guardar la página" }
    return { ok: true, page }
  } catch (err) {
    logger.error("[Sitio IA] No se pudo guardar la página", err)
    return { ok: false, error: "No se pudo guardar la página" }
  }
}

export async function setSeoPageStatus(
  supabase: Client,
  restaurantId: string,
  pageId: string,
  status: SeoPageStatus
): Promise<boolean> {
  if (!isPageStatus(status)) return false
  try {
    const { error } = await supabase
      .from("foodos_seo_pages")
      .update({
        status,
        approved_at: status === "published" ? new Date().toISOString() : null,
      })
      .eq("id", pageId)
      // El filtro por restaurante es la segunda llave: aunque la RLS ya lo
      // cubre, evita que un id ajeno escrito a mano publique otra cosa.
      .eq("restaurant_id", restaurantId)
    if (error) throw error
    return true
  } catch (err) {
    logger.error("[Sitio IA] No se pudo cambiar el estado de la página", err)
    return false
  }
}

export async function deleteSeoPage(
  supabase: Client,
  restaurantId: string,
  pageId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("foodos_seo_pages")
      .delete()
      .eq("id", pageId)
      .eq("restaurant_id", restaurantId)
    if (error) throw error
    return true
  } catch (err) {
    logger.error("[Sitio IA] No se pudo borrar la página", err)
    return false
  }
}

// ------------------------------------------------------------
// Perfil público
// ------------------------------------------------------------

export interface SeoProfileInput {
  restaurantId: string
  tagline?: string | null
  about?: string | null
  seoKeywords?: string[] | null
  googleBusinessUrl?: string | null
}

export type SeoProfileResult = { ok: true } | { ok: false; error: string }

/**
 * Normaliza las palabras clave: minúsculas, sin repetidos, sin vacíos y con
 * tope. Un array de 200 términos no posiciona nada y ensucia el JSON-LD.
 */
export function normalizeKeywords(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== "string") continue
    const clean = value.trim().toLowerCase().slice(0, MAX_KEYWORD_LENGTH)
    if (!clean) continue
    seen.add(clean)
    if (seen.size >= MAX_KEYWORDS) break
  }
  return [...seen]
}

export async function saveSeoProfile(
  supabase: Client,
  input: SeoProfileInput
): Promise<SeoProfileResult> {
  const tagline = input.tagline?.trim() ?? ""
  if (tagline.length > MAX_TAGLINE_LENGTH) {
    return { ok: false, error: "La frase corta es demasiado larga" }
  }

  const about = input.about?.trim() ?? ""
  if (about.length > MAX_ABOUT_PROFILE_LENGTH) {
    return { ok: false, error: "La descripción es demasiado larga" }
  }

  const rawUrl = input.googleBusinessUrl?.trim() ?? ""
  if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
    return { ok: false, error: "El enlace de Google Business no es válido" }
  }

  try {
    const { error } = await supabase
      .from("foodos_restaurants")
      .update({
        tagline: tagline || null,
        about: about || null,
        seo_keywords: normalizeKeywords(input.seoKeywords),
        google_business_url: rawUrl || null,
      })
      .eq("id", input.restaurantId)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    logger.error("[Sitio IA] No se pudo guardar el perfil público", err)
    return { ok: false, error: "No se pudo guardar el perfil" }
  }
}
