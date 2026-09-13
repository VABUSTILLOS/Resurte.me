"use client"

// ============================================================
// Tracking público del pedido FoodOS: timeline de estados con
// polling cada 20s (solo con la pestaña visible).
// ============================================================

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Bike, CheckCircle2, ChefHat, Clock, Loader2, PackageCheck, Star, Store, UtensilsCrossed, XCircle,
} from "lucide-react"
import { formatMoney, modifiersSummary } from "@/lib/foodos"
import type { FoodosOrderItem, FoodosOrderStatus } from "@/types/foodos"

interface TrackData {
  id: string
  status: FoodosOrderStatus
  payment_status: string
  fulfillment: "delivery" | "pickup" | "dine_in"
  table_number: string | null
  created_at: string
  branch_name: string | null
  total: number
  items: FoodosOrderItem[]
}

const STEPS: { status: FoodosOrderStatus; label: string; icon: React.ReactNode }[] = [
  { status: "pending", label: "Recibido", icon: <Clock className="w-4 h-4" /> },
  { status: "confirmed", label: "Confirmado", icon: <CheckCircle2 className="w-4 h-4" /> },
  { status: "preparing", label: "En preparación", icon: <ChefHat className="w-4 h-4" /> },
  { status: "out_for_delivery", label: "En camino", icon: <Bike className="w-4 h-4" /> },
  { status: "delivered", label: "Entregado", icon: <PackageCheck className="w-4 h-4" /> },
]

const FULFILLMENT_ICON = {
  delivery: <Bike className="w-4 h-4" />,
  pickup: <Store className="w-4 h-4" />,
  dine_in: <UtensilsCrossed className="w-4 h-4" />,
}

export function OrderTracking({ slug, orderId, restaurantName }: { slug: string; orderId: string; restaurantName: string }) {
  const [data, setData] = useState<TrackData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/foodos/orders/${orderId}/track?slug=${encodeURIComponent(slug)}`)
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(json.error ?? "No se encontró el pedido")
          return
        }
        setData(json as TrackData)
        setError(null)
      } catch {
        if (!cancelled) setError("Error de conexión. Reintentando…")
      }
    }
    fetchStatus()
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchStatus()
    }, 20_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchStatus()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [orderId, slug])

  if (error && !data) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="bg-white border border-stone-200 rounded-3xl p-8 max-w-md w-full text-center">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-black text-stone-900">No encontramos tu pedido</h1>
          <p className="text-sm text-stone-500 mt-2">{error}</p>
          <Link href={`/r/${slug}`} className="mt-6 inline-block px-6 py-3 rounded-xl bg-stone-900 text-white font-bold text-sm">
            Volver al menú
          </Link>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    )
  }

  const isDelivery = data.fulfillment === "delivery"
  const visibleSteps = isDelivery ? STEPS : STEPS.filter((s) => s.status !== "out_for_delivery")
  const currentIndex =
    data.status === "cancelled"
      ? -1
      : visibleSteps.findIndex((s) => s.status === data.status)

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8">
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white border border-stone-200 rounded-3xl p-6">
          <p className="text-xs text-stone-400 uppercase tracking-wide">{restaurantName}</p>
          <h1 className="text-xl font-black text-stone-900 mt-1">
            Pedido #{data.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-sm text-stone-500 mt-1 flex items-center gap-1.5">
            {FULFILLMENT_ICON[data.fulfillment]}
            {data.fulfillment === "delivery" ? "A domicilio" : data.fulfillment === "dine_in" ? `En el local${data.table_number ? ` · Mesa ${data.table_number}` : ""}` : "Para llevar"}
            {data.branch_name ? ` · ${data.branch_name}` : ""}
          </p>
          <p className="text-xs text-stone-400 mt-1">
            {new Date(data.created_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>

        {data.status === "cancelled" ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="font-bold text-red-700">Pedido cancelado</p>
            <p className="text-sm text-red-500 mt-1">Contacta al restaurante si crees que es un error.</p>
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-3xl p-6">
            <div className="space-y-0">
              {visibleSteps.map((step, idx) => {
                const done = idx <= currentIndex
                const active = idx === currentIndex
                return (
                  <div key={step.status} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          done ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-400"
                        } ${active ? "ring-4 ring-emerald-100" : ""}`}
                      >
                        {step.icon}
                      </div>
                      {idx < visibleSteps.length - 1 && (
                        <div className={`w-0.5 h-6 ${idx < currentIndex ? "bg-emerald-500" : "bg-stone-200"}`} />
                      )}
                    </div>
                    <div className="pt-1.5">
                      <p className={`text-sm font-bold ${done ? "text-stone-900" : "text-stone-400"}`}>{step.label}</p>
                      {active && data.status !== "delivered" && (
                        <p className="text-xs text-emerald-600 font-semibold">Estado actual</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="bg-white border border-stone-200 rounded-3xl p-6">
          <h2 className="font-bold text-stone-900 mb-3">Tu pedido</h2>          <div className="space-y-2">
            {data.items.map((item, idx) => (
              <div key={idx} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-stone-700">
                    <span className="font-bold text-stone-900">{item.qty}×</span> {item.name}
                  </p>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <p className="text-xs text-stone-400">{modifiersSummary(item.modifiers)}</p>
                  )}
                </div>
                <span className="text-stone-600 font-semibold shrink-0">{formatMoney(item.price * item.qty)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-base font-black text-stone-900 pt-3 mt-3 border-t border-stone-200">
            <span>Total</span>
            <span>{formatMoney(data.total)}</span>
          </div>
          {data.payment_status === "paid" && (
            <p className="text-xs text-emerald-600 font-bold mt-2">✓ Pagado</p>
          )}
        </div>

        {data.status === "delivered" && <ReviewForm orderId={orderId} />}

        <Link
          href={`/r/${slug}`}
          className="block text-center text-sm font-semibold text-emerald-700 hover:text-emerald-600"
        >
          ← Volver al menú
        </Link>
      </div>
    </div>
  )
}

/** Reseña post-entrega (una por pedido; el API lo valida). */
function ReviewForm({ orderId }: { orderId: string }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [name, setName] = useState("")
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 text-center">
        <p className="font-bold text-emerald-800">¡Gracias por tu reseña! ⭐</p>
      </div>
    )
  }

  const submit = async () => {
    if (rating === 0) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch("/api/foodos/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, rating, comment, customer_name: name }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar")
        return
      }
      setDone(true)
    } catch {
      setError("Error de conexión")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-6">
      <h2 className="font-bold text-stone-900 mb-2">¿Cómo estuvo tu pedido?</h2>
      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            className="p-1"
            aria-label={`${n} estrellas`}
          >
            <Star className={`w-7 h-7 ${n <= rating ? "text-amber-400 fill-amber-400" : "text-stone-300"}`} />
          </button>
        ))}
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tu nombre (opcional)"
        className="w-full px-4 py-2.5 mb-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Cuéntanos más (opcional)"
        rows={2}
        className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={rating === 0 || sending}
        className="mt-3 w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
      >
        {sending ? "Enviando…" : "Enviar reseña"}
      </button>
    </div>
  )
}
