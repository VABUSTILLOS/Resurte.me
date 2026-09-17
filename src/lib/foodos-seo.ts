// ============================================================
// Sitio IA y SEO local: núcleo puro.
//
// Todo lo que se puede calcular sin red vive aquí — manifest PWA, datos
// estructurados, meta descripciones, checklist de Google Business — para que
// el micrositio público sea prerenderizable y los tests no necesiten Supabase.
//
// La regla que gobierna este archivo: **no inventar**. Una meta descripción
// que promete algo que el restaurante no dijo es peor que no tenerla.
// ============================================================

export const DEFAULT_SEO_THEME_COLOR = "#0E7A0E"
export const DEFAULT_SEO_ORIGIN = "https://resurte.me"

/**
 * Android y iOS recortan `short_name` alrededor de los 12 caracteres debajo
 * del icono. Es el mismo límite que impone la CHECK de `app_short_name` (00159).
 */
export const MANIFEST_SHORT_NAME_MAX = 12
/**
 * Fondo de la pantalla de arranque. Era el beige de Resurte.me escrito a mano:
 * un restaurante con marca oscura veía un destello claro al abrir su app.
 */
export const DEFAULT_MANIFEST_BACKGROUND_COLOR = "#F7F5F0"

/** Google corta la descripción alrededor de los 155 caracteres. */
export const META_DESCRIPTION_MAX = 155
/** El título indexable se corta cerca de los 60 caracteres. */
export const META_TITLE_MAX = 60

export interface SeoRestaurantProfile {
  slug: string
  name: string
  tagline?: string | null
  about?: string | null
  description?: string | null
  logo_url?: string | null
  theme_color?: string | null
  currency?: string | null
  seo_keywords?: string[] | null
  google_business_url?: string | null
  /** Nombre corto bajo el icono (00159). NULL = derivarlo del nombre. */
  app_short_name?: string | null
  /** Fondo de la pantalla de arranque (00159). NULL = el beige por defecto. */
  app_background_color?: string | null
}

export interface SeoBranchFacts {
  name: string
  city?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  phone?: string | null
  pickup_active?: boolean
  delivery_active?: boolean
  dine_in_active?: boolean
}

export interface SeoHoursFact {
  day_of_week: number
  open_time?: string | null
  close_time?: string | null
  is_closed?: boolean
}

export interface SeoMenuItemFact {
  name: string
  description?: string | null
  price: number
  categoryName?: string | null
  imageUrl?: string | null
}

export interface SeoFaqItem {
  q: string
  a: string
}

// ------------------------------------------------------------
// Rutas
// ------------------------------------------------------------

export function restaurantPath(slug: string): string {
  return `/r/${slug}`
}

export function menuPath(slug: string): string {
  return `/r/${slug}/carta`
}

export function manifestPath(slug: string): string {
  return `/r/${slug}/manifest.webmanifest`
}

export function cateringPath(slug: string): string {
  return `/r/${slug}/catering`
}

export function seoPagePath(slug: string, pageSlug: string): string {
  return `/r/${slug}/p/${pageSlug}`
}

export function siteOrigin(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim()
  return (raw || DEFAULT_SEO_ORIGIN).replace(/\/$/, "")
}

