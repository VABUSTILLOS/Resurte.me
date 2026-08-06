"use client"

import { useState } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage } from "@/hooks/use-local-storage"
import Link from "next/link"
import {
  ShoppingCart, ArrowLeft, Users, TrendingUp, AlertCircle,
  Package, ChevronDown, ChevronUp, Calculator, TrendingDown,
} from "lucide-react"

// Suggested items per collection based on typical restaurant needs
const COLLECTION_PRODUCTS: Record<string, { name: string; unit: string; price: number; perPerson: number; category: string }[]> = {
  "hamburguesas-hot-dogs": [
    { name: "Carne molida sirloin", unit: "kg", price: 189, perPerson: 0.18, category: "Proteína" },
    { name: "Pan brioche", unit: "pza", price: 8.5, perPerson: 1, category: "Pan" },
    { name: "Queso cheddar", unit: "rebanada", price: 6, perPerson: 1, category: "Lácteos" },
    { name: "Papas congeladas", unit: "kg", price: 52, perPerson: 0.15, category: "Acompañamiento" },
    { name: "Lechuga", unit: "pza", price: 18, perPerson: 0.1, category: "Verdura" },
    { name: "Jitomate", unit: "kg", price: 35, perPerson: 0.04, category: "Verdura" },
    { name: "Tocino", unit: "kg", price: 210, perPerson: 0.03, category: "Proteína" },
  ],
  "taquerias-antojitos": [
    { name: "Bistec de res", unit: "kg", price: 220, perPerson: 0.15, category: "Proteína" },
    { name: "Carne de pastor", unit: "kg", price: 165, perPerson: 0.12, category: "Proteína" },
    { name: "Tortilla taquera", unit: "kg", price: 32, perPerson: 0.1, category: "Tortillas" },
    { name: "Cilantro", unit: "manojo", price: 8, perPerson: 0.05, category: "Verdura" },
    { name: "Cebolla", unit: "kg", price: 28, perPerson: 0.03, category: "Verdura" },
    { name: "Limón", unit: "kg", price: 30, perPerson: 0.04, category: "Fruta" },
    { name: "Salsa verde", unit: "L", price: 48, perPerson: 0.015, category: "Salsas" },
  ],
  "pizzas-comida-italiana": [
    { name: "Harina 00", unit: "kg", price: 42, perPerson: 0.15, category: "Harinas" },
    { name: "Mozzarella", unit: "kg", price: 160, perPerson: 0.12, category: "Lácteos" },
    { name: "Pepperoni", unit: "kg", price: 195, perPerson: 0.04, category: "Proteína" },
    { name: "Puré de tomate", unit: "lata 2.5kg", price: 65, perPerson: 0.05, category: "Salsas" },
    { name: "Aceite de oliva", unit: "L", price: 180, perPerson: 0.005, category: "Aceites" },
  ],
  "comida-mexicana-corrida": [
    { name: "Pechuga de pollo", unit: "kg", price: 120, perPerson: 0.2, category: "Proteína" },
    { name: "Arroz", unit: "kg", price: 28, perPerson: 0.08, category: "Granos" },
    { name: "Frijol", unit: "kg", price: 35, perPerson: 0.06, category: "Granos" },
    { name: "Jitomate", unit: "kg", price: 35, perPerson: 0.06, category: "Verdura" },
    { name: "Tortillas", unit: "kg", price: 28, perPerson: 0.08, category: "Tortillas" },
    { name: "Aceite vegetal", unit: "L", price: 45, perPerson: 0.008, category: "Aceites" },
  ],
}

const DEFAULT_PRODUCTS = [
  { name: "Proteína principal", unit: "kg", price: 180, perPerson: 0.2, category: "Proteína" },
  { name: "Acompañamiento", unit: "kg", price: 40, perPerson: 0.15, category: "Guarnición" },
  { name: "Verdura", unit: "kg", price: 30, perPerson: 0.08, category: "Verdura" },
]

