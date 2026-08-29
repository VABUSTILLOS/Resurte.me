"use client"

import { CheckCircle2 } from "lucide-react"
import type { FoodosRestaurant } from "@/types/foodos"

export function SuccessScreen({ restaurant, orderId }: { restaurant: FoodosRestaurant; orderId: string }) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="bg-white border border-stone-200 rounded-3xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-black text-stone-900">¡Pedido recibido!</h1>
        <p className="text-stone-500 mt-2">
          Tu orden fue enviada a <strong>{restaurant.name}</strong>. Te contactarán por WhatsApp para confirmar la entrega.
        </p>
        <p className="text-sm text-stone-400 mt-4">Referencia: #{orderId.slice(0, 8).toUpperCase()}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 w-full py-3 rounded-xl bg-stone-900 text-white font-bold hover:bg-stone-700"
        >
          Volver al menú
        </button>
      </div>
    </div>
  )
}
