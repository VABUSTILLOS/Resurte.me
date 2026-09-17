"use client"

/**
 * Insignia del nivel de compras. Se usa en el hub y en las cabeceras de las
 * herramientas premium para que el restaurantero vea de un vistazo qué tiene
 * y qué le falta, sin abrir nada.
 */

import { Crown, Gem, Leaf, Medal, type LucideIcon } from "lucide-react"
import { t } from "@/lib/i18n/es"
import { TIER_LABEL_KEY } from "@/lib/foodos-entitlements"
import type { CashbackTier } from "@/types"

interface TierStyle {
  icon: LucideIcon
  /** Píldora: fondo + texto. */
  pill: string
  /** Solo el icono, sobre fondo neutro. */
  iconClass: string
}

const TIER_STYLE: Record<CashbackTier, TierStyle> = {
  Verde: {
    icon: Leaf,
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    iconClass: "text-emerald-600",
  },
  Plata: {
    icon: Medal,
    pill: "bg-slate-100 text-slate-700 border-slate-300",
    iconClass: "text-slate-500",
  },
  Oro: {
    icon: Crown,
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    iconClass: "text-amber-500",
  },
  Diamante: {
    icon: Gem,
    pill: "bg-sky-50 text-sky-700 border-sky-200",
    iconClass: "text-sky-500",
  },
}

export function tierLabel(tier: CashbackTier): string {
  return t(TIER_LABEL_KEY[tier])
}

export function TierIcon({ tier, className }: { tier: CashbackTier; className?: string }) {
  const Icon = TIER_STYLE[tier].icon
  return <Icon aria-hidden className={className ?? `w-4 h-4 ${TIER_STYLE[tier].iconClass}`} />
}

interface NivelBadgeProps {
  tier: CashbackTier
  /** "earned" = ganado con compras; "granted" = otorgado por Resurte.me. */
  source?: "earned" | "granted"
  size?: "sm" | "md"
  className?: string
}

/** Píldora con el nombre del nivel. */
export default function NivelBadge({
  tier,
  source = "earned",
  size = "sm",
  className = "",
}: NivelBadgeProps) {
  const style = TIER_STYLE[tier]
  const padding = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
  const title =
    source === "granted" ? t("foodos.entitlements.overriddenNote") : t("foodos.entitlements.tierLabel", { tier: tierLabel(tier) })

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap ${style.pill} ${padding} ${className}`}
    >
      <TierIcon tier={tier} className={`w-3.5 h-3.5 ${style.iconClass}`} />
      {tierLabel(tier)}
    </span>
  )
}
