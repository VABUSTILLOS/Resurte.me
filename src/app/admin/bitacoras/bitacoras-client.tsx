"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ScrollText, Bug, Mail } from "lucide-react"
import { AuditoriaTab } from "./auditoria-tab"
import { ErroresTab } from "./errores-tab"
import { EmailsTab } from "./emails-tab"

const TABS = [
  {
    id: "auditoria",
    label: "Auditoría",
    description: "Quién cambió qué y cuándo",
    icon: ScrollText,
  },
  {
    id: "errores",
    label: "Errores",
    description: "Errores reportados por cliente, servidor y edge",
    icon: Bug,
  },
  {
    id: "emails",
    label: "Emails",
    description: "Correos transaccionales y campañas enviadas",
    icon: Mail,
  },
] as const

type TabId = (typeof TABS)[number]["id"]

function resolveTab(value: string | null): TabId {
  return TABS.some((t) => t.id === value) ? (value as TabId) : "auditoria"
}

/**
 * /admin/bitacoras — unifica las tres bitácoras del panel (auditoría, errores y
 * emails) en pestañas. Antes eran tres entradas de navegación separadas con la
 * misma forma: lista + filtros. La pestaña activa vive en `?tab=` para que los
 * enlaces antiguos sigan siendo compartibles.
 */
export function BitacorasClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active = resolveTab(searchParams.get("tab"))

  const selectTab = useCallback(
    (id: TabId) => {
      router.replace(id === "auditoria" ? pathname : `${pathname}?tab=${id}`, { scroll: false })
    },
    [router, pathname]
  )

  const current = TABS.find((t) => t.id === active) ?? TABS[0]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Bitácoras</h1>
        <p className="text-sm text-gray-500">{current.description}</p>
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-2 mb-6 border-b border-gray-200"
        aria-label="Secciones de bitácora"
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

      {active === "auditoria" && <AuditoriaTab />}
      {active === "errores" && <ErroresTab />}
      {active === "emails" && <EmailsTab />}
    </div>
  )
}
