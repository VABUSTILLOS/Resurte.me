"use client"

import { useState } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
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
  "sushi-comida-asiatica": [
    { name: "Salmón grado sushi", unit: "kg", price: 480, perPerson: 0.1, category: "Proteína" },
    { name: "Arroz para sushi", unit: "kg", price: 55, perPerson: 0.12, category: "Granos" },
    { name: "Alga nori", unit: "hoja", price: 2.5, perPerson: 2, category: "Algas" },
    { name: "Aguacate", unit: "kg", price: 65, perPerson: 0.05, category: "Fruta" },
    { name: "Queso crema", unit: "kg", price: 150, perPerson: 0.03, category: "Lácteos" },
    { name: "Salsa de soya", unit: "L", price: 72, perPerson: 0.01, category: "Salsas" },
  ],
  "cortes-carne-asaderos": [
    { name: "Ribeye", unit: "kg", price: 580, perPerson: 0.35, category: "Proteína" },
    { name: "Arrachera", unit: "kg", price: 320, perPerson: 0.3, category: "Proteína" },
    { name: "Chorizo argentino", unit: "kg", price: 185, perPerson: 0.15, category: "Proteína" },
    { name: "Papa para asar", unit: "kg", price: 35, perPerson: 0.2, category: "Guarnición" },
    { name: "Chile morrón", unit: "kg", price: 45, perPerson: 0.08, category: "Verdura" },
  ],
  "pollo-alitas": [
    { name: "Alitas de pollo", unit: "kg", price: 95, perPerson: 0.35, category: "Proteína" },
    { name: "Boneless", unit: "kg", price: 130, perPerson: 0.3, category: "Proteína" },
    { name: "Salsa Buffalo", unit: "L", price: 85, perPerson: 0.04, category: "Salsas" },
    { name: "Papas fritas", unit: "kg", price: 52, perPerson: 0.15, category: "Acompañamiento" },
    { name: "Aderezo ranch", unit: "L", price: 68, perPerson: 0.02, category: "Salsas" },
  ],
  "cafeterias-crepas-desayunos": [
    { name: "Huevo", unit: "docena", price: 48, perPerson: 0.17, category: "Proteína" },
    { name: "Harina hot cakes", unit: "kg", price: 38, perPerson: 0.12, category: "Harinas" },
    { name: "Café en grano", unit: "kg", price: 220, perPerson: 0.015, category: "Bebidas" },
    { name: "Leche", unit: "L", price: 28, perPerson: 0.2, category: "Lácteos" },
    { name: "Jarabe de maple", unit: "L", price: 130, perPerson: 0.015, category: "Endulzantes" },
  ],
  "mariscos-pescados": [
    { name: "Camarón mediano", unit: "kg", price: 320, perPerson: 0.2, category: "Proteína" },
    { name: "Filete de pescado", unit: "kg", price: 180, perPerson: 0.25, category: "Proteína" },
    { name: "Pulpo cocido", unit: "kg", price: 380, perPerson: 0.15, category: "Proteína" },
    { name: "Tostadas", unit: "paquete 20pz", price: 22, perPerson: 0.15, category: "Base" },
    { name: "Limón", unit: "kg", price: 30, perPerson: 0.05, category: "Fruta" },
    { name: "Aguacate", unit: "kg", price: 65, perPerson: 0.08, category: "Fruta" },
  ],
  "saludable-ensaladas-pokes": [
    { name: "Salmón fresco", unit: "kg", price: 450, perPerson: 0.15, category: "Proteína" },
    { name: "Atún fresco", unit: "kg", price: 380, perPerson: 0.15, category: "Proteína" },
    { name: "Quinoa", unit: "kg", price: 85, perPerson: 0.08, category: "Granos" },
    { name: "Mix lechugas", unit: "kg", price: 72, perPerson: 0.12, category: "Verdura" },
    { name: "Edamame", unit: "kg", price: 65, perPerson: 0.05, category: "Proteína" },
  ],
  "postres-panaderia-helados": [
    { name: "Harina de trigo", unit: "kg", price: 32, perPerson: 0.15, category: "Harinas" },
    { name: "Mantequilla", unit: "kg", price: 160, perPerson: 0.05, category: "Lácteos" },
    { name: "Chocolate belga", unit: "kg", price: 280, perPerson: 0.04, category: "Chocolate" },
    { name: "Crema para batir", unit: "L", price: 75, perPerson: 0.06, category: "Lácteos" },
    { name: "Azúcar", unit: "kg", price: 35, perPerson: 0.05, category: "Endulzantes" },
    { name: "Huevo", unit: "docena", price: 48, perPerson: 0.08, category: "Proteína" },
  ],
  "comida-arabe-griega": [
    { name: "Carne de cordero", unit: "kg", price: 340, perPerson: 0.2, category: "Proteína" },
    { name: "Pechuga de pollo", unit: "kg", price: 120, perPerson: 0.2, category: "Proteína" },
    { name: "Garbanzo", unit: "kg", price: 42, perPerson: 0.1, category: "Granos" },
    { name: "Tahini", unit: "kg", price: 160, perPerson: 0.015, category: "Salsas" },
    { name: "Pan pita", unit: "pza", price: 4, perPerson: 2, category: "Pan" },
    { name: "Yogur griego", unit: "L", price: 65, perPerson: 0.04, category: "Lácteos" },
  ],
  "comida-venezolana-latina": [
    { name: "Harina P.A.N.", unit: "kg", price: 45, perPerson: 0.15, category: "Harinas" },
    { name: "Carne mechada", unit: "kg", price: 195, perPerson: 0.18, category: "Proteína" },
    { name: "Plátano macho", unit: "kg", price: 30, perPerson: 0.2, category: "Acompañamiento" },
    { name: "Queso blanco", unit: "kg", price: 140, perPerson: 0.06, category: "Lácteos" },
    { name: "Frijol negro", unit: "kg", price: 35, perPerson: 0.08, category: "Granos" },
  ],
  "bebidas-bares-botanas": [
    { name: "Cacahuate", unit: "kg", price: 72, perPerson: 0.05, category: "Botana" },
    { name: "Cueritos", unit: "kg", price: 55, perPerson: 0.06, category: "Botana" },
    { name: "Alitas", unit: "kg", price: 95, perPerson: 0.2, category: "Proteína" },
    { name: "Limón", unit: "kg", price: 30, perPerson: 0.03, category: "Fruta" },
    { name: "Chile en polvo", unit: "kg", price: 85, perPerson: 0.003, category: "Condimentos" },
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
  const [sharedDishes] = useSharedDishes(slug)
  const products = selectedCollection
    ? (COLLECTION_PRODUCTS[selectedCollection.slug] || DEFAULT_PRODUCTS)
    : DEFAULT_PRODUCTS

  const [covers, setCovers] = useLocalStorage<number>("planner-covers", 50, slug)
  const [wastePercent, setWastePercent] = useLocalStorage<number>("planner-waste", 8, slug)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [showOrder, setShowOrder] = useState(false)
  const [manualQtys, setManualQtys] = useLocalStorage<Record<string, number>>("planner-manual-qtys", {}, slug)

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
    const autoNeeded = p.perPerson * covers * (1 + wastePercent / 100)
    const needed = p.name in manualQtys ? manualQtys[p.name] : autoNeeded
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
          {sharedDishes.length > 0 && (
            <p className="text-xs text-[#108910] font-medium mt-0.5">
              {sharedDishes.length} platillos de Costeando mi menú — revisa cantidades abajo
            </p>
          )}
        </div>
      </div>

      {/* Shared dishes from Costeo — quick ingredient needs reference */}
      {sharedDishes.length > 0 && (
        <div className="bg-white rounded-2xl border border-green-100 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-green-600" />
            <h3 className="text-sm font-semibold text-gray-700">
              Tus platillos activos ({sharedDishes.length})
            </h3>
            <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full ml-auto">
              Del Costeador
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {sharedDishes.map((dish) => {
              const totalGrams = dish.ingredients.reduce((sum, ing) => sum + (ing.quantity || 0), 0)
              const scaledGrams = totalGrams * covers
              const scaledKg = (scaledGrams / 1000).toFixed(1)
              return (
                <div key={dish.id} className="flex items-center justify-between bg-green-50/50 rounded-xl px-3 py-2 text-xs">
                  <span className="font-medium text-gray-700 truncate mr-2">{dish.name}</span>
                  <span className="text-green-700 whitespace-nowrap font-medium">
                    ~{scaledKg} kg para {covers} pax
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Estimación basada en las cantidades por platillo × {covers} comensales. Agrega {wastePercent}% de merma.
          </p>
        </div>
      )}

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
                  const autoNeeded = item.perPerson * covers * (1 + wastePercent / 100)
                  const isManual = item.name in manualQtys
                  const needed = isManual ? manualQtys[item.name] : autoNeeded
                  const cost = needed * item.price
                  return (
                    <div key={idx} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="min-w-0 mr-4 flex-1">
                        <p className="font-medium text-gray-800 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">${item.price}/{item.unit}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          value={needed < 1 ? parseFloat((needed * 1000).toFixed(0)) : parseFloat(needed.toFixed(2))}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            const unitVal = item.unit === "kg" || item.unit === "L" ? val : val / 1000
                            if (val === 0) {
                              setManualQtys((prev) => { const { [item.name]: _, ...rest } = prev; return rest })
                            } else {
                              setManualQtys((prev) => ({ ...prev, [item.name]: unitVal }))
                            }
                          }}
                          className={`w-20 text-right text-sm font-mono font-bold py-1 px-2 rounded-lg border focus:outline-none ${
                            isManual ? "border-amber-300 bg-amber-50 text-amber-800" : "border-transparent bg-gray-50 text-gray-900 hover:border-gray-200"
                          }`}
                          step={item.unit === "kg" || item.unit === "L" ? "0.01" : "1"}
                          min="0"
                          title={isManual ? "Cantidad manual" : "Click para ajustar"}
                        />
                        <span className="text-xs text-gray-400 w-12 text-left">{item.unit === "kg" || item.unit === "L" || needed >= 1 ? item.unit : "g"}</span>
                        <p className="text-xs text-emerald-600 font-medium w-16 text-right">
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
      <div className="mt-4 space-y-3">
        <button
          onClick={() => setShowOrder(!showOrder)}
          className="w-full flex items-center justify-center gap-2 bg-[#108910] hover:bg-green-800 text-white font-bold py-3 rounded-2xl transition-colors"
        >
          <ShoppingCart className="w-5 h-5" />
          {showOrder ? "Ocultar lista de pedido" : "Generar lista de pedido"}
        </button>

        {/* Order summary */}
        {showOrder && (
          <div className="bg-white rounded-2xl border-2 border-[#108910]/20 p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-gray-900">📋 Lista de pedido — {selectedCollection.name}</h4>
              <button
                onClick={() => {
                  const text = products.map((p) => {
                    const needed = (p.perPerson * covers * (1 + wastePercent / 100)).toFixed(2)
                    return `• ${p.name}: ${needed} ${p.unit} — $${(parseFloat(needed) * p.price).toFixed(0)} MXN ($${p.price}/${p.unit})`
                  }).join("\n")
                  const header = `Pedido para ${covers} comensales (+${wastePercent}% merma) — ${selectedCollection.name}\n\n`
                  navigator.clipboard.writeText(header + text + `\n\nTotal estimado: $${totalCost.toFixed(0)} MXN\nPedido generado con Resurte.me`)
                }}
                className="text-xs font-semibold text-[#108910] hover:text-green-800 transition-colors"
              >
                📋 Copiar
              </button>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {products.map((p) => {
                const needed = (p.perPerson * covers * (1 + wastePercent / 100)).toFixed(2)
                const subtotal = parseFloat(needed) * p.price
                return (
                  <div key={p.name} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-gray-800">{p.name}</span>
                      <span className="text-gray-400 ml-1">{needed} {p.unit}</span>
                    </div>
                    <span className="font-semibold text-gray-700 text-xs">${subtotal.toFixed(0)}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
              <span className="font-bold text-gray-900">Total estimado</span>
              <span className="font-extrabold text-[#108910] text-lg">${totalCost.toFixed(0)} MXN</span>
            </div>
          </div>
        )}

        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
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
    </div>
  )
}