export function absoluteUrl(origin: string, path: string): string {
  return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`
}

// ------------------------------------------------------------
// Texto
// ------------------------------------------------------------

/** Colapsa espacios y recorta en frontera de palabra. Nunca corta a media palabra. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const space = cut.lastIndexOf(" ")
  // Sin espacio razonable (una sola palabra gigante) se corta duro: dejar la
  // cadena vacía sería peor que una palabra partida.
  const body = space > max * 0.5 ? cut.slice(0, space) : cut
  return `${body.replace(/[\s,;:.!?¡¿-]+$/, "")}…`
}

/** Elige el texto más útil disponible: la frase corta gana sobre el párrafo. */
export function seoDescription(profile: SeoRestaurantProfile): string {
  const candidates = [
    profile.tagline,
    profile.description,
    profile.about,
  ]
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value) return truncate(value, META_DESCRIPTION_MAX)
  }
  return truncate(
    `Pide en línea a ${profile.name}: menú, precios y envío a domicilio sin comisiones.`,
    META_DESCRIPTION_MAX
  )
}

export function seoTitle(profile: SeoRestaurantProfile, city?: string | null): string {
  const base = city?.trim() ? `${profile.name} · ${city.trim()}` : profile.name
  return truncate(`${base} · Pide en línea`, META_TITLE_MAX)
}

/** Slug estable para URLs de contenido generado. */
export function slugifySeo(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/** Un color inválido rompería el tema del manifest; cae al verde de la marca. */
export function safeThemeColor(value?: string | null): string {
  const raw = value?.trim() ?? ""
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : DEFAULT_SEO_THEME_COLOR
}

// ------------------------------------------------------------
// Manifest PWA
// ------------------------------------------------------------

export interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

export interface RestaurantManifest {
  name: string
  short_name: string
  description: string
  id: string
  start_url: string
  scope: string
  display: string
  background_color: string
  theme_color: string
  orientation: string
  lang: string
  icons: ManifestIcon[]
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
}

export function imageMimeType(url: string): string {
  const match = url.split("?")[0]?.match(/\.([a-z0-9]+)$/i)
  return IMAGE_TYPES[match?.[1]?.toLowerCase() ?? ""] ?? "image/png"
}

/**
 * Nombre bajo el icono. El dueño manda; si no lo definió se deriva del nombre,
 * que es exactamente lo que se hacía antes de 00159 — y por eso "Restaurante
 * La Parrilla" se instalaba como "Restaurante " (el recorte dejaba el espacio
 * colgando y Android mostraba un nombre a medias sin forma de arreglarlo).
 */
export function manifestShortName(profile: SeoRestaurantProfile): string {
  const own = profile.app_short_name?.trim()
  if (own) return own.slice(0, MANIFEST_SHORT_NAME_MAX)
  const name = profile.name.trim()
  if (name.length <= MANIFEST_SHORT_NAME_MAX) return name
  return name.slice(0, MANIFEST_SHORT_NAME_MAX).trim()
}

/**
 * Fondo de la pantalla de arranque. La CHECK de 00159 ya garantiza el formato
 * en la base, pero el panel previsualiza valores en vuelo: un color inválido
 * haría que el navegador rechace el manifest entero, así que aquí se valida.
 */
export function manifestBackgroundColor(profile: SeoRestaurantProfile): string {
  const raw = profile.app_background_color?.trim() ?? ""
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : DEFAULT_MANIFEST_BACKGROUND_COLOR
}

/**
 * Iconos del manifest.
 *
 * El logo del restaurante se declara `sizes: "any"`: no conocemos sus
 * dimensiones reales y declarar "512x512" a ciegas hace que Android rechace la
 * instalación. Si no hay logo se cae a los iconos de Resurte.me, que existen
 * siempre — una app de marca sin logo sigue siendo instalable.
 */
export function manifestIcons(logoUrl?: string | null): ManifestIcon[] {
  const logo = logoUrl?.trim()
  if (logo) {
    const type = imageMimeType(logo)
    return [
      { src: logo, sizes: "any", type, purpose: "any" },
      { src: logo, sizes: "any", type, purpose: "maskable" },
    ]
  }
  return [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]
}

export function buildRestaurantManifest(profile: SeoRestaurantProfile): RestaurantManifest {
  const path = restaurantPath(profile.slug)

  return {
    name: profile.name.trim(),
    short_name: manifestShortName(profile) || profile.name.trim(),
    description: seoDescription(profile),
    id: path,
    start_url: path,
    // El scope se queda en el restaurante: si el comensal instala "Tacos Don
    // Beto", abrir el link de otro restaurante debe salir del navegador, no
    // reusar una app que no es la suya.
    scope: path,
    display: "standalone",
    background_color: manifestBackgroundColor(profile),
    theme_color: safeThemeColor(profile.theme_color),
    orientation: "portrait-primary",
    lang: "es-MX",
    icons: manifestIcons(profile.logo_url),
  }
}

// ------------------------------------------------------------
// Datos estructurados (JSON-LD)
// ------------------------------------------------------------

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

interface OpeningHoursSpec {
  "@type": "OpeningHoursSpecification"
  dayOfWeek: string[]
  opens: string
  closes: string
}

/** "HH:MM:SS" → "HH:MM" (schema.org rechaza los segundos). */
function hhmm(value?: string | null): string | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  return `${match[1]?.padStart(2, "0")}:${match[2]}`
}

/**
 * Agrupa días con el mismo horario en una sola especificación. Sin la
 * agrupación, un restaurante con horario corrido publica 7 nodos idénticos.
 */
export function openingHoursSpecification(hours: SeoHoursFact[]): OpeningHoursSpec[] {
  const buckets = new Map<string, string[]>()
  for (const row of hours) {
    if (row.is_closed) continue
    const opens = hhmm(row.open_time)
    const closes = hhmm(row.close_time)
    if (!opens || !closes) continue
    const day = DAY_NAMES[row.day_of_week]
    if (!day) continue
    const key = `${opens}|${closes}`
    const days = buckets.get(key) ?? []
    if (!days.includes(day)) days.push(day)
    buckets.set(key, days)
  }

  return [...buckets.entries()]
    .map(([key, dayOfWeek]) => {
      const [opens, closes] = key.split("|") as [string, string]
      return {
        "@type": "OpeningHoursSpecification" as const,
        dayOfWeek: dayOfWeek.sort(
          (a, b) => DAY_NAMES.indexOf(a as (typeof DAY_NAMES)[number]) - DAY_NAMES.indexOf(b as (typeof DAY_NAMES)[number])
        ),
        opens,
        closes,
      }
    })
    .sort((a, b) => (a.opens === b.opens ? a.closes.localeCompare(b.closes) : a.opens.localeCompare(b.opens)))
}

export interface RestaurantSchemaInput {
  profile: SeoRestaurantProfile
  branches: SeoBranchFacts[]
  hours: SeoHoursFact[]
  /** Valoración media ya calculada por el panel; sin reseñas va `null`. */
  rating?: { value: number; count: number } | null
  url: string
}

export function buildRestaurantSchema(input: RestaurantSchemaInput): object {
  const { profile, branches, hours, rating, url } = input
  const primary = branches[0]
  const sameAs = [profile.google_business_url?.trim()].filter(
    (value): value is string => Boolean(value)
  )

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${url}#restaurant`,
    name: profile.name.trim(),
    url,
    servesCuisine: profile.seo_keywords?.length ? profile.seo_keywords.slice(0, 8) : undefined,
    priceRange: "$$",
    acceptsReservations: branches.some((b) => b.dine_in_active) ? "True" : "False",
  }

  if (profile.logo_url?.trim()) schema.image = profile.logo_url.trim()
  const description = profile.about?.trim() || profile.description?.trim() || profile.tagline?.trim()
  if (description) schema.description = truncate(description, 300)
  if (sameAs.length) schema.sameAs = sameAs

  const postal = primary
    ? {
        "@type": "PostalAddress",
        streetAddress: primary.address?.trim() || undefined,
        addressLocality: primary.city?.trim() || undefined,
        addressCountry: "MX",
      }
    : null
  if (postal && (postal.streetAddress || postal.addressLocality)) schema.address = postal

  if (primary && typeof primary.lat === "number" && typeof primary.lng === "number") {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: primary.lat,
      longitude: primary.lng,
    }
  }

  const phone = branches.map((b) => b.phone?.trim()).find((value) => Boolean(value))
  if (phone) schema.telephone = phone

  const spec = openingHoursSpecification(hours)
  if (spec.length) schema.openingHoursSpecification = spec

  if (rating && rating.count > 0 && rating.value > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(rating.value.toFixed(1)),
      reviewCount: rating.count,
      bestRating: 5,
      worstRating: 1,
    }
  }

  const methods: string[] = []
  if (branches.some((b) => b.delivery_active)) methods.push("https://schema.org/DeliveryModeHomeDelivery")
  if (branches.some((b) => b.pickup_active)) methods.push("https://schema.org/DeliveryModePickup")
  if (methods.length) schema.hasDeliveryMethod = methods

  return schema
}

