"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  X,
  Gift,
  TrendingDown,
  Loader2,
} from "lucide-react"
import { useCity, DEFAULT_CITY_SLUG } from "@/contexts/city-context"
import { getGuestToken } from "@/lib/guest-address"
import { ORDER_PAID_EVENT } from "@/components/checkout/CheckoutDrawer"
import { trackEvent } from "@/lib/analytics"
import { useEscapeKey } from "@/hooks/use-escape-key"
import type { UpsellOffer } from "@/lib/upsell-offers"
import { OfferStage, SuccessStage } from "@/components/checkout/upsell-modal-stages"
import { updateLastOrder } from "@/lib/upsell-last-order"
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

let stripePromise: Promise<import("@stripe/stripe-js").Stripe | null> | null = null

// Esperas entre reintentos al consultar ofertas (el webhook tarda ~1-2s en
// confirmar la orden base). Intentos en t≈0, 0.8s, 2.6s y 6.2s.
const RETRY_DELAYS_MS = [800, 1800, 3600]
// Escapatoria global para el descubrimiento de ofertas.
const FETCH_TIMEOUT_MS = 10_000
// Escapatoria global para el cobro del upsell (process-upsell + 3DS).
const PROCESS_TIMEOUT_MS = 20_000
// Reintentos máximos de un 409 transitorio ("order_not_confirmed": el webhook
// tarda ~1-2s en confirmar el pago base). Nunca ilimitado: un 409 permanente
// (sin método de pago, producto agotado) no se reintenta.
// Backoff entre reintentos: t≈1.2s, 3s y 5.4s (tres entradas = tres reintentos).
const PROCESS_RETRY_DELAYS_MS = [1200, 1800, 2400]

