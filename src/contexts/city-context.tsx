"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"

import { MEXICO_CITIES } from "@/lib/cities"
import { nearestCitySlugTo } from "@/lib/geo-city"
import type { City } from "@/types"

interface CityProviderProps {
  children: ReactNode
  initialCitySlug?: string | null
}

interface CityContextValue {
  city: City | null
  setCity: (slug: string, options?: { manual?: boolean }) => void
  cities: typeof MEXICO_CITIES
  isLoading: boolean
  isDetecting: boolean
  detectionError: string | null
  requestBrowserLocation: () => Promise<City | null>
  /** Origen de la ciudad actual: `auto` (IP), `manual` (elección/GPS) o null. */
  citySource: CitySource | null
}

const CityContext = createContext<CityContextValue | null>(null)

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

/** `auto` = la puso la geolocalización por IP; `manual` = la eligió el visitante. */
export type CitySource = "auto" | "manual"

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match && match[1] ? decodeURIComponent(match[1]) : null
}

function getCityFromCookie(): string | null {
  return readCookie("city-slug")
}

/** Origen con el que el proxy marcó la ciudad (cookie `city-source`). */
export function getCitySourceFromCookie(): CitySource | null {
  const value = readCookie("city-source")
  return value === "auto" || value === "manual" ? value : null
}

/**
 * `manual: true` marca la elección en el selector para que el proxy la respete
 * por encima de la geolocalización por IP (`city-source=manual`). El resto de
 * escrituras dejan el origen intacto: navegar a una ciudad no es elegirla.
 */
function setCityCookie(slug: string, manual = false) {
  document.cookie = `city-slug=${slug};max-age=${COOKIE_MAX_AGE};path=/`
  if (manual) {
    document.cookie = `city-source=manual;max-age=${COOKIE_MAX_AGE};path=/`
  }
}

function getCityFromLocalStorage(): string | null {
  try {
    return localStorage.getItem("selected-city")
  } catch {
    return null
  }
}

function setCityLocalStorage(slug: string) {
  try {
    localStorage.setItem("selected-city", slug)
  } catch {
    // localStorage may not be available
  }
}

export const DEFAULT_CITY_SLUG = "chihuahua"

