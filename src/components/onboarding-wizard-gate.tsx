"use client"

import { useEffect, useState } from "react"
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

export function OnboardingWizardGate() {
  const [shouldShow, setShouldShow] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
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
  }, [])

  if (!shouldShow) return null
  return <OnboardingWizard />
}
