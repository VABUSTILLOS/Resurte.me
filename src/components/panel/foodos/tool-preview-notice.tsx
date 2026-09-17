"use client"

/**
 * Franja que explica por qué una herramienta premium se ve completa.
 *
 * El nivel ya no decide si los campos se ven: la herramienta se renderiza
 * entera con datos reales (o vacíos si el nivel no alcanza) y aquí se avisa
 * que para guardar hace falta un nivel, con el atajo a la demo.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Eye, Lock, PlayCircle, ShieldCheck } from "lucide-react"
import { t } from "@/lib/i18n/es"
import type { FoodosFeature } from "@/lib/foodos-entitlements"
import { useToolDemo } from "@/hooks/use-tool-demo"
import { getToolDemo } from "@/components/panel/guide/tool-demo"
import { useEntitlements } from "./entitlements-context"
import { featureLabel } from "./nivel-gate"
import { TierIcon, tierLabel } from "./nivel-badge"

interface ToolPreviewNoticeProps {
  feature: FoodosFeature
  /** Ruta de la herramienta. Si tiene dataset demo se ofrece el botón. */
  pathname?: string
}

export default function ToolPreviewNotice({
  feature,
  pathname,
}: ToolPreviewNoticeProps) {
  const { lockedTier, isAdmin } = useEntitlements()
  const demo = useToolDemo()
  const current = usePathname()
  const route = pathname ?? current
  const hasDemo = !!getToolDemo(route)
  const required = lockedTier(feature)

  // Vista de administrador: todo desbloqueado, sin aviso de nivel.
  if (isAdmin) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
        <ShieldCheck aria-hidden className="w-3.5 h-3.5 shrink-0" />
        {t("foodos.entitlements.adminUnlockedNote")}
      </p>
    )
  }

  if (!required) return null

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
      <div className="flex items-start gap-2.5">
        <Eye aria-hidden className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-gray-900">
            {t("foodos.entitlements.previewTitle", { tool: featureLabel(feature) })}
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 whitespace-nowrap">
              <TierIcon tier={required} className="w-3 h-3 opacity-60" />
              {tierLabel(required)}
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {t("foodos.entitlements.previewBody", { tier: tierLabel(required) })}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {hasDemo && (
              <button
                type="button"
                onClick={demo.enableDemo}
                className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <PlayCircle aria-hidden className="w-3.5 h-3.5" />
                {t("foodos.entitlements.previewDemoCta")}
              </button>
            )}
            <Link
              href="/panel/foodos/tablero"
              className="touch-target inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#0E7A0E] hover:bg-emerald-50 transition-colors"
            >
              <Lock aria-hidden className="w-3.5 h-3.5" />
              {t("foodos.entitlements.previewUpgradeCta", { tier: tierLabel(required) })}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
