import type { City } from "@/types"

export const MEXICO_CITIES: City[] = [
  {
    id: 1,
    name: "Ciudad de México",
    slug: "cdmx",
    state: "CDMX",
    lat: 19.432608,
    lng: -99.133209,
    is_active: false,
  },
  {
    id: 2,
    name: "Guadalajara",
    slug: "guadalajara",
    state: "Jalisco",
    lat: 20.659699,
    lng: -103.349609,
    is_active: false,
  },
  {
    id: 3,
    name: "Monterrey",
    slug: "monterrey",
    state: "Nuevo León",
    lat: 25.686613,
    lng: -100.316116,
    is_active: false,
  },
  {
    id: 4,
    name: "Puebla",
    slug: "puebla",
    state: "Puebla",
    lat: 19.041297,
    lng: -98.2062,
    is_active: false,
  },
  {
    id: 5,
    name: "Toluca",
    slug: "toluca",
    state: "Estado de México",
    lat: 19.282608,
    lng: -99.655746,
    is_active: false,
  },
  {
    id: 6,
    name: "Querétaro",
    slug: "queretaro",
    state: "Querétaro",
    lat: 20.588793,
    lng: -100.389885,
    is_active: false,
  },
  {
    id: 7,
    name: "León",
    slug: "leon",
    state: "Guanajuato",
    lat: 21.116667,
    lng: -101.666667,
    is_active: false,
  },
  {
    id: 8,
    name: "Tijuana",
    slug: "tijuana",
    state: "Baja California",
    lat: 32.514946,
    lng: -117.038247,
    is_active: false,
  },
  {
    id: 9,
    name: "Mérida",
    slug: "merida",
    state: "Yucatán",
    lat: 20.97537,
    lng: -89.616959,
    is_active: false,
  },
  {
    id: 10,
    name: "San Luis Potosí",
    slug: "san-luis-potosi",
    state: "San Luis Potosí",
    lat: 22.14982,
    lng: -100.97916,
    is_active: false,
  },
  {
    id: 11,
    name: "Aguascalientes",
    slug: "aguascalientes",
    state: "Aguascalientes",
    lat: 21.881796,
    lng: -102.291267,
    is_active: false,
  },
  {
    id: 12,
    name: "Hermosillo",
    slug: "hermosillo",
    state: "Sonora",
    lat: 29.072967,
    lng: -110.955917,
    is_active: false,
  },
  {
    id: 13,
    name: "Saltillo",
    slug: "saltillo",
    state: "Coahuila",
    lat: 25.42318,
    lng: -101.005211,
    is_active: false,
  },
  {
    id: 14,
    name: "Culiacán",
    slug: "culiacan",
    state: "Sinaloa",
    lat: 24.809065,
    lng: -107.394012,
    is_active: false,
  },
  {
    id: 15,
    name: "Morelia",
    slug: "morelia",
    state: "Michoacán",
    lat: 19.700678,
    lng: -101.184296,
    is_active: false,
  },
  {
    id: 16,
    name: "Chihuahua",
    slug: "chihuahua",
    state: "Chihuahua",
    lat: 28.635277,
    lng: -106.088882,
    is_active: true,
  },
  {
    id: 17,
    name: "Veracruz",
    slug: "veracruz",
    state: "Veracruz",
    lat: 19.190277,
    lng: -96.153336,
    is_active: false,
  },
  {
    id: 18,
    name: "Villahermosa",
    slug: "villahermosa",
    state: "Tabasco",
    lat: 17.989456,
    lng: -92.927521,
    is_active: false,
  },
  {
    id: 19,
    name: "Cancún",
    slug: "cancun",
    state: "Quintana Roo",
    lat: 21.161908,
    lng: -86.851524,
    is_active: false,
  },
  {
    id: 20,
    name: "Torreón",
    slug: "torreon",
    state: "Coahuila",
    lat: 25.542843,
    lng: -103.40678,
    is_active: false,
  },
]

/**
 * Ciudad por defecto y única con operación activa. El resto del catálogo se
 * muestra como "próximamente" en el selector y en las superficies de cobertura.
 */
export const DEFAULT_CITY_SLUG = "chihuahua"

/** Ciudades donde ya se entrega hoy. */
export const ACTIVE_CITIES: City[] = MEXICO_CITIES.filter((c) => c.is_active)

/** Ciudades anunciadas como "muy pronto", sin operación todavía. */
export const COMING_SOON_CITIES: City[] = MEXICO_CITIES.filter((c) => !c.is_active)

/** ¿La ciudad tiene cobertura de entrega hoy? */
export function isCityActive(slug: string): boolean {
  return MEXICO_CITIES.some((c) => c.slug === slug && c.is_active)
}

/** Normaliza cualquier slug a una ciudad con cobertura (Chihuahua por defecto). */
export function resolveActiveCitySlug(slug: string | null | undefined): string {
  return slug && isCityActive(slug) ? slug : DEFAULT_CITY_SLUG
}

export const CITIES_BY_STATE = MEXICO_CITIES.reduce(
  (acc, city) => {
    const group = (acc[city.state] ??= [])
    group.push(city)
    return acc
  },
  {} as Record<string, typeof MEXICO_CITIES>
)
