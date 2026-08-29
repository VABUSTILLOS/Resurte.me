"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Gift, Mail, Tag } from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { useEscapeKey } from "@/hooks/use-escape-key"
import type { AppliedCoupon } from "@/types"
import {
  isExitMouseEvent,
  buildExitLeadPayload,
} from "@/lib/exit-intent"

/**
 * Cupón de recuperación por intención de abandono (exit-intent).
 *
 * - Desktop: detecta la salida del puntero por el borde superior del viewport.
 * - Móvil: detecta `visibilitychange` → `hidden` (cambio de app / cierre de tab).
 *
 * Solo se arma si el carrito tiene artículos, no se ha completado una compra en
 * la sesión actual y el modal no se mostró antes en esta pestaña. Captura el
 * email vía POST /api/leads (source `exit_intent`) — fail-open, nunca bloquea.
 *
 * El cupón se valida contra POST /api/coupons/validate antes de aplicarse; si
 * el código no es válido se muestra el error y el usuario puede ignorarlo.
 */

/** Código de cupón de recuperación (configurable vía env; vacío = sin cupón). */
const EXIT_INTENT_COUPON = process.env.NEXT_PUBLIC_EXIT_INTENT_COUPON ?? ""

export function ExitIntentCoupon() {
  const { itemCount, subtotal, applyCoupon } = useCart()
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [emailSent, setEmailSent] = useState(false)
  const [couponApplied, setCouponApplied] = useState(false)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const shownRef = useRef(false)

  // El modal solo se muestra una vez por pestaña y solo si hay compras posibles.
  const canShow =
    typeof window !== "undefined" &&
    itemCount > 0 &&
    !window.sessionStorage.getItem("resurte_exit_intent_shown")

  const showModal = useCallback(() => {
    if (shownRef.current || !canShow) return
    shownRef.current = true
    try {
      window.sessionStorage.setItem("resurte_exit_intent_shown", "1")
    } catch {
      /* storage puede no estar disponible; el ref evita repeticiones */
    }
    setVisible(true)
  }, [canShow])

  useEscapeKey(useCallback(() => setVisible(false), []), visible)

  // ── Exit intent: mouseleave superior (desktop) + visibilitychange (móvil) ──
  useEffect(() => {
    const onMouseOut = (event: MouseEvent) => {
      if (isExitMouseEvent(event)) {
        showModal()
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        showModal()
      }
    }
    document.documentElement.addEventListener("mouseout", onMouseOut)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.documentElement.removeEventListener("mouseout", onMouseOut)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [showModal])

  // ── Captura de lead (fire-and-forget, fail-open) ──
  const captureLead = useCallback(() => {
    const payload = buildExitLeadPayload({
      email,
      phone,
      couponCode: EXIT_INTENT_COUPON,
    })
    if (!payload) return
    setEmailSent(true)
    void fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* fail-open: la captura de leads nunca debe romper la UX */
    })
  }, [email, phone])

  // ── Aplicar cupón de recuperación (validado contra la BD) ──
  const handleApplyCoupon = useCallback(async () => {
    if (!EXIT_INTENT_COUPON) return
    setIsApplying(true)
    setCouponError(null)
    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: EXIT_INTENT_COUPON, subtotal }),
      })
      const data = (await response.json()) as AppliedCoupon | { error?: string }
      if (!response.ok || "error" in data) {
        setCouponError(
          "error" in data && data.error
            ? data.error
            : "El cupón no pudo aplicarse en este momento."
        )
        return
      }
      applyCoupon(data as AppliedCoupon)
      setCouponApplied(true)
    } catch {
      setCouponError("Error de conexión al aplicar el cupón.")
    } finally {
      setIsApplying(false)
    }
  }, [subtotal, applyCoupon])

  // Aplicar cupón + capturar lead al mismo tiempo (un solo flujo).
  const handleClaim = useCallback(() => {
    captureLead()
    void handleApplyCoupon()
  }, [captureLead, handleApplyCoupon])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Espera, tu carrito está casi listo"
        >
          <motion.div
            initial={{ scale: 0.95, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 16 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative max-h-[min(90dvh,640px)] overflow-y-auto overscroll-contain"
          >
            <button
              type="button"
              onClick={() => setVisible(false)}
              aria-label="Cerrar"
              className="absolute top-3 right-3 p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors touch-target"
            >
              <X className="w-5 h-5" />
            </button>

            {couponApplied ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Gift className="w-7 h-7 text-[#0E7A0E]" />
                </div>
                <h2 className="text-xl font-black text-[#242529] mb-1">
                  ¡Cupón aplicado!
                </h2>
                <p className="text-sm text-gray-500">
                  Tu descuento ya está reflejado en el carrito. ¡No dejes tu
                  pedido a medias!
                </p>
                <button
                  type="button"
                  onClick={() => setVisible(false)}
                  className="mt-6 w-full px-6 py-3 bg-[#0E7A0E] text-white font-bold rounded-xl hover:bg-[#0D720D] transition-colors"
                >
                  Terminar mi pedido
                </button>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                  <Tag className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-xl font-black text-[#242529] mb-1">
                  ¡Espera! Tu carrito está casi listo 🛒
                </h2>
                <p className="text-sm text-gray-500 mb-5">
                  {EXIT_INTENT_COUPON
                    ? "Déjanos tu email y te damos un cupón exclusivo para que no dejes tu pedido pendiente."
                    : "Déjanos tu email y te avisamos cuando tus productos favoritos vuelvan a estar disponibles."}
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleClaim()
                  }}
                  className="space-y-3"
                >
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={captureLead}
                      placeholder="tu@email.com"
                      required
                      className="w-full pl-9 pr-3 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                    />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Teléfono (opcional)"
                    className="w-full px-3 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />

                  {emailSent && (
                    <p className="text-xs text-green-600">
                      ¡Gracias! Te enviaremos tu cupón al correo.
                    </p>
                  )}

                  {EXIT_INTENT_COUPON && (
                    <button
                      type="submit"
                      disabled={isApplying}
                      className="w-full px-6 py-3 bg-[#0E7A0E] text-white font-bold rounded-xl hover:bg-[#0D720D] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                    >
                      {isApplying ? (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Gift className="w-4 h-4" />
                          {EXIT_INTENT_COUPON
                            ? `Aplicar cupón ${EXIT_INTENT_COUPON}`
                            : "Recibir aviso"}
                        </>
                      )}
                    </button>
                  )}

                  {couponError && (
                    <p className="text-xs text-red-600">{couponError}</p>
                  )}

                  <button
                    type="button"
                    onClick={() => setVisible(false)}
                    className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors pt-1"
                  >
                    No, gracias — seguir comprando
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
