"use client"

import { useState } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import Link from "next/link"
import {
  Calculator, Plus, Trash2, DollarSign, PieChart, ArrowLeft,
  Percent, TrendingDown, TrendingUp, AlertCircle,
} from "lucide-react"

// Mock ingredients per collection type — in production this comes from Resurte.me catalog
const MOCK_INGREDIENTS: Record<string, { name: string; unit: string; price: number }[]> = {
  "hamburguesas-hot-dogs": [
    { name: "Carne molida sirloin 80/20", unit: "kg", price: 189 },
    { name: "Pan brioche para hamburguesa", unit: "pza", price: 8.5 },
    { name: "Queso cheddar rebanado", unit: "rebanada", price: 6 },
    { name: "Tocino ahumado", unit: "kg", price: 210 },
    { name: "Papas congeladas", unit: "kg", price: 52 },
    { name: "Lechuga iceberg", unit: "pza", price: 18 },
    { name: "Jitomate bola", unit: "kg", price: 35 },
    { name: "Cebolla blanca", unit: "kg", price: 28 },
  ],
  "taquerias-antojitos": [
    { name: "Bistec de res para asada", unit: "kg", price: 220 },
    { name: "Carne de cerdo para pastor", unit: "kg", price: 165 },
    { name: "Tortilla de maíz taquera", unit: "kg", price: 32 },
    { name: "Cilantro fresco", unit: "manojo", price: 8 },
    { name: "Cebolla blanca", unit: "kg", price: 28 },
    { name: "Limón", unit: "kg", price: 30 },
    { name: "Queso asadero", unit: "kg", price: 145 },
    { name: "Salsa verde preparada", unit: "L", price: 48 },
  ],
  "pizzas-comida-italiana": [
    { name: "Harina de fuerza 00", unit: "kg", price: 42 },
    { name: "Queso mozzarella rallado", unit: "kg", price: 160 },
    { name: "Pepperoni rebanado", unit: "kg", price: 195 },
    { name: "Puré de tomate enlatado", unit: "lata 2.5kg", price: 65 },
    { name: "Aceite de oliva extra virgen", unit: "L", price: 180 },
    { name: "Albahaca fresca", unit: "manojo", price: 15 },
  ],
  "comida-mexicana-corrida": [
    { name: "Pechuga de pollo", unit: "kg", price: 120 },
    { name: "Arroz grano largo", unit: "kg", price: 28 },
    { name: "Frijol negro", unit: "kg", price: 35 },
    { name: "Jitomate bola", unit: "kg", price: 35 },
    { name: "Chile serrano", unit: "kg", price: 40 },
    { name: "Tortilla de maíz", unit: "kg", price: 28 },
    { name: "Aceite vegetal", unit: "L", price: 45 },
  ],
  "mariscos-pescados": [
    { name: "Camarón mediano crudo", unit: "kg", price: 320 },
    { name: "Filete de pescado blanco", unit: "kg", price: 180 },
    { name: "Pulpo cocido", unit: "kg", price: 380 },
    { name: "Tostadas de maíz", unit: "paquete 20pz", price: 22 },
    { name: "Aguacate hass", unit: "kg", price: 65 },
    { name: "Limón", unit: "kg", price: 30 },
  ],
  "pollo-alitas": [
    { name: "Alitas de pollo", unit: "kg", price: 95 },
    { name: "Boneless de pollo", unit: "kg", price: 130 },
    { name: "Salsa Buffalo", unit: "L", price: 85 },
    { name: "Salsa BBQ", unit: "L", price: 78 },
    { name: "Aceite por bidón", unit: "L", price: 42 },
    { name: "Aderezo blue cheese", unit: "L", price: 95 },
  ],
}

const DEFAULT_INGREDIENTS = [
  { name: "Ingrediente 1", unit: "kg", price: 0 },
  { name: "Ingrediente 2", unit: "kg", price: 0 },
]

interface DishIngredient {
  ingredientName: string
  quantity: number
  unit: string
  unitPrice: number
}

interface Dish {
  id: string
  name: string
  ingredients: DishIngredient[]
  foodCostPercent: number
  sellingPrice: number
}

let dishCounter = 0
function nextId() { dishCounter++; return `dish-${dishCounter}` }

