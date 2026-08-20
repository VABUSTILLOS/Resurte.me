"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Check,
} from "lucide-react"
import type { BlogPostMeta } from "@/lib/blog"
import { searchPosts } from "@/lib/blog-search"
import { BLOG_CATEGORIES, BLOG_CONTENT_TYPES, getContentType } from "@/lib/blog-categories"
import { BlogCard } from "@/components/blog/blog-card"
import { FeaturedBlogCard } from "@/components/blog/featured-blog-card"

interface BlogIndexClientProps {
  posts: BlogPostMeta[]
  initialQuery?: string
  initialCategory?: string
  initialContentType?: string
}

const PAGE_SIZE = 9

type SortKey =
  | "date-desc"
  | "date-asc"
  | "length-desc"
  | "length-asc"
  | "title-asc"
  | "title-desc"

const SORT_OPTIONS: { id: SortKey; label: string; description: string }[] = [
  { id: "date-desc", label: "Más recientes", description: "Los artículos más nuevos primero" },
  { id: "date-asc", label: "Más antiguos", description: "Los artículos más viejos primero" },
  { id: "length-desc", label: "Más extensos", description: "Las guías más completas primero" },
  { id: "length-asc", label: "Más cortos", description: "Las lecturas rápidas primero" },
  { id: "title-asc", label: "Título A-Z", description: "Orden alfabético por título" },
  { id: "title-desc", label: "Título Z-A", description: "Orden alfabético inverso" },
]

function sortPosts(posts: BlogPostMeta[], key: SortKey): BlogPostMeta[] {
  const sorted = [...posts]
  switch (key) {
    case "date-desc":
      return sorted.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    case "date-asc":
      return sorted.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
    case "length-desc":
      return sorted.sort((a, b) => b.readingTime - a.readingTime)
    case "length-asc":
      return sorted.sort((a, b) => a.readingTime - b.readingTime)
    case "title-asc":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, "es"))
    case "title-desc":
      return sorted.sort((a, b) => b.title.localeCompare(a.title, "es"))
  }
}