export default function PlanificadorPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const products = selectedCollection
    ? (COLLECTION_PRODUCTS[selectedCollection.slug] || DEFAULT_PRODUCTS)
    : DEFAULT_PRODUCTS

  const [covers, setCovers] = useLocalStorage<number>("planner-covers", 50, slug)
  const [wastePercent, setWastePercent] = useLocalStorage<number>("planner-waste", 8, slug)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  // Group by category
  const categories = new Map<string, typeof products>()
  products.forEach((p) => {
    const existing = categories.get(p.category) || []
    existing.push(p)
    categories.set(p.category, existing)
  })

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Usa el selector para personalizar tu lista de insumos y cantidades sugeridas por comensal.
        </p>
      </div>
    )
  }

  const totalCost = products.reduce((sum, p) => {
    const needed = p.perPerson * covers * (1 + wastePercent / 100)
    return sum + (needed * p.price)
  }, 0)

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Planificador de pedidos</h2>
          <p className="text-sm text-gray-400">{selectedCollection.name}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-gray-900">Comensales esperados</h3>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCovers(Math.max(5, covers - 10))}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 text-lg transition-colors"
            >
              −
            </button>
            <input
              type="number"
              value={covers}
              onChange={(e) => setCovers(Math.max(1, parseInt(e.target.value) || 0))}
              className="w-24 text-center text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-gray-200 focus:border-[#108910] focus:outline-none py-1"
            />
            <button
              onClick={() => setCovers(covers + 10)}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 text-lg transition-colors"
            >
              +
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-gray-900">% de merma estimada</h3>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setWastePercent(Math.max(0, wastePercent - 2))}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 text-lg transition-colors"
            >
              −
            </button>
            <input
              type="number"
              value={wastePercent}
              onChange={(e) => setWastePercent(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-20 text-center text-2xl font-bold text-amber-600 bg-transparent border-b-2 border-gray-200 focus:border-amber-500 focus:outline-none py-1"
            />
            <span className="text-2xl font-bold text-amber-600">%</span>
            <button
              onClick={() => setWastePercent(Math.min(30, wastePercent + 2))}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 text-lg transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Product list by category */}
      <div className="space-y-3 mb-6">
        {Array.from(categories.entries()).map(([category, items]) => (
          <div key={category} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                <span className="font-semibold text-gray-700">{category}</span>
                <span className="text-xs text-gray-400">({items.length} insumos)</span>
              </div>
              {expandedCategory === category
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />
              }
            </button>
            {expandedCategory === category && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {items.map((item, idx) => {
                  const needed = item.perPerson * covers * (1 + wastePercent / 100)
                  const cost = needed * item.price
                  return (
                    <div key={idx} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="min-w-0 mr-4">
                        <p className="font-medium text-gray-800 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">${item.price}/{item.unit}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-bold text-gray-900">
                          {needed < 1
                            ? `${(needed * 1000).toFixed(0)} g`
                            : `${needed.toFixed(2)} ${item.unit}`}
                        </p>
                        <p className="text-xs text-emerald-600 font-medium">
                          ${cost.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Total card */}
      <div className="bg-gradient-to-r from-emerald-50 to-[#F0FDF4] rounded-2xl border border-emerald-200/50 p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-gray-900">Costo total estimado</h3>
          </div>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">
            Para {covers} comensales
          </span>
        </div>
        <p className="text-4xl font-extrabold text-[#108910] mb-2">
          ${totalCost.toFixed(0)} <span className="text-lg font-medium text-gray-400">MXN</span>
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="bg-white rounded-lg px-2.5 py-1">
            ${(totalCost / covers).toFixed(2)} por comensal
          </span>
          <span className="bg-white rounded-lg px-2.5 py-1">
            +{wastePercent}% incluido por merma
          </span>
        </div>
      </div>

      {/* Waste savings delta */}
      {wastePercent > 5 && (
        <div className="mt-4 bg-amber-50 rounded-2xl border border-amber-200 p-5">
          <div className="flex items-start gap-3">
            <TrendingDown className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-amber-800 text-sm mb-1">
                Oportunidad de ahorro por reducción de merma
              </h4>
              <p className="text-xs text-amber-700 mb-2">
                Si reduces tu merma del <strong>{wastePercent}%</strong> al <strong>5%</strong> (nivel óptimo), 
                ahorrarías aproximadamente:
              </p>
              <p className="text-2xl font-extrabold text-amber-700">
                ${(() => {
                  const costNow = products.reduce((sum, p) => {
                    return sum + (p.perPerson * covers * (1 + wastePercent / 100) * p.price)
                  }, 0)
                  const costIdeal = products.reduce((sum, p) => {
                    return sum + (p.perPerson * covers * (1 + 5 / 100) * p.price)
                  }, 0)
                  return (costNow - costIdeal).toFixed(0)
                })()}
                <span className="text-sm font-medium text-amber-500"> MXN</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-4 bg-emerald-50 rounded-xl p-4 border border-emerald-100">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800 mb-1">
              ¿Listo para hacer tu pedido?
            </p>
            <p className="text-xs text-emerald-600">
              Todos estos insumos están disponibles en Resurte.me. Arma tu carrito con las cantidades sugeridas 
              y recibe todo en una sola entrega. Los precios son en tiempo real de nuestro catálogo.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