export interface MenuSchemaInput {
  profile: SeoRestaurantProfile
  items: SeoMenuItemFact[]
  url: string
}

/**
 * `Menu` con una sección por categoría. Los platos sin categoría caen en
 * "Menú" en vez de desaparecer: un platillo sin sección sigue siendo
 * indexable y es el que más duele perder.
 */
export function buildMenuSchema(input: MenuSchemaInput): object | null {
  const usable = input.items.filter((item) => item.name.trim() && Number.isFinite(item.price))
  if (!usable.length) return null

  const sections = new Map<string, SeoMenuItemFact[]>()
  for (const item of usable) {
    const name = item.categoryName?.trim() || "Menú"
    const bucket = sections.get(name) ?? []
    bucket.push(item)
    sections.set(name, bucket)
  }

  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": `${input.url}#menu`,
    name: `Menú de ${input.profile.name.trim()}`,
    url: input.url,
    inLanguage: "es-MX",
    hasMenuSection: [...sections.entries()].map(([name, items]) => ({
      "@type": "MenuSection",
      name,
      hasMenuItem: items.slice(0, 60).map((item) => ({
        "@type": "MenuItem",
        name: item.name.trim(),
        ...(item.description?.trim()
          ? { description: truncate(item.description, 200) }
          : {}),
        ...(item.imageUrl?.trim() ? { image: item.imageUrl.trim() } : {}),
        offers: {
          "@type": "Offer",
          price: item.price.toFixed(2),
          priceCurrency: (input.profile.currency ?? "MXN").toUpperCase(),
        },
      })),
    })),
  }
}

