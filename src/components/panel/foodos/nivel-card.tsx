"use client"

/**
 * Tarjeta de nivel en el hub: el restaurantero ve en qué nivel va, cuánto le
 * falta para la semana y qué se abre al siguiente escalón. Es el punto donde
 * el nivel deja de ser un dato escondido y se vuelve el motor de recompra.
 */

import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { t } from "@/lib/i18n/es"
import NivelBadge, { TierIcon, tierLabel } from "./nivel-badge"
import { featureLabel, NivelProgress } from "./nivel-gate"
import { useEntitlements } from "./entitlements-context"

export default function NivelCard() {
  const { entitlements: e } = useEntitlements()

  return (
    <section
      aria-label={t("foodos.entitlements.title")}
      className="mb-4 sm:mb-6 bg-white rounded-xl sm:rounded-2xl border border-gray-100 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900">{t("foodos.entitlements.title")}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t("foodos.entitlements.lockedBody")}</p>
        </div>
        <NivelBadge tier={e.tier} source={e.overridden ? "granted" : "earned"} />
      </div>

      <div className="mt-4">
        <NivelProgress />
      </div>

      {e.nextTier && e.unlocksNext.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <TierIcon tier={e.nextTier} className="w-4 h-4" />
            {t("foodos.entitlements.toNextTier", {
              count: e.weeksToNextTier ?? 0,
              tier: tierLabel(e.nextTier),
            })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {e.unlocksNext.map((feature) => (
              <li
                key={feature}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full"
              >
                <Sparkles aria-hidden className="w-3 h-3 text-gray-400" />
                {featureLabel(feature)}
              </li>
            ))}
          </ul>
          <Link
            href="/comer"
            className="touch-target inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-[#0E7A0E] hover:gap-2.5 transition-all"
          >
            {t("foodos.entitlements.lockedCta")}
            <ArrowRight aria-hidden className="w-4 h-4" />
          </Link>
        </div>
      )}
    </section>
  )
}
