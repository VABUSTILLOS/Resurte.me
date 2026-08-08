"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { loadStripe, type Stripe } from "@stripe/stripe-js"
import {
  X,
  CheckCircle2,
  Gift,
  TrendingDown,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { useCity } from "@/contexts/city-context"
import { getGuestToken } from "@/lib/guest-address"
import { ORDER_PAID_EVENT } from "@/components/checkout/CheckoutDrawer"
import type { UpsellOffer } from "@/lib/upsell-offers"
import { logger } from "@/lib/logger"

interface OrderPaidDetail {
  orderId?: number
  paymentIntentId?: string
  total?: number
}

type ModalStage =
  | "loading" // consultando ofertas
  | "upsell" // oferta principal
  | "downsell" // alternativa de menor precio
  | "processing" // cobrando
  | "authenticating" // 3DS/SCA en curso
  | "success" // confirmación consolidada

let stripePromise: Promise<Stripe | null> | null = null

function getStripePromise() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    stripePromise = key ? loadStripe(key) : Promise.resolve(null)
  }
  return stripePromise
}

/**
 * Modal de 1-click upsell/downsell post-compra (mecánica SamCart).
 *
 * Escucha ORDER_PAID_EVENT (cancelable). Si nadie lo reclama, el CheckoutDrawer
 * navega a la confirmación; este modal lo reclama con preventDefault() y
 * toma el control: consulta las ofertas, cobra el upsell off-session vía
 * POST /api/checkout/process-upsell (con idempotency_key de sesión), maneja
 * 3DS/SCA con stripe.confirmPayment y renderiza la confirmación consolidada.
 *
 * Reglas estrictas:
 *  · Si no hay ofertas o la API falla → navega a la confirmación (nunca se
 *    bloquea al cliente tras un pago exitoso).
 *  · Si el cargo del upsell falla → la orden base permanece intacta; se ofrece
 *    el downsell o la confirmación final.
 *  · Montos SIEMPRE derivados server-side; el cliente solo envía product_id.
 */