export function BlogIndexClient({
  posts,
  initialQuery = "",
  initialCategory = "all",
  initialContentType = "all",
}: BlogIndexClientProps) {
  const [query, setQuery] = useState(initialQuery)
  const [activeCategory, setActiveCategory] = useState(
    BLOG_CATEGORIES.some((c) => c.slug === initialCategory)
      ? initialCategory
      : "all"
  )
  const [activeContentType, setActiveContentType] = useState(
    BLOG_CONTENT_TYPES.some((t) => t.slug === initialContentType)
      ? initialContentType
      : "all"
  )
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortKey>("date-desc")
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  // La página ya no lee searchParams en el servidor (eso la volvía dinámica);
  // los filtros (?q=, ?categoria=, ?tipo=) se adoptan desde la URL ajustando el
  // estado DURANTE el render — patrón oficial de React para derivar estado de una
  // fuente externa, en lugar de setState en un efecto (rule
  // react-hooks/set-state-in-effect). En SSR estático useSearchParams devuelve
  // valores vacíos → el HTML inicial coincide sin hydration mismatch; en el
  // cliente las guardas comparan contra el estado actual, así que el ajuste se
  // estabiliza en un solo re-render. De paso, esto también refleja cambios de URL
  // por navegación del cliente (Link/back), que el efecto con [] no cubría.
  const searchParams = useSearchParams()
  // Adopta los filtros iniciales (?q=, ?categoria=, ?tipo=) de la URL AL MONTAR.
  // La página se mantiene estática en el servidor (sin leer searchParams en el
  // server), así que esta es la única vía para que un enlace con filtros
  // (p.ej. ?q=carne) se aplique en el primer render del cliente. Los setState
  // son intencionales y se ejecutan una sola vez; la regla
  // react-hooks/set-state-in-effect no modela el bootstrap de filtros de URL en
  // páginas estáticas, por eso se deshabilita de forma local y documentada.
  useEffect(() => {
    const q = searchParams.get("q")
    const cat = searchParams.get("categoria")
    const tipo = searchParams.get("tipo")
    if (q) {
      // eslint-disable-next-line
      setQuery((prev) => (q !== prev ? q : prev))
    }
    if (cat && BLOG_CATEGORIES.some((c) => c.slug === cat)) {
      // eslint-disable-next-line
      setActiveCategory((prev) => (cat !== prev ? cat : prev))
    }
    if (tipo && BLOG_CONTENT_TYPES.some((t) => t.slug === tipo)) {
      // eslint-disable-next-line
      setActiveContentType((prev) => (tipo !== prev ? tipo : prev))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const urlQuery = searchParams.get("q")
  const urlCategory = searchParams.get("categoria")
  const urlContentType = searchParams.get("tipo")
  if (urlQuery && query !== urlQuery) {
    setQuery(urlQuery)
  }
  if (
    urlCategory &&
    BLOG_CATEGORIES.some((c) => c.slug === urlCategory) &&
    activeCategory !== urlCategory
  ) {
    setActiveCategory(urlCategory)
  }
  if (
    urlContentType &&
    BLOG_CONTENT_TYPES.some((t) => t.slug === urlContentType) &&
    activeContentType !== urlContentType
  ) {
    setActiveContentType(urlContentType)
  }

  // Cierra el menú de orden al hacer clic fuera.
  useEffect(() => {
    if (!sortOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [sortOpen])

  // Sincroniza los filtros con la URL (?q=, ?categoria= y ?tipo=) sin recargar.
  useEffect(() => {
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    if (activeCategory !== "all") params.set("categoria", activeCategory)
    if (activeContentType !== "all") params.set("tipo", activeContentType)
    const qs = params.toString()
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, "", url)
  }, [query, activeCategory, activeContentType])

  // Cambiar búsqueda o filtros vuelve a la primera página.
  const handleQueryChange = (value: string) => {
    setQuery(value)
    setCurrentPage(1)
  }

  const handleCategoryChange = (slug: string) => {
    setActiveCategory(slug)
    setCurrentPage(1)
  }

  const handleContentTypeChange = (slug: string) => {
    setActiveContentType(slug)
    setCurrentPage(1)
  }

  const handleSortChange = (key: SortKey) => {
    setSortBy(key)
    setSortOpen(false)
    setCurrentPage(1)
  }

  const filtered = useMemo(() => {
    const matches = searchPosts(posts, query).filter((post) => {
      const matchesCategory =
        activeCategory === "all" || post.category === activeCategory
      if (!matchesCategory) return false
      const matchesContentType =
        activeContentType === "all" || post.contentType === activeContentType
      return matchesContentType
    })
    return sortPosts(matches, sortBy)
  }, [posts, query, activeCategory, activeContentType, sortBy])

  const activeContentTypeInfo = getContentType(activeContentType)

  // Artículos destacados (featured: true) — se muestran en la vista general.
  const featured = useMemo(
    () => posts.filter((post) => post.featured),
    [posts]
  )
  const showFeatured =
    featured.length > 0 &&
    !query.trim() &&
    activeCategory === "all" &&
    activeContentType === "all"

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const chips = [
    { slug: "all", label: "Todas", emoji: "🗂️" },
    ...BLOG_CATEGORIES,
  ]

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      {/* Buscador */}
      <div className="mx-auto mt-8 max-w-xl">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-secondary)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Buscar guías, herramientas, costos…"
            aria-label="Buscar en el blog"
            className="w-full rounded-full border border-warm-200 bg-white py-3 pl-12 pr-10 text-sm text-warm-900 shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => handleQueryChange("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-secondary)] hover:text-warm-600"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Chips de categorías */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {chips.map((chip) => {
          const active = activeCategory === chip.slug
          return (
            <button
              key={chip.slug}
              type="button"
              onClick={() => handleCategoryChange(chip.slug)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-brand-500 text-white"
                  : "bg-white text-warm-600 shadow-sm ring-1 ring-warm-200 hover:bg-cream-50"
              }`}
            >
              <span aria-hidden="true">{chip.emoji}</span>
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Chips de tipo de contenido */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <span className="mr-1 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          Tipo de contenido
        </span>
        {[
          { slug: "all", label: "Todos", emoji: "🗂️", description: "Todos los tipos de contenido" },
          ...BLOG_CONTENT_TYPES,
        ].map((chip) => {
          const active = activeContentType === chip.slug
          return (
            <button
              key={chip.slug}
              type="button"
              onClick={() => handleContentTypeChange(chip.slug)}
              aria-pressed={active}
              title={chip.description}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-amber-500 text-amber-950"
                  : "bg-white text-warm-600 shadow-sm ring-1 ring-warm-200 hover:bg-cream-50"
              }`}
            >
              <span aria-hidden="true">{chip.emoji}</span>
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Artículos destacados */}
      {showFeatured && (
        <div className="mt-14">
          <div className="flex items-center gap-3">
            <span className="h-8 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-warm-900">
                Artículos destacados
              </h2>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                Las guías que más ayudan a los dueños de restaurantes.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-6">
            <FeaturedBlogCard
              post={featured[0]!}
              size="large"
              priority
            />
            <div className="grid gap-6 sm:grid-cols-3">
              {featured.slice(1, 4).map((post) => (
                <FeaturedBlogCard key={post.slug} post={post} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Todos los artículos */}
      <div className="mt-14 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-8 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-warm-900">
              Todos los artículos
            </h2>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              {filtered.length} {filtered.length === 1 ? "artículo" : "artículos"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {totalPages > 1 && (
            <p className="hidden text-sm font-medium text-[var(--text-secondary)] sm:block">
              Página {safePage} de {totalPages}
            </p>
          )}

          {/* Ordenar */}
          <div ref={sortRef} className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              aria-label="Ordenar artículos"
              onClick={() => setSortOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-full border border-warm-200 bg-white px-4 py-2 text-sm font-semibold text-warm-700 shadow-sm transition-colors hover:border-brand-400 hover:text-brand-600"
            >
              <ArrowUpDown className="h-4 w-4 text-brand-500" aria-hidden="true" />
              {SORT_OPTIONS.find((o) => o.id === sortBy)?.label ?? "Ordenar"}
            </button>

            {sortOpen && (
              <ul
                role="listbox"
                aria-label="Opciones de orden"
                className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-warm-200 bg-white py-1.5 shadow-lg"
              >
                {SORT_OPTIONS.map((option) => {
                  const selected = sortBy === option.id
                  return (
                    <li key={option.id} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        onClick={() => handleSortChange(option.id)}
                        className={`flex w-full items-start gap-2 px-4 py-2.5 text-left transition-colors ${
                          selected
                            ? "bg-brand-50 text-brand-700"
                            : "text-warm-700 hover:bg-cream-50"
                        }`}
                      >
                        <span
                          className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border ${
                            selected
                              ? "border-brand-500 bg-brand-500 text-white"
                              : "border-warm-300"
                          } flex items-center justify-center`}
                        >
                          {selected && <Check className="h-3 w-3" aria-hidden="true" />}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">
                            {option.label}
                          </span>
                          <span className="block text-xs text-[var(--text-secondary)]">
                            {option.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((post, i) => (
            <BlogCard key={post.slug} post={post} priority={i < 3} />
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-4xl" aria-hidden="true">
            🔍
          </p>
          <h2 className="mt-3 text-lg font-bold text-warm-900">
            Sin resultados para &quot;{query}&quot;
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {activeContentTypeInfo
              ? `No hay artículos de tipo «${activeContentTypeInfo.label}». Prueba con otra palabra o explora todas las categorías.`
              : "Prueba con otra palabra o explora todas las categorías."}
          </p>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <nav
          aria-label="Paginación de artículos"
          className="mt-10 flex items-center justify-center gap-4"
        >
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-white px-5 py-2.5 text-sm font-semibold text-warm-700 shadow-sm transition-colors hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-warm-200 disabled:hover:text-warm-700"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Anterior
          </button>
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="inline-flex items-center gap-1.5 rounded-full border border-warm-200 bg-white px-5 py-2.5 text-sm font-semibold text-warm-700 shadow-sm transition-colors hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-warm-200 disabled:hover:text-warm-700"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </section>
  )
}
