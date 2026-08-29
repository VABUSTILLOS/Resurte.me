"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useSyncedStorage } from "@/hooks/use-synced-storage"
import { useToast } from "@/components/toast"
import type { ShoppingItem, TransferItem } from "@/components/panel/temporada/temporada-shared"
import { t } from "@/lib/i18n/es"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import Link from "next/link"
import {
  Calendar, ArrowLeft, Sun, Leaf, DollarSign, TrendingDown,
  ChevronLeft, ChevronRight, Eye, ShoppingCart, Copy, X,
} from "lucide-react"

// Mexican seasonal produce calendar (when things are abundant/cheapest)
const SEASONS: Record<string, { name: string; months: number[]; icon: string; highPrice: number; lowPrice: number }> = {
  aguacate: { name: "Aguacate", months: [1, 2, 6, 7, 8, 9, 10, 11], icon: "🥑", highPrice: 49, lowPrice: 85 },
  jitomate: { name: "Jitomate", months: [1, 2, 3, 7, 8, 9, 10, 11, 12], icon: "🍅", highPrice: 18, lowPrice: 35 },
  cebolla: { name: "Cebolla", months: [1, 2, 3, 4, 5, 9, 10, 11, 12], icon: "🧅", highPrice: 15, lowPrice: 28 },
  limon: { name: "Limón", months: [1, 2, 3, 4, 5, 6, 7, 8], icon: "🍋", highPrice: 20, lowPrice: 55 },
  chile: { name: "Chile serrano", months: [1, 2, 3, 7, 8, 9, 10, 11, 12], icon: "🌶️", highPrice: 25, lowPrice: 48 },
  cilantro: { name: "Cilantro", months: [1, 2, 3, 10, 11, 12], icon: "🌿", highPrice: 30, lowPrice: 60 },
  mango: { name: "Mango", months: [3, 4, 5, 6, 7], icon: "🥭", highPrice: 22, lowPrice: 45 },
  fresa: { name: "Fresa", months: [1, 2, 3, 11, 12], icon: "🍓", highPrice: 48, lowPrice: 75 },
  calabaza: { name: "Calabaza", months: [6, 7, 8, 9, 10], icon: "🎃", highPrice: 18, lowPrice: 32 },
  elote: { name: "Elote", months: [6, 7, 8, 9], icon: "🌽", highPrice: 12, lowPrice: 22 },
  nopal: { name: "Nopal", months: [1, 2, 3, 4, 5, 6, 7, 8, 9], icon: "🌵", highPrice: 14, lowPrice: 25 },
  papaya: { name: "Papaya", months: [2, 3, 4, 5, 6], icon: "🍈", highPrice: 18, lowPrice: 35 },
  pina: { name: "Piña", months: [3, 4, 5, 6, 7], icon: "🍍", highPrice: 22, lowPrice: 38 },
  sandia: { name: "Sandía", months: [4, 5, 6, 7], icon: "🍉", highPrice: 10, lowPrice: 22 },
  guayaba: { name: "Guayaba", months: [10, 11, 12], icon: "🍐", highPrice: 20, lowPrice: 40 },
  naranja: { name: "Naranja", months: [11, 12, 1, 2, 3], icon: "🍊", highPrice: 16, lowPrice: 30 },
}