export function buildFaqSchema(items: SeoFaqItem[], url: string): object | null {
  const usable = items.filter((item) => item.q.trim() && item.a.trim())
  if (!usable.length) return null
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: usable.map((item) => ({
      "@type": "Question",
      name: item.q.trim(),
      acceptedAnswer: { "@type": "Answer", text: item.a.trim() },
    })),
  }
}

export function buildBreadcrumbSchema(items: { name: string; url: string }[]): object | null {
  const usable = items.filter((item) => item.name.trim() && item.url.trim())
  if (!usable.length) return null
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: usable.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name.trim(),
      item: item.url.trim(),
    })),
  }
}

/**
 * Lee la columna `faq` sin confiar en su forma: es JSONB escrito por
 * generaciones sucesivas y un registro corrupto no debe tumbar la página.
 */
export function parseFaq(value: unknown): SeoFaqItem[] {
  if (!Array.isArray(value)) return []
  const out: SeoFaqItem[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const q = typeof record.q === "string" ? record.q.trim() : ""
    const a = typeof record.a === "string" ? record.a.trim() : ""
    if (q && a) out.push({ q, a })
  }
  return out.slice(0, 20)
}

// ------------------------------------------------------------
// Google Business
// ------------------------------------------------------------

export const GOOGLE_BUSINESS_CREATE_URL = "https://www.google.com/business/"

export interface GoogleBusinessInput {
  profile: SeoRestaurantProfile
  branches: SeoBranchFacts[]
  hours: SeoHoursFact[]
  reviewCount: number
}

export interface GoogleBusinessStep {
  key: string
  done: boolean
  /** Enlace externo para completar el paso, cuando existe uno. */
  href?: string
}

