"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, X, ArrowRight } from "lucide-react"
import { readStored } from "@/lib/storage"

interface InventarioItem {
  name: string
  stock: number
  minStock: number
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

interface WasteEntry {
  id: string
  category: string
  amountKg: number
  costPerKg: number
  date: string
  note?: string
  cause?: string
}

interface ShoppingItem {
  key: string
  name: string
  icon?: string
  pricePerKg?: number
  quantityKg?: number
}

export function GlobalSearch({ open, onClose, slug }: { open: boolean; onClose: () => void; slug?: string | null }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [selectedIdx, setSelectedIdx] = useState(0)

  // Reset state when the dialog opens. Se ajusta durante el render (patrón
  // recomendado por React) en vez de en un effect, para evitar re-renders en cascada.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setQuery("")
      setSelectedIdx(0)
    }
  }

  // Parsea todas las fuentes de localStorage UNA sola vez por apertura del
  // diálogo (antes: se re-leían y re-parseaban en cada tecla).
  const index = useMemo(() => {
    if (!open) return null
    const safe = <T,>(key: string, fallback: T): T => {
      try {
        return readStored(key, fallback, slug)
      } catch {
        return fallback
      }
    }
    return {
      dishes: [...safe<Dish[]>("costeo-dishes", []), ...safe<Dish[]>("shared-dishes", [])],
      inventory: safe<InventarioItem[]>("inventario-items", []),
      qtys: safe<Record<string, { qty: number; unit?: string }>>("planner-manual-qtys", {}),
      sales: safe<{ dishName: string; quantity: number; date: string; unitPrice: number }[]>("ventas-entries", []),
      wastes: safe<WasteEntry[]>("mermas-entries", []),
      shopping: safe<ShoppingItem[]>("temporada-shopping-list", []),
    }
  }, [open, slug])

  const results = useMemo((): SearchResult[] => {
    if (!index || !query.trim()) return []
    const q = query.toLowerCase()
    const items: SearchResult[] = []

    // Index dishes from costeo (datos reales de shared-dishes)
    const seenDishes = new Set<string>()
    index.dishes.forEach((d) => {
      if (!d.name || seenDishes.has(d.name)) return
      const hit =
        d.name.toLowerCase().includes(q) ||
        d.category?.toLowerCase().includes(q) ||
        d.ingredients?.some((i) => i.ingredientName.toLowerCase().includes(q))
      if (!hit) return
      seenDishes.add(d.name)
      items.push({
        id: `dish-${d.name}`,
        label: d.name,
        subtitle: `${d.category || "Sin categoría"} · ${d.ingredients?.length || 0} ingredientes`,
        tool: "costeo",
        toolLabel: "Costeo de Menú",
        url: "/panel/costeo",
        emoji: "🍽️",
      })
    })

    // Index inventario
    index.inventory.forEach((i) => {
      if (i.name.toLowerCase().includes(q)) {
        const status = i.stock <= 0 ? "Agotado" : i.stock <= i.minStock ? "Bajo" : "OK"
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

    // Index planificador: cantidades manuales reales (productos del pedido).
    Object.entries(index.qtys).forEach(([name, v]) => {
      if (!name.toLowerCase().includes(q)) return
      if (v && typeof v === "object" && typeof v.qty === "number") {
        items.push({ id: `prod-${name}`, label: name, subtitle: `Cantidad: ${v.qty} ${v.unit || "kg"} (pedido actual)`, tool: "planificador", toolLabel: "Planificador", url: "/panel/planificador", emoji: "📋" })
      }
    })

    // Index ventas entries
    const seenSales = new Set<string>()
    index.sales.forEach((s) => {
      if (s.dishName && s.dishName.toLowerCase().includes(q) && !seenSales.has(s.dishName)) {
        seenSales.add(s.dishName)
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

    // Index mermas entries
    index.wastes.forEach((w) => {
      const haystack = `${w.category} ${w.cause || ""} ${w.note || ""}`
      if (haystack.toLowerCase().includes(q)) {
        items.push({
          id: `merma-${w.id || w.date}`,
          label: `${w.category} — ${w.amountKg} kg`,
          subtitle: `Costo: $${w.costPerKg}/kg · ${w.date}${w.cause ? ` · ${w.cause}` : ""}`,
          tool: "mermas",
          toolLabel: "Mermas",
          url: "/panel/mermas",
          emoji: "♻️",
        })
      }
    })

    // Index temporada: lista de compras estacional
    index.shopping.forEach((s) => {
      if (s.name.toLowerCase().includes(q)) {
        items.push({
          id: `temporada-${s.key || s.name}`,
          label: `${s.icon || ""} ${s.name}`.trim(),
          subtitle: `${s.quantityKg ?? 1} kg · $${s.pricePerKg ?? 0}/kg`,
          tool: "temporada",
          toolLabel: "Temporada",
          url: "/panel/temporada",
          emoji: "🌱",
        })
      }
    })

    // Limit to 8 results max
    return items.slice(0, 8)
  }, [index, query])

  const goTo = useCallback((url: string) => {
    onClose()
    router.push(url)
  }, [onClose, router])

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
  }, [open, results, selectedIdx, onClose, goTo])

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
                  {idx === selectedIdx && <ArrowRight className="w-4 h-4 text-[#0E7A0E]" />}
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
