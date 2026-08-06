"use client"

import { useState } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage } from "@/hooks/use-local-storage"
import Link from "next/link"
import {
  ClipboardCheck, ArrowLeft, CheckCircle2, Circle, DollarSign,
  Package, Store, CalendarClock,
} from "lucide-react"

interface ChecklistItem {
  id: string
  label: string
  phase: string
}

const PHASES = [
  "Planeación", "Legal y permisos", "Local e instalaciones",
  "Equipamiento", "Proveeduría", "Personal", "Soft opening",
]

// Checklist items specific to collection type
const COLLECTION_CHECKLISTS: Record<string, ChecklistItem[]> = {
  "hamburguesas-hot-dogs": [
    { id: "h1", label: "Definir concepto: gourmet, smash, fast casual", phase: "Planeación" },
    { id: "h2", label: "Seleccionar ubicación con alto tráfico peatonal", phase: "Local e instalaciones" },
    { id: "h3", label: "Plancha y freidora industrial", phase: "Equipamiento" },
    { id: "h4", label: "Congelador para carne y papas", phase: "Equipamiento" },
    { id: "h5", label: "Primer pedido: carne molida, pan, queso, papas", phase: "Proveeduría" },
    { id: "h6", label: "Diseñar menú base (3-5 burgers, hot dogs, acompañamientos)", phase: "Planeación" },
  ],
  "taquerias-antojitos": [
    { id: "t1", label: "Definir especialidad: asada, pastor, suadero, mixto", phase: "Planeación" },
    { id: "t2", label: "Trompo para pastor y plancha para asada", phase: "Equipamiento" },
    { id: "t3", label: "Mesa de trabajo de acero inoxidable", phase: "Equipamiento" },
    { id: "t4", label: "Primer pedido: carne, tortillas, verdura, salsas", phase: "Proveeduría" },
    { id: "t5", label: "Tramitar permiso de uso de suelo (puesto o local)", phase: "Legal y permisos" },
    { id: "t6", label: "Contratar taquero y ayudante", phase: "Personal" },
  ],
  "pizzas-comida-italiana": [
    { id: "p1", label: "Definir estilo: napolitana, neoyorquina, al molde", phase: "Planeación" },
    { id: "p2", label: "Horno de piedra o de convección para pizza", phase: "Equipamiento" },
    { id: "p3", label: "Batidora industrial para masa", phase: "Equipamiento" },
    { id: "p4", label: "Cámara de fermentación o espacio refrigerado", phase: "Equipamiento" },
    { id: "p5", label: "Primer pedido: harina, mozzarella, pepperoni, salsa", phase: "Proveeduría" },
    { id: "p6", label: "Cajas para delivery y bolsas térmicas", phase: "Equipamiento" },
  ],
  "comida-mexicana-corrida": [
    { id: "c1", label: "Definir menú rotativo (5-7 guisados)", phase: "Planeación" },
    { id: "c2", label: "Estufa industrial 4-6 quemadores", phase: "Equipamiento" },
    { id: "c3", label: "Ollas grandes, cazos y utensilios", phase: "Equipamiento" },
    { id: "c4", label: "Primer pedido: carnes, verdura, arroz, frijol, tortillas", phase: "Proveeduría" },
    { id: "c5", label: "Contenedores para comida para llevar", phase: "Proveeduría" },
  ],
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "d1", label: "Definir concepto y propuesta de valor", phase: "Planeación" },
  { id: "d2", label: "Elaborar plan de negocio básico", phase: "Planeación" },
  { id: "d3", label: "Tramitar licencia de funcionamiento", phase: "Legal y permisos" },
  { id: "d4", label: "Seleccionar y acondicionar local", phase: "Local e instalaciones" },
  { id: "d5", label: "Adquirir equipamiento de cocina", phase: "Equipamiento" },
  { id: "d6", label: "Registrarse en Resurte.me como proveedor principal", phase: "Proveeduría" },
  { id: "d7", label: "Hacer primer pedido de insumos", phase: "Proveeduría" },
  { id: "d8", label: "Contratar personal clave", phase: "Personal" },
  { id: "d9", label: "Realizar soft opening con amigos y familia", phase: "Soft opening" },
]

