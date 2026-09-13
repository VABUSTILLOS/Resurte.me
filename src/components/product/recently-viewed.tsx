"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { History } from "lucide-react"

export interface RecentProduct {
  id: number
  name: string
  slug: string
  image_url: string | null
  price: number
  sale_price: number | null
}

const STORAGE_KEY = "resurte-recently-viewed"
const MAX_STORED = 12
const RAIL_ITEMS = 10

function readList(): RecentProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RecentProduct[]) : []
  } catch {
    return []
  }
}

function recordView(product: RecentProduct) {
  try {
    const list = readList().filter((p) => p.id !== product.id)
    list.unshift(product)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_STORED)))
  } catch {
    /* storage lleno o no disponible */
  }
}

/**
 * RecentlyViewed — rail horizontal de productos vistos antes (localStorage).
 * Registra el producto actual al montar y muestra el historial previo debajo
 * del detalle: en B2B el usuario compara precios entre varios insumos antes
 * de decidir, y este rail le ahorra volver a buscarlos. En móvil el rail es
 * scroll horizontal con fade de borde.
 */
export function RecentlyViewed({
  current,
  citySlug,
}: {
  current: RecentProduct
  citySlug: string
}) {
  // Historial previo (sin el actual) calculado al render — es síncrono y
  // local al navegador; el efecto solo registra la vista (efecto real).
  const [items, setItems] = useState<RecentProduct[]>([])

  useEffect(() => {
    const prev = readList().filter((p) => p.id !== current.id)
    const snapshot = prev.slice(0, RAIL_ITEMS)
    // Diferido a microtask: ningún setState corre síncrono en el efecto.
    void Promise.resolve().then(() => setItems(snapshot))
    // Registrar el producto actual al frente del historial
    recordView(current)
    // Solo al montar o cambiar de producto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id])

  if (items.length === 0) return null

  return (
    <section aria-label="Vistos recientemente" className="max-w-7xl mx-auto px-4 sm:px-6 mt-8 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-[#0E7A0E]" aria-hidden="true" />
        <h2 className="text-base font-bold text-[#242529]">Vistos recientemente</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto overscroll-contain scrollbar-hide scroll-fade-x pb-1">
        {items.map((p) => {
          const price = p.sale_price ?? p.price
          return (
            <Link
              key={p.id}
              href={`/${citySlug}/producto/${p.slug}`}
              className="w-28 shrink-0 group"
            >
              <div className="w-28 h-28 rounded-xl bg-[#faf8f5] border border-[#e0dbd2] overflow-hidden flex items-center justify-center">
                {p.image_url ? (
                  <Image
                    src={p.image_url}
                    alt={p.name}
                    loading="lazy"
                    width={112}
                    height={112}
                    className="w-full h-full object-contain p-1.5"
                  />
                ) : (
                  <span className="text-2xl" aria-hidden="true">🛒</span>
                )}
              </div>
              <p className="mt-1.5 text-xs font-medium text-[#1a1a1a] line-clamp-2 leading-tight group-hover:text-[#0E7A0E] transition-colors">
                {p.name}
              </p>
              <p className="text-xs font-bold text-[#1a1a1a] mt-0.5">
                ${price.toFixed(2)}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