// Stripe se carga bajo demanda (import dinámico) la primera vez que el modal
// necesita autenticar el cobro del upsell (3DS/SCA); así no entra en el bundle
// inicial del cliente.
function getStripePromise() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    stripePromise = key
      ? import("@stripe/stripe-js").then(({ loadStripe }) => loadStripe(key))
      : Promise.resolve(null)
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

  // Vigilancia de procesos asíncronos: evita que un fetch/pago en vuelo navegue
  // o "cuelgue" el modal tras un nuevo pedido o cierre manual.
  const mountedRef = useRef(true)
  // Token de generación para invalidar invocaciones obsoletas (stale closures).
  const fetchAttemptRef = useRef(0)
  const processAttemptRef = useRef(0)
  // Guard de doble clic: un solo cobro por oferta, incluso con clics rápidos.
  const chargingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const goToConfirmation = useCallback(() => {
    // Cierra el modal antes de navegar: el modal vive en el layout raíz y
    // sobrevive la navegación, así que sin esto quedaría flotando con el
    // spinner sobre la página de confirmación (el "loop" visual).
    setIsOpen(false)
    setStage("loading")
    setUpsell(null)
    setDownsell(null)
    // Nunca bloquear tras un pago exitoso: si city no está disponible (slug
    // inválido persistido), se navega a la ciudad por defecto en vez de
    // quedarse en el modal en "Preparando tu oferta...".
    const slug = city?.slug ?? DEFAULT_CITY_SLUG
    router.push(`/${slug}/pedido-confirmado`)
  }, [city, router])

  // ── Descubrimiento de ofertas (server-side, fail-open) ──
  const fetchOffers = useCallback(
    async (id?: number) => {
      if (!id) {
        goToConfirmation()
        return
      }

      const token = ++fetchAttemptRef.current
      const startedAt = Date.now()
      let attempt = 0
      let settled = false

      // Escapatoria global: el modal jamás se queda en "Preparando tu oferta..."
      // aunque el webhook tarde o la API se cuelgue.
      const safetyTimer = window.setTimeout(() => {
        settleConfirmation()
      }, FETCH_TIMEOUT_MS)

      // Se ejecuta una sola vez: navega a la confirmación sin pisar un estado
      // posterior (oferta ya mostrada, otro pedido, cierre manual).
      const settleConfirmation = () => {
        if (settled || token !== fetchAttemptRef.current) return
        settled = true
        clearTimeout(safetyTimer)
        goToConfirmation()
      }

      const nextDelay = (): number | null => {
        const delay = RETRY_DELAYS_MS[attempt]
        attempt += 1
        if (!delay) return null
        if (Date.now() - startedAt + delay > FETCH_TIMEOUT_MS) return null
        return delay
      }

      const attemptFetch = async (): Promise<void> => {
        if (!mountedRef.current || token !== fetchAttemptRef.current) return
        try {
          const res = await fetch("/api/checkout/upsell-offers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_id: id,
              guest_token: getGuestToken(),
            }),
          })
          if (token !== fetchAttemptRef.current) return

          if (res.status === 429) {
            // Rate limited: reintentar solo empeoraría el límite → confirmación.
            settleConfirmation()
            return
          }
          if (!res.ok) {
            // Error 5xx/otro: reintento con backoff, luego confirmación.
            const delay = nextDelay()
            if (delay) window.setTimeout(() => void attemptFetch(), delay)
            else settleConfirmation()
            return
          }

          const data = (await res.json()) as {
            upsell?: UpsellOffer | null
            downsell?: UpsellOffer | null
            orderConfirmed?: boolean
            orderTotal?: number
          }
          if (token !== fetchAttemptRef.current) return

          // Total base autoritativo (server-side), por si el total local del
          // drawer quedó desactualizado con los bumps.
          if (typeof data.orderTotal === "number" && data.orderTotal > 0) {
            setBaseTotal(data.orderTotal)
          }

          if (data.orderConfirmed === false) {
            // El webhook aún no confirmó el pago base (race ~1-2s) → reintentar.
            const delay = nextDelay()
            if (delay) window.setTimeout(() => void attemptFetch(), delay)
            else settleConfirmation()
            return
          }

          const up = data.upsell ?? null
          const down = data.downsell ?? null
          if (!up) {
            // Sin ofertas elegibles → confirmación directa (retrocompatible).
            settleConfirmation()
            return
          }
          settled = true
          clearTimeout(safetyTimer)
          setUpsell(up)
          setDownsell(down)
          setStage("upsell")
          // Exposición de la oferta: denominador del conversion rate del upsell.
          trackEvent("upsell_viewed", {
            currency: "MXN",
            value: up.price,
            item_id: String(up.productId),
            item_name: up.title,
            discount_pct: up.discount_pct,
          })
        } catch (err) {
          if (token !== fetchAttemptRef.current) return
          logger.warn("upsell-offers fetch failed, retrying", {
            error: err instanceof Error ? err.message : String(err),
          })
          const delay = nextDelay()
          if (delay) window.setTimeout(() => void attemptFetch(), delay)
          else settleConfirmation()
        }
      }

      void attemptFetch()
    },
    [goToConfirmation]
  )

  const claimEvent = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent<OrderPaidDetail>).detail ?? {}
      // Reclamar la navegación: el drawer ya no navega; este modal decide.
      event.preventDefault()
      // Invalidar cualquier consulta/cobro en vuelto del pedido anterior.
      fetchAttemptRef.current += 1
      processAttemptRef.current += 1
      chargingRef.current = false
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

    // Token de proceso: un solo cobro por oferta. Los reintentos NO lo
    // incrementan (reusarían el mismo settle), para que el safety timer global
    // siga siendo la única escapatoria si el 409 persiste.
    const token = processAttemptRef.current
    let settled = false

    // Escapatoria global: el modal jamás se queda en "Procesando tu pago..."
    // si la API se cuelga o el banco nunca responde. Se crea UNA VEZ por
    // proceso (no se reinicia en los reintentos).
    const safetyTimer = window.setTimeout(() => {
      settle(() => goToDownsellOrSuccess())
    }, PROCESS_TIMEOUT_MS)

    // Resuelve una sola vez por invocación y solo si el proceso sigue vigente.
    const settle = (fn: () => void) => {
      if (settled || token !== processAttemptRef.current) return
      settled = true
      clearTimeout(safetyTimer)
      fn()
    }

    // Cierra el proceso con un error claro: la orden base permanece intacta.
    const finishWithError = (message: string) => {
      settle(() => {
        setError(message)
        goToDownsellOrSuccess()
      })
    }

    const attemptCharge = async (attempt: number): Promise<void> => {
      if (token !== processAttemptRef.current) return
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
        if (token !== processAttemptRef.current) return

        if (res.ok && data.status === "succeeded") {
          settle(() => {
            setPaidAmount((prev) => prev + Number(data.amount ?? 0))
            setStage("success")
            updateLastOrder(offer, Number(data.amount ?? offer.price))
          })
          return
        }

        if (res.ok && data.status === "requires_action" && data.clientSecret) {
          // 3DS/SCA: el banco requiere autenticación. La orden base ya está
          // pagada; confirmamos el intent del upsell y esperamos el webhook.
          // Cancelamos el timer de "procesando" (la verificación 3DS es
          // interactiva y puede durar más de 20s), pero NO hacemos settle aquí —
          // si lo hiciéramos, el settle posterior (éxito/fallo) nunca se
          // ejecutaría y el modal quedaría colgado en "authenticating" para
          // siempre. runThreeDS siempre resuelve (nunca cuelga).
          clearTimeout(safetyTimer)
          setStage("authenticating")
          const authenticated = await runThreeDS(data.clientSecret)
          if (token !== processAttemptRef.current) return
          if (authenticated) {
            settle(() => {
              setPaidAmount((prev) => prev + offer.price)
              setStage("success")
              updateLastOrder(offer, offer.price)
            })
          } else {
            // El cliente canceló o falló la verificación → downsell o confirmación.
            finishWithError(
              "No se pudo completar la verificación. Tu pedido principal está confirmado."
            )
          }
          return
        }

        if (res.status === 409) {
          const code: string | undefined = data?.code
          // 409 transitorio: el webhook aún no confirmó la orden base. Reintento
          // con backoff, agotando MAX_PROCESS_ATTEMPTS. El servidor es idempotente
          // por idempotency_key, así que nunca hay cobro doble.
          const retryable = code === "order_not_confirmed"
          const delay = PROCESS_RETRY_DELAYS_MS[attempt]
          if (retryable && delay) {
            logger.warn("process-upsell conflict (409), retrying with backoff", {
              orderId: id,
              productId: offer.productId,
              attempt: attempt + 1,
            })
            window.setTimeout(() => {
              void attemptCharge(attempt + 1)
            }, delay)
            return
          }
          // 409 permanente (no_payment_method / out_of_stock) o reintentos
          // agotados: la orden base está confirmada e intacta.
          logger.warn("process-upsell conflict (409), giving up", {
            orderId: id,
            productId: offer.productId,
            code,
            attempts: attempt + 1,
          })
          finishWithError(
            code === "no_payment_method"
              ? "Este método de pago no permite cargos 1-clic. Tu pedido principal está confirmado."
              : "No se pudo procesar el cargo 1-clic. Tu pedido principal está confirmado."
          )
          return
        }

        // 4xx (declinado / sin método guardado): orden base intacta.
        finishWithError(
          typeof data?.error === "string"
            ? data.error
            : "No se pudo agregar el artículo"
        )
      } catch (err) {
        if (token !== processAttemptRef.current) return
        logger.warn("process-upsell failed", {
          error: err instanceof Error ? err.message : String(err),
        })
        finishWithError(
          "Error de conexión. Tu pedido principal está confirmado."
        )
      }
    }

    await attemptCharge(0)
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
      // "succeeded" → pago confirmado al instante. "processing" → verificación
      // asíncrona en curso (el webhook reconciliará el upsell): NO es un fallo.
      const status = result.paymentIntent?.status
      return status === "succeeded" || status === "processing"
    } catch (err) {
      logger.warn("upsell 3DS unexpected error", {
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  const handleAccept = (offer: UpsellOffer) => {
    // Guard anti doble clic: un solo cobro por oferta aunque se clique dos veces
    // antes de que React re-renderice (idempotencia extra del lado del cliente).
    if (chargingRef.current) return
    chargingRef.current = true
    const isDownsellOffer = showDownsell
    const key =
      (isDownsellOffer ? downsellKeyRef.current : upsellKeyRef.current) ??
      crypto.randomUUID()
    if (isDownsellOffer) downsellKeyRef.current = key
    else upsellKeyRef.current = key
    // Evento de aceptación: mide el conversion rate del upsell/downsell 1-click.
    trackEvent(isDownsellOffer ? "downsell_accepted" : "upsell_accepted", {
      currency: "MXN",
      value: offer.price,
      item_id: String(offer.productId),
      item_name: offer.title,
      quantity: offer.quantity,
      discount_pct: offer.discount_pct,
    })
    void processOffer(offer, key).finally(() => {
      chargingRef.current = false
    })
  }

  const handleDecline = () => {
    const offer = showDownsell ? downsell : upsell
    if (offer) {
      trackEvent(showDownsell ? "downsell_declined" : "upsell_declined", {
        currency: "MXN",
        value: offer.price,
        item_id: String(offer.productId),
        item_name: offer.title,
      })
    }
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
    // Invalidar consultas/cobros en vuelo para que sus timeouts de escapatoria
    // no naveguen tras un cierre manual, y liberar el guard de doble clic.
    fetchAttemptRef.current += 1
    processAttemptRef.current += 1
    chargingRef.current = false
    setIsOpen(false)
    goToConfirmation()
  }

  useEscapeKey(handleClose, isOpen)

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

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[min(90dvh,640px)] flex flex-col">
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
            className="text-white/70 hover:text-white transition-colors p-2 -m-2 touch-target"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 min-h-0 overscroll-contain">
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