export function CityProvider({ children, initialCitySlug }: CityProviderProps) {
  const [city, setCityState] = useState<City | null>(() => {
    // Inicialización DETERMINÍSTICA: el layout raíz ya no lee cookies() en el
    // servidor (eso convertía todas las rutas en SSR por request). Server y
    // cliente renderizan la misma ciudad inicial (prop o default) para evitar
    // hydration mismatch; la ciudad persistida en cookie/localStorage se
    // adopta en el efecto de montaje de abajo.
    // Si el slug persistido ya no existe en MEXICO_CITIES, se auto-sana a la
    // ciudad por defecto en lugar de dejar `city` en null (que colgaba el
    // checkout y el modal de upsell).
    const slug = initialCitySlug || DEFAULT_CITY_SLUG
    const found = MEXICO_CITIES.find((c) => c.slug === slug)
    const defaultCity = MEXICO_CITIES.find((c) => c.slug === DEFAULT_CITY_SLUG)
    return (found ?? defaultCity ?? MEXICO_CITIES[0] ?? null) as City | null
  })
  // Derived: isLoading is true only during SSR (city not yet computed from cookies)
  const isLoading = city === null
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionError, setDetectionError] = useState<string | null>(null)
  // Origen de la ciudad: lo fija la cookie que escribe el proxy (IP) o el
  // propio visitante (selector / ubicación). Arranca en null para que el
  // primer render no dependa de cookies (hydration determinista).
  const [citySource, setCitySource] = useState<CitySource | null>(null)

  // Persist the selected city so subsequent visits keep it.
  // Prioridad: cookie > localStorage. Si hay cookie, esa manda y además se
  // sincroniza localStorage. Si NO hay cookie pero sí localStorage (p.ej.
  // sesión previa), se promueve ese valor a cookie en lugar de pisarlo con
  // el default — antes ambos divergían y cada mount reseteaba la ciudad.
  // Además adopta la ciudad persistida si difiere de la inicial (el estado
  // inicial es siempre el default para que server y cliente coincidan).
  useEffect(() => {
    const cookieSlug = getCityFromCookie()
    const cookieSource = getCitySourceFromCookie()
    const lsSlug = getCityFromLocalStorage()
    let effective = cookieSlug || lsSlug || DEFAULT_CITY_SLUG
    // Auto-sanear valores inválidos: si el slug persistido ya no existe en el
    // catálogo, se promueve el default (evita `city` null en futuras visitas).
    if (!MEXICO_CITIES.some((c) => c.slug === effective)) {
      effective = DEFAULT_CITY_SLUG
    }
    if (!cookieSlug) {
      setCityCookie(effective)
    }
    // Diferido a microtask: adoptar la ciudad persistida tras el mount sin
    // setState síncrono dentro del efecto (evita renders en cascada).
    void Promise.resolve().then(() => {
      setCitySource(cookieSource)
      setCityState((current) => {
        if (current?.slug === effective) return current
        const found = MEXICO_CITIES.find((c) => c.slug === effective)
        return found ? (found as City) : current
      })
    })
  }, [])

  const setCity = useCallback((slug: string, options?: { manual?: boolean }) => {
    const found = MEXICO_CITIES.find((c) => c.slug === slug)
    if (found) {
      setCityState(found as City)
      setCityCookie(slug, options?.manual === true)
      if (options?.manual) setCitySource("manual")
      setCityLocalStorage(slug)
    }
  }, [])

  /**
   * Solicita la ubicación del navegador y devuelve la ciudad más cercana
   * (o null si no se pudo resolver). La ciudad detectada se marca como
   * elección: el GPS es más preciso que la IP y no debe ser pisado por ella.
   */
  const requestBrowserLocation = useCallback(async (): Promise<City | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setDetectionError("Tu navegador no soporta geolocalización.")
      return null
    }

    setIsDetecting(true)
    setDetectionError(null)

    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (result) => resolve(result),
        (error) => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              setDetectionError("Permiso de ubicación denegado. Selecciona tu ciudad manualmente.")
              break
            case error.TIMEOUT:
              setDetectionError("Tiempo de espera agotado. Intenta de nuevo o selecciona manualmente.")
              break
            default:
              setDetectionError("No pudimos obtener tu ubicación. Selecciona tu ciudad manualmente.")
          }
          resolve(null)
        },
        { timeout: 10000, maximumAge: 60000 }
      )
    })

    setIsDetecting(false)
    if (!position) return null

    const slug = nearestCitySlugTo(position.coords.latitude, position.coords.longitude)
    const closestCity = slug ? MEXICO_CITIES.find((c) => c.slug === slug) : undefined
    if (!closestCity) {
      setDetectionError("No pudimos determinar tu ciudad.")
      return null
    }

    const detected = closestCity as City
    setCityState(detected)
    setCityCookie(detected.slug, true)
    setCitySource("manual")
    setCityLocalStorage(detected.slug)
    return detected
  }, [])

  const value = useMemo<CityContextValue>(
    () => ({
      city,
      setCity,
      cities: MEXICO_CITIES,
      isLoading,
      isDetecting,
      detectionError,
      requestBrowserLocation,
      citySource,
    }),
    [
      city,
      setCity,
      isLoading,
      isDetecting,
      detectionError,
      requestBrowserLocation,
      citySource,
    ]
  )

  return <CityContext.Provider value={value}>{children}</CityContext.Provider>
}

export function useCity() {
  const ctx = useContext(CityContext)
  if (!ctx) {
    throw new Error("useCity must be used within a CityProvider")
  }
  return ctx
}
