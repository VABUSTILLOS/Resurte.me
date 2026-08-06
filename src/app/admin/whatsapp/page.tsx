"use client"

import { useState, useMemo } from "react"
import { Search, MessageCircle, Check, Eye, EyeOff, RefreshCw, ImageIcon } from "lucide-react"
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from "@/lib/mock-products"
import { getCategoryIcon } from "@/lib/utils"

export default function AdminWhatsAppPage() {
  const [products, setProducts] = useState(
    MOCK_PRODUCTS.map((p) => ({ ...p }))
  )
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory && p.category_id !== selectedCategory) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [products, search, selectedCategory])

  const totalInCatalog = products.filter((p) => p.show_in_whatsapp).length

  const toggleProduct = (productId: number) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, show_in_whatsapp: !p.show_in_whatsapp } : p
      )
    )
  }

  const selectAll = () => {
    setProducts((prev) => prev.map((p) => ({ ...p, show_in_whatsapp: true })))
  }

  const deselectAll = () => {
    setProducts((prev) => prev.map((p) => ({ ...p, show_in_whatsapp: false })))
  }

  const syncCatalog = () => {
    alert(
      `Catálogo listo para sincronizar con WhatsApp.\n\n${totalInCatalog} productos serán publicados en el catálogo de WhatsApp Business.\n\nConecta tu WhatsApp Cloud API para completar la sincronización.`
    )
  }

  return (
    <div>
      {/* Header — Take App style */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#242529]">
            Catálogo de WhatsApp
          </h1>
          <p className="text-sm text-[#72767E] mt-1">
            Elige qué productos mostrar en tu tienda de WhatsApp Business.
          </p>
        </div>
        <button
          onClick={syncCatalog}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#25D366] text-white font-semibold rounded-full hover:bg-[#20BD5A] transition-colors text-sm shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Sincronizar catálogo
        </button>
      </div>

      {/* Info banner — Take App "Official Partner" style */}
      <div className="bg-gradient-to-r from-[#E7F8EE] to-[#DCF5E6] border border-[#25D366]/20 rounded-2xl p-5 mb-6 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#25D366]/10 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[#25D366]">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-[#1B5E20] mb-1">
            Tú decides qué mostrar
          </p>
          <p className="text-sm text-[#2E7D32] leading-relaxed">
            A diferencia de otras plataformas que publican automáticamente los productos más nuevos, aquí{" "}
            <strong>tú eliges manualmente</strong> qué productos aparecen en el catálogo de WhatsApp.
            Solo los productos activados se sincronizan con WhatsApp Cloud API.
          </p>
        </div>
      </div>

      {/* Stats — compact cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-[#E8E9EB] p-4">
          <p className="text-xs text-[#B0B3B8] mb-1">Total productos</p>
          <p className="text-2xl font-bold text-[#242529]">{products.length}</p>
        </div>
        <div className="bg-[#E7F8EE] rounded-xl border border-[#25D366]/20 p-4">
          <p className="text-xs text-[#2E7D32] mb-1">En WhatsApp</p>
          <p className="text-2xl font-bold text-[#1B5E20]">{totalInCatalog}</p>
        </div>
        <div className="bg-[#F5F3F0] rounded-xl border border-[#E8E9EB] p-4">
          <p className="text-xs text-[#B0B3B8] mb-1">Ocultos</p>
          <p className="text-2xl font-bold text-[#72767E]">{products.length - totalInCatalog}</p>
        </div>
      </div>

      {/* Category + Search filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0B3B8]" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#E8E9EB] rounded-xl text-sm focus:outline-none focus:border-[#108910] focus:ring-2 focus:ring-[#108910]/10 transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors ${
              selectedCategory === null
                ? "bg-[#108910] text-white"
                : "bg-white border border-[#E8E9EB] text-[#72767E] hover:bg-[#F7F5F0]"
            }`}
          >
            Todas
          </button>
          {MOCK_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                selectedCategory === cat.id
                  ? "bg-[#108910] text-white"
                  : "bg-white border border-[#E8E9EB] text-[#72767E] hover:bg-[#F7F5F0]"
              }`}
            >
              {getCategoryIcon(cat.icon, cat.slug)} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={selectAll}
          className="text-xs font-medium text-[#108910] hover:text-[#0D720D] transition-colors flex items-center gap-1"
        >
          <Eye className="w-3.5 h-3.5" />
          Publicar todos
        </button>
        <span className="text-[#E8E9EB]">|</span>
        <button
          onClick={deselectAll}
          className="text-xs font-medium text-[#72767E] hover:text-[#5C6068] transition-colors flex items-center gap-1"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Ocultar todos
        </button>
        <span className="text-xs text-[#B0B3B8] ml-auto">
          {totalInCatalog} de {products.length} publicados
        </span>
      </div>

      {/* Product list — single list with toggles */}
      <div className="space-y-2">
        {filtered.map((product) => {
          const category = MOCK_CATEGORIES.find((c) => c.id === product.category_id)
          return (
            <div
              key={product.id}
              className={`bg-white rounded-xl border p-4 flex items-center gap-4 transition-all ${
                product.show_in_whatsapp
                  ? "border-[#25D366]/30 shadow-sm"
                  : "border-[#E8E9EB] hover:border-[#25D366]/20"
              }`}
            >
              {/* Product image */}
              <div className="w-12 h-12 rounded-lg bg-[#F7F5F0] flex items-center justify-center overflow-hidden shrink-0">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <ImageIcon className="w-5 h-5 text-[#D9D7D2]" />
                )}
              </div>

              {/* Product info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-[#242529] text-sm truncate">
                    {product.name}
                  </p>
                  {product.show_in_whatsapp && (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-[#E7F8EE] text-[#1B5E20] text-[11px] font-medium rounded-full">
                      <Check className="w-3 h-3" />
                      Publicado
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#B0B3B8] mt-0.5">
                  {getCategoryIcon(category?.icon, category?.slug)} {category?.name || "Sin categoría"}
                  {product.brand ? ` · ${product.brand}` : ""}
                  {product.unit ? ` · ${product.unit}` : ""}
                </p>
              </div>

              {/* Price */}
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-[#242529]">
                  ${(product.sale_price ?? product.price).toFixed(2)}
                </p>
                {product.sale_price && (
                  <p className="text-xs text-[#B0B3B8] line-through">
                    ${product.price.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Toggle */}
              <button
                onClick={() => toggleProduct(product.id)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all ${
                  product.show_in_whatsapp
                    ? "bg-[#F5F3F0] text-[#72767E] hover:bg-[#EDEBE6]"
                    : "bg-[#25D366] text-white hover:bg-[#20BD5A] shadow-sm"
                }`}
              >
                {product.show_in_whatsapp ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    Ocultar
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Publicar
                  </>
                )}
              </button>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-[#E8E9EB]">
            <Search className="w-10 h-10 text-[#D9D7D2] mx-auto mb-3" />
            <p className="text-sm text-[#72767E]">No se encontraron productos.</p>
            <p className="text-xs text-[#B0B3B8] mt-1">Cambia los filtros para ver más resultados.</p>
          </div>
        )}
      </div>

      {/* How it works — bottom card */}
      <div className="mt-8 p-5 bg-white rounded-2xl border border-[#E8E9EB]">
        <h3 className="text-sm font-semibold text-[#242529] mb-3 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#25D366]" />
          ¿Cómo funciona?
        </h3>
        <ol className="text-sm text-[#5C6068] space-y-2 list-decimal list-inside leading-relaxed">
          <li>Activa los productos que quieres mostrar en WhatsApp usando el botón <strong className="text-[#242529]">Publicar</strong>.</li>
          <li>Haz clic en <strong className="text-[#242529]">Sincronizar catálogo</strong> para enviar los cambios a WhatsApp Cloud API.</li>
          <li>Tus clientes verán los productos directamente en el catálogo de WhatsApp Business.</li>
          <li>Pueden consultar precios, hacer preguntas y realizar pedidos sin salir de WhatsApp.</li>
          <li>Cambia la selección cuando quieras — los cambios se reflejan al sincronizar.</li>
        </ol>
      </div>
    </div>
  )
}
