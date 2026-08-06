"use client"

import Link from "next/link"
import { ArrowRight, Package, Wrench, Sparkles } from "lucide-react"
import { useCity } from "@/contexts/city-context"

/**
 * CTA embebible en posts MDX. Tres variantes alineadas a los activos de
 * Resurte.me:
 *  - `coleccion`   → catálogo por tipo de cocina (usa la ciudad seleccionada)
 *  - `herramienta` → herramientas del panel (costeo, planificador, mermas)
 *  - `crecimiento` → Tienda de Crecimiento (recompensas)
 */
interface BlogCTAProps {
  variant?: "coleccion" | "herramienta" | "crecimiento"
  /** href explícito para variantes herramienta/crecimiento */
  href?: string
  /** slug de la colección (ej: "taquerias-antojitos") para variant="coleccion" */
  collectionSlug?: string
  /** nombre de la colección para variant="coleccion" */
  collectionName?: string
  title?: string
  cta?: string
  children?: React.ReactNode
}

const VARIANTS = {
  coleccion: {
    icon: Package,
    accent: "bg-brand-500",
    accentSoft: "bg-brand-50 text-brand-600",
    border: "border-brand-100",
    text: "text-brand-600",
  },
  herramienta: {
    icon: Wrench,
    accent: "bg-blue-600",
    accentSoft: "bg-blue-50 text-blue-600",
    border: "border-blue-100",
    text: "text-blue-600",
  },
  crecimiento: {
    icon: Sparkles,
    accent: "bg-emerald-600",
    accentSoft: "bg-emerald-50 text-emerald-600",
    border: "border-emerald-100",
    text: "text-emerald-600",
  },
} as const

const DEFAULT_CTA: Record<string, string> = {
  coleccion: "Ver colección",
  herramienta: "Abrir herramienta",
  crecimiento: "Ir a la Tienda de Crecimiento",
}

export function BlogCTA({
  variant = "herramienta",
  href,
  collectionSlug,
  collectionName,
  title,
  cta,
  children,
}: BlogCTAProps) {
  const { city } = useCity()
  const style = VARIANTS[variant]
  const Icon = style.icon

  let resolvedHref = href
  if (variant === "coleccion") {
    const citySlug = city?.slug ?? "chihuahua"
    resolvedHref = `/${citySlug}/coleccion/${collectionSlug ?? ""}`
  } else if (variant === "crecimiento") {
    resolvedHref = href ?? "/recompensas"
  }

  return (
    <div
      className={`my-8 rounded-2xl border ${style.border} bg-white p-6 sm:p-8 shadow-sm`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.accentSoft}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
            {variant === "coleccion"
              ? collectionName ?? "Colección para tu restaurante"
              : variant === "crecimiento"
                ? "Tienda de Crecimiento"
                : "Herramienta Resurte.me"}
          </p>
          {title && (
            <h3 className="mt-1 text-lg font-bold text-warm-900">{title}</h3>
          )}
          {children && (
            <div className="mt-2 text-sm leading-relaxed text-warm-600">
              {children}
            </div>
          )}
          <Link
            href={resolvedHref ?? "#"}
            className={`mt-4 inline-flex items-center gap-2 rounded-full ${style.accent} px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90`}
          >
            {cta ?? DEFAULT_CTA[variant]}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}
