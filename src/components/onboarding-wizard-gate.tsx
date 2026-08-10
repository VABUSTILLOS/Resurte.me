"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"

// El wizard usa framer-motion (~120KB). Se importa dinámicamente solo cuando
// el check determina que debe mostrarse, para no cargar framer-motion en el
// bundle de TODAS las páginas públicas (home, comer, blog, producto…).
const OnboardingWizard = dynamic(
  () => import("@/components/onboarding-wizard").then((m) => m.OnboardingWizard),
  {
    ssr: false,
    loading: () => null,
  },
)

const ONBOARDING_KEY = "onboarding-wizard-completed"

// El onboarding es exclusivo del área de comercios (negocio/panel/admin).
// Fuera de esas rutas (carrito, checkout, catálogo, home…) el wizard nunca
// debe aparecer: un cliente logueado vería un overlay full-screen que tapa la
// página (incluidos los order bumps) sin haber entrado al flujo de comercio.
const COMMERCE_ROUTES = ["/negocio", "/panel", "/admin"]

function isCommerceRoute(pathname: string | null): boolean {
  if (!pathname) return false
  return COMMERCE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export function OnboardingWizardGate() {
  const pathname = usePathname()
  const [shouldShow, setShouldShow] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      // Solo aplica al área de comercios. En rutas públicas nunca mostrar.
      if (!isCommerceRoute(pathname)) {
        setShouldShow(false)
        return
      }

      // Check localStorage first (síncrono, no descarga nada adicional)
      if (localStorage.getItem(ONBOARDING_KEY) === "true") return

      // Import dinámico: supabase/auth-js tampoco entra al bundle inicial
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      if (!supabase) return
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.user?.id) setShouldShow(true)
    }

    // Small delay so page renders first (mismo comportamiento que antes)
    const timer = setTimeout(check, 800)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pathname])

  if (!shouldShow) return null
  return <OnboardingWizard />
}
