"use client"

import { useState } from "react"
import { Plus, Search, Edit2, Trash2, Package, Tag } from "lucide-react"

interface MockProduct {
  id: number
  name: string
  slug: string
  category: string
  brand: string
  store_name: string
  price: number
  sale_price: number | null
  is_available: boolean
  show_in_whatsapp: boolean
  image_url: string
}

const MOCK_PRODUCTS: MockProduct[] = [
  { id: 1, name: "Aguacate Hass", slug: "aguacate-hass", category: "Frutas y Verduras", brand: "Genérico", store_name: "La Comer", price: 35, sale_price: 29, is_available: true, show_in_whatsapp: true, image_url: "" },
  { id: 2, name: "Pechuga de pollo 500g", slug: "pechuga-pollo", category: "Carnes", brand: "Bachoco", store_name: "Chedraui", price: 89, sale_price: null, is_available: true, show_in_whatsapp: false, image_url: "" },
  { id: 3, name: "Leche Lala entera 1L", slug: "leche-lala", category: "Lácteos", brand: "Lala", store_name: "La Comer", price: 28, sale_price: 24, is_available: true, show_in_whatsapp: true, image_url: "" },
  { id: 4, name: "Tortillas de maíz 1kg", slug: "tortillas-maiz", category: "Tortillería", brand: "Genérico", store_name: "City Market", price: 22, sale_price: null, is_available: true, show_in_whatsapp: false, image_url: "" },
  { id: 5, name: "Jitomate saladet", slug: "jitomate-saladet", category: "Frutas y Verduras", brand: "Genérico", store_name: "Soriana", price: 18, sale_price: 15, is_available: false, show_in_whatsapp: true, image_url: "" },
  { id: 6, name: "Pan Bimbo integral", slug: "pan-bimbo", category: "Panadería", brand: "Bimbo", store_name: "Walmart Express", price: 45, sale_price: null, is_available: true, show_in_whatsapp: false, image_url: "" },
  { id: 7, name: "Queso Oaxaca 400g", slug: "queso-oaxaca", category: "Lácteos", brand: "Esmeralda", store_name: "Fresko", price: 72, sale_price: 65, is_available: true, show_in_whatsapp: true, image_url: "" },
  { id: 8, name: "Huevo blanco 18pz", slug: "huevo-blanco", category: "Abarrotes", brand: "San Juan", store_name: "La Comer", price: 52, sale_price: null, is_available: true, show_in_whatsapp: true, image_url: "" },
  { id: 9, name: "Arroz Morelos 1kg", slug: "arroz-morelos", category: "Abarrotes", brand: "Verde Valle", store_name: "Chedraui", price: 32, sale_price: 28, is_available: true, show_in_whatsapp: false, image_url: "" },
  { id: 10, name: "Jabón Zote blanco", slug: "jabon-zote", category: "Limpieza", brand: "Zote", store_name: "Soriana", price: 15, sale_price: null, is_available: true, show_in_whatsapp: false, image_url: "" },
]

export default function AdminProductsPage() {
  const [products, setProducts] = useState(MOCK_PRODUCTS)
  const [search, setSearch] = useState("")

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.store_name.toLowerCase().includes(search.toLowerCase())
  )

  const toggleAvailable = (id: number) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_available: !p.is_available } : p)))
  }

  const toggleWhatsApp = (id: number) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, show_in_whatsapp: !p.show_in_whatsapp } : p)))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-sm text-gray-500">{products.length} productos registrados</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors text-sm">
          <Plus className="w-4 h-4" />
          Nuevo producto
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar producto, categoría o tienda..."
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
                <th className="px-5 py-3">Tienda</th>
                <th className="px-5 py-3">Precio</th>
                <th className="px-5 py-3">Disponible</th>
                <th className="px-5 py-3">WhatsApp</th>
                <th className="px-5 py-3"></th>
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
                        <p className="text-xs text-gray-400">{product.brand}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                      <Tag className="w-3 h-3" />
                      {product.category}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{product.store_name}</td>
                  <td className="px-5 py-3">
                    {product.sale_price ? (
                      <div>
                        <span className="font-semibold text-brand-600">${product.sale_price}</span>
                        <span className="ml-1.5 text-xs text-gray-400 line-through">${product.price}</span>
                      </div>
                    ) : (
                      <span className="font-semibold text-gray-900">${product.price}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleAvailable(product.id)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${
                        product.is_available ? "bg-green-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          product.is_available ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleWhatsApp(product.id)}
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
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
