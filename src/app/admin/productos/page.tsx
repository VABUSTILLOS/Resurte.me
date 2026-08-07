"use client"

import { useState, useEffect } from "react"
import { Search, Package, Tag, Loader2, Pencil, Check, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface Product {
  id: number
  name: string
  slug: string
  brand: string | null
  category_id: number | null
  price: number | null
  sale_price: number | null
  stock_status: "in_stock" | "low_stock" | "out_of_stock"
  is_visible: boolean
  show_in_whatsapp: boolean | null
  image_url: string | null
}

interface Category {
  id: number
  name: string
  slug: string
}

type StockStatus = Product["stock_status"]

const STOCK_LABELS: Record<StockStatus, string> = {
  in_stock: "En stock",
  low_stock: "Stock bajo",
  out_of_stock: "Agotado",
}

export default function AdminProductsPage() {
  // Lazy browser-only client: creating it during SSR would throw when
  // NEXT_PUBLIC_SUPABASE_URL is a placeholder/unset.
  const [supabase] = useState(() => (typeof window === "undefined" ? null : createClient()))

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [draftPrice, setDraftPrice] = useState<string>("")

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id,name,slug,brand,category_id,price,sale_price,stock_status,is_visible,show_in_whatsapp,image_url"
          )
          .order("name"),
        supabase.from("categories").select("id,name,slug").order("name"),
      ])
      if (cancelled) return
      if (prodRes.error) setError(prodRes.error.message)
      if (prodRes.data) setProducts(prodRes.data)
      if (catRes.data) setCategories(catRes.data)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const categoryName = (id: number | null) =>
    categories.find((c) => c.id === id)?.name ?? "Sin categoría"

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand ?? "").toLowerCase().includes(search.toLowerCase()) ||
      categoryName(p.category_id).toLowerCase().includes(search.toLowerCase())
  )

  const patchProduct = async (productId: number, fields: Record<string, unknown>) => {
    setSaving((prev) => new Set(prev).add(productId))
    setError(null)
    try {
      const res = await fetch("/api/admin/products/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, ...fields }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Error al actualizar")
      }
      // Aplica el cambio localmente
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, ...fields } : p))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar")
    } finally {
      setSaving((prev) => {
        const next = new Set(prev)
        next.delete(productId)
        return next
      })
    }
  }

  const cycleStock = (p: Product) => {
    const order: StockStatus[] = ["in_stock", "low_stock", "out_of_stock"]
    const next = order[(order.indexOf(p.stock_status) + 1) % order.length]
    patchProduct(p.id, { stock_status: next })
  }

  const toggleWhatsApp = (p: Product) => {
    patchProduct(p.id, { show_in_whatsapp: !p.show_in_whatsapp })
  }

  const startEditPrice = (p: Product) => {
    setEditingPrice(p.id)
    setDraftPrice(String(p.sale_price ?? p.price ?? ""))
  }

  const savePrice = async (p: Product) => {
    const parsed = parseFloat(draftPrice)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Precio inválido")
      return
    }
    // Guarda como precio normal; si hay sale_price distinto, conservarlo.
    const fields: Record<string, unknown> = { price: parsed }
    if (p.sale_price !== null && p.sale_price !== undefined) {
      fields.sale_price = p.sale_price
    }
    await patchProduct(p.id, fields)
    setEditingPrice(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Cargando productos...
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-sm text-gray-500">{products.length} productos registrados</p>
        </div>
        <button
          disabled
          title="Próximamente"
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors text-sm opacity-60 cursor-not-allowed"
        >
          <Package className="w-4 h-4" />
          Nuevo producto
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar producto o categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {/* Products table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-400 font-medium">
                <th className="px-5 py-3">Producto</th>
                <th className="px-5 py-3">Categoría</th>
                <th className="px-5 py-3">Precio</th>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Visible</th>
                <th className="px-5 py-3">WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Package className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{product.name}</p>
                        <p className="text-xs text-gray-400">{product.brand ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                      <Tag className="w-3 h-3" />
                      {categoryName(product.category_id)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {editingPrice === product.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draftPrice}
                          onChange={(e) => setDraftPrice(e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500"
                        />
                        <button
                          onClick={() => savePrice(product)}
                          disabled={saving.has(product.id)}
                          className="p-1 rounded-lg text-green-600 hover:bg-green-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingPrice(null)}
                          className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditPrice(product)}
                        className="group flex items-center gap-1.5"
                        title="Editar precio"
                      >
                        {product.sale_price ? (
                          <div className="flex items-center">
                            <span className="font-semibold text-brand-600">
                              ${Number(product.sale_price).toFixed(2)}
                            </span>
                            <span className="ml-1.5 text-xs text-gray-400 line-through">
                              ${Number(product.price ?? 0).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-semibold text-gray-900">
                            ${Number(product.price ?? 0).toFixed(2)}
                          </span>
                        )}
                        <Pencil className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-500" />
                      </button>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => cycleStock(product)}
                      disabled={saving.has(product.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        product.stock_status === "in_stock"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : product.stock_status === "low_stock"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}
                      title="Clic para cambiar stock"
                    >
                      {saving.has(product.id) ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : null}
                      {STOCK_LABELS[product.stock_status]}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        product.is_visible
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {product.is_visible ? "Visible" : "Oculto"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleWhatsApp(product)}
                      disabled={saving.has(product.id)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        product.show_in_whatsapp ? "bg-green-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          product.show_in_whatsapp ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">
              No se encontraron productos
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