const MONTHS = [
  "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

// Seasonal suggestions per collection
const SEASONAL_TIPS: Record<string, { season: string; months: string; tip: string; savings: string }[]> = {
  "hamburguesas-hot-dogs": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Aprovecha el jitomate y cebolla de temporada. Ofrece hamburguesas con guacamole fresco cuando el aguacate esté barato.", savings: "~15% en verdura" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Lanza una hamburguesa con chiles asados de temporada. Agrega opciones con queso fundido.", savings: "~10% en complementos" },
  ],
  "taquerias-antojitos": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Temporada alta de limón, cebolla y cilantro. Es momento de promociones en tacos y aguas frescas de fruta.", savings: "~20% en acompañamientos" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Ofrece tacos de guisado con calabaza y nopales de temporada. Caldos calientes como complemento.", savings: "~12% en verdura" },
  ],
  "mariscos-pescados": [
    { season: "Primavera", months: "Mar-May", tip: "Cuaresma: máxima demanda. Aprovecha mango y piña de temporada para ceviches y aguachiles.", savings: "~18% en fruta para acompañamiento" },
    { season: "Verano", months: "Jun-Ago", tip: "Temporada de aguacate barato. Ideal para promocionar tostadas y platillos con aguacate.", savings: "~25% en aguacate" },
  ],
  "sushi-comida-asiatica": [
    { season: "Primavera", months: "Mar-May", tip: "Aguacate en su mejor momento. Ideal para rolls con aguacate. Aprovecha el pepino y jengibre de temporada.", savings: "~15% en complementos frescos" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Salmón de mejor calidad en meses fríos. Lanza promociones de ramen con verduras de temporada fría.", savings: "~10% en insumos importados" },
  ],
  "cortes-carne-asaderos": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Temporada alta de parrilladas. Aprovecha elotes y cebollitas de temporada para guarniciones frescas.", savings: "~20% en guarnición" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Ofrece cortes con guarniciones calientes. Papas y calabazas de temporada fría como acompañamiento.", savings: "~12% en verdura de estación" },
  ],
  "pollo-alitas": [
    { season: "Todo el año", months: "Ene-Dic", tip: "El pollo tiene precio estable todo el año. Enfócate en salsas de temporada: mango-habanero en verano, BBQ ahumada en invierno.", savings: "~5% variando salsas" },
    { season: "Verano", months: "Jun-Ago", tip: "Aprovecha el limón y chile de temporada para salsas frescas. Promociona alitas para ver partidos.", savings: "~15% en cítricos" },
  ],
  "cafeterias-crepas-desayunos": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Fresas y frutos rojos de temporada. Lanza crepas y malteadas con fruta fresca de estación.", savings: "~20% en fruta fresca" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Temporada de naranja y guayaba. Promociona jugos naturales y crepas con frutas de invierno.", savings: "~15% en fruta de invierno" },
  ],
  "saludable-ensaladas-pokes": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Mango, sandía y aguacate frescos para pokes. Arma bowls con fruta de temporada como topping.", savings: "~22% en fruta fresca" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Calabaza horneada y naranja para ensaladas de invierno. Promociona bowls calientes con quinoa.", savings: "~12% en verdura" },
  ],
  "postres-panaderia-helados": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Fresa, mango y piña de temporada. Helados artesanales y pays de fruta fresca.", savings: "~25% en fruta para repostería" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Guayaba y naranja de temporada. Postres con frutas de horno como peras y manzanas.", savings: "~18% en fruta de invierno" },
  ],
  "comida-arabe-griega": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Limón, pepino y jitomate abundantes. Ideal para ensalada griega y tabule frescos.", savings: "~15% en verdura fresca" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Garbanzo y berenjena de temporada. Promociona hummus y baba ganoush con pan pita caliente.", savings: "~10% en legumbres" },
  ],
  "comida-venezolana-latina": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Aguacate y plátano macho abundantes. Lanza promociones de arepas con reina pepiada.", savings: "~20% en aguacate y plátano" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Frijol negro y jitomate de temporada. Ofrece pabellón criollo con ingredientes de estación.", savings: "~12% en granos" },
  ],
  "bebidas-bares-botanas": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Limón y chile abundantes para micheladas y botanas. Promociona cocteles con frutas tropicales.", savings: "~20% en cítricos y chile" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Cacahuates y botanas calientes de temporada. Ofrece bebidas calientes con especias de invierno.", savings: "~10% en botanas" },
  ],
}