/**
 * Checklist de ficha de Google. No hay API sin credenciales —y con
 * credenciales Google exige verificación de propiedad— así que el producto
 * entrega lo que sí controla: los datos ya cargados y el enlace correcto.
 */
export function googleBusinessChecklist(input: GoogleBusinessInput): GoogleBusinessStep[] {
  const { profile, branches, hours, reviewCount } = input
  const hasPhone = branches.some((b) => Boolean(b.phone?.trim()))
  const hasAddress = branches.some((b) => Boolean(b.address?.trim()) || Boolean(b.city?.trim()))
  const hasHours = hours.some((row) => !row.is_closed && Boolean(hhmm(row.open_time)))

  return [
    { key: "logo", done: Boolean(profile.logo_url?.trim()) },
    { key: "tagline", done: Boolean(profile.tagline?.trim()) },
    { key: "about", done: Boolean(profile.about?.trim()) },
    { key: "hours", done: hasHours },
    { key: "phone", done: hasPhone },
    { key: "address", done: hasAddress },
    { key: "keywords", done: Boolean(profile.seo_keywords?.length) },
    { key: "reviews", done: reviewCount > 0 },
    {
      key: "google_business",
      done: Boolean(profile.google_business_url?.trim()),
      href: profile.google_business_url?.trim() || GOOGLE_BUSINESS_CREATE_URL,
    },
  ]
}

export interface GoogleBusinessProgress {
  done: number
  total: number
  /** 0..1 redondeado a 2 decimales, listo para una barra de progreso. */
  ratio: number
  pending: string[]
}

export function googleBusinessProgress(steps: GoogleBusinessStep[]): GoogleBusinessProgress {
  const total = steps.length
  const done = steps.filter((step) => step.done).length
  return {
    done,
    total,
    ratio: total === 0 ? 0 : Math.round((done / total) * 100) / 100,
    pending: steps.filter((step) => !step.done).map((step) => step.key),
  }
}

// ------------------------------------------------------------
// Texto de respaldo para el sitio IA (sin modelo)
// ------------------------------------------------------------

export function fallbackAbout(input: {
  name: string
  city?: string | null
  keywords?: string[] | null
}): string {
  const where = input.city?.trim() ? ` en ${input.city.trim()}` : ""
  const what = (input.keywords ?? []).filter(Boolean).slice(0, 3)
  const specialty = what.length
    ? ` Nos conocen por ${what.join(", ")}.`
    : ""
  return (
    `${input.name.trim()} es un restaurante${where} que atiende a sus clientes directo, ` +
    `sin intermediarios.${specialty} Pide en línea desde nuestro menú: eliges tus platillos, ` +
    "confirmas y te decimos cuándo está listo. Puedes recogerlo o pedir envío a domicilio."
  )
}

export function fallbackFaq(input: {
  name: string
  branches: SeoBranchFacts[]
  hasDelivery: boolean
  hasPickup: boolean
}): SeoFaqItem[] {
  const items: SeoFaqItem[] = []
  const city = input.branches.find((b) => b.city?.trim())?.city?.trim()

  if (input.hasDelivery) {
    items.push({
      q: `¿${input.name.trim()} hace envíos a domicilio?`,
      a: city
        ? `Sí. Entregamos en ${city} y zonas cercanas. Al pedir en línea te mostramos el costo de envío antes de confirmar.`
        : "Sí. Al pedir en línea te mostramos el costo de envío antes de confirmar.",
    })
  }
  if (input.hasPickup) {
    items.push({
      q: "¿Puedo pasar a recoger mi pedido?",
      a: "Sí. Elige \"para llevar\" al hacer tu pedido y te avisamos en cuanto esté listo para recoger.",
    })
  }
  items.push({
    q: "¿Cómo pago mi pedido?",
    a: "Puedes pagar en línea con tarjeta o en efectivo al recibir, según lo que tenga activado el restaurante al confirmar tu pedido.",
  })
  return items
}
