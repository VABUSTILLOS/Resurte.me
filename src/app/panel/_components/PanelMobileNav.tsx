"use client"

import Link from "next/link"
import { Fragment } from "react"
import { usePathname } from "next/navigation"
import { LayoutGrid, Lock, X } from "lucide-react"
import { TOOLS, TOOL_AREAS } from "@/components/panel/hub/hub-data"
import type { RestaurantCollection } from "@/types"
import { t } from "@/lib/i18n/es"

interface PanelMobileNavProps {
  open: boolean
  onClose: () => void
  selectedCollection: RestaurantCollection | null
}

export function PanelMobileNav({ open, onClose, selectedCollection }: PanelMobileNavProps) {
  const pathname = usePathname()

  if (!open) return null

  const isActive = (href: string) =>
    href === "/panel" ? pathname === "/panel" : pathname === href || pathname.startsWith(href + "/")

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[65] lg:hidden" onClick={onClose} aria-hidden="true" />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("panel.title")}
        className="fixed inset-x-0 bottom-0 z-[70] lg:hidden bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto animate-slide-up pb-[env(safe-area-inset-bottom)]"
      >
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 p-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-[#0E7A0E]" />
            {t("panel.title")}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors touch-target"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <nav className="p-3 flex flex-col gap-1">
          <Link
            href="/panel"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
              isActive("/panel") ? "bg-[#F0FDF4]" : "hover:bg-gray-50"
            }`}
          >
            <span className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
              <LayoutGrid
                className={`w-4 h-4 ${isActive("/panel") ? "text-[#0E7A0E]" : "text-gray-500"}`}
              />
            </span>
            <span
              className={`flex-1 min-w-0 text-sm font-medium truncate ${
                isActive("/panel") ? "text-[#0E7A0E]" : "text-gray-700"
              }`}
            >
              Inicio del panel
            </span>
            {isActive("/panel") && (
              <span className="text-xs font-semibold text-[#0E7A0E] shrink-0">{t("panel.current")}</span>
            )}
          </Link>

          {TOOL_AREAS.map((area) => {
            const areaTools = TOOLS.filter((tool) => tool.area === area.key)
            if (areaTools.length === 0) return null
            return (
              <Fragment key={area.key}>
                <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
                  <area.icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    {area.label}
                  </span>
                  {area.key === "sistema" && (
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Incluido gratis
                    </span>
                  )}
                </div>
                {areaTools.map((tool) => {
                  const locked = !tool.standalone && !selectedCollection
                  const active = isActive(tool.href)
                  return (
                    <Link
                      key={tool.href}
                      href={locked ? "#" : tool.href}
                      onClick={(e) => {
                        if (locked) e.preventDefault()
                        else onClose()
                      }}
                      aria-disabled={locked}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
                        active ? "bg-[#F0FDF4]" : "hover:bg-gray-50"
                      } ${locked ? "opacity-50" : ""}`}
                    >
                      <span
                        className={`w-9 h-9 ${tool.bgColor} rounded-lg flex items-center justify-center shrink-0`}
                      >
                        <tool.icon className={`w-4 h-4 ${tool.color}`} />
                      </span>
                      <span
                        className={`flex-1 min-w-0 text-sm font-medium truncate ${
                          active ? "text-[#0E7A0E]" : "text-gray-700"
                        }`}
                      >
                        {tool.title}
                      </span>
                      {locked ? (
                        <Lock className="w-4 h-4 text-gray-300 shrink-0" aria-hidden="true" />
                      ) : (
                        active && (
                          <span className="text-xs font-semibold text-[#0E7A0E] shrink-0">
                            {t("panel.current")}
                          </span>
                        )
                      )}
                    </Link>
                  )
                })}
              </Fragment>
            )
          })}
        </nav>
      </div>
    </>
  )
}
