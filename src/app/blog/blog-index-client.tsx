"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import type { BlogPostMeta } from "@/lib/blog"
import { BLOG_CATEGORIES } from "@/lib/blog-categories"
import { BlogCard } from "@/components/blog/blog-card"

interface BlogIndexClientProps {
  posts: BlogPostMeta[]
  initialQuery?: string
  initialCategory?: string
}

export function BlogIndexClient({
  posts,
  initialQuery = "",
  initialCategory = "all",
}: BlogIndexClientProps) {
  const [query, setQuery] = useState(initialQuery)
  const [activeCategory, setActiveCategory] = useState(
    BLOG_CATEGORIES.some((c) => c.slug === initialCategory)
      ? initialCategory
      : "all"
  )

  // Sincroniza los filtros con la URL (?q= y ?categoria=) sin recargar.
  useEffect(() => {
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    if (activeCategory !== "all") params.set("categoria", activeCategory)
    const qs = params.toString()
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, "", url)
  }, [query, activeCategory])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return posts.filter((post) => {
      const matchesCategory =
        activeCategory === "all" || post.category === activeCategory
      if (!matchesCategory) return false
      if (!q) return true
      return [post.title, post.description, ...post.tags]
        .join(" ")
        .toLowerCase()
        .includes(q)
    })
  }, [posts, query, activeCategory])

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
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-warm-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar guías, herramientas, costos…"
            aria-label="Buscar en el blog"
            className="w-full rounded-full border border-warm-200 bg-white py-3 pl-12 pr-10 text-sm text-warm-900 shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-warm-400 hover:text-warm-600"
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
              onClick={() => setActiveCategory(chip.slug)}
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

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post, i) => (
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
          <p className="mt-1 text-sm text-warm-500">
            Prueba con otra palabra o explora todas las categorías.
          </p>
        </div>
      )}
    </section>
  )
}
