"use client"

import Link from "next/link"
import { ArrowRight, BookOpen, Package, Sparkles, Wrench } from "lucide-react"
import { useCity } from "@/contexts/city-context"
import type { ResolvedPostCta } from "@/lib/blog"

const ICONS = {
  coleccion: Package,
  herramienta: Wrench,
  crecimiento: Sparkles,
} as const

/**
 * Caja CTA de cierre al final de cada post, inspirada en TenClientes
 * ("¿Listo para llevar tu negocio al siguiente nivel?") pero con el branding
 * y los activos de Resurte.me (Colecciones / Herramientas / Tienda de
 * Crecimiento). La configuración se resuelve en el servidor (por categoría o
 * frontmatter) y se pasa como prop; la ciudad se lee del contexto del usuario
 * para las colecciones.
 */
export function PostCTA({
  config,
  heading = "¿Listo para llevar tu restaurante al siguiente nivel?",
  secondaryHref = "/blog",
  secondaryLabel = "Seguir leyendo el blog",
}: {
  config: ResolvedPostCta
  heading?: string
  secondaryHref?: string
  secondaryLabel?: string
}) {
  // Cliente: ciudad del contexto tras hidratación (SSR = ciudad por defecto).
  // Antes leía cookies() y eso forzaba SSR dinámico en todo el blog.
  const { city } = useCity()
  const citySlug = city?.slug ?? "chihuahua"
  const Icon = ICONS[config.variant]

  let href = config.href
  if (config.variant === "coleccion") {
    href = `/${citySlug}/coleccion/${config.collectionSlug ?? ""}`
  }

  return (
    <section
      aria-label="Lleva tu restaurante al siguiente nivel"
      className="mx-auto mt-4 max-w-3xl px-4 sm:px-6"
    >
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-6 py-10 text-center shadow-lg sm:px-10 sm:py-12">
        {/* Acentos decorativos */}
        <div
          aria-hidden="true"
          className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-14 -left-10 h-52 w-52 rounded-full bg-brand-300/20 blur-2xl"
        />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {config.eyebrow}
          </span>
          <h2 className="mt-4 text-2xl font-extrabold leading-tight text-white sm:text-3xl">
            {heading}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-brand-50/95">
            {config.title}
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={href ?? "/blog"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-bold text-brand-700 shadow-md transition hover:bg-brand-50 sm:w-auto"
            >
              {config.cta}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={secondaryHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/35 px-7 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:w-auto"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
