"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

export interface TocHeading {
  text: string
  /** `id` real del encabezado en el HTML (ver `extractHeadings`). */
  id: string
  level: 2 | 3
}

/**
 * Índice del artículo con scroll-spy.
 *
 * Los `id` vienen del servidor (`extractHeadings`), que garantiza que
 * coinciden con los que inyecta `rehypeHeadingAnchors`; aquí solo se
 * enlazan y se resalta el que el lector está mirando. Los encabezados se
 * buscan en el DOM en vez de recibir refs para no envolver el MDX.
 */
export function ArticleToc({ headings }: { headings: TocHeading[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null)

    if (elements.length === 0) return

    // La franja de detección es la parte alta de la ventana: así el
    // encabezado activo es el de la sección que se está leyendo, no el
    // último que se alcanzó a ver al fondo.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = new Set(
          entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target)
        )
        if (visible.size === 0) return
        // En orden del documento: el primero visible es el que manda.
        const next = elements.find((element) => visible.has(element))
        if (next) setActiveId(next.id)
      },
      { rootMargin: "-15% 0px -70% 0px" }
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [headings])

  return (
    <nav
      aria-label="Índice del artículo"
      className="mx-auto max-w-3xl px-4 pb-4 sm:px-6"
    >
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group rounded-2xl border border-warm-200 bg-warm-50/70 px-4 py-2"
      >
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-warm-700 [&::-webkit-details-marker]:hidden">
          Índice del artículo
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <ol className="pb-3">
          {headings.map((heading) => {
            const isActive = activeId === heading.id
            return (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  aria-current={isActive ? "location" : undefined}
                  className={`block rounded-md py-1.5 pr-2 text-sm leading-snug transition-colors ${
                    heading.level === 3 ? "pl-6" : "pl-2"
                  } ${
                    isActive
                      ? "bg-white font-semibold text-brand-600"
                      : "text-warm-600 hover:bg-white hover:text-brand-600"
                  }`}
                >
                  {heading.text}
                </a>
              </li>
            )
          })}
        </ol>
      </details>
    </nav>
  )
}
