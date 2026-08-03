import type { City } from "@/types"

export const MEXICO_CITIES: Omit<City, "id" | "is_active">[] = [
  {
    name: "Ciudad de México",
    slug: "cdmx",
    state: "CDMX",
    lat: 19.432608,
    lng: -99.133209,
  },
  {
    name: "Guadalajara",
    slug: "guadalajara",
    state: "Jalisco",
    lat: 20.659699,
    lng: -103.349609,
  },
  {
    name: "Monterrey",
    slug: "monterrey",
    state: "Nuevo León",
    lat: 25.686613,
    lng: -100.316116,
  },
  {
    name: "Puebla",
    slug: "puebla",
    state: "Puebla",
    lat: 19.041297,
    lng: -98.2062,
  },
  {
    name: "Toluca",
    slug: "toluca",
    state: "Estado de México",
    lat: 19.282608,
    lng: -99.655746,
  },
  {
    name: "Querétaro",
    slug: "queretaro",
    state: "Querétaro",
    lat: 20.588793,
    lng: -100.389885,
  },
  {
    name: "León",
    slug: "leon",
    state: "Guanajuato",
    lat: 21.116667,
    lng: -101.666667,
  },
  {
    name: "Tijuana",
    slug: "tijuana",
    state: "Baja California",
    lat: 32.514946,
    lng: -117.038247,
  },
  {
    name: "Mérida",
    slug: "merida",
    state: "Yucatán",
    lat: 20.97537,
    lng: -89.616959,
  },
  {
    name: "San Luis Potosí",
    slug: "san-luis-potosi",
    state: "San Luis Potosí",
    lat: 22.14982,
    lng: -100.97916,
  },
  {
    name: "Aguascalientes",
    slug: "aguascalientes",
    state: "Aguascalientes",
    lat: 21.881796,
    lng: -102.291267,
  },
  {
    name: "Hermosillo",
    slug: "hermosillo",
    state: "Sonora",
    lat: 29.072967,
    lng: -110.955917,
  },
  {
    name: "Saltillo",
    slug: "saltillo",
    state: "Coahuila",
    lat: 25.42318,
    lng: -101.005211,
  },
  {
    name: "Culiacán",
    slug: "culiacan",
    state: "Sinaloa",
    lat: 24.809065,
    lng: -107.394012,
  },
  {
    name: "Morelia",
    slug: "morelia",
    state: "Michoacán",
    lat: 19.700678,
    lng: -101.184296,
  },
  {
    name: "Chihuahua",
    slug: "chihuahua",
    state: "Chihuahua",
    lat: 28.635277,
    lng: -106.088882,
  },
  {
    name: "Veracruz",
    slug: "veracruz",
    state: "Veracruz",
    lat: 19.190277,
    lng: -96.153336,
  },
  {
    name: "Villahermosa",
    slug: "villahermosa",
    state: "Tabasco",
    lat: 17.989456,
    lng: -92.927521,
  },
  {
    name: "Cancún",
    slug: "cancun",
    state: "Quintana Roo",
    lat: 21.161908,
    lng: -86.851524,
  },
  {
    name: "Torreón",
    slug: "torreon",
    state: "Coahuila",
    lat: 25.542843,
    lng: -103.40678,
  },
]

export const CITIES_BY_STATE = MEXICO_CITIES.reduce(
  (acc, city) => {
    if (!acc[city.state]) acc[city.state] = []
    acc[city.state].push(city)
    return acc
  },
  {} as Record<string, typeof MEXICO_CITIES>
)
