"use client"

/**
 * Experimentos A/B del carrito de alta conversión.
 *
 * Sobre el framework genérico de `feature-flags.ts` (asignación sticky por
 * usuario + tracking GA4), añade:
 *  - registro central de experimentos activos del checkout,
 *  - hook `useCheckoutExperiment` que además registra la impresión
 *    (`experiment_view`) una sola vez por sesión,
 *  - `trackActiveExperimentsConversion`, que atribuye la conversión (p.ej.
 *    "purchase") a TODOS los experimentos con variante asignada en
 *    localStorage — sin cablear cada experimento en la página de confirmación.
 */

import { useEffect, useRef } from "react"
import { useABTest, trackABConversion } from "@/lib/feature-flags"
import { logger } from "@/lib/logger"

export interface CheckoutExperiment {
  testId: string
  variants: Array<{ key: string; weight: number }>
}

/** Experimentos activos del checkout. Pesos deben sumar 1. */
export const CHECKOUT_EXPERIMENTS = {
  /** Copy del encabezado del paso de order bumps. */
  bumpsHeadline: {
    testId: "checkout-bumps-headline-v1",
    variants: [
      { key: "control", weight: 0.5 },
      { key: "urgencia", weight: 0.5 },
    ],
  },
} as const satisfies Record<string, CheckoutExperiment>

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function trackExperimentView(testId: string, variant: string): void {
  if (typeof window === "undefined") return
  const dedupeKey = `ab_viewed_${testId}`
  try {
    if (sessionStorage.getItem(dedupeKey)) return
    sessionStorage.setItem(dedupeKey, "1")
  } catch {
    // sessionStorage no disponible — el evento puede duplicarse, aceptable
  }
  if (window.gtag) {
    window.gtag("event", "experiment_view", {
      experiment_id: testId,
      variant_id: variant,
    })
  }
}

/**
 * Hook para usar un experimento del registro en un componente cliente.
 * Devuelve la variante asignada y registra la impresión una vez por sesión.
 *
 * @example
 * const variant = useCheckoutExperiment(CHECKOUT_EXPERIMENTS.bumpsHeadline)
 * const headline = variant === "urgencia" ? "..." : "Agrega a tu pedido"
 */
export function useCheckoutExperiment(experiment: CheckoutExperiment): string {
  const variant = useABTest(experiment.testId, [...experiment.variants])
  const tracked = useRef(false)

  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    trackExperimentView(experiment.testId, variant)
  }, [experiment.testId, variant])

  return variant
}

/**
 * Atribuye una conversión a todos los experimentos con variante asignada
 * (claves `ab_<testId>` en localStorage). Llamar al confirmarse la compra.
 */
export function trackActiveExperimentsConversion(goal: string): void {
  if (typeof window === "undefined") return
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith("ab_") || key === "ab_user_id" || key.startsWith("ab_viewed_")) {
        continue
      }
      const variant = localStorage.getItem(key)
      if (!variant) continue
      trackABConversion(key.slice(3), variant, goal)
    }
  } catch (error) {
    logger.warn("abtest.conversion-failed", { error })
  }
}
