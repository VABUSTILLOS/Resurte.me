"use client"

/**
 * Feature Flags & A/B Testing Framework
 *
 * Lightweight, no-dependency system for running growth experiments.
 * Client-side only — uses localStorage for persistence.
 *
 * Usage:
 *   - Feature flags: configure in .env.local as NEXT_PUBLIC_FEATURE_<NAME>=true
 *   - A/B tests: use useABTest(testId, variants) hook to split users
 *   - Track wins: trackABConversion(testId, variant, goal)
 */

// ============================================================
// FEATURE FLAGS
// ============================================================

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

// Next.js inlina `process.env.NEXT_PUBLIC_*` en el bundle de cliente solo con
// accesos estáticos. Un índice con accesos literales permite habilitar flags
// por build-time sin usar `process.env[key]` (que no se reemplaza en client).
const FEATURE_ENV_INDEX: Record<string, string | undefined> = {
  PROMO_BANNER: process.env.NEXT_PUBLIC_FEATURE_PROMO_BANNER,
}

export function isFeatureEnabled(flag: string): boolean {
  if (typeof window === "undefined") return false
  return FEATURE_ENV_INDEX[flag.toUpperCase()] === "true"
}

// ============================================================
// A/B TESTING
// ============================================================

interface ABVariant {
  key: string
  weight: number // 0-1, all weights must sum to 1
}

interface ABAssignment {
  testId: string
  variant: string
}

/**
 * Deterministic but random-looking assignment for a user + test combo.
 * Uses a simple hash so the same user always gets the same variant.
 */
function hashUserTest(userId: string, testId: string): number {
  let hash = 0
  const str = `${userId}:${testId}`
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0 // Convert to 32bit integer
  }
  return Math.abs(hash) / 2147483648 // Normalize to 0-1
}

/**
 * Get or create a persistent anonymous user ID for A/B testing.
 */
function getABUserId(): string {
  if (typeof window === "undefined") return "ssr"
  let id = localStorage.getItem("ab_user_id")
  if (!id) {
    id = `ab_${Math.random().toString(36).substring(2, 10)}`
    localStorage.setItem("ab_user_id", id)
  }
  return id
}

/**
 * Assign a user to an A/B test variant. Consistent per user + test.
 *
 * @param testId - Unique test identifier (e.g., "hero-cta-v2")
 * @param variants - Array of variants with weights (must sum to 1)
 * @returns The assigned variant key
 */
export function getABVariant(testId: string, variants: ABVariant[]): string {
  if (typeof window === "undefined") return variants[0]?.key ?? "control"

  const userId = getABUserId()

  // Check if user was already assigned (persistent across sessions)
  const stored = localStorage.getItem(`ab_${testId}`)
  if (stored && variants.some((v) => v.key === stored)) {
    return stored
  }

  // Deterministic assignment using hash
  const hash = hashUserTest(userId, testId)

  let cumulative = 0
  for (const variant of variants) {
    cumulative += variant.weight
    if (hash <= cumulative) {
      localStorage.setItem(`ab_${testId}`, variant.key)
      return variant.key
    }
  }

  // Fallback to last variant
  const last = variants[variants.length - 1]
  localStorage.setItem(`ab_${testId}`, last.key)
  return last.key
}

/**
 * Track an A/B test conversion event.
 * Sends to analytics if configured.
 *
 * @param testId - Test identifier
 * @param variant - Assigned variant key
 * @param goal - Conversion goal (e.g., "signup", "purchase", "click")
 */
export function trackABConversion(
  testId: string,
  variant: string,
  goal: string
): void {
  if (typeof window === "undefined") return

  // Track in GA4 if available
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", "experiment_conversion", {
      experiment_id: testId,
      variant_id: variant,
      goal,
    })
  }

  // Log locally for debugging
  if (process.env.NODE_ENV === "development") {
    console.log(`[AB Test] ${testId}:${variant} → ${goal}`)
  }
}

// ============================================================
// REACT HOOK
// ============================================================

import { useMemo } from "react"

/**
 * React hook for A/B testing in client components.
 *
 * @example
 * const variant = useABTest("hero-cta", [
 *   { key: "control", weight: 0.5 },
 *   { key: "free-sample", weight: 0.5 },
 * ])
 *
 * if (variant === "free-sample") return <HeroVariantB />
 * return <HeroControl />
 */
export function useABTest(testId: string, variants: ABVariant[]): string {
  return useMemo(() => getABVariant(testId, variants), [testId, variants])
}
