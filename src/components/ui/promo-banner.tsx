"use client"

import { isFeatureEnabled, useABTest, trackABConversion } from "@/lib/feature-flags"
import Link from "next/link"

/**
 * PromoBanner — banner promocional controlado por feature flags.
 *
 * Sólo se renderiza si `NEXT_PUBLIC_FEATURE_PROMO_BANNER=true`. La variante de
 * copy es un A/B test (`promo-banner-v1`) que se registra en analytics al
 * hacer clic, para poder medir conversión antes de promocionar un banner.
 */
export function PromoBanner() {
  const enabled = isFeatureEnabled("PROMO_BANNER")
  const variant = useABTest("promo-banner-v1", [
    { key: "control", weight: 0.5 },
    { key: "cashback", weight: 0.5 },
  ])

  if (!enabled) return null

  const copy =
    variant === "cashback"
      ? "🔥 Hasta 5% de cashback en tu primera orden"
      : "🛒 Envío gratis en tu primera orden"

  const onCtaClick = () => {
    trackABConversion("promo-banner-v1", variant, "click")
  }

  return (
    <div className="bg-[#0E7A0E] text-white text-center text-sm py-2 px-4">
      <Link href="/recompensas" onClick={onCtaClick} className="underline-offset-2 hover:underline">
        {copy}
      </Link>
    </div>
  )
}
