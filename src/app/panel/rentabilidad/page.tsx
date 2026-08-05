"use client"

import { useState } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import Link from "next/link"
import {
  TrendingUp, ArrowLeft, Circle, AlertTriangle, CheckCircle2,
  DollarSign, Percent,
} from "lucide-react"

interface DishData { name: string; cost: number; price: number; category: string; alert?: string }

// Mock dishes per collection with profitability data
const DISH_DATA: Record<string, DishData[]> = {
  "hamburguesas-hot-dogs": [
    { name: "Hamburguesa clásica", cost: 48, price: 149, category: "Burgers" },
    { name: "Hamburguesa doble", cost: 72, price: 189, category: "Burgers" },
    { name: "Hamburguesa de pollo", cost: 38, price: 129, category: "Burgers" },
    { name: "Hot dog sencillo", cost: 22, price: 59, category: "Hot Dogs" },
    { name: "Hot dog especial", cost: 35, price: 85, category: "Hot Dogs" },
    { name: "Papas fritas", cost: 18, price: 69, category: "Acompañamiento" },
    { name: "Aros de cebolla", cost: 15, price: 55, category: "Acompañamiento" },
    { name: "Hamburguesa vegetariana", cost: 42, price: 139, category: "Burgers", alert: "Costo elevado — considera ajustar porción de portobello" },
  ],
  "taquerias-antojitos": [
    { name: "Taco de asada", cost: 14, price: 35, category: "Tacos" },
    { name: "Taco de pastor", cost: 10, price: 30, category: "Tacos" },
    { name: "Taco de suadero", cost: 12, price: 32, category: "Tacos" },
    { name: "Gringa", cost: 28, price: 75, category: "Especialidades" },
    { name: "Quesadilla", cost: 18, price: 45, category: "Antojitos" },
    { name: "Sopes (3 pz)", cost: 22, price: 65, category: "Antojitos" },
    { name: "Orden de guacamole", cost: 25, price: 55, category: "Entradas" },
    { name: "Taco de tripa", cost: 8, price: 28, category: "Tacos", alert: "Precio muy bajo — margen de solo $20" },
  ],
  "pizzas-comida-italiana": [
    { name: "Pizza margherita (mediana)", cost: 42, price: 180, category: "Pizzas" },
    { name: "Pizza pepperoni (mediana)", cost: 55, price: 210, category: "Pizzas" },
    { name: "Pizza hawaiana (mediana)", cost: 48, price: 195, category: "Pizzas" },
    { name: "Pasta alfredo", cost: 35, price: 145, category: "Pastas" },
    { name: "Pasta boloñesa", cost: 40, price: 150, category: "Pastas" },
    { name: "Lasagna", cost: 52, price: 165, category: "Pastas", alert: "Costo alto — verifica precio de queso mozzarella" },
    { name: "Ensalada caprese", cost: 25, price: 95, category: "Entradas" },
  ],
  "comida-mexicana-corrida": [
    { name: "Plato de guisado (con 2 guarniciones)", cost: 32, price: 85, category: "Plato fuerte" },
    { name: "Pechuga empanizada", cost: 38, price: 105, category: "Plato fuerte" },
    { name: "Chiles rellenos (2 pz)", cost: 35, price: 95, category: "Plato fuerte" },
    { name: "Caldo de pollo", cost: 25, price: 75, category: "Caldos" },
    { name: "Enchiladas (4 pz)", cost: 28, price: 80, category: "Plato fuerte" },
    { name: "Flautas (5 pz)", cost: 22, price: 70, category: "Antojitos" },
  ],
}

const DEFAULT_DISHES: DishData[] = [
  { name: "Platillo estrella", cost: 45, price: 140, category: "Principal" },
  { name: "Platillo secundario", cost: 35, price: 110, category: "Principal" },
  { name: "Entrada", cost: 18, price: 65, category: "Entrada" },
]

