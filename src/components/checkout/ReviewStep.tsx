"use client"

import { MapPin, Clock, ArrowLeft, ArrowRight } from "lucide-react"
import type { City, CartItem } from "@/types"
import { getNextDays, type AddressForm, type ScheduleForm } from "./checkout-shared"

interface ReviewStepProps {
  address: AddressForm
  schedule: ScheduleForm
  city: City
  cartItems: CartItem[]
  itemCount: number
  subtotal: number
  discount: number
  deliveryFee: number
  total: number
  onEditAddress: () => void
  onEditSchedule: () => void
  onBack: () => void
  onContinue: () => void
}

export function ReviewStep({
  address,
  schedule,
  city,
  cartItems,
  itemCount,
  subtotal,
  discount,
  deliveryFee,
  total,
  onEditAddress,
  onEditSchedule,
  onBack,
  onContinue,
}: ReviewStepProps) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">
        Revisa tu pedido
      </h2>
      <p className="text-gray-500 text-sm mb-6">
        Confirma que todo esté correcto antes de pagar.
      </p>

      {/* Address summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand-600" />
            Dirección
          </h3>
          <button
            onClick={onEditAddress}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
          >
            Editar
          </button>
        </div>
        <p className="text-sm text-gray-600">
          {address.street} {address.number}
          {address.interior ? `, ${address.interior}` : ""}
          <br />
          {address.neighborhood}, CP {address.zip_code}
          <br />
          {city.name}, {city.state}
          {address.references && (
            <>
              <br />
              <span className="text-gray-400 text-xs">Ref: {address.references}</span>
            </>
          )}
        </p>
      </div>

      {/* Schedule summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-600" />
            Entrega
          </h3>
          <button
            onClick={onEditSchedule}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
          >
            Editar
          </button>
        </div>
        <p className="text-sm text-gray-600">
          {schedule.date === getNextDays()[0]?.value ? "Hoy" : schedule.date} — {schedule.time}
        </p>
      </div>

      {/* Items summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Productos ({itemCount})
        </h3>
        <ul className="space-y-2">
          {cartItems.map((item) => (
            <li key={item.product_id} className="flex justify-between text-sm">
              <span className="text-gray-600 truncate mr-4">
                {item.quantity}× {item.name}
              </span>
              <span className="font-medium text-gray-900 shrink-0">
                ${((item.sale_price ?? item.price) * item.quantity).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Total */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Subtotal</span>
          <span className="text-gray-900">${subtotal.toFixed(2)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-green-600">Descuento</span>
            <span className="text-green-600">-${discount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Envío</span>
          <span className="text-gray-900">${deliveryFee.toFixed(2)}</span>
        </div>
        <hr className="border-gray-100" />
        <div className="flex justify-between">
          <span className="text-lg font-bold text-gray-900">Total</span>
          <span className="text-lg font-bold text-brand-600">${total.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Atrás
        </button>
        <button
          onClick={onContinue}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
        >
          Continuar al pago
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