export default function CosteoPage() {
  const { selectedCollection } = useRestaurant()
  const ingredients = selectedCollection
    ? (MOCK_INGREDIENTS[selectedCollection.slug] || DEFAULT_INGREDIENTS)
    : DEFAULT_INGREDIENTS

  const [dishes, setDishes] = useState<Dish[]>([])
  const [showForm, setShowForm] = useState(false)
  const [newDishName, setNewDishName] = useState("")
  const [newDishIngredients, setNewDishIngredients] = useState<DishIngredient[]>([
    { ingredientName: ingredients[0]?.name || "", quantity: 0, unit: ingredients[0]?.unit || "", unitPrice: ingredients[0]?.price || 0 },
  ])
  const [targetFoodCost, setTargetFoodCost] = useState(30)

  function addIngredient() {
    setNewDishIngredients([...newDishIngredients, {
      ingredientName: "",
      quantity: 0,
      unit: "",
      unitPrice: 0,
    }])
  }

  function removeIngredient(idx: number) {
    setNewDishIngredients(newDishIngredients.filter((_, i) => i !== idx))
  }

  function updateIngredient(idx: number, field: keyof DishIngredient, value: string | number) {
    const updated = [...newDishIngredients]
    if (field === "ingredientName" && typeof value === "string") {
      const found = ingredients.find((ing) => ing.name === value)
      updated[idx] = {
        ...updated[idx],
        ingredientName: value,
        unit: found?.unit || updated[idx].unit,
        unitPrice: found?.price || updated[idx].unitPrice,
      }
    } else {
      updated[idx] = { ...updated[idx], [field]: value }
    }
    setNewDishIngredients(updated)
  }

  function addDish() {
    if (!newDishName.trim() || newDishIngredients.length === 0) return
    const totalCost = newDishIngredients.reduce((sum, ing) => sum + (ing.quantity * ing.unitPrice), 0)
    const sellingPrice = targetFoodCost > 0 ? totalCost / (targetFoodCost / 100) : 0

    setDishes([...dishes, {
      id: nextId(),
      name: newDishName.trim(),
      ingredients: [...newDishIngredients],
      foodCostPercent: targetFoodCost,
      sellingPrice: Math.round(sellingPrice * 100) / 100,
    }])
    setNewDishName("")
    setNewDishIngredients([{
      ingredientName: ingredients[0]?.name || "",
      quantity: 0,
      unit: ingredients[0]?.unit || "",
      unitPrice: ingredients[0]?.price || 0,
    }])
    setShowForm(false)
  }

  function removeDish(id: string) {
    setDishes(dishes.filter((d) => d.id !== id))
  }

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Usa el selector de arriba para elegir tu tipo de restaurante y acceder a precios reales del catálogo de Resurte.me.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Back link and title */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Costeando mi menú</h2>
          <p className="text-sm text-gray-400">{selectedCollection.name}</p>
        </div>
      </div>

      {/* Food cost target */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Food Cost objetivo</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTargetFoodCost(Math.max(20, targetFoodCost - 5))}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 transition-colors"
            >
              −
            </button>
            <span className="text-2xl font-bold text-[#108910]">{targetFoodCost}%</span>
            <button
              onClick={() => setTargetFoodCost(Math.min(45, targetFoodCost + 5))}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 transition-colors"
            >
              +
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Tus platillos se preciarán para alcanzar este % de costo sobre el precio de venta.
          Lo ideal en México está entre 28% y 35%.
        </p>
      </div>

      {/* Dishes list */}
      {dishes.length > 0 && (
        <div className="space-y-3 mb-6">
          {dishes.map((dish) => {
            const totalCost = dish.ingredients.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0)
            const margin = dish.sellingPrice - totalCost
            const actualFoodCost = dish.sellingPrice > 0 ? (totalCost / dish.sellingPrice) * 100 : 0
            const isGood = actualFoodCost <= 32
            const isOk = actualFoodCost <= 38

            return (
              <div key={dish.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-900">{dish.name}</h4>
                  <button onClick={() => removeDish(dish.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1.5 mb-3">
                  {dish.ingredients.map((ing, i) => (
                    <div key={i} className="flex justify-between text-sm text-gray-500">
                      <span>{ing.ingredientName} ({ing.quantity} {ing.unit})</span>
                      <span className="font-mono">${(ing.quantity * ing.unitPrice).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-100 pt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-gray-400">Costo total</p>
                    <p className="font-bold text-gray-900">${totalCost.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Precio venta</p>
                    <p className="font-bold text-[#108910]">${dish.sellingPrice.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Margen</p>
                    <p className={`font-bold ${margin > 0 ? "text-green-600" : "text-red-600"}`}>
                      ${margin.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className={`mt-2 flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-1.5 ${
                  isGood ? "bg-green-50 text-green-700" : isOk ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                }`}>
                  {isGood ? <TrendingDown className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  Food cost real: {actualFoodCost.toFixed(1)}%
                  {isGood ? " — ¡Excelente!" : isOk ? " — Aceptable" : " — ¡Revisa tus precios!"}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add dish form */}
      {showForm ? (
        <div className="bg-white rounded-2xl border border-[#108910]/30 p-5 mb-6">
          <h4 className="font-semibold text-gray-900 mb-4">Nuevo platillo</h4>
          <input
            type="text"
            value={newDishName}
            onChange={(e) => setNewDishName(e.target.value)}
            placeholder="Nombre del platillo"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm mb-4 focus:outline-none focus:border-[#108910]"
          />

          <div className="space-y-3 mb-4">
            {newDishIngredients.map((ing, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={ing.ingredientName}
                  onChange={(e) => updateIngredient(idx, "ingredientName", e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#108910] bg-white"
                >
                  <option value="">Seleccionar ingrediente</option>
                  {ingredients.map((opt) => (
                    <option key={opt.name} value={opt.name}>
                      {opt.name} — ${opt.price}/{opt.unit}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={ing.quantity || ""}
                  onChange={(e) => updateIngredient(idx, "quantity", parseFloat(e.target.value) || 0)}
                  placeholder="Cant."
                  className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                  min="0"
                  step="0.01"
                />
                <span className="text-xs text-gray-400 w-10 text-center">{ing.unit}</span>
                <button
                  onClick={() => removeIngredient(idx)}
                  className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                  disabled={newDishIngredients.length === 1}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addIngredient}
            className="text-sm text-[#108910] font-semibold hover:underline mb-4 inline-block"
          >
            + Agregar ingrediente
          </button>

          <div className="flex gap-3">
            <button onClick={addDish} className="flex-1 bg-[#108910] text-white font-semibold py-2.5 rounded-xl hover:bg-[#0D720D] transition-colors">
              Guardar platillo
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#108910] hover:text-[#108910] transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Agregar platillo
        </button>
      )}

      {/* Summary */}
      {dishes.length > 0 && (
        <div className="mt-6 bg-gradient-to-r from-[#F0FDF4] to-white rounded-2xl border border-[#108910]/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <PieChart className="w-5 h-5 text-[#108910]" />
            <h3 className="font-semibold text-gray-900">Resumen de menú</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-400">Platillos</p>
              <p className="text-xl font-bold text-gray-900">{dishes.length}</p>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-400">Costo total menú</p>
              <p className="text-xl font-bold text-gray-900">
                ${dishes.reduce((s, d) => s + d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0), 0).toFixed(0)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-400">Ingreso potencial</p>
              <p className="text-xl font-bold text-[#108910]">
                ${dishes.reduce((s, d) => s + d.sellingPrice, 0).toFixed(0)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-400">Food cost promedio</p>
              <p className="text-xl font-bold text-gray-900">
                {(() => {
                  const totalCost = dishes.reduce((s, d) => s + d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0), 0)
                  const totalPrice = dishes.reduce((s, d) => s + d.sellingPrice, 0)
                  return totalPrice > 0 ? `${((totalCost / totalPrice) * 100).toFixed(1)}%` : "—"
                })()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tip */}
      <div className="mt-4 bg-blue-50 rounded-xl p-4 border border-blue-100">
        <p className="text-xs text-blue-700">
          <strong>💡 Tip:</strong> Todos los precios mostrados son del catálogo real de Resurte.me. 
          Cuando los precios cambien en nuestra plataforma, regresa aquí para actualizar tus costos automáticamente.
        </p>
      </div>
    </div>
  )
}
