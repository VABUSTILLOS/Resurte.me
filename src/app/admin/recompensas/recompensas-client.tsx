"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Gift, FileText, PackageCheck } from "lucide-react"
import { ServiciosTab } from "./servicios-tab"
import { FacturasTab } from "./facturas-tab"
import { CanjesTab } from "./canjes-tab"

const TABS = [
  {
    id: "servicios",
    label: "Servicios",
    description: "Catálogo canjeable de la Tienda de Crecimiento",
    icon: Gift,
  },
  {
    id: "canjes",
    label: "Canjes",
    description: "Servicios que los clientes pagaron con créditos",
    icon: PackageCheck,
  },
  {
    id: "facturas",
    label: "Facturas",
    description: "Cola de revisión de facturas de clientes",
    icon: FileText,
  },
] as const

type TabId = (typeof TABS)[number]["id"]

function resolveTab(value: string | null): TabId {
  return TABS.some((t) => t.id === value) ? (value as TabId) : "servicios"
}

/**
 * /admin/recompensas — programa de créditos: el catálogo canjeable, la cola de
 * servicios ya canjeados y la cola de facturas por revisar. Antes eran entradas
 * de navegación separadas aunque todas operan sobre el mismo programa.
 */
export function RecompensasClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = resolveTab(searchParams.get("tab"))

  const selectTab = useCallback(
    (id: TabId) => {
      router.replace(id === "servicios" ? pathname : `${pathname}?tab=${id}`, { scroll: false })
    },
    [router, pathname]
  )

  const current = TABS.find((t) => t.id === active) ?? TABS[0]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Recompensas</h1>
        <p className="text-sm text-gray-500">{current.description}</p>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-2 mb-6 border-b border-gray-200"
        aria-label="Secciones de recompensas"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 touch-target inline-flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {active === "servicios" && <ServiciosTab />}
      {active === "canjes" && <CanjesTab />}
      {active === "facturas" && <FacturasTab />}
    </div>
  )
}
