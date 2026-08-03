"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { MEXICO_CITIES } from "@/lib/cities"
import type { City } from "@/types"

interface CityContextValue {
  city: City | null
  setCity: (slug: string) => void
  cities: typeof MEXICO_CITIES
  isLoading: boolean
  isDetecting: boolean
  detectionError: string | null
  requestBrowserLocation: () => void
}

const CityContext = createContext<CityContextValue | null>(null)

function getCityFromCookie(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)city-slug=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

function setCityCookie(slug: string) {
  document.cookie = `city-slug=${slug};max-age=${60 * 60 * 24 * 30};path=/`
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

const DEFAULT_CITY_SLUG = "chihuahua"

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCityState] = useState<City | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionError, setDetectionError] = useState<string | null>(null)

  // On mount, read from cookie or localStorage; default to Chihuahua
  useEffect(() => {
    const slug =
      getCityFromCookie() || getCityFromLocalStorage() || DEFAULT_CITY_SLUG
    const found = MEXICO_CITIES.find((c) => c.slug === slug)
    if (found) {
      setCityState(found as City)
      // Persist the default so subsequent visits keep it
      if (!getCityFromCookie()) {
        setCityCookie(DEFAULT_CITY_SLUG)
        setCityLocalStorage(DEFAULT_CITY_SLUG)
      }
    }
    setIsLoading(false)
  }, [])

  const setCity = useCallback((slug: string) => {
    const found = MEXICO_CITIES.find((c) => c.slug === slug)
    if (found) {
      setCityState(found as City)
      setCityCookie(slug)
      setCityLocalStorage(slug)
    }
  }, [])

  /**
   * Solicita la ubicación del navegador y encuentra la ciudad más cercana.
   */
  const requestBrowserLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setDetectionError("Tu navegador no soporta geolocalización.")
      return
    }

    setIsDetecting(true)
    setDetectionError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords

        // Encontrar la ciudad más cercana por distancia euclidiana simple
        let closestCity: (typeof MEXICO_CITIES)[0] | null = null
        let minDistance = Infinity

        for (const c of MEXICO_CITIES) {
          const dLat = latitude - c.lat
          const dLng = longitude - c.lng
          const dist = dLat * dLat + dLng * dLng // squared distance
          if (dist < minDistance) {
            minDistance = dist
            closestCity = c
          }
        }

        if (closestCity) {
          setCityState(closestCity as City)
          setCityCookie(closestCity.slug)
          setCityLocalStorage(closestCity.slug)
        } else {
          setDetectionError("No pudimos determinar tu ciudad.")
        }
        setIsDetecting(false)
      },
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
        setIsDetecting(false)
      },
      { timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  return (
    <CityContext.Provider
      value={{
        city,
        setCity,
        cities: MEXICO_CITIES,
        isLoading,
        isDetecting,
        detectionError,
        requestBrowserLocation,
      }}
    >
      {children}
    </CityContext.Provider>
  )
}

export function useCity() {
  const ctx = useContext(CityContext)
  if (!ctx) {
    throw new Error("useCity must be used within a CityProvider")
  }
  return ctx
}
