"use client"

import { useRestaurant } from "@/contexts/restaurant-context"
import Link from "next/link"
import {
  Calculator, ShoppingCart, Trash2, TrendingUp,
  Calendar, ClipboardCheck, ArrowRight, ChefHat,
} from "lucide-react"

interface Tool {
  title: string
  description: string
  icon: typeof Calculator
  href: string
  color: string
  bgColor: string
  collectionDesc?: (name: string) => string
}

const TOOLS: Tool[] = [
  {
    title: "Costeando mi menú",
    description: "Calcula el costo real de cada platillo usando precios del catálogo de Resurte.me. Define tu food cost ideal y recibe el precio de venta sugerido.",
    icon: Calculator,
    href: "/panel/costeo",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    collectionDesc: (name) => `Costea los platillos típicos de ${name} con precios reales de Resurte.me.`,
  },
  {
    title: "Planificador de pedidos",
    description: "Según tus comensales esperados, calcula cuánto pedir de cada insumo. Ajusta por merma y genera tu orden directamente en Resurte.me.",
    icon: ShoppingCart,
    href: "/panel/planificador",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    collectionDesc: (name) => `Planea tus compras para ${name} según la demanda esperada.`,
  },
  {
    title: "Calculadora de mermas",
    description: "Registra tu desperdicio por categoría y descubre cuánto dinero estás perdiendo. Recibe tips prácticos para reducir merma en cada tipo de insumo.",
    icon: Trash2,
    href: "/panel/mermas",
    color: "text-red-600",
    bgColor: "bg-red-50",
    collectionDesc: (name) => `Controla el desperdicio típico de ${name} y reduce pérdidas.`,
  },
  {
    title: "Semáforo de rentabilidad",
    description: "Visualiza tus platillos en verde, amarillo o rojo según su margen. Recibe alertas cuando los precios de insumos cambien y afecten tu rentabilidad.",
    icon: TrendingUp,
    href: "/panel/rentabilidad",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    collectionDesc: (name) => `Monitorea la rentabilidad de tu menú de ${name} en tiempo real.`,
  },
  {
    title: "Planificador de temporada",
    description: "Calendario de frutas y verduras de temporada en México. Arma menús estacionales con los insumos más frescos y baratos del momento.",
    icon: Calendar,
    href: "/panel/temporada",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    collectionDesc: (name) => `Descubre los insumos de temporada ideales para ${name}.`,
  },
  {
    title: "Kit de apertura",
    description: "Checklist paso a paso para abrir tu restaurante. Calculadora de inversión inicial y sugerencias de primeros pedidos según tu tipo de cocina.",
    icon: ClipboardCheck,
    href: "/panel/apertura",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    collectionDesc: (name) => `Todo lo que necesitas para abrir tu ${name}, en un solo lugar.`,
  },
]

export default function PanelPage() {
  const { selectedCollection } = useRestaurant()

  return (
    <div>
      {/* Hero section */}
      <div className="mb-8">
        {selectedCollection ? (
          <div className="bg-gradient-to-r from-[#F0FDF4] to-[#E8F5E8] rounded-2xl p-6 sm:p-8 border border-[#108910]/10">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-[#108910]/10 rounded-2xl flex items-center justify-center shrink-0">
                <ChefHat className="w-7 h-7 text-[#108910]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Panel para {selectedCollection.name}
                </h2>
                <p className="text-gray-500 max-w-2xl">
                  Todas las herramientas están calibradas para tu tipo de cocina. 
                  Resurte.me es tu único proveedor: todos los precios, sugerencias 
                  y cálculos usan nuestro catálogo real.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-6 sm:p-8 border border-amber-200/50">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
                <ChefHat className="w-7 h-7 text-amber-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  ¡Elige tu tipo de restaurante!
                </h2>
                <p className="text-gray-500 max-w-2xl">
                  Selecciona el tipo de cocina de tu negocio en el selector de arriba. 
                  Así personalizamos cada herramienta con sugerencias, precios e 
                  insumos relevantes para ti. Todo basado en el catálogo real de Resurte.me.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tool cards grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={selectedCollection ? tool.href : "#"}
            onClick={(e) => {
              if (!selectedCollection) e.preventDefault()
            }}
            className={`group relative bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-gray-200 transition-all ${
              !selectedCollection ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            <div className={`w-11 h-11 ${tool.bgColor} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <tool.icon className={`w-5 h-5 ${tool.color}`} />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1.5">{tool.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-3">
              {selectedCollection && tool.collectionDesc
                ? tool.collectionDesc(selectedCollection.name)
                : tool.description}
            </p>
            <div className="flex items-center gap-1 text-sm font-semibold text-[#108910] group-hover:gap-2 transition-all">
              {selectedCollection ? "Abrir herramienta" : "Selecciona tu cocina"}
              <ArrowRight className="w-4 h-4" />
            </div>
            {!selectedCollection && (
              <div className="absolute inset-0 bg-white/40 rounded-2xl flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-400 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                  Selecciona tu tipo de cocina ↑
                </span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
