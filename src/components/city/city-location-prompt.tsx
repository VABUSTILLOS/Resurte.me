"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2, MapPin, Navigation, X } from "lucide-react"

import { useCity } from "@/contexts/city-context"
import { CitySelector } from "@/components/city/city-selector"
import { MEXICO_CITIES } from "@/lib/cities"

const VALID_SLUGS = new Set(MEXICO_CITIES.map((c) => c.slug))

/** Solo la raíz y `/{ciudad}`: en páginas profundas navegar cambiaría la URL. */
function isCityRootPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return true
  const [first] = segments
  return segments.length === 1 && first !== undefined && VALID_SLUGS.has(first)
}

async function geolocationPermission(): Promise<PermissionState | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return null
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    })
    return status.state
  } catch {
    return null
  }
}

const DISMISS_KEY = "city-prompt-dismissed"

/**
 * La ciudad que resuelve la IP es una aproximación: los proveedores registran
 * bloques enteros en la ciudad de su sede (TotalPlay, por ejemplo, registra en
 * CDMX direcciones de Chihuahua). El navegador sí sabe dónde está el visitante,
 * así que la ubicación se usa como fuente principal y la IP solo como respaldo.
 *
 * No se abre un diálogo de permiso por sorpresa: si el permiso ya está
 * concedido la corrección es silenciosa; si no, se ofrece un aviso de un toque.
 * El resultado se guarda como elección (`city-source=manual`) y a partir de ahí
 * el proxy ya no vuelve a imponer la ciudad de la IP.
 */
export function CityLocationPrompt() {
  const { city, citySource, requestBrowserLocation, isDetecting, detectionError } =
    useCity()
  const pathname = usePathname()
  const router = useRouter()
  // `citySource` nace en null y lo resuelve CityProvider tras el mount, así que
  // el aviso nunca aparece en el HTML del servidor: no hay hydration mismatch
  // por leer sessionStorage en el primer render.
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1"
    } catch {
      return false
    }
  })
  const [showSelector, setShowSelector] = useState(false)
  const attempted = useRef(false)

  const onCityRoot = isCityRootPath(pathname)
  // Solo se corrige una ciudad que puso la IP: una elección no se discute.
  const shouldCorrect = onCityRoot && citySource === "auto" && !dismissed

  useEffect(() => {
    if (!shouldCorrect || attempted.current) return
    let cancelled = false

    void (async () => {
      const permission = await geolocationPermission()
      // `null` (permisos no soportados) o `prompt`: se deja el aviso.
      if (cancelled || permission !== "granted") return
      attempted.current = true
      const detected = await requestBrowserLocation()
      if (cancelled || !detected) return
      if (detected.slug !== city?.slug) router.replace(`/${detected.slug}`)
    })()

    return () => {
      cancelled = true
    }
  }, [shouldCorrect, city?.slug, requestBrowserLocation, router])

  const handleDismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // sessionStorage puede no estar disponible
    }
  }

  const handleDetect = async () => {
    const detected = await requestBrowserLocation()
    if (detected && detected.slug !== city?.slug) router.replace(`/${detected.slug}`)
  }

  if (!shouldCorrect) return null

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-[calc(5rem+var(--header-inset-top))] z-40 flex justify-center px-4">
        <div
          role="region"
          aria-label="Confirmar tu ciudad"
          className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-[12px] border border-[#E8E9EB] bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur"
        >
          <MapPin className="size-4 shrink-0 text-[#0E7A0E]" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-xs leading-snug text-[#343538]">
            {detectionError ? (
              detectionError
            ) : (
              <>
                Te ubicamos en{" "}
                <span className="font-semibold">{city?.name ?? "tu zona"}</span> por tu
                conexión. ¿Usamos tu ubicación exacta?
              </>
            )}
          </p>
          <button
            type="button"
            onClick={handleDetect}
            disabled={isDetecting}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#0E7A0E] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0D720D] disabled:opacity-60"
          >
            {isDetecting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Navigation className="size-3.5" aria-hidden="true" />
            )}
            Usar mi ubicación
          </button>
          <button
            type="button"
            onClick={() => setShowSelector(true)}
            className="hidden shrink-0 rounded-full px-2 py-1.5 text-xs font-medium text-[#5C6068] transition-colors hover:bg-[#F7F5F0] hover:text-[#242529] sm:inline-flex"
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Descartar aviso de ubicación"
            className="shrink-0 rounded-full p-1.5 text-[#5C6068] transition-colors hover:bg-[#F7F5F0] hover:text-[#242529]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {showSelector && <CitySelector onClose={() => setShowSelector(false)} />}
    </>
  )
}