const INVESTMENT_TEMPLATES: Record<string, { item: string; low: number; high: number }[]> = {
  "hamburguesas-hot-dogs": [
    { item: "Plancha y freidora", low: 30000, high: 80000 },
    { item: "Congelador industrial", low: 15000, high: 35000 },
    { item: "Mobiliario (mesas, sillas, barra)", low: 20000, high: 60000 },
    { item: "Renta y depósito (primer mes)", low: 15000, high: 40000 },
    { item: "Insumos iniciales (Resurte.me)", low: 8000, high: 20000 },
    { item: "Licencias y permisos", low: 5000, high: 15000 },
    { item: "Branding y menús", low: 5000, high: 15000 },
    { item: "Capital de trabajo (3 meses)", low: 30000, high: 80000 },
  ],
  "taquerias-antojitos": [
    { item: "Plancha y trompo", low: 20000, high: 60000 },
    { item: "Refrigerador industrial", low: 12000, high: 25000 },
    { item: "Puesto/carreta o local", low: 8000, high: 40000 },
    { item: "Insumos iniciales (Resurte.me)", low: 6000, high: 15000 },
    { item: "Licencias y permisos", low: 3000, high: 10000 },
    { item: "Utensilios y desechables", low: 3000, high: 8000 },
    { item: "Capital de trabajo (3 meses)", low: 20000, high: 50000 },
  ],
  "pizzas-comida-italiana": [
    { item: "Horno para pizza", low: 40000, high: 120000 },
    { item: "Batidora industrial", low: 25000, high: 60000 },
    { item: "Cámara de fermentación", low: 15000, high: 40000 },
    { item: "Mobiliario", low: 20000, high: 50000 },
    { item: "Renta y depósito", low: 15000, high: 40000 },
    { item: "Insumos iniciales (Resurte.me)", low: 10000, high: 25000 },
    { item: "Cajas y empaque para delivery", low: 5000, high: 12000 },
    { item: "Capital de trabajo (3 meses)", low: 40000, high: 90000 },
  ],
  "comida-mexicana-corrida": [
    { item: "Estufa industrial", low: 15000, high: 40000 },
    { item: "Refrigerador y congelador", low: 15000, high: 35000 },
    { item: "Ollas, cazos y utensilios", low: 8000, high: 20000 },
    { item: "Mobiliario (mesas, sillas)", low: 10000, high: 30000 },
    { item: "Renta y depósito", low: 8000, high: 25000 },
    { item: "Insumos iniciales (Resurte.me)", low: 7000, high: 18000 },
    { item: "Licencias", low: 5000, high: 12000 },
    { item: "Capital de trabajo (3 meses)", low: 25000, high: 60000 },
  ],
}

const DEFAULT_INVESTMENT = [
  { item: "Equipamiento de cocina", low: 30000, high: 100000 },
  { item: "Mobiliario y adecuaciones", low: 20000, high: 60000 },
  { item: "Renta y depósito", low: 10000, high: 40000 },
  { item: "Insumos iniciales (Resurte.me)", low: 8000, high: 20000 },
  { item: "Licencias y permisos", low: 5000, high: 15000 },
  { item: "Capital de trabajo (3 meses)", low: 30000, high: 80000 },
]