export function UpsellModal() {
  const { city } = useCity()
  const router = useRouter()

  const [isOpen, setIsOpen] = useState(false)
  const [stage, setStage] = useState<ModalStage>("loading")
  const [upsell, setUpsell] = useState<UpsellOffer | null>(null)
  const [downsell, setDownsell] = useState<UpsellOffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDownsell, setShowDownsell] = useState(false)
  const [paidAmount, setPaidAmount] = useState(0)

  // Una llave de idempotencia por oferta mostrada (una por visita). Rechaza
  // duplicados server-side: clics repetidos no generan cargos adicionales.
  const upsellKeyRef = useRef<string | null>(null)
  const downsellKeyRef = useRef<string | null>(null)
  const [orderId, setOrderId] = useState<number | undefined>(undefined)
  const [baseTotal, setBaseTotal] = useState(0)

  const goToConfirmation = useCallback(() => {
    if (!city) return
    router.push(`/${city.slug}/pedido-confirmado`)
  }, [city, router])

  // ── Descubrimiento de ofertas (server-side, fail-open) ──
  const fetchOffers = useCallback(async (id?: number) => {
    if (!id) {
      goToConfirmation()
      return
    }
    try {
      const res = await fetch("/api/checkout/upsell-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: id,
          guest_token: getGuestToken(),
        }),
      })
      const data = (await res.json()) as {
        upsell?: UpsellOffer | null
        downsell?: UpsellOffer | null
      }
      const up = data.upsell ?? null
      const down = data.downsell ?? null
      if (!up) {
        // Sin ofertas elegibles → confirmación directa (retrocompatible).
        goToConfirmation()
        return
      }
      setUpsell(up)
      setDownsell(down)
      setStage("upsell")
    } catch (err) {
      logger.warn("upsell-offers fetch failed, going to confirmation", {
        error: err instanceof Error ? err.message : String(err),
      })
      goToConfirmation()
    }
  }, [goToConfirmation])

  const claimEvent = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent<OrderPaidDetail>).detail ?? {}
      // Reclamar la navegación: el drawer ya no navega; este modal decide.
      event.preventDefault()
      setIsOpen(true)
      setStage("loading")
      setError(null)
      setShowDownsell(false)
      setPaidAmount(0)
      setOrderId(detail.orderId)
      setBaseTotal(detail.total ?? 0)
      upsellKeyRef.current = null
      downsellKeyRef.current = null
      void fetchOffers(detail.orderId)
    },
    [fetchOffers]
  )

  const processOffer = async (offer: UpsellOffer, idempotencyKey: string) => {
    const id = orderId
    if (!id) return
    setStage("processing")
    setError(null)
    try {
      const res = await fetch("/api/checkout/process-upsell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: id,
          product_id: offer.productId,
          quantity: offer.quantity,
          idempotency_key: idempotencyKey,
          guest_token: getGuestToken(),
        }),
      })
      const data = await res.json()

      if (res.ok && data.status === "succeeded") {
        setPaidAmount((prev) => prev + Number(data.amount ?? 0))
        setStage("success")
        updateLastOrder(offer, Number(data.amount ?? offer.price))
        return
      }

      if (res.ok && data.status === "requires_action" && data.clientSecret) {
        // 3DS/SCA: el banco requiere autenticación. La orden base ya está
        // pagada; confirmamos el intent del upsell y esperamos el webhook.
        setStage("authenticating")
        const authenticated = await runThreeDS(data.clientSecret)
        if (authenticated) {
          setPaidAmount((prev) => prev + offer.price)
          setStage("success")
          updateLastOrder(offer, offer.price)
        } else {
          // El cliente canceló o falló la verificación → downsell o confirmación.
          setError(
            "No se pudo completar la verificación. Tu pedido principal está confirmado."
          )
          goToDownsellOrSuccess()
        }
        return
      }

      // 4xx (declinado / sin método guardado / conflicto): orden base intacta.
      setError(
        typeof data?.error === "string" ? data.error : "No se pudo agregar el artículo"
      )
      goToDownsellOrSuccess()
    } catch (err) {
      logger.warn("process-upsell failed", {
        error: err instanceof Error ? err.message : String(err),
      })
      setError("Error de conexión. Tu pedido principal está confirmado.")
      goToDownsellOrSuccess()
    }
  }

  const goToDownsellOrSuccess = useCallback(() => {
    // Si hay downsell disponible, ofrécelo; si no, confirmación final.
    setShowDownsell(true)
    setStage(downsell ? "downsell" : "success")
  }, [downsell])

  const runThreeDS = async (clientSecret: string): Promise<boolean> => {
    try {
      const stripe = await getStripePromise()
      if (!stripe) return false
      const result = await stripe.confirmPayment({
        clientSecret,
        redirect: "if_required",
      })
      if (result.error) {
        logger.warn("upsell 3DS error", { error: result.error.message })
        return false
      }
      return result.paymentIntent?.status === "succeeded"
    } catch (err) {
      logger.warn("upsell 3DS unexpected error", {
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  const handleAccept = (offer: UpsellOffer) => {
    const isDownsellOffer = showDownsell
    const key =
      (isDownsellOffer ? downsellKeyRef.current : upsellKeyRef.current) ??
      crypto.randomUUID()
    if (isDownsellOffer) downsellKeyRef.current = key
    else upsellKeyRef.current = key
    void processOffer(offer, key)
  }

  const handleDecline = () => {
    if (!showDownsell && downsell) {
      setShowDownsell(true)
      setStage("downsell")
      setError(null)
      return
    }
    // Segundo rechazo (o sin downsell) → confirmación final consolidada.
    setStage("success")
  }

  const handleClose = () => {
    setIsOpen(false)
    goToConfirmation()
  }

  // Listener global del evento de pago.
  useEffect(() => {
    window.addEventListener(ORDER_PAID_EVENT, claimEvent)
    return () => window.removeEventListener(ORDER_PAID_EVENT, claimEvent)
  }, [claimEvent])

  if (!isOpen) return null

  const activeOffer = showDownsell ? downsell : upsell

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1F2937]">
          <div className="flex items-center gap-2 text-white">
            {stage === "downsell" ? (
              <TrendingDown className="w-5 h-5 text-amber-300" />
            ) : (
              <Gift className="w-5 h-5 text-amber-300" />
            )}
            <p className="font-bold">
              {stage === "downsell"
                ? "Oferta especial para ti"
                : "¡Un último paso para completar tu pedido!"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar"
            className="text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {stage === "loading" || stage === "processing" || stage === "authenticating" ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Loader2 className="w-8 h-8 text-[#B87A3A] animate-spin" />
              <p className="mt-4 text-sm text-gray-600">
                {stage === "loading"
                  ? "Preparando tu oferta..."
                  : stage === "authenticating"
                    ? "Verificando con tu banco..."
                    : "Procesando tu pago..."}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                No cierres esta ventana.
              </p>
            </div>
          ) : stage === "success" ? (
            <SuccessStage
              orderId={orderId}
              baseTotal={baseTotal}
              upsellAmount={paidAmount}
              onDone={handleClose}
            />
          ) : activeOffer ? (
            <OfferStage
              offer={activeOffer}
              isDownsell={showDownsell}
              error={error}
              onAccept={() => handleAccept(activeOffer)}
              onDecline={handleDecline}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

interface OfferStageProps {
  offer: UpsellOffer
  isDownsell: boolean
  error: string | null
  onAccept: () => void
  onDecline: () => void
}

function OfferStage({ offer, isDownsell, error, onAccept, onDecline }: OfferStageProps) {
  const savings = offer.original_price - offer.price
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl bg-[#F7F5F0] flex items-center justify-center overflow-hidden shrink-0">
          {offer.product.image_url ? (
            <img
              src={offer.product.image_url}
              alt={offer.product.name}
              width={80}
              height={80}
              className="w-full h-full object-contain p-1.5"
            />
          ) : (
            <Sparkles className="w-7 h-7 text-[#C7C8CD]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 leading-tight">
            {offer.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
            {offer.description}
          </p>
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-extrabold text-[#1F2937]">
          ${offer.price.toFixed(2)}
        </span>
        {offer.original_price > offer.price && (
          <span className="text-sm text-gray-400 line-through">
            ${offer.original_price.toFixed(2)}
          </span>
        )}
        {offer.discount_pct > 0 && (
          <span className="text-[11px] font-bold text-white bg-emerald-600 px-1.5 py-0.5 rounded">
            Ahorra ${savings.toFixed(2)}
          </span>
        )}
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
        <p className="text-xs text-amber-800">
          {isDownsell ? (
            <>Una alternativa más económica. Se suma a tu envío de hoy con 1 clic.</>
          ) : (
            <>Se suma directo a tu envío de hoy. Sin costos de envío adicionales.</>
          )}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onAccept}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#1F2937] text-white font-bold py-3.5 hover:bg-gray-800 active:scale-[0.99] transition-all"
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        {isDownsell ? "Sí, lo quiero — 1 clic" : "Sí, agrégalo — 1 clic"}
      </button>
      <button
        type="button"
        onClick={onDecline}
        className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
      >
        {isDownsell ? "No, gracias — ver mi pedido" : "No, gracias"}
      </button>
    </div>
  )
}

interface SuccessStageProps {
  orderId?: number
  baseTotal: number
  upsellAmount: number
  onDone: () => void
}

/**
 * Confirmación final consolidada: orden base + upsells pagados. Muestra el
 * resumen y deja el botón para ver el pedido confirmado (donde se despliega
 * el horario de entrega y el cashback ganado).
 */
function SuccessStage({ orderId, baseTotal, upsellAmount, onDone }: SuccessStageProps) {
  const total = baseTotal + upsellAmount
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
      </div>
      <div>
        <p className="font-bold text-gray-900 text-lg">
          ¡Tu pedido está confirmado!
        </p>
        {orderId ? (
          <p className="text-sm text-gray-500 mt-0.5">Pedido #{orderId}</p>
        ) : null}
      </div>

      <div className="rounded-xl bg-[#F7F5F0] p-4 text-left space-y-1.5">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Pedido principal</span>
          <span className="font-medium">${baseTotal.toFixed(2)}</span>
        </div>
        {upsellAmount > 0 && (
          <div className="flex justify-between text-sm text-emerald-700">
            <span>Artículos agregados</span>
            <span className="font-medium">+${upsellAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-1.5">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Recibirás la confirmación por WhatsApp y podrás ver el horario de
        entrega en tu recibo.
      </p>

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-xl bg-[#1F2937] text-white font-bold py-3.5 hover:bg-gray-800 active:scale-[0.99] transition-all"
      >
        Ver mi pedido
      </button>
    </div>
  )
}

/**
 * Actualiza sessionStorage.last_order para que la página de confirmación
 * muestre el total consolidado (base + upsells) en el evento `purchase`.
 * No muta la orden en la BD — el webhook ya la marcó pagada.
 */
function updateLastOrder(offer: UpsellOffer, amount: number) {
  if (typeof window === "undefined") return
  try {
    const raw = window.sessionStorage.getItem("last_order")
    const previous = raw ? JSON.parse(raw) : {}
    const existingItems = Array.isArray(previous.items) ? previous.items : []
    const upsellItem = {
      id: String(offer.productId),
      name: offer.product.name,
      quantity: offer.quantity,
      price: offer.price,
    }
    window.sessionStorage.setItem(
      "last_order",
      JSON.stringify({
        ...previous,
        total: Number(previous.total ?? 0) + amount,
        items: [...existingItems, upsellItem],
      })
    )
  } catch {
    // sessionStorage puede no estar disponible — no bloquear la navegación.
  }
}
