"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Search, X, ArrowRight } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { searchProducts } from "@/app/[slug]/buscar/actions"
import { AnalyticsEvents } from "@/lib/analytics"
import type { Product } from "@/types"

interface MobileSearchOverlayProps {
  citySlug: string
  onClose: () => void
}

/**
 * Overlay de búsqueda a pantalla completa para móvil: sustituye el salto a
 * /buscar por resultados en vivo sin perder contexto. Reutiliza la server
 * action `searchProducts` (ilike sobre todo el catálogo).
 */
export function MobileSearchOverlay({ citySlug, onClose }: MobileSearchOverlayProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Enfocar y bloquear scroll del body mientras el overlay está abierto
  useEffect(() => {
    inputRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  // Búsqueda en vivo con debounce. Los setState ocurren en el handler del
  // input o en el callback del timeout (no síncronos en el effect).
  useEffect(() => {
    const trimmed = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (trimmed.length < 2) return
    debounceRef.current = setTimeout(async () => {
      try {
        const products = await searchProducts(trimmed)
        setResults(products)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setSearching(false)
    } else {
      setSearching(true)
    }
  }

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = query.trim()
      if (trimmed.length < 2) return
      AnalyticsEvents.search(trimmed)
      onClose()
      router.push(`/${citySlug}/buscar?q=${encodeURIComponent(trimmed)}`)
    },
    [query, citySlug, router, onClose]
  )

  const goToResult = useCallback(() => {
    onClose()
  }, [onClose])

  const hasQuery = query.trim().length >= 2

  return (
    <div
      className="fixed inset-0 z-[80] sm:hidden flex flex-col bg-[#faf8f5]"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar productos"
    >
      {/* Barra superior con input */}
      <div className="sticky top-0 z-10 bg-[#faf8f5] border-b border-[#e0dbd2] px-3 pt-[var(--header-inset-top)]">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar búsqueda"
            className="shrink-0 p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors touch-target -ml-2"
          >
            <X className="w-5 h-5 text-[#343538]" aria-hidden="true" />
          </button>
          <div className="flex-1 flex items-center bg-white border border-[#e0dbd2] rounded-xl shadow-sm focus-within:border-[#0E7A0E] focus-within:ring-2 focus-within:ring-[#0E7A0E]/10">
            <Search className="w-4 h-4 ml-3 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Buscar productos..."
              className="flex-1 bg-transparent px-3 py-3 text-[#1a1a1a] placeholder:text-[var(--text-secondary)] focus:outline-none text-sm min-w-0"
              minLength={2}
              aria-label="Buscar productos"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("")
                  inputRef.current?.focus()
                }}
                aria-label="Limpiar búsqueda"
                className="shrink-0 p-1 mr-1 rounded-full hover:bg-[#F7F5F0]"
              >
                <X className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!hasQuery}
            className="shrink-0 bg-[#0E7A0E] text-white rounded-xl px-3 py-2 text-sm font-medium hover:bg-[#0D720D] transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-target"
          >
            Buscar
          </button>
        </form>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto px-3 pb-8">
        {searching ? (
          <p className="text-sm text-[var(--text-secondary)] text-center py-8">
            Buscando…
          </p>
        ) : !hasQuery ? (
          <p className="text-sm text-[var(--text-secondary)] text-center py-8 px-4">
            Escribe al menos 2 letras para buscar en todo el catálogo.
          </p>
        ) : results.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] text-center py-8 px-4">
            Sin resultados para “{query.trim()}”. Prueba con otro término.
          </p>
        ) : (
          <ul className="divide-y divide-[#e0dbd2]">
            {results.slice(0, 12).map((p) => {
              const price = p.sale_price ?? p.price ?? 0
              const original = p.price ?? 0
              const hasDiscount = !!p.sale_price && p.sale_price < original
              return (
                <li key={p.id}>
                  <Link
                    href={`/${citySlug}/producto/${p.slug}`}
                    onClick={goToResult}
                    className="flex items-center gap-3 py-3 hover:bg-white/60 rounded-xl transition-colors"
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#f7f4ef] border border-[#ede8df] shrink-0">
                      {p.image_url ? (
                        <Image
                          src={p.image_url}
                          alt={p.name}
                          width={48}
                          height={48}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl text-gray-300">
                          🛒
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a1a] truncate">
                        {p.name}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">
                        {p.brand || "Resurte"}
                      </p>
                      <p className="text-sm font-semibold text-[#0E7A0E]">
                        ${price.toFixed(2)}
                        {hasDiscount && (
                          <span className="text-xs text-[var(--text-secondary)] line-through font-normal ml-1.5">
                            ${original.toFixed(2)}
                          </span>
                        )}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[var(--text-secondary)] shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {/* CTA a la búsqueda completa */}
        {results.length > 0 && (
          <Link
            href={`/${citySlug}/buscar?q=${encodeURIComponent(query.trim())}`}
            onClick={goToResult}
            className="mt-4 flex items-center justify-center gap-2 w-full h-11 rounded-xl border-2 border-[#0E7A0E] text-[#0E7A0E] text-sm font-semibold hover:bg-[#0E7A0E]/5 transition-colors touch-target"
          >
            Ver todos los resultados
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  )
}