export default function AperturaPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const [checked, setChecked] = useLocalStorage<string[]>("apertura-checked", [], slug)
  const [showCalculator, setShowCalculator] = useState(false)
  const [phaseDates, setPhaseDates] = useLocalStorage<Record<string, string>>("apertura-dates", {}, slug)

  const checkedSet = new Set(checked)

  const checklist = selectedCollection
    ? (COLLECTION_CHECKLISTS[selectedCollection.slug] || DEFAULT_CHECKLIST)
    : DEFAULT_CHECKLIST

  const investment = selectedCollection
    ? (INVESTMENT_TEMPLATES[selectedCollection.slug] || DEFAULT_INVESTMENT)
    : DEFAULT_INVESTMENT

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const arr = Array.isArray(prev) ? prev : []
      if (arr.includes(id)) return arr.filter((i) => i !== id)
      return [...arr, id]
    })
  }

  function setPhaseDate(phase: string, date: string) {
    setPhaseDates((prev) => ({ ...prev, [phase]: date }))
  }

  const completedCount = checklist.filter((c) => checkedSet.has(c.id)).length
  const progress = checklist.length > 0 ? (completedCount / checklist.length) * 100 : 0
  const invLow = investment.reduce((s, i) => s + i.low, 0)
  const invHigh = investment.reduce((s, i) => s + i.high, 0)

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Selecciona tu tipo de restaurante para recibir un checklist y calculadora de inversión personalizados.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Kit de apertura</h2>
          <p className="text-sm text-gray-400">{selectedCollection.name}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Progreso de apertura</h3>
          </div>
          <span className="text-sm font-bold text-indigo-600">
            {completedCount}/{checklist.length}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 to-[#108910] h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {progress >= 80 ? "¡Casi listo para abrir!" :
           progress >= 50 ? "Vas por buen camino." :
           progress > 0 ? "Continúa con los siguientes pasos." :
           "Marca los pasos conforme los completes."}
        </p>
      </div>

      {/* Checklist */}
      <div className="space-y-4 mb-6">
        {PHASES.map((phase) => {
          const items = checklist.filter((c) => c.phase === phase)
          if (items.length === 0) return null
          const phaseComplete = items.every((c) => checkedSet.has(c.id))
          const phaseDate = phaseDates[phase] || ""
          return (
          <div key={phase} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className={`px-5 py-3 flex items-center gap-2 border-b ${phaseComplete ? "bg-green-50 border-green-100" : "border-gray-50"}`}>
              {phaseComplete
                ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                : <Circle className="w-4 h-4 text-gray-300" />
              }
              <h4 className="font-semibold text-sm text-gray-700">{phase}</h4>
              <span className="text-xs text-gray-400 ml-auto">
                {items.filter((c) => checkedSet.has(c.id)).length}/{items.length}
              </span>
            </div>
            {/* Phase date estimate */}
            <div className="px-5 py-2 bg-gray-50/50 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-3.5 h-3.5 text-gray-400" />
                <input
                  type="date"
                  value={phaseDate}
                  onChange={(e) => setPhaseDate(phase, e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#108910] bg-white"
                />
                <span className="text-xs text-gray-400">Fecha objetivo</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleCheck(item.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  {checkedSet.has(item.id)
                    ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    : <Circle className="w-5 h-5 text-gray-300 shrink-0" />
                  }
                  <span className={`text-sm ${checkedSet.has(item.id) ? "text-gray-500 line-through" : "text-gray-700"}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
            </div>
          )
        })}
      </div>

      {/* Investment calculator */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
        <button
          onClick={() => setShowCalculator(!showCalculator)}
          className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Calculadora de inversión inicial</h3>
          </div>
          <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1 rounded-full">
            ${invLow.toLocaleString()} – ${invHigh.toLocaleString()}
          </span>
        </button>

        {showCalculator && (
          <div className="border-t border-gray-100 p-5">
            <div className="space-y-3 mb-4">
              {investment.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{item.item}</span>
                  <span className="text-sm font-mono font-semibold text-gray-900">
                    ${item.low.toLocaleString()} – ${item.high.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between">
              <span className="font-bold text-gray-900">Total estimado</span>
              <span className="font-bold text-[#108910]">
                ${invLow.toLocaleString()} – ${invHigh.toLocaleString()} MXN
              </span>
            </div>
          </div>
        )}
      </div>

      {/* First order CTA */}
      <div className="bg-gradient-to-r from-indigo-50 to-[#F0FDF4] rounded-2xl border border-indigo-100 p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-[#108910]/10 rounded-xl flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-[#108910]" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-1 text-sm">
              Tu primer pedido con Resurte.me
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              Cuando estés listo para abrir, tu primer pedido de insumos está a un clic. 
              Nuestro catálogo tiene todo lo que necesitas para {selectedCollection.name.toLowerCase()}, 
              con envío gratis desde $2,500 MXN.
            </p>
            <Link
              href="/auth/register"
              className="inline-flex items-center gap-2 text-sm font-semibold bg-[#108910] text-white px-5 py-2.5 rounded-xl hover:bg-[#0D720D] transition-colors"
            >
              <Store className="w-4 h-4" />
              Crear cuenta y empezar
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