const DEFAULT_TIPS = [
  { season: "Primavera-Verano", months: "Mar-Ago", tip: "Aprovecha frutas y verduras de temporada para reducir costos y ofrecer platillos más frescos.", savings: "~15% en insumos frescos" },
  { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Incluye caldos, guisos y platillos calientes que aprovechen verduras de temporada fría.", savings: "~10% en verdura" },
]

export default function TemporadaPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const router = useRouter()
  const { toast } = useToast()
  const today = new Date()
  const [viewMonth, setViewMonth] = useLocalStorage<number>("temporada-month", today.getMonth() + 1, slug)
  const [shoppingList, setShoppingList] = useSyncedStorage<ShoppingItem[]>("temporada-shopping-list", [], slug)
  const [, setTransfers] = useSyncedStorage<TransferItem[]>("temporada-transfer", [], slug)

  const tips = selectedCollection
    ? (SEASONAL_TIPS[selectedCollection.slug] || DEFAULT_TIPS)
    : DEFAULT_TIPS

  const inSeasonNow = useMemo(() => {
    return Object.entries(SEASONS)
      .filter(([, data]) => data.months.includes(viewMonth))
      .map(([key, data]) => ({ key, ...data }))
  }, [viewMonth])

  function addToShoppingList(item: { key: string; name: string; icon: string; highPrice: number }) {
    setShoppingList((prev) => {
      if (prev.some((s) => s.key === item.key)) return prev
      return [...prev, { key: item.key, name: item.name, icon: item.icon, pricePerKg: item.highPrice, quantityKg: 1 }]
    })
    toast(t("temporada.toastAdded", { icon: item.icon, name: item.name }), "success")
  }

  function transferToPlanner(item: { name: string; icon: string; highPrice: number }) {
    setTransfers((prev) => {
      const exists = prev.find((t) => t.name === item.name)
      if (exists) return prev.map((t) => t.name === item.name ? { ...t, qty: t.qty + 5 } : t)
      return [...prev, { name: item.name, unit: "kg", price: item.highPrice, qty: 5 }]
    })
    toast(t("temporada.toastSentToPlanner", { icon: item.icon, name: item.name }), "success")
    router.push("/panel/planificador")
  }

  // Send the whole shopping list (clean names + real unit + price + qty) to the planificador
  function transferShoppingListToPlanner() {
    if (shoppingList.length === 0) return
    setTransfers((prev) => {
      const next = [...prev]
      shoppingList.forEach((s) => {
        const exists = next.find((t) => t.name === s.name)
        if (exists) exists.qty += s.quantityKg
        else next.push({ name: s.name, unit: "kg", price: s.pricePerKg, qty: s.quantityKg })
      })
      return next
    })
    toast(
      t(shoppingList.length > 1 ? "temporada.toastListSentMany" : "temporada.toastListSentOne", { count: shoppingList.length }),
      "success"
    )
    router.push("/panel/planificador")
  }

  function removeFromShoppingList(key: string) {
    setShoppingList((prev) => prev.filter((s) => s.key !== key))
    const item = shoppingList.find((s) => s.key === key)
    if (item) toast(t("temporada.toastRemoved", { icon: item.icon, name: item.name }), "warning")
  }

  function updateShoppingQty(key: string, qty: number) {
    setShoppingList((prev) => prev.map((s) => s.key === key ? { ...s, quantityKg: Math.max(0.5, qty) } : s))
  }

  function copyShoppingList() {
    const lines = shoppingList.map((s) => `• ${s.icon} ${s.name}: ${s.quantityKg} kg × $${s.pricePerKg}/kg = $${(s.quantityKg * s.pricePerKg).toFixed(0)} MXN`)
    const total = shoppingList.reduce((sum, s) => sum + s.quantityKg * s.pricePerKg, 0)
    const text = `${t("temporada.copyHeader", { month: MONTHS[viewMonth] ?? "" })}\n\n${lines.join("\n")}\n\n${t("temporada.totalEstimated", { total: total.toFixed(0) })}\nGenerado con Resurte.me`
    navigator.clipboard.writeText(text)
    toast(t("temporada.toastListCopied"), "success")
  }

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">{t("temporada.selectCuisineTitle")}</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          {t("temporada.selectCuisineDescription")}
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
          <h2 className="text-xl font-bold text-gray-900">{t("temporada.title")}</h2>
          <p className="text-sm text-gray-400">{selectedCollection.name}</p>
        </div>
      </div>

      {/* Month selector */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setViewMonth(viewMonth === 1 ? 12 : viewMonth - 1)}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label={t("temporada.prevMonth")}
            title={t("temporada.prevMonth")}
          >
            <ChevronLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="text-center">
            <span className="text-2xl font-bold text-gray-900">{MONTHS[viewMonth]}</span>
            <p className="text-xs text-gray-400 mt-0.5">
              {viewMonth === today.getMonth() + 1 ? t("temporada.currentMonth") : ""}
            </p>
          </div>
          <button
            onClick={() => setViewMonth(viewMonth === 12 ? 1 : viewMonth + 1)}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label={t("temporada.nextMonth")}
            title={t("temporada.nextMonth")}
          >
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* In-season items */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Leaf className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-semibold text-gray-700">{t("temporada.inSeasonIn", { month: MONTHS[viewMonth] ?? "" })}</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
           {inSeasonNow.map((item) => {
             const savings = item.highPrice > 0 ? Math.round((1 - item.highPrice / item.lowPrice) * 100) : 0
             const inList = shoppingList.some((s) => s.key === item.key)
             return (
             <div key={item.key} className={`rounded-xl px-3 py-2.5 border ${inList ? "bg-emerald-100 border-emerald-300" : "bg-emerald-50 border-emerald-100"}`}>
               <div className="flex items-center justify-between gap-1 mb-1.5">
                 <div className="flex items-center gap-2">
                   <span className="text-lg">{item.icon}</span>
                   <span className="text-sm font-medium text-emerald-800 leading-tight">{item.name}</span>
                 </div>
                 <button
                   onClick={() => inList ? removeFromShoppingList(item.key) : addToShoppingList(item)}
                   className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                     inList ? "bg-emerald-600 text-white" : "bg-white text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200"
                   }`}
                   title={inList ? t("temporada.removeFromList") : t("temporada.addToList")}
                 >
                   {inList ? <X className="w-3 h-3" /> : "+"}
                 </button>
               </div>
               <div className="flex items-center gap-1.5 mb-2">
                 <span className="text-xs font-bold text-emerald-700">${item.highPrice}/kg</span>
                 <span className="text-[10px] text-gray-400 line-through">${item.lowPrice}</span>
                 <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1 py-0.5 rounded-full font-bold">
                   -{savings}%
                 </span>
               </div>
               <button
                 onClick={() => transferToPlanner(item)}
                 className="w-full text-[10px] font-semibold bg-white text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 rounded-lg py-1 transition-colors flex items-center justify-center gap-1"
               >
                 <ShoppingCart className="w-3 h-3" /> {t("temporada.addToPlanner")}
               </button>
             </div>
             )
           })}
            {inSeasonNow.length === 0 && (
              <p className="col-span-full text-sm text-gray-400 text-center py-4">
                {t("temporada.emptySeason")}
              </p>
            )}
          </div>
        </div>

        {/* Shopping list */}
        {shoppingList.length > 0 && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-600" />
                <h4 className="text-sm font-semibold text-gray-700">
                  {t("temporada.shoppingListTitle", { month: MONTHS[viewMonth] ?? "" })}
                </h4>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  {shoppingList.length} {t(shoppingList.length > 1 ? "temporada.products" : "temporada.product")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyShoppingList}
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {t("temporada.copyList")}
                </button>
                <button
                  onClick={transferShoppingListToPlanner}
                  className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-lg transition-colors"
                  title={t("temporada.sendToPlannerHint")}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  {t("temporada.sendToPlanner")}
                </button>
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {shoppingList.map((s) => (
                <div key={s.key} className="flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{s.icon}</span>
                    <span className="text-sm font-medium text-gray-700">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateShoppingQty(s.key, s.quantityKg - 0.5)}
                        className="w-5 h-5 rounded bg-white text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
                        aria-label={t("temporada.reduceQty", { name: s.name })}
                      >
                        −
                      </button>
                      <span className="text-xs font-bold text-emerald-800 w-10 text-center">
                        {s.quantityKg} kg
                      </span>
                      <button
                        onClick={() => updateShoppingQty(s.key, s.quantityKg + 0.5)}
                        className="w-5 h-5 rounded bg-white text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors"
                        aria-label={t("temporada.increaseQty", { name: s.name })}
                      >
                        +
                      </button>
                    </div>
                    <span className="text-sm font-bold text-emerald-700 w-20 text-right">
                      ${(s.quantityKg * s.pricePerKg).toFixed(0)} MXN
                    </span>
                    <button
                      onClick={() => removeFromShoppingList(s.key)}
                      className="p-0.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                      aria-label={t("temporada.removeItem", { name: s.name })}
                      title={t("temporada.removeItem", { name: s.name })}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-emerald-100 flex justify-between items-center">
              <span className="text-xs text-gray-500">{t("temporada.estimatedSubtotal")}</span>
              <span className="font-extrabold text-emerald-700 text-lg">
                ${shoppingList.reduce((sum, s) => sum + s.quantityKg * s.pricePerKg, 0).toFixed(0)} MXN
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Seasonal tips for this collection */}
      <div className="space-y-4 mb-6">
        {tips.map((tip, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-2">
              {idx === 0 ? <Sun className="w-5 h-5 text-amber-500" /> : <Leaf className="w-5 h-5 text-purple-500" />}
              <h4 className="font-semibold text-gray-900">{tip.season}</h4>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tip.months}</span>
            </div>
            <p className="text-sm text-gray-500 mb-3">{tip.tip}</p>
            <div className="flex items-center gap-2 text-xs">
              <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-semibold text-emerald-700">
                {t("temporada.estimatedSavings", { savings: tip.savings })}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Next month preview */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-purple-600" />
          <h4 className="text-sm font-semibold text-gray-700">
            {t("temporada.nextMonthTitle", { month: MONTHS[viewMonth === 12 ? 1 : viewMonth + 1] ?? "" })}
          </h4>
          <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-semibold">
            {t("temporada.anticipatePurchase")}
          </span>
        </div>
        {(() => {
          const nextMonth = viewMonth === 12 ? 1 : viewMonth + 1
          const nextItems = Object.entries(SEASONS)
            .filter(([, data]) => data.months.includes(nextMonth))
            .filter(([, data]) => !data.months.includes(viewMonth))
          if (nextItems.length === 0) {
            return (
              <p className="text-sm text-gray-400">
                {t("temporada.nextMonthEmpty")}
              </p>
            )
          }
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {nextItems.map(([key, item]) => (
                <div key={key} className="flex items-center gap-2 bg-purple-50 rounded-xl px-3 py-2.5 border border-purple-100">
                  <span className="text-lg">{item.icon}</span>
                  <div>
                    <span className="text-sm font-medium text-purple-800">{item.name}</span>
                    <p className="text-[10px] text-purple-500">{t("temporada.entersSeason")}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      {/* Full year quick view */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 overflow-x-auto">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-purple-600" />
          {t("temporada.annualCalendar")}
        </h4>
        <div className="min-w-[600px]">
          {/* Header */}
          <div className="grid grid-cols-[120px_repeat(12,1fr)] gap-1 text-center mb-2">
            <div />
            {MONTHS.slice(1).map((m) => (
              <div key={m} className={`text-[10px] font-bold py-1 rounded ${viewMonth === MONTHS.indexOf(m) ? "bg-purple-100 text-purple-700" : "text-gray-400"}`}>
                {m}
              </div>
            ))}
          </div>
          {/* Rows */}
          <div className="max-h-[440px] overflow-y-auto pr-1">
          {Object.entries(SEASONS).map(([key, item]) => (
            <div key={key} className="grid grid-cols-[120px_repeat(12,1fr)] gap-1 items-center mb-1">
              <span className="text-xs text-gray-600 truncate">{item.icon} {item.name}</span>
              {Array.from({ length: 12 }, (_, i) => (
                <div
                  key={i}
                  className={`h-5 rounded ${item.months.includes(i + 1) ? "bg-emerald-200" : "bg-gray-100"}`}
                  title={item.months.includes(i + 1) ? `${item.name} — ${t("temporada.highSeason")}` : t("temporada.outOfSeason")}
                />
              ))}
            </div>
          ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-4 bg-purple-50 rounded-xl p-4 border border-purple-100">
        <div className="flex items-start gap-3">
          <DollarSign className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-purple-800 mb-1">
              {t("temporada.ctaTitle")}
            </p>
            <p className="text-xs text-purple-600">
              {t("temporada.ctaDescription")}
            </p>
          </div>
        </div>
      </div>
      <ToolGuideHost toolKey="temporada" pathname="/panel/temporada" slug={slug} icon="🗓️" title="Temporada" subtitle={selectedCollection.name} />
    </div>
  )
}
