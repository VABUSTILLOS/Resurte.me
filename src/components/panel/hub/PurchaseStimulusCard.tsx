"use client"

import Link from "next/link"
import { ShoppingCart, ClipboardList, Package, Store, TrendingUp } from "lucide-react"
import { useCity, DEFAULT_CITY_SLUG } from "@/contexts/city-context"
import type { ShoppingItem } from "@/components/panel/temporada/temporada-shared"

interface PurchaseStimulusCardProps {
  /** Insumos que faltan para los covers planeados (conteo de recetas) */
  shortfall: number
  /** Insumos con stock bajo o agotado */
  lowStockCount: number
  /** Lista de compra sugerida por temporada */
  shoppingList: ShoppingItem[]
  /** Comensales planeados */
  covers: number
}

/**
 * Tarjeta de estímulo del dashboard: empuja al restaurantero a comprar
 * insumos y generar órdenes. Combina señales reales del panel (faltantes,
 * stock bajo, lista de temporada) con CTAs hacia el Planificador y la
 * tienda pública de Resurte.
 */
export default function PurchaseStimulusCard({
  shortfall,
  lowStockCount,
  shoppingList,
  covers,
}: PurchaseStimulusCardProps) {
  const { city } = useCity()
  const storeHref = `/${city?.slug || DEFAULT_CITY_SLUG}`
  const signals = Math.max(shortfall, lowStockCount, shoppingList.length)
  const headline =
    signals > 0
      ? `Tienes ${signals} insumo${signals !== 1 ? "s" : ""} por surtir`
      : "¿Listo para tu próximo pedido de insumos?"

  return (
    <section
      aria-label="Comprar insumos y generar órdenes"
      className="mb-4 sm:mb-6 rounded-2xl border border-[#0E7A0E]/15 bg-gradient-to-r from-[#F0FDF4] to-white p-4 sm:p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-[#0E7A0E]/10 rounded-xl flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-[#0E7A0E]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-gray-900">{headline}</h3>
            <p className="text-[13px] text-gray-500 leading-snug mt-0.5">
              {covers > 0
                ? `Planeas ${covers} comensal${covers !== 1 ? "es" : ""} con el planificador.`
                : "Programa tus comensales y arma tu lista de pedido con precios de nuestro catálogo real."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto shrink-0">
          <Link
            href="/panel/planificador"
            className="inline-flex items-center gap-1.5 bg-[#0E7A0E] text-white text-xs sm:text-sm font-semibold px-3.5 sm:px-4 py-2 rounded-lg hover:bg-[#0B630B] transition-colors touch-target"
          >
            <ClipboardList className="w-4 h-4" />
            Armar mi pedido
          </Link>
          <Link
            href={storeHref}
            className="inline-flex items-center gap-1.5 border border-[#0E7A0E]/30 text-[#0E7A0E] text-xs sm:text-sm font-semibold px-3.5 sm:px-4 py-2 rounded-lg hover:bg-[#0E7A0E]/5 transition-colors touch-target"
          >
            <Store className="w-4 h-4" />
            Comprar en la tienda
          </Link>
        </div>
      </div>

      {(shortfall > 0 || lowStockCount > 0 || shoppingList.length > 0) && (
        <div className="mt-3 pt-3 border-t border-[#0E7A0E]/10 grid grid-cols-3 gap-2 sm:max-w-md">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <TrendingUp className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">{shortfall > 0 ? `${shortfall} faltantes` : "Sin faltantes"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Package className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span className="truncate">{lowStockCount > 0 ? `${lowStockCount} bajos/agotados` : "Stock completo"}</span>
          </div>
          <Link href="/panel/temporada" className="flex items-center gap-1.5 text-xs font-medium text-[#0E7A0E] hover:underline">
            <span className="truncate">{shoppingList.length > 0 ? `${shoppingList.length} en temporada` : "Lista temporada"}</span>
          </Link>
        </div>
      )}
    </section>
  )
}
