"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Star, Package, CheckCircle2, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getUserPurchaseHistory } from "@/lib/wallet-actions"
import { PageSkeleton } from "@/components/ui/page-skeleton"

const MAX_COMMENT_LENGTH = 500

interface PrefillResponse {
  orderId: number
  delivered: boolean
  review: { rating: number; comment: string | null; created_at: string } | null
}

interface DeliveredOrder {
  id: number
  created_at: string
  total: number
}

function StarPicker({
  value,
  onChange,
  size = "w-10 h-10",
}: {
  value: number
  onChange?: (rating: number) => void
  size?: string
}) {
  return (
    <div className="flex items-center justify-center gap-1.5" role="radiogroup" aria-label="Calificación en estrellas">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          aria-label={`${star} estrella${star !== 1 ? "s" : ""}`}
          aria-pressed={value >= star}
          className={`transition-transform ${onChange ? "hover:scale-110 active:scale-95 cursor-pointer" : "cursor-default"}`}
        >
          <Star
            className={`${size} ${
              value >= star ? "fill-amber-400 text-amber-400" : "fill-gray-100 text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export function CalificarClient() {
  const searchParams = useSearchParams()
  const orderId = Number(searchParams.get("pedido")) || null
  const token = searchParams.get("t")

  const [loading, setLoading] = useState(true)
  const [prefill, setPrefill] = useState<PrefillResponse | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [deliveredOrders, setDeliveredOrders] = useState<DeliveredOrder[]>([])
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sin ?pedido=: si hay sesión, listar los pedidos entregados del usuario
  // para que elija cuál calificar (el enlace bare de la automatización).
  useEffect(() => {
    if (orderId) return
    let cancelled = false

    async function loadDelivered() {
      try {
        const supabase = createClient()
        if (!supabase) {
          if (!cancelled) setLoading(false)
          return
        }
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) {
          if (!cancelled) setLoading(false)
          return
        }
        const { orders } = await getUserPurchaseHistory(0, 20)
        if (cancelled) return
        setDeliveredOrders(
          orders
            .filter((o) => o.status === "delivered")
            .map((o) => ({ id: o.id, created_at: o.created_at, total: o.total }))
        )
      } catch {
        // Keep defaults
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDelivered()
    return () => {
      cancelled = true
    }
  }, [orderId])

  // Con ?pedido=: prefill (valida autorización y trae reseña existente).
  useEffect(() => {
    if (!orderId) return
    let cancelled = false

    async function loadPrefill() {
      try {
        const params = new URLSearchParams({ pedido: String(orderId) })
        if (token) params.set("t", token)
        const res = await fetch(`/api/reviews?${params.toString()}`)
        if (!res.ok) {
          if (!cancelled) setNotFound(true)
          return
        }
        const data = (await res.json()) as PrefillResponse
        if (cancelled) return
        setPrefill(data)
        if (data.review) {
          setRating(data.review.rating)
          setComment(data.review.comment ?? "")
          setSubmitted(true)
        }
      } catch {
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPrefill()
    return () => {
      cancelled = true
    }
  }, [orderId, token])

  const handleSubmit = useCallback(async () => {
    if (!orderId || rating < 1 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          rating,
          comment: comment.trim() || undefined,
          token: token ?? undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "No se pudo guardar tu reseña")
        return
      }
      setSubmitted(true)
    } catch {
      setError("Error de conexión. Intenta de nuevo.")
    } finally {
      setSubmitting(false)
    }
  }, [orderId, rating, comment, token, submitting])

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <PageSkeleton titleWidth="w-40" cards={1} />
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Califica tu pedido</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tu opinión nos ayuda a mejorar el servicio.
        </p>
      </div>

      {!orderId ? (
        // ── Sin pedido: lista de entregados del usuario (o aviso de sesión) ──
        deliveredOrders.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 font-medium">Elige el pedido que quieres calificar:</p>
            {deliveredOrders.map((order) => (
              <Link
                key={order.id}
                href={`/calificar?pedido=${order.id}`}
                className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-gray-300" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Pedido #{order.id}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(order.created_at).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · ${order.total.toFixed(2)}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center bg-white rounded-xl border border-gray-200 p-8">
            <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600 mb-4">
              Usa el enlace que te enviamos por WhatsApp para calificar tu pedido, o inicia sesión
              para ver tus pedidos entregados.
            </p>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        )
      ) : notFound ? (
        <div className="text-center bg-white rounded-xl border border-gray-200 p-8">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-4">
            No encontramos este pedido o el enlace ya no es válido.
          </p>
          <Link href="/" className="text-brand-600 text-sm font-medium hover:underline">
            Volver al inicio
          </Link>
        </div>
      ) : prefill && !prefill.delivered && !submitted ? (
        <div className="text-center bg-white rounded-xl border border-gray-200 p-8">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-600">
            Podrás calificar tu pedido cuando haya sido entregado.
          </p>
        </div>
      ) : (
        // ── Formulario de reseña ──
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-900 text-center mb-4">
            Pedido #{orderId}
          </p>

          <StarPicker value={rating} onChange={submitted ? undefined : setRating} />

          {submitted ? (
            <div className="text-center mt-6">
              <CheckCircle2 className="w-10 h-10 text-brand-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-900 mb-1">¡Gracias por tu reseña!</p>
              {comment ? (
                <p className="text-xs text-gray-500 italic mt-2">&ldquo;{comment}&rdquo;</p>
              ) : null}
              <Link
                href="/"
                className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 transition-colors"
              >
                Volver al inicio
              </Link>
            </div>
          ) : (
            <>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
                placeholder="Cuéntanos más (opcional): ¿cómo estuvo la calidad y la entrega?"
                rows={4}
                className="w-full mt-6 px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
              />
              <p className="text-[11px] text-gray-400 text-right mt-1">
                {comment.length}/{MAX_COMMENT_LENGTH}
              </p>

              {error ? (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={rating < 1 || submitting}
                className="w-full mt-4 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Enviando…" : "Enviar calificación"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
