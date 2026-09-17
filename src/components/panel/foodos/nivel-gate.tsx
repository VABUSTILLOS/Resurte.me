"use client"

/**
 * Pantalla de bloqueo por nivel para una capacidad premium.
 *
 * No es un muro de pago: explica exactamente cuánto falta para desbloquearla
 * con las compras que el restaurantero ya hace en Resurte.me. El progreso es
 * el mismo de la fuente única (`wallet-progress`), así que nunca contradice a
 * la sección de recompensas.
 */

import Link from "next/link"
import { ArrowRight, Lock, Sparkles } from "lucide-react"
import { t } from "@/lib/i18n/es"
import { FOODOS_FEATURES, type FoodosFeature } from "@/lib/foodos-entitlements"
import { useEntitlements } from "./entitlements-context"
import NivelBadge, { TierIcon, tierLabel } from "./nivel-badge"

/** Nombre legible de una capacidad. */
export function featureLabel(feature: FoodosFeature): string {
  return t(FOODOS_FEATURES[feature].labelKey)
}

export function featureDescription(feature: FoodosFeature): string {
  return t(FOODOS_FEATURES[feature].descriptionKey)
}

/** Formato corto de pesos para el progreso ("$1,250"). */
function mxn(amount: number): string {
  return `$${Math.round(amount).toLocaleString("es-MX")}`
}

/**
 * Detalle del avance: consumo de la semana, cuánto falta y a qué nivel lleva.
 * Se usa dentro del gate y también en la tarjeta de nivel del hub.
 */
export function NivelProgress({ className = "" }: { className?: string }) {
  const { entitlements: e } = useEntitlements()
  const atMax = e.nextTier === null
  const qualified = e.remainingToQualify <= 0
  const target = e.qualifyingWeeksThisMonth + (e.weeksToNextTier ?? 0)

  return (
    <dl className={`space-y-1.5 text-sm ${className}`} aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-gray-500">{t("foodos.entitlements.weekSpend", { spend: mxn(e.weekSpend) })}</dt>
        <dd className={qualified ? "font-medium text-emerald-600" : "font-medium text-gray-900"}>
          {qualified
            ? t("foodos.entitlements.weekQualified")
            : t("foodos.entitlements.remainingToQualify", { amount: mxn(e.remainingToQualify) })}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-gray-500">
          {t("foodos.entitlements.weeksProgress", {
            count: e.qualifyingWeeksThisMonth,
            target,
          })}
        </dt>
        <dd className="font-medium text-gray-900">
          {atMax ? t("foodos.entitlements.maxTier") : null}
        </dd>
      </div>
    </dl>
  )
}

interface NivelGateProps {
  feature: FoodosFeature
  /** Contenido opcional extra (por ejemplo, un botón para volver). */
  children?: React.ReactNode
  /**
   * `page` ocupa la pantalla completa de la herramienta; `inline` es una
   * versión compacta para bloquear una sección dentro de una tarjeta.
   */
  variant?: "page" | "inline"
}

/**
 * Sustituye al contenido de una herramienta premium cuando el nivel no
 * alcanza. Nunca se renderiza si la capacidad está disponible.
 */
export default function NivelGate({
  feature,
  children,
  variant = "page",
}: NivelGateProps) {
  const { entitlements: e } = useEntitlements()
  const info = FOODOS_FEATURES[feature]
  const required = info.minTier

  if (variant === "inline") {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="relative inline-flex">
            <TierIcon tier={required} className="w-4 h-4 opacity-40" />
            <Lock
              aria-hidden
              className="absolute -bottom-0.5 -right-1 w-3 h-3 text-gray-400"
            />
          </span>
          {t("foodos.entitlements.lockedTitle", { tier: tierLabel(required) })}
        </p>
        <p className="mt-1.5 text-xs text-gray-500">{featureDescription(feature)}</p>
        <div className="mt-3">
          <NivelProgress />
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto mt-8">
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <div className="relative w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
          <TierIcon tier={required} className="w-7 h-7 opacity-40" />
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center">
            <Lock aria-hidden className="w-3.5 h-3.5 text-gray-400" />
          </span>
        </div>

        <h2 className="text-lg font-semibold text-gray-900">
          {t("foodos.entitlements.lockedTitle", { tier: tierLabel(required) })}
        </h2>
        <p className="mt-1 text-sm font-medium text-gray-900">{featureLabel(feature)}</p>
        <p className="mt-2 text-sm text-gray-500">{featureDescription(feature)}</p>

        <div className="mt-6 rounded-xl bg-gray-50 p-4 text-left">
          <NivelProgress />
          {e.nextTier && e.unlocksNext.length > 0 && (
            <p className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
              {t("foodos.entitlements.unlocksNext", { tier: tierLabel(e.nextTier) })}{" "}
              {e.unlocksNext.map((f) => featureLabel(f)).join(" · ")}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-3">
          <NivelBadge tier={e.tier} source={e.overridden ? "granted" : "earned"} size="md" />
        </div>

        <Link
          href="/panel/foodos/tablero"
          className="touch-target inline-flex items-center justify-center gap-1.5 mt-5 px-4 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-medium hover:bg-[#0c6b0c] transition-colors"
        >
          <Sparkles aria-hidden className="w-4 h-4" />
          {t("foodos.entitlements.lockedCta")}
          <ArrowRight aria-hidden className="w-4 h-4" />
        </Link>

        {children}
      </div>
    </div>
  )
}
