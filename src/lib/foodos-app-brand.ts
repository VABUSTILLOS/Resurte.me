// ============================================================
// "App de tu marca": núcleo puro de lo que el comensal ve al instalar el PWA.
//
// El manifest ya existía (`/r/[slug]/manifest.webmanifest`), pero dos de sus
// campos no eran editables y salían mal:
//   - `short_name`: se recortaba el nombre a 12 caracteres, así que
//     "Restaurante La Parrilla" se instalaba como "Restaurante ".
//   - `background_color`: era el beige de Resurte.me escrito a mano, así que un
//     restaurante de marca oscura veía un destello claro al abrir su app.
//
// 00159 añadió las dos columnas; 00160 las dejó fuera del UPDATE del dueño, de
// modo que se escriben **solo** por `saveAppBrand` (service role). Aquí vive la
// validación que ese único camino aplica, para que el navegador y el servidor
// no puedan discrepar sobre qué es un valor aceptable.
//
// La regla del archivo: **vacío significa "derívalo", no "bórralo"**. NULL es
// un estado legítimo (el manifest calcula el valor como antes de 00159); una
// cadena inválida nunca lo es.
// ============================================================

import { MANIFEST_SHORT_NAME_MAX } from "./foodos-seo"

export { MANIFEST_SHORT_NAME_MAX }

/** Resultado de validar un campo del manifest. `error` gana sobre `value`. */
export interface AppBrandField {
  value: string | null
  error: string | null
}

/**
 * Nombre bajo el icono. Android e iOS lo recortan alrededor de 12 caracteres;
 * pasado ese punto el usuario ve un nombre a medias, así que se rechaza en vez
 * de recortarlo en silencio (que es justo el bug que 00159 vino a arreglar).
 */
export function normalizeAppShortName(raw?: string | null): AppBrandField {
  const clean = (raw ?? "").replace(/\s+/g, " ").trim()
  if (!clean) return { value: null, error: null }
  if (clean.length > MANIFEST_SHORT_NAME_MAX) {
    return {
      value: null,
      error: `El nombre bajo el icono no puede pasar de ${MANIFEST_SHORT_NAME_MAX} caracteres: es lo que alcanza a mostrar el teléfono`,
    }
  }
  return { value: clean, error: null }
}

/**
 * Fondo de la pantalla de arranque. Se acepta la forma corta (`#abc`) y se
 * expande a la larga: es una conversión sin pérdida y evita rechazar un color
 * que el dueño escribió bien. La CHECK de 00159 solo admite la forma larga, así
 * que expandir aquí es lo que mantiene la base y el formulario de acuerdo.
 */
export function normalizeAppBackgroundColor(raw?: string | null): AppBrandField {
  const clean = (raw ?? "").trim().toLowerCase()
  if (!clean) return { value: null, error: null }

  const short = clean.match(/^#([0-9a-f]{3})$/)
  if (short) {
    const [r = "", g = "", b = ""] = (short[1] ?? "").split("")
    return { value: `#${r}${r}${g}${g}${b}${b}`, error: null }
  }

  if (!/^#[0-9a-f]{6}$/.test(clean)) {
    return { value: null, error: "Escribe el color en hexadecimal, por ejemplo #1A2B3C" }
  }
  return { value: clean, error: null }
}

export type AppBrandStepKey =
  | "logo"
  | "theme_color"
  | "short_name"
  | "background"
  | "published"
  | "menu"

export interface AppBrandStep {
  key: AppBrandStepKey
  done: boolean
  /** A dónde ir para resolverlo. Ausente cuando ya está hecho. */
  href?: string
}

export interface AppBrandInput {
  logo_url?: string | null
  theme_color?: string | null
  app_short_name?: string | null
  app_background_color?: string | null
  status?: string | null
  menuItemCount: number
}

/**
 * Qué le falta a la app instalada para verse como una app y no como una web
 * con icono. Todo sale de datos que ya existen: no se pide nada nuevo al dueño.
 *
 * `published` no es cosmético: si el restaurante está en borrador, el comensal
 * instala la app y al abrirla no carga nada.
 *
 * `href` solo aparece en los pasos pendientes — un paso hecho no tiene nada que
 * resolver, y así la UI no puede mostrar un "ve a arreglarlo" sobre algo sano.
 */
export function appBrandChecklist(input: AppBrandInput): AppBrandStep[] {
  const steps: Array<Omit<AppBrandStep, "href"> & { href?: string }> = [
    {
      key: "logo",
      done: Boolean(input.logo_url?.trim()),
      href: "/panel/foodos/restaurante",
    },
    {
      key: "theme_color",
      done: Boolean(input.theme_color?.trim()),
      href: "/panel/foodos/restaurante",
    },
    {
      key: "short_name",
      done: Boolean(input.app_short_name?.trim()),
    },
    {
      key: "background",
      done: Boolean(input.app_background_color?.trim()),
    },
    {
      key: "published",
      done: input.status === "active",
      href: "/panel/foodos/restaurante",
    },
    {
      key: "menu",
      done: input.menuItemCount > 0,
      href: "/panel/foodos/menu",
    },
  ]

  return steps.map((step) => (step.done ? { key: step.key, done: true } : step))
}

export interface AppBrandProgress {
  done: number
  total: number
  ratio: number
  pending: AppBrandStep[]
}

export function appBrandProgress(steps: AppBrandStep[]): AppBrandProgress {
  const done = steps.filter((step) => step.done)
  const pending = steps.filter((step) => !step.done)
  return {
    done: done.length,
    total: steps.length,
    ratio: steps.length === 0 ? 0 : done.length / steps.length,
    pending,
  }
}
