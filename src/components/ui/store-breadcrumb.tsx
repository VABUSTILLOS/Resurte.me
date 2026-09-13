"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

export interface StoreBreadcrumbItem {
  label: string
  href: string
}

interface StoreBreadcrumbProps {
  citySlug: string
  /** Eslabones intermedios (p.ej. la categoría de un producto). */
  trail?: StoreBreadcrumbItem[]
  /** Nombre de la página actual (no es link). */
  current: string
  /** Label del primer eslabón (default "Inicio"); p.ej. el nombre de la ciudad. */
  homeLabel?: string
}

/**
 * Breadcrumb de la tienda con orientación clara en móvil:
 * - Botón "Atrás" real (history.back con fallback al inicio de la ciudad).
 * - Trail Inicio / Todos / ... / actual; "Todos" lleva al catálogo completo.
 * - En pantallas angostas los eslabones intermedios se ocultan y queda
 *   "Atrás + ubicación actual" en negrita, sin scroll horizontal.
 */
export function StoreBreadcrumb({ citySlug, trail = [], current, homeLabel = "Inicio" }: StoreBreadcrumbProps) {
  const router = useRouter()

  function goBack() {
    // router.back() si hay historial de la app; si se llegó directo (link
    // externo), cae al inicio de la ciudad.
    if (window.history.length > 1 && document.referrer.includes(window.location.host)) {
      router.back()
    } else {
      router.push(`/${citySlug}`)
    }
  }

  const crumbs: StoreBreadcrumbItem[] = [
    { label: homeLabel, href: `/${citySlug}` },
    { label: "Todos", href: `/${citySlug}/buscar` },
    ...trail,
  ]

  return (
    <nav aria-label="Ruta de navegación" className="flex items-center gap-2.5 mb-4 sm:mb-8">
      <button
        type="button"
        onClick={goBack}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-[#e0dbd2] text-sm font-semibold text-[#343538] hover:border-[#0E7A0E]/40 hover:bg-[#f7f5f0] transition-colors touch-target"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Atrás
      </button>

      <ol className="flex items-center gap-1.5 text-xs sm:text-sm min-w-0">
        {crumbs.map((crumb, i) => (
          <li key={crumb.href} className={`items-center gap-1.5 min-w-0 ${i === 0 ? "hidden min-[420px]:flex" : "hidden sm:flex"}`}>
            <Link
              href={crumb.href}
              className="text-[#5c6069] hover:text-[#0E7A0E] transition-colors whitespace-nowrap"
            >
              {crumb.label}
            </Link>
            <span className="text-[#c0bab0]" aria-hidden="true">/</span>
          </li>
        ))}
        <li className="min-w-0">
          <span
            aria-current="page"
            className="text-[#1a1a1a] font-semibold truncate block max-w-[38vw] sm:max-w-[280px]"
          >
            {current}
          </span>
        </li>
      </ol>
    </nav>
  )
}
