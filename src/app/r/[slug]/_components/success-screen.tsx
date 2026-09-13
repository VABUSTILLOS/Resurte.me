"use client"

import { CheckCircle2 } from "lucide-react"
import Link from "next/link"
import type { FoodosRestaurant } from "@/types/foodos"
import { sf, type StorefrontLang } from "@/lib/foodos-i18n"

export function SuccessScreen({
  restaurant,
  orderId,
  showTransfer = false,
  lang = "es",
}: {
  restaurant: FoodosRestaurant
  orderId: string
  showTransfer?: boolean
  lang?: StorefrontLang
}) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="bg-white border border-stone-200 rounded-3xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-black text-stone-900">{sf(lang, "orderReceived")}</h1>
        <p className="text-stone-500 mt-2">
          {sf(lang, "orderSentTo")} <strong>{restaurant.name}</strong>.
        </p>
        {showTransfer && restaurant.transfer_clabe && (
          <div className="mt-4 text-left bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-sm font-bold text-amber-900">{sf(lang, "transferTitle")}</p>
            <dl className="mt-2 space-y-1 text-sm text-amber-800">
              {restaurant.transfer_bank && (
                <div className="flex justify-between"><dt>{sf(lang, "bank")}</dt><dd className="font-semibold">{restaurant.transfer_bank}</dd></div>
              )}
              {restaurant.transfer_beneficiary && (
                <div className="flex justify-between"><dt>{sf(lang, "beneficiary")}</dt><dd className="font-semibold">{restaurant.transfer_beneficiary}</dd></div>
              )}
              <div className="flex justify-between"><dt>CLABE</dt><dd className="font-mono font-semibold">{restaurant.transfer_clabe}</dd></div>
            </dl>
            <p className="text-xs text-amber-700 mt-2">
              {sf(lang, "transferProof")}
            </p>
          </div>
        )}
        <p className="text-sm text-stone-400 mt-4">{sf(lang, "reference")}: #{orderId.slice(0, 8).toUpperCase()}</p>
        <Link
          href={`/r/${restaurant.slug}/pedido/${orderId}`}
          className="mt-6 block w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700"
        >
          {sf(lang, "trackOrder")}
        </Link>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 w-full py-3 rounded-xl bg-stone-900 text-white font-bold hover:bg-stone-700"
        >
          {sf(lang, "backToMenuBtn")}
        </button>
      </div>
    </div>
  )
}