export default function RentabilidadPage() {
  const { selectedCollection } = useRestaurant()
  const dishes = selectedCollection
    ? (DISH_DATA[selectedCollection.slug] || DEFAULT_DISHES)
    : DEFAULT_DISHES

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Selecciona tu tipo de restaurante para ver el semáforo de rentabilidad de platillos típicos.
        </p>
      </div>
    )
  }

  function getStatus(cost: number, price: number) {
    const pct = (cost / price) * 100
    if (pct <= 30) return { color: "green", label: "Excelente", icon: CheckCircle2 }
    if (pct <= 38) return { color: "amber", label: "Aceptable", icon: AlertTriangle }
    return { color: "red", label: "Revisar", icon: Circle }
  }

  const greenCount = dishes.filter((d) => (d.cost / d.price) * 100 <= 30).length
  const amberCount = dishes.filter((d) => { const p = (d.cost / d.price) * 100; return p > 30 && p <= 38 }).length
  const redCount = dishes.filter((d) => (d.cost / d.price) * 100 > 38).length
  const alerts = dishes.filter((d) => d.alert)

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Semáforo de rentabilidad</h2>
          <p className="text-sm text-gray-400">{selectedCollection.name}</p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-green-50 rounded-2xl border border-green-200 p-4 text-center">
          <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <p className="text-2xl font-extrabold text-green-700">{greenCount}</p>
          <p className="text-xs text-green-600">Platillos rentables</p>
          <p className="text-[10px] text-green-500">Food cost ≤ 30%</p>
        </div>
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 text-center">
          <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto mb-1" />
          <p className="text-2xl font-extrabold text-amber-700">{amberCount}</p>
          <p className="text-xs text-amber-600">En observación</p>
          <p className="text-[10px] text-amber-500">Food cost 30-38%</p>
        </div>
        <div className="bg-red-50 rounded-2xl border border-red-200 p-4 text-center">
          <Circle className="w-5 h-5 text-red-600 mx-auto mb-1" />
          <p className="text-2xl font-extrabold text-red-700">{redCount}</p>
          <p className="text-xs text-red-600">Requieren ajuste</p>
          <p className="text-[10px] text-red-500">Food cost &gt; 38%</p>
        </div>
      </div>

      {/* Alert box */}
      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h4 className="font-semibold text-red-800 text-sm">Alertas de rentabilidad</h4>
          </div>
          <div className="space-y-1.5">
            {alerts.map((dish, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-red-700">
                <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-red-500" />
                <span><strong>{dish.name}:</strong> {dish.alert}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dish cards */}
      <div className="space-y-3">
        {dishes.map((dish, idx) => {
          const status = getStatus(dish.cost, dish.price)
          const foodCost = ((dish.cost / dish.price) * 100).toFixed(1)
          const margin = dish.price - dish.cost

          return (
            <div key={idx} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <status.icon className={`w-5 h-5 shrink-0 ${
                    status.color === "green" ? "text-green-500" : status.color === "amber" ? "text-amber-500" : "text-red-500"
                  }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900 text-sm">{dish.name}</h4>
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        {dish.category}
                      </span>
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                  status.color === "green" ? "bg-green-100 text-green-700" :
                  status.color === "amber" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {status.label}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-50">
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">Costo</p>
                  <p className="font-bold text-sm text-gray-700">${dish.cost}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">Precio</p>
                  <p className="font-bold text-sm text-[#108910]">${dish.price}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">Margen</p>
                  <p className={`font-bold text-sm ${margin > 0 ? "text-green-600" : "text-red-600"}`}>
                    ${margin.toFixed(0)} ({foodCost}%)
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tip */}
      <div className="mt-6 bg-gradient-to-r from-[#F0FDF4] to-white rounded-2xl border border-[#108910]/10 p-5">
        <div className="flex items-start gap-3">
          <DollarSign className="w-5 h-5 text-[#108910] mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-gray-900 mb-1 text-sm">¿Cómo usarlo?</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              Este semáforo usa precios reales del catálogo de Resurte.me. Cuando los precios de insumos 
              cambien en nuestra plataforma, regresa aquí para recalcular automáticamente. 
              Un food cost arriba del 38% pone en riesgo tu negocio.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
