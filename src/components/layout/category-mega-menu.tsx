"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, LayoutGrid } from "lucide-react"
import { useEscapeKey } from "@/hooks/use-escape-key"
import { getCategoryIcon } from "@/lib/utils"

/** Categoría tal como la sirve /api/categories. */
interface CategoryItem {
  id: number
  name: string
  slug: string
  icon: string | null
  count: number
}

type LoadStatus = "idle" | "loading" | "ready" | "error"

/**
 * Mega-menú de categorías del header (N11).
 *
 * El catálogo se carga la PRIMERA vez que se abre el menú, no en el
 * arranque: la mayoría de las visitas no lo abren y no debe costarles un
 * request.
 *
 * El panel es `absolute` y se ancla al ancestro posicionado más cercano
 * —la fila del header—, NO al disparador: el disparador está a ~150px del
 * borde derecho, así que anclarlo a él desbordaría la ventana en 640px.
 * Por eso el componente no declara `relative` en su raíz y el header sí.
 *
 * Patrón disclosure (no `role="menu"`): el contenido son enlaces de
 * navegación, así que `aria-expanded` + `aria-controls` describen mejor el
 * widget que `aria-haspopup`, que anunciaría un menú de comandos.
 */
export function CategoryMegaMenu({
  citySlug,
  onOpenChange,
}: {
  citySlug: string
  /** Avisa al header para que se mantenga visible mientras el menú está abierto. */
  onOpenChange?: (open: boolean) => void
}) {
  const pathname = usePathname()
  // `openedAt` guarda la ruta en la que se abrió: si la ruta cambia (clic en
  // un enlace, atrás del navegador) el menú se cierra solo, sin un efecto.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const [items, setItems] = useState<CategoryItem[]>([])
  const [status, setStatus] = useState<LoadStatus>("idle")
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const open = openedAt !== null && openedAt === pathname

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  // Carga diferida: solo al abrir por primera vez.
  const loadCategories = useCallback(async () => {
    setStatus("loading")
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await fetch("/api/categories", { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as { categories?: CategoryItem[] }
      setItems(data.categories ?? [])
      setStatus("ready")
    } catch {
      if (!controller.signal.aborted) setStatus("error")
    }
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  // Clic fuera cierra.
  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenedAt(null)
      }
    }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [open])

  // Escape cierra y devuelve el foco al disparador.
  const close = useCallback(() => {
    setOpenedAt(null)
    triggerRef.current?.focus()
  }, [])
  useEscapeKey(close, open)

  function handleTriggerClick() {
    if (open) {
      setOpenedAt(null)
      return
    }
    setOpenedAt(pathname)
    if (status === "idle") void loadCategories()
  }

  return (
    <div ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        aria-expanded={open}
        aria-controls="category-mega-menu"
        aria-label="Categorías"
        className="hidden sm:inline-flex min-w-[44px] items-center justify-center gap-1.5 px-3 py-1.5 rounded-[10px] hover:bg-[#F7F5F0] transition-colors text-sm shrink-0 touch-target"
      >
        <LayoutGrid className="w-4 h-4 text-[#0E7A0E]" aria-hidden="true" />
        <span className="hidden font-medium text-[#343538] lg:inline">Categorías</span>
        <ChevronDown
          className={`w-4 h-4 text-[var(--text-secondary)] transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="category-mega-menu"
          className="absolute right-0 top-full z-50 mt-2 w-[min(78vw,42rem)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#ede8df] bg-white shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#ede8df] px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Explorar el catálogo
            </p>
            <Link
              href={`/${citySlug}/buscar`}
              onClick={() => setOpenedAt(null)}
              className="shrink-0 text-xs font-semibold text-[#0E7A0E] hover:underline"
            >
              Ver todos los productos &rarr;
            </Link>
          </div>

          <div className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain p-2">
            {status === "loading" && (
              <ul aria-hidden="true" className="grid grid-cols-1 gap-0.5 min-[420px]:grid-cols-2 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <li key={index} className="flex min-h-[44px] items-center gap-2.5 px-2.5 py-2">
                    <span className="h-5 w-5 shrink-0 animate-pulse rounded bg-[#ede8df]" />
                    <span className="h-3.5 flex-1 animate-pulse rounded bg-[#ede8df]" />
                  </li>
                ))}
              </ul>
            )}

            {status === "error" && (
              <p className="px-2.5 py-4 text-sm text-[var(--text-secondary)]">
                No pudimos cargar las categorías.{" "}
                <Link
                  href={`/${citySlug}/buscar`}
                  onClick={() => setOpenedAt(null)}
                  className="font-semibold text-[#0E7A0E] hover:underline"
                >
                  Ver todos los productos
                </Link>
              </p>
            )}

            {status === "ready" && items.length === 0 && (
              <p className="px-2.5 py-4 text-sm text-[var(--text-secondary)]">
                Todavía no hay categorías publicadas.
              </p>
            )}

            {status === "ready" && items.length > 0 && (
              <ul className="grid grid-cols-1 gap-0.5 min-[420px]:grid-cols-2 sm:grid-cols-3">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/${citySlug}/categoria/${item.slug}`}
                      onClick={() => setOpenedAt(null)}
                      className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-[#F7F5F0] transition-colors"
                    >
                      <span aria-hidden="true" className="text-lg leading-none">
                        {getCategoryIcon(item.icon, item.slug)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[#343538]">
                          {item.name}
                        </span>
                        <span className="block text-[11px] text-[var(--text-secondary)]">
                          {item.count} {item.count === 1 ? "producto" : "productos"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
