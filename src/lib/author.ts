// ============================================================
// ENTIDAD AUTOR — fuente única de verdad para la autoría
// ============================================================
// Los motores de respuesta (ChatGPT, Perplexity, Gemini, Copilot) citan a
// entidades verificables, no a firmas anónimas. Por eso el blog deja de
// firmarse como "Equipo Resurte.me" y pasa a una `Person` con `@id`, `url`,
// `knowsAbout` y `sameAs` — y Resurte.me queda como `publisher`.
//
// Este archivo es la única fuente: la usan el JSON-LD (blog-schema.ts,
// structured-data.ts), la página /autor/[slug], el byline del post y
// llms.txt. No duplicar estos datos en otro sitio.

import { DELIVERY_CITIES } from "./commercial-facts"

export interface AuthorProfile {
  /** Slug de la ruta pública /autor/[slug]. */
  slug: string
  name: string
  jobTitle: string
  /** Resumen de una línea para el byline. */
  tagline: string
  /** Bio larga para /autor/[slug]. */
  bio: string[]
  /** Credenciales y experiencia verificables. */
  credentials: string[]
  knowsAbout: string[]
  /** Perfiles externos del autor. Ver PENDING_PROFILES abajo. */
  sameAs: string[]
  /** `@id` canónico de la entidad `Person`. */
  id: string
  /** URL canónica de la página de autor. */
  url: string
}

export const SITE_URL = "https://resurte.me"
export const SITE_NAME = "Resurte.me"

/** `@id` de la organización, para que el autor y el publisher se crucen. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`

/**
 * PENDIENTE: perfiles personales de Victor Bustillos (LinkedIn, X).
 * Se dejan fuera a propósito en vez de inventar URLs — un `sameAs` falso
 * rompe la verificación de entidad en lugar de reforzarla. Agregar aquí
 * cuando estén disponibles; el schema y la página los toman solos.
 */
const PENDING_PROFILES: string[] = []

const VICTOR_BUSTILLOS: AuthorProfile = {
  slug: "victor-bustillos",
  name: "Victor Bustillos",
  jobTitle: "Fundador de Resurte.me",
  tagline: "Fundador de Resurte.me · Proveeduría y operación de restaurantes",
  bio: [
    "Victor Bustillos es fundador de Resurte.me, la central de abastos digital que conecta a restaurantes, fondas, cafeterías y hoteles de México con proveedores de mayoreo. Escribe sobre costeo de menú, control de mermas, compra de insumos y operación de cocina a partir del trabajo diario con negocios de comida en el país.",
    "Su enfoque es práctico: cada guía sale de datos reales de compra —precios por ciudad, mermas medidas en cocina y márgenes de menús que están operando hoy— y no de teoría de manual. Por eso el blog de Resurte.me publica tablas de costos, comparativas de formas de surtir y el índice de precios de insumos por ciudad.",
  ],
  credentials: [
    `Fundador de Resurte.me, central de abastos digital con cobertura en ${DELIVERY_CITIES} ciudades de México.`,
    "Trabajo directo con restaurantes, fondas y negocios de comida en el diseño de su proveeduría y su costeo.",
    "Autor de las guías pilar de costos, proveeduría, operación de cocina y crecimiento de Resurte.me.",
  ],
  knowsAbout: [
    "Proveeduría para restaurantes",
    "Compra de insumos por mayoreo",
    "Centrales de abastos en México",
    "Costeo de menú y food cost",
    "Control de mermas e inventario",
    "Operación de cocina",
    "Marketing para restaurantes",
    "Precios de insumos en México",
  ],
  sameAs: ["https://github.com/VABUSTILLOS", ...PENDING_PROFILES],
  id: `${SITE_URL}/autor/victor-bustillos#person`,
  url: `${SITE_URL}/autor/victor-bustillos`,
}

/** Autor principal del blog: el que firma todo el contenido editorial. */
export const PRIMARY_AUTHOR: AuthorProfile = VICTOR_BUSTILLOS

export const AUTHORS: AuthorProfile[] = [VICTOR_BUSTILLOS]

/**
 * Valores históricos de `author:` en el frontmatter de los MDX. Cualquier
 * firma no reconocida cae al autor principal, para que ningún post quede
 * sin entidad (un `author` anónimo es exactamente lo que rompe el E-E-A-T).
 */
const LEGACY_AUTHOR_NAMES = new Set(["Equipo Resurte.me", "Resurte.me", "Resurte"])

export function getAuthorBySlug(slug: string): AuthorProfile | undefined {
  return AUTHORS.find((a) => a.slug === slug)
}

/**
 * Resuelve el autor de un post a partir del `author:` del frontmatter.
 * Devuelve la entidad `Person` para firmas conocidas y el autor principal
 * como respaldo.
 */
export function resolveAuthor(frontmatterAuthor?: string): AuthorProfile {
  const name = frontmatterAuthor?.trim()
  if (name && !LEGACY_AUTHOR_NAMES.has(name)) {
    const match = AUTHORS.find((a) => a.name === name)
    if (match) return match
  }
  return PRIMARY_AUTHOR
}

/** Referencia `Person` compacta para incrustar en otros schemas. */
export function getAuthorReference(author: AuthorProfile = PRIMARY_AUTHOR) {
  return {
    "@type": "Person" as const,
    "@id": author.id,
    name: author.name,
    url: author.url,
    jobTitle: author.jobTitle,
    knowsAbout: author.knowsAbout,
    sameAs: author.sameAs,
  }
}

/** Schema `Person` completo, para la página /autor/[slug]. */
export function getPersonSchema(author: AuthorProfile = PRIMARY_AUTHOR) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": author.id,
    name: author.name,
    url: author.url,
    jobTitle: author.jobTitle,
    description: author.bio[0],
    knowsAbout: author.knowsAbout,
    sameAs: author.sameAs,
    worksFor: {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: SITE_NAME,
      url: SITE_URL,
    },
  }
}
