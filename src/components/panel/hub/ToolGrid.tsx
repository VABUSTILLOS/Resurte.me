"use client"

import { Fragment } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { t } from "@/lib/i18n/es"
import { minTierFor } from "@/lib/foodos-entitlements"
import { useEntitlements } from "@/components/panel/foodos/entitlements-context"
import { TierIcon, tierLabel } from "@/components/panel/foodos/nivel-badge"
import { TOOL_AREAS } from "./hub-data"
import type { HubCollection, Tool } from "./hub-data"
import type { CashbackTier } from "@/types"

/**
 * Píldora informativa del nivel que hace falta para USAR la herramienta.
 * Es informativa: no dims ni bloquea la tarjeta, que sigue abriendo la
 * herramienta en vista previa.
 */
function TierChip({ tier, className = "" }: { tier: CashbackTier; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500 whitespace-nowrap ${className}`}
    >
      <TierIcon tier={tier} className="w-3 h-3 opacity-60" />
      {tierLabel(tier)}
    </span>
  )
}

interface ToolGridProps {
  tools: Tool[]
  selectedCollection: HubCollection | null
}

export default function ToolGrid({ tools, selectedCollection }: ToolGridProps) {
  const { canUse } = useEntitlements()
  const isLocked = (tool: Tool) => !tool.standalone && !selectedCollection
  /**
   * Nivel que hace falta para USAR la capacidad premium. No bloquea la
   * tarjeta: la herramienta se abre en vista previa (se ve completa, con
   * demo) y el nivel solo se pide al guardar.
   */
  const levelLockOf = (tool: Tool) =>
    tool.feature && !canUse(tool.feature) ? minTierFor(tool.feature) : null

  return (
    <div id="panel-tools" className="flex flex-col gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
      {TOOL_AREAS.map((area) => {
        const areaTools = tools.filter((t) => t.area === area.key)
        if (areaTools.length === 0) return null
        return (
          <Fragment key={area.key}>
            <div className="flex items-center gap-2 px-1 pt-2 sm:pt-3 sm:col-span-2 lg:col-span-3">
              <area.icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                {area.label}
              </h2>
              {area.key === "sistema" && (
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Incluido gratis
                </span>
              )}
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            {areaTools.map((tool) => {
              const locked = isLocked(tool)
              const requiredTier = levelLockOf(tool)
              const blocked = locked
              return (
                <Link
                  key={tool.href}
                  href={blocked ? "#" : tool.href}
                  onClick={(e) => {
                    if (blocked) e.preventDefault()
                  }}
                  aria-disabled={blocked || undefined}
                  className={`group relative bg-white rounded-xl sm:rounded-2xl border border-gray-100 p-3 sm:p-5 flex items-center gap-3 sm:block hover:shadow-lg hover:border-gray-200 transition-all ${
                    blocked ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  <div className={`w-10 h-10 sm:w-11 sm:h-11 ${tool.bgColor} rounded-xl flex items-center justify-center shrink-0 sm:mb-4 group-hover:scale-110 transition-transform`}>
                    <tool.icon className={`w-5 h-5 ${tool.color}`} />
                  </div>
                  <div className="min-w-0 flex-1 sm:flex-none">
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 sm:mb-1.5 truncate sm:whitespace-normal sm:overflow-visible flex items-center gap-1.5 min-w-0 sm:block">
                      {tool.short && (
                        <span className={`shrink-0 sm:hidden text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${tool.bgColor} ${tool.color}`}>
                          {tool.short}
                        </span>
                      )}
                      <span className="truncate sm:whitespace-normal">{tool.title}</span>
                      {!locked && requiredTier && (
                        <TierChip tier={requiredTier} className="shrink-0 sm:hidden" />
                      )}
                    </h3>
                    <p className="hidden sm:block text-sm text-gray-500 leading-relaxed sm:mb-3">
                      {selectedCollection && tool.collectionDesc
                        ? tool.collectionDesc(selectedCollection.name)
                        : tool.description}
                    </p>
                    <p className="sm:hidden text-[13px] text-gray-500 leading-snug line-clamp-1">
                      {selectedCollection && tool.collectionDesc
                        ? tool.collectionDesc(selectedCollection.name)
                        : tool.description}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-[#0E7A0E] group-hover:gap-2 transition-all">
                    {locked ? (
                      t("panel.selectKitchen")
                    ) : requiredTier ? (
                      <>
                        {t("foodos.entitlements.previewOpenTool")}
                        <TierChip tier={requiredTier} />
                      </>
                    ) : (
                      t("panel.openTool")
                    )}
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <ArrowRight className="sm:hidden w-5 h-5 text-gray-300 shrink-0" />
                  {locked && (
                    <div className="absolute inset-0 bg-white/40 rounded-xl sm:rounded-2xl flex items-center justify-center">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                        🔒 {t("panel.locked")}
                      </span>
                    </div>
                  )}
                </Link>
              )
            })}
          </Fragment>
        )
      })}
    </div>
  )
}
