"use client"

import { useState, useEffect, useCallback } from "react"
import { Eye, EyeOff, Search, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface Product {
  id: number
  name: string
  slug: string
  brand: string
  category_id: number
  is_visible: boolean
  image_url: string | null
}

interface Category {
  id: number
  name: string
  slug: string
}

export default function AdminVisibilityPage() {
  const supabase = createClient()

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [prodRes, catRes] = await Promise.all([
      supabase.from("products").select("id,name,slug,brand,category_id,is_visible,image_url").order("name"),
      supabase.from("categories").select("id,name,slug").order("name"),
    ])

    if (prodRes.data) setProducts(prodRes.data)
    if (catRes.data) setCategories(catRes.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggle = async (productId: number, current: boolean) => {
    setToggling((prev) => new Set(prev).add(productId))

    const res = await fetch("/api/admin/products/toggle-visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, isVisible: !current }),
    })

    if (res.ok) {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, is_visible: !current } : p))
      )
    }

    setToggling((prev) => {
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
  }

  const filtered = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (categoryFilter !== null && p.category_id !== categoryFilter) return false
    return true
  })

  const visibleCount = products.filter((p) => p.is_visible).length
  const hiddenCount = products.length - visibleCount

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Control de Visibilidad</h1>
          <p className="text-sm text-gray-500 mt-1">
            {visibleCount} visibles · {hiddenCount} ocultos · {products.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`px-3 py-1.5 ${categoryFilter === null ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              Todas
            </button>
            {categories.slice(0, 6).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id === categoryFilter ? null : cat.id)}
                className={`px-3 py-1.5 whitespace-nowrap ${cat.id === categoryFilter ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 text-left text-xs text-gray-400 font-medium">
                  <th className="px-5 py-3 w-12">#</th>
                  <th className="px-5 py-3">Producto</th>
                  <th className="px-5 py-3">Categoría</th>
                  <th className="px-5 py-3">Marca</th>
                  <th className="px-5 py-3 text-center w-24">Visible</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((product) => {
                  const cat = categories.find((c) => c.id === product.category_id)
                  const isToggling = toggling.has(product.id)

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-gray-50 transition-colors ${!product.is_visible ? "opacity-50" : ""}`}
                    >
                      <td className="px-5 py-2 text-xs text-gray-400 font-mono">{product.id}</td>
                      <td className="px-5 py-2">
                        <p className="font-medium text-gray-900 text-sm">{product.name}</p>
                        <p className="text-xs text-gray-400">{product.slug}</p>
                      </td>
                      <td className="px-5 py-2">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                          {cat?.name || `Cat ${product.category_id}`}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-xs text-gray-500">{product.brand}</td>
                      <td className="px-5 py-2 text-center">
                        <button
                          onClick={() => toggle(product.id, product.is_visible)}
                          disabled={isToggling}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            product.is_visible
                              ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                              : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                          }`}
                        >
                          {isToggling ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : product.is_visible ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              Visible
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              Oculto
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
