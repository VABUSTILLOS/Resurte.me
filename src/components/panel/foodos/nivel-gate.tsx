"use client"

/**
 * Pantalla de bloqueo por nivel para una capacidad premium.
 *
 * No es un muro de pago: explica exactamente cuánto falta para desbloquearla
 * con las compras que el restaurantero ya hace en Resurte.me. El progreso es
 * el mismo de la fuente única (`wallet-progress`), así que nunca contradice a
 * la sección de recompensas.
 */

import { t } from "@/lib/i18n/es"
import { FOODOS_FEATURES, type FoodosFeature } from "@/lib/foodos-entitlements"
import { useEntitlements } from "./entitlements-context"

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
 * Se usa dentro del aviso de vista previa y en la tarjeta de nivel del hub.
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
