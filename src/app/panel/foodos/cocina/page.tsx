"use client"

// ============================================================
// Cocina (KDS) — pantalla de cocina en vivo: pedidos confirmados
// y en preparación con tiempo transcurrido y bump de estado.
// Pensada para quedarse abierta en una tablet/pantalla.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { getFoodosPanelData, updateOrderStatus } from "../actions"
import { createClient } from "@/lib/supabase/client"
import { modifiersSummary } from "@/lib/foodos"
import type { FoodosOrder, FoodosRestaurant } from "@/types/foodos"
import { ChefHat, Clock, Loader2, Store, Bike, UtensilsCrossed } from "lucide-react"

const ACTIVE_STATUSES = ["confirmed", "preparing"] as const

export default function CocinaPage() {
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [orders, setOrders] = useState<FoodosOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const audioCtxRef = useRef<AudioContext | null>(null)

  const load = useCallback(async () => {
    try {
      const { restaurant: r, orders: os } = await getFoodosPanelData()
      setRestaurant(r)
      setOrders(os.filter((o) => (ACTIVE_STATUSES as readonly string[]).includes(o.status)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  // Reloj para el tiempo transcurrido
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Realtime: nuevos pedidos confirmados y cambios de estado
  useEffect(() => {
    if (!restaurant) return
    const supabase = createClient()
    if (!supabase) return

    const beep = () => {
      try {
        audioCtxRef.current ??= new AudioContext()
        const ctx = audioCtxRef.current
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = "triangle"
        osc.frequency.value = 660
        gain.gain.setValueAtTime(0.12, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.4)
      } catch { /* autoplay bloqueado */ }
    }

    const channel = supabase
      .channel(`foodos-kds-${restaurant.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "foodos_orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => { beep(); load() }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "foodos_orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => load()
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurant, load])

  const sorted = useMemo(
    () =>
      [...orders].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [orders]
  )

  async function bump(order: FoodosOrder) {
    const next = order.status === "confirmed" ? "preparing" : order.fulfillment === "delivery" ? "out_for_delivery" : "delivered"
    await updateOrderStatus(order.id, next)
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-stone-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando cocina…
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="max-w-2xl mx-auto mt-16 bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
        <h1 className="text-xl font-black text-stone-900">Configura tu restaurante primero</h1>
        <p className="text-stone-600 mt-2">
          Ve a <Link href="/panel/foodos/restaurante" className="text-emerald-700 font-semibold underline">Mi restaurante</Link>.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-stone-900 flex items-center gap-2">
            <ChefHat className="w-6 h-6" /> Cocina
          </h1>
          <p className="text-sm text-stone-500">
            Pedidos activos en vivo · {sorted.length} en curso
          </p>
        </div>
        <Link href="/panel/foodos/pedidos" className="text-sm font-semibold text-stone-500 hover:text-stone-900">
          Ver todos los pedidos →
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-16 text-center text-stone-400">
          <ChefHat className="w-10 h-10 mx-auto mb-3 text-stone-300" />
          Sin pedidos en cocina. Los nuevos aparecen aquí automáticamente.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((order) => {
            const elapsed = Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 60_000))
            const late = elapsed >= 20
            return (
              <div
                key={order.id}
                className={`bg-white border-2 rounded-2xl p-4 flex flex-col ${
                  order.status === "preparing"
                    ? "border-purple-300"
                    : "border-amber-300"
                } ${late ? "ring-2 ring-red-300" : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-stone-900">#{order.id.slice(0, 6).toUpperCase()}</span>
                    <span className="flex items-center gap-1 text-xs font-bold text-stone-500">
                      {order.fulfillment === "delivery" ? <Bike className="w-3.5 h-3.5" /> : order.fulfillment === "dine_in" ? <UtensilsCrossed className="w-3.5 h-3.5" /> : <Store className="w-3.5 h-3.5" />}
                      {order.fulfillment === "delivery" ? "Domicilio" : order.fulfillment === "dine_in" ? `Mesa ${order.table_number ?? "?"}` : "Llevar"}
                    </span>
                  </div>
                  <span className={`flex items-center gap-1 text-xs font-bold ${late ? "text-red-600" : "text-stone-500"}`}>
                    <Clock className="w-3.5 h-3.5" /> {elapsed} min
                  </span>
                </div>

                <div className="flex-1 space-y-1.5 mb-3">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="text-sm">
                      <p className="text-stone-800">
                        <span className="font-black">{item.qty}×</span> {item.name}
                      </p>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <p className="text-xs text-stone-500 pl-5">└ {modifiersSummary(item.modifiers)}</p>
                      )}
                    </div>
                  ))}
                  {order.note && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mt-1">⚠️ {order.note}</p>
                  )}
                </div>

                <button
                  onClick={() => bump(order)}
                  className={`w-full py-2.5 rounded-xl text-white text-sm font-bold ${
                    order.status === "confirmed"
                      ? "bg-purple-600 hover:bg-purple-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {order.status === "confirmed"
                    ? "▶ Empezar a preparar"
                    : order.fulfillment === "delivery"
                      ? "✓ Salió a entrega"
                      : "✓ Listo / entregado"}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
