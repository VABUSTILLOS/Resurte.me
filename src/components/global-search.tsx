"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Search, X, ArrowRight } from "lucide-react"

interface Product {
  name: string
  category: string
  price: number
  unit: string
}

interface InventarioItem {
  name: string
  stock: number
  stockMin: number
  unit: string
  pricePerUnit: number
}

interface Dish {
  name: string
  category: string
  ingredients: { ingredientName: string; quantity: number; unit: string }[]
}

interface SearchResult {
  id: string
  label: string
  subtitle: string
  tool: string
  toolLabel: string
  url: string
  emoji: string
}

function readJSON<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    if (open) {
      setQuery("")
      setSelectedIdx(0)
    }
  }, [open])

  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const items: SearchResult[] = []

    // Index dishes from costeo
    try {
      const dishes: Dish[] = readJSON("resurte-costeo-dishes-default") || []
      dishes.forEach((d) => {
        if (d.name.toLowerCase().includes(q) || d.category?.toLowerCase().includes(q) || d.ingredients?.some((i) => i.ingredientName.toLowerCase().includes(q))) {
          items.push({
            id: `dish-${d.name}`,
            label: d.name,
            subtitle: `${d.category || "Sin categoría"} · ${d.ingredients?.length || 0} ingredientes`,
            tool: "costeo",
            toolLabel: "Costeo de Menú",
            url: "/panel/costeo",
            emoji: "🍽️",
          })
        }
      })
    } catch {}

    // Index inventario
    try {
      const inv: InventarioItem[] = readJSON("resurte-inventario-items-default") || []
      inv.forEach((i) => {
        if (i.name.toLowerCase().includes(q)) {
          const status = i.stock <= 0 ? "Agotado" : i.stock <= i.stockMin ? "Bajo" : "OK"
          items.push({
            id: `inv-${i.name}`,
            label: i.name,
            subtitle: `Stock: ${i.stock} ${i.unit} · ${status} · $${i.pricePerUnit}/${i.unit}`,
            tool: "inventario",
            toolLabel: "Mi Inventario",
            url: "/panel/inventario",
            emoji: "📦",
          })
        }
      })
    } catch {}

    // Index planificador products
    try {
      const raw = localStorage.getItem("resurte-planner-products-default")
      if (raw) {
        const prods: Product[] = JSON.parse(raw)
        prods.forEach((p) => {
          if (p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) {
            items.push({ id: `prod-${p.name}`, label: p.name, subtitle: `${p.category} · $${p.price}/${p.unit}`, tool: "planificador", toolLabel: "Planificador", url: "/panel/planificador", emoji: "📋" })
          }
        })
      }
    } catch {}

    // Index ventas entries
    try {
      const raw = localStorage.getItem("resurte-ventas-entries-default")
      if (raw) {
        const sales: { dishName: string; quantity: number; date: string; unitPrice: number }[] = JSON.parse(raw)
        const seen = new Set<string>()
        sales.forEach((s) => {
          if (s.dishName && s.dishName.toLowerCase().includes(q) && !seen.has(s.dishName)) {
            seen.add(s.dishName)
            items.push({
              id: `venta-${s.dishName}`,
              label: s.dishName,
              subtitle: `${s.quantity} vendidos · $${s.unitPrice} · ${s.date || "fecha pendiente"}`,
              tool: "ventas",
              toolLabel: "Ventas del día",
              url: "/panel/ventas",
              emoji: "💰",
            })
          }
        })
      }
    } catch {}

    // Limit to 8 results max
    return items.slice(0, 8)
  }, [query])

  const goTo = (url: string) => {
    onClose()
    router.push(url)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)) }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
      if (e.key === "Enter" && results[selectedIdx]) { goTo(results[selectedIdx].url) }
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, results, selectedIdx, onClose])

  // Global Cmd+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        if (open) onClose(); else {
          // trigger open from outside by calling onOpen
          window.dispatchEvent(new CustomEvent("global-search-toggle"))
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-[fadeUp_0.15s_ease-out]">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
            placeholder="Buscar platillos, productos, inventario..."
            className="flex-1 text-base text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-gray-100 text-[10px] font-medium text-gray-400 font-mono">
            esc
          </kbd>
          <button onClick={onClose} className="sm:hidden p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {query.trim() === "" ? (
            <div className="px-4 py-8 text-center text-gray-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Escribe para buscar en todas las herramientas</p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400">
              <p className="text-sm">Sin resultados para &quot;{query}&quot;</p>
              <p className="text-xs mt-1 text-gray-300">Prueba con otro término</p>
            </div>
          ) : (
            results.map((r, idx) => (
              <button
                key={r.id}
                onClick={() => goTo(r.url)}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  idx === selectedIdx ? "bg-[#F0FDF4]" : "hover:bg-gray-50"
                }`}
              >
                <span className="text-xl shrink-0">{r.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{r.label}</div>
                  <div className="text-xs text-gray-400 truncate">{r.subtitle}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded">{r.toolLabel}</span>
                  {idx === selectedIdx && <ArrowRight className="w-4 h-4 text-[#108910]" />}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-50 flex items-center gap-4 text-[10px] text-gray-300">
          <span><kbd className="font-mono">↑↓</kbd> Navegar</span>
          <span><kbd className="font-mono">↵</kbd> Abrir</span>
          <span><kbd className="font-mono">Esc</kbd> Cerrar</span>
        </div>
      </div>
    </div>
  )
}
