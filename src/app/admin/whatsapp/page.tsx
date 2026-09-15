"use client"

// ============================================================
// Catálogos de WhatsApp de la plataforma — multi-catálogo por
// ciudad con selección y ORDEN exacto (primero: Chihuahua).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  Search, RefreshCw, ArrowUp, ArrowDown, Plus, Send,
  Loader2, MapPin, Globe,
} from "lucide-react"
import { getCategoryIcon } from "@/lib/utils"
import {
  getAdminWhatsappCatalog,
  listWaCatalogs,
  createWaCatalog,
  getWaCatalogItems,
  setWaCatalogProduct,
  reorderWaCatalog,
  syncWaCatalog,
  sendWaCatalogToPhone,
  type AdminWhatsappProduct,
  type AdminWhatsappCategory,
  type WaCatalogSummary,
  type WaCatalogDetailItem,
} from "@/app/admin/actions"

export default function AdminWhatsAppPage() {
  const [products, setProducts] = useState<AdminWhatsappProduct[]>([])
  const [categories, setCategories] = useState<AdminWhatsappCategory[]>([])
  const [catalogs, setCatalogs] = useState<WaCatalogSummary[]>([])
  const [selectedCatalog, setSelectedCatalog] = useState<WaCatalogSummary | null>(null)
  const [catalogItems, setCatalogItems] = useState<WaCatalogDetailItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [newCityName, setNewCityName] = useState("")
  const [sendPhone, setSendPhone] = useState("")

  const load = useCallback(async () => {
    try {
      const [data, cats] = await Promise.all([getAdminWhatsappCatalog(), listWaCatalogs()])
      setProducts(data.products)
      setCategories(data.categories)
      setCatalogs(cats)
      if (cats.length > 0) {
        const first = cats.find((c) => c.slug === "chihuahua") ?? cats[0] ?? null
        setSelectedCatalog((prev) => prev ?? first)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadItems = useCallback(async () => {
    if (!selectedCatalog) return
    setCatalogItems(await getWaCatalogItems(selectedCatalog.id))
  }, [selectedCatalog])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  useEffect(() => {
    const run = async () => { await loadItems() }
    run().catch(() => {})
  }, [loadItems])

  const curatedIds = useMemo(() => new Set(catalogItems.map((i) => i.product_id)), [catalogItems])
  const curated = useMemo(
    () => catalogItems.filter((i) => i.is_visible).sort((a, b) => a.position - b.position),
    [catalogItems]
  )
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const available = useMemo(
    () =>
      products.filter((p) => {
        if (curatedIds.has(p.id)) return false
        if (selectedCategory && p.category_id !== selectedCategory) return false
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
        return true
      }),
    [products, curatedIds, selectedCategory, search]
  )

  async function run<T>(fn: () => Promise<T>, okText?: (r: T) => string) {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const result = await fn()
      if (okText) setMessage({ ok: true, text: okText(result) })
      await loadItems()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = (productId: number) =>
    run(async () => {
      if (!selectedCatalog) return
      await setWaCatalogProduct(selectedCatalog.id, productId, true)
    })

  const handleRemove = (productId: number) =>
    run(async () => {
      if (!selectedCatalog) return
      await setWaCatalogProduct(selectedCatalog.id, productId, false)
    })

  const move = (item: WaCatalogDetailItem, delta: -1 | 1) =>
    run(async () => {
      if (!selectedCatalog) return
      const ids = curated.map((i) => i.product_id)
      const idx = ids.indexOf(item.product_id)
      const swap = idx + delta
      if (idx < 0 || swap < 0 || swap >= ids.length) return
      const a = ids[idx]
      const b = ids[swap]
      if (a === undefined || b === undefined) return
      ids[idx] = b
      ids[swap] = a
      await reorderWaCatalog(selectedCatalog.id, ids)
    })

  const handleSync = () =>
    run(
      async () => {
        if (!selectedCatalog) throw new Error("Selecciona un catálogo")
        return syncWaCatalog(selectedCatalog.id)
      },
      (r) => `Catálogo "${selectedCatalog?.name}" sincronizado: ${r.added} en WhatsApp${r.removed ? ` (${r.removed} removidos)` : ""}.`
    )

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    run(
      async () => {
        if (!selectedCatalog) throw new Error("Selecciona un catálogo")
        await sendWaCatalogToPhone(selectedCatalog.id, sendPhone)
      },
      () => `Catálogo de ${selectedCatalog?.name} enviado a ${sendPhone} en el orden exacto.`
    )
    setSendPhone("")
  }

  const handleCreateCatalog = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCityName.trim()) return
    run(
      async () => {
        await createWaCatalog(newCityName.trim(), null)
        setNewCityName("")
      },
      () => "Catálogo creado."
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#242529]">Catálogos de WhatsApp</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Un catálogo por ciudad, con tu selección y <strong>tu orden exacto</strong>.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={busy || !selectedCatalog || curated.length === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F7A3D] text-white font-semibold rounded-full hover:bg-[#0F6B3A] transition-colors text-sm shadow-sm disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
          Sincronizar a WhatsApp
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">{message.text}</div>
      )}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Selector de catálogo */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {catalogs.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCatalog(c)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              selectedCatalog?.id === c.id
                ? "bg-[#0E7A0E] text-white"
                : "bg-white border border-[#E8E9EB] text-[var(--text-secondary)] hover:bg-[#F7F5F0]"
            }`}
          >
            {c.city_id ? <MapPin className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
            {c.name}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${selectedCatalog?.id === c.id ? "bg-white/20" : "bg-[#F5F3F0]"}`}>
              {c.items_count}
            </span>
          </button>
        ))}
        <form onSubmit={handleCreateCatalog} className="flex items-center gap-1.5">
          <input
            value={newCityName}
            onChange={(e) => setNewCityName(e.target.value)}
            placeholder="Nueva ciudad…"
            className="w-32 px-3 py-2 bg-white border border-dashed border-[#0E7A0E]/40 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20"
          />
          <button
            type="submit"
            disabled={busy || !newCityName.trim()}
            className="p-2 rounded-full bg-[#0E7A0E] text-white hover:bg-[#0D720D] disabled:opacity-40"
            aria-label="Crear catálogo"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>
      </div>

      {selectedCatalog && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Curaduría ordenada */}
          <div className="bg-white rounded-2xl border border-[#E8E9EB] p-5 h-fit">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-[#242529]">
                Catálogo de {selectedCatalog.name}
              </h2>
              <span className="text-xs text-[#B0B3B8]">{curated.length} productos</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Este es el orden EXACTO que verá el cliente.
            </p>

            {curated.length === 0 ? (
              <p className="text-sm text-[#B0B3B8] py-8 text-center">
                Catálogo vacío. Agrega productos de la lista de la derecha.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                {curated.map((item, idx) => {
                  const p = productById.get(item.product_id)
                  if (!p) return null
                  return (
                    <div key={item.product_id} className="flex items-center gap-2 rounded-xl border border-[#25D366]/20 bg-[#F2FBF5] px-3 py-2">
                      <span className="w-6 text-xs font-black text-[#0E7A0E]">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#242529] truncate">{p.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          ${(p.sale_price ?? p.price ?? 0).toFixed(2)}
                          {item.available_in_city === false && (
                            <span className="ml-2 text-amber-600 font-semibold">⚠ no disponible en la ciudad</span>
                          )}
                        </p>
                      </div>
                      <button onClick={() => move(item, -1)} disabled={busy || idx === 0} className="p-1.5 text-[#B0B3B8] hover:text-[#242529] disabled:opacity-30" aria-label={`Subir ${p.name}`}>
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button onClick={() => move(item, 1)} disabled={busy || idx === curated.length - 1} className="p-1.5 text-[#B0B3B8] hover:text-[#242529] disabled:opacity-30" aria-label={`Bajar ${p.name}`}>
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleRemove(item.product_id)} disabled={busy} className="p-1.5 text-[#B0B3B8] hover:text-red-600" aria-label={`Quitar ${p.name}`}>
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Enviar a teléfono */}
            <form onSubmit={handleSend} className="mt-4 pt-4 border-t border-[#F0F1F2]">
              <p className="text-xs font-semibold text-[#242529] mb-2">Probar con un cliente</p>
              <div className="flex gap-2">
                <input
                  value={sendPhone}
                  onChange={(e) => setSendPhone(e.target.value)}
                  placeholder="Teléfono (10 dígitos)"
                  inputMode="tel"
                  className="flex-1 px-3 py-2 bg-white border border-[#E8E9EB] rounded-xl text-sm focus:outline-none focus:border-[#0E7A0E]"
                />
                <button
                  type="submit"
                  disabled={busy || curated.length === 0 || !sendPhone.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#1fb857] disabled:opacity-40"
                >
                  <Send className="w-4 h-4" /> Enviar
                </button>
              </div>
            </form>
          </div>

          {/* Productos disponibles */}
          <div className="bg-white rounded-2xl border border-[#E8E9EB] p-5">
            <h2 className="font-bold text-[#242529] mb-3">Agregar productos</h2>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0B3B8]" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#E8E9EB] rounded-xl text-sm focus:outline-none focus:border-[#0E7A0E]"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${selectedCategory === null ? "bg-[#0E7A0E] text-white" : "bg-[#F5F3F0] text-[var(--text-secondary)]"}`}
              >
                Todas
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${selectedCategory === cat.id ? "bg-[#0E7A0E] text-white" : "bg-[#F5F3F0] text-[var(--text-secondary)]"}`}
                >
                  {getCategoryIcon(cat.icon ?? "", cat.slug)} {cat.name}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
              {available.length === 0 ? (
                <p className="text-sm text-[#B0B3B8] py-8 text-center">Sin productos por agregar.</p>
              ) : (
                available.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#F0F1F2] px-3 py-2 hover:border-[#25D366]/40 transition-colors">
                    {p.image_url ? (
                      <Image src={p.image_url} alt={p.name} width={36} height={36} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-[#F5F3F0] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#242529] truncate">{p.name}</p>
                      <p className="text-xs text-[#B0B3B8]">${(p.sale_price ?? p.price ?? 0).toFixed(2)}{p.unit ? ` · ${p.unit}` : ""}</p>
                    </div>
                    <button onClick={() => handleAdd(p.id)} disabled={busy} className="p-1.5 text-[#0E7A0E] hover:bg-[#E7F8EE] rounded-lg" aria-label={`Agregar ${p.name}`}>
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
