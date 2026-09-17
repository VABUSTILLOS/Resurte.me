"use client"

/**
 * Aviso de nivel al intentar USAR una capacidad premium.
 *
 * El nivel ya no oculta la herramienta: se ve completa y con demo. Este
 * diálogo es lo único que aparece cuando la acción de verdad se va a
 * ejecutar (guardar, cobrar, enviar), y explica cuánto falta para el nivel
 * con el mismo progreso de la fuente única (`wallet-progress`).
 */

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { t } from "@/lib/i18n/es"
import { FOODOS_FEATURES, type FoodosFeature } from "@/lib/foodos-entitlements"
import { useEntitlements } from "./entitlements-context"
import { featureDescription, featureLabel, NivelProgress } from "./nivel-gate"
import NivelBadge, { TierIcon, tierLabel } from "./nivel-badge"

interface TierUpsellDialogProps {
  open: boolean
  feature: FoodosFeature
  onClose: () => void
}

export default function TierUpsellDialog({
  open,
  feature,
  onClose,
}: TierUpsellDialogProps) {
  const { entitlements: e, lockedTier } = useEntitlements()
  const required = lockedTier(feature) ?? FOODOS_FEATURES[feature].minTier

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabelledby="tier-upsell-title"
      maxWidthClass="max-w-sm"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex w-10 h-10 rounded-full bg-gray-50 items-center justify-center shrink-0">
            <TierIcon tier={required} className="w-5 h-5 opacity-50" />
          </span>
          <div className="min-w-0">
            <h4 id="tier-upsell-title" className="font-bold text-gray-900">
              {t("foodos.entitlements.upsellTitle", { tier: tierLabel(required) })}
            </h4>
            <p className="mt-0.5 text-xs font-medium text-gray-500">
              {featureLabel(feature)}
            </p>
          </div>
        </div>

        <p className="mt-3 text-sm text-gray-500">{featureDescription(feature)}</p>
        <p className="mt-3 text-sm text-gray-500">
          {t("foodos.entitlements.upsellBody", { tier: tierLabel(required) })}
        </p>

        <div className="mt-4 rounded-xl bg-gray-50 p-4">
          <NivelProgress />
        </div>

        <div className="mt-4 flex items-center justify-center">
          <NivelBadge
            tier={e.tier}
            source={e.overridden ? "granted" : "earned"}
            size="md"
          />
        </div>

        <div className="mt-5 flex gap-3">
          <Link
            href="/panel/foodos/tablero"
            onClick={onClose}
            className="touch-target flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0c6b0c] transition-colors"
          >
            <Sparkles aria-hidden className="w-4 h-4" />
            {t("foodos.entitlements.upsellConfirm")}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="touch-target flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm"
          >
            {t("foodos.entitlements.upsellCancel")}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
