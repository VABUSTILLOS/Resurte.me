"use client"

import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from "react"
import { createClient } from "@/lib/supabase/client"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import { AnalyticsEvents } from "@/lib/analytics"
import type { Address, City, PaymentMethod, CartItem, RepurchaseCouponInfo } from "@/types"
import {
  getGuestToken,
  saveGuestToken,
  getLastAddress,
  saveLastAddress,
  claimGuestAddresses,
  ensureGuestToken,
} from "@/lib/guest-address"
import {
  addressesMatch,
  pickPreferredAddress,
  toAddressForm,
} from "@/lib/address-book"
import { getStoredUtm } from "@/lib/utm"
import {
  DEFAULT_ADDRESS_FORM,
  type AddressForm,
  type ScheduleForm,
} from "@/components/checkout/checkout-shared"
import type { SelectedBump } from "@/components/checkout/BumpCards"

/**
 * Lógica de negocio compartida por los dos flujos de checkout:
 *  - CheckoutDrawer (drawer móvil SamCart/ThriveCart)
 *  - /[slug]/checkout (página completa)
 *
 * Antes había dos copias de ~120 líneas (fetch a /api/orders, create-intent,
 * /api/leads, sesión + direcciones guardadas). Este hook las centraliza en un
 * solo lugar; cada flujo conserva su shell, sus pasos y sus decisiones de
 * post-pago vía `onPaid`.
 *
 * Diferencias intencionales conservadas:
 *  - `saveDefault`: solo el drawer envía save_default (checkbox "predeterminada").
 *  - `saveCard`: solo el drawer envía save_card en create-intent (consentimiento).
 *  - `autoSelectSavedAddress`: ambos flujos auto-seleccionan + autocompletan al
 *    cargar (antes solo el drawer: la página obligaba a reescribir la dirección).
 *  - `onAfterOrderCreated`: la página limpia los bumps y refresca direcciones.
 *  - `onPaid`: el drawer dispara ORDER_PAID_EVENT (UpsellModal) y navega; la
 *    página navega directo a pedido-confirmado.
 *
 * Libro de direcciones (migración 00117): la lista de direcciones guardadas y
 * la preselección funcionan igual con y sin sesión. Con sesión se leen de
 * `addresses` por RLS; sin sesión, del endpoint anónimo /api/addresses/guest
 * (el `guest_token` del navegador es la credencial).
 */

export type CreatedOrder = {
  orderId: number
  cashback: { credits: number; tier: string | null } | null
  repurchaseCoupon?: RepurchaseCouponInfo | null
  /** Token de seguimiento público del pedido (restore_token de la orden). */
  trackingToken?: string | null
}

export type CheckoutPaidInfo = {
  orderId: number | null
  cashback: { credits: number; tier: string | null } | null
  paymentIntentId: string
  /** Cupón de recompra emitido con esta orden (solo usuarios logueados). */
  repurchaseCoupon?: RepurchaseCouponInfo | null
  /** Token de seguimiento público del pedido (restore_token de la orden). */
  trackingToken?: string | null
}

export interface CheckoutOrderOptions {
  city: City | null
  address: AddressForm
  schedule: ScheduleForm
  phone: string
  email: string
  /**
   * Cupón aplicado. Tipo estructural mínimo (solo se usa `code`): acepta tanto
   * `Coupon` (BD) como `AppliedCoupon` (contexto de carrito).
   */
  coupon: { code?: string | null } | null
  cartItems: CartItem[]
  selectedBumps: SelectedBump[]
  /** subtotal + bumpsSubtotal (bruto antes del descuento del cupón). */
  effectiveSubtotal: number
  deliveryFee: number
  total: number
  /** Origen del lead: "checkout_drawer" (móvil) o "checkout_page". */
  leadSource: "checkout_drawer" | "checkout_page"
  /** save_default para órdenes logueadas. undefined → no se envía (página). */
  saveDefault?: boolean
  /** save_card en create-intent. undefined → no se envía (página). */
  saveCard?: boolean
  /** Al iniciar sesión: auto-seleccionar la predeterminada y autocompletar. */
  autoSelectSavedAddress?: boolean
  setAddress: Dispatch<SetStateAction<AddressForm>>
  setPhone: Dispatch<SetStateAction<string>>
  setEmail: Dispatch<SetStateAction<string>>
  /** Tras crear la orden con éxito (página: limpia bumps + refresca direcciones). */
  onAfterOrderCreated?: () => void
  /** Tras un pago confirmado: cada flujo navega/distribuye a su manera. */
  onPaid: (info: CheckoutPaidInfo) => void
}

/** Direcciones guardadas del usuario con sesión (RLS: solo las suyas). */
async function fetchOwnAddresses(): Promise<Address[]> {
  const supabase = createClient()
  if (!supabase) return []

  // Orden preferido: sin papelera, la predeterminada primero y, entre las
  // demás, la usada más recientemente (`last_used_at`, que el servidor toca en
  // cada POST /api/orders). Si el esquema desplegado aún no tiene `deleted_at`
  // / `is_default` / `last_used_at` (00117/00050 pendientes), PostgREST
  // devuelve error y se reintenta con el orden clásico: la preselección se
  // recalcula igual en el cliente con `pickPreferredAddress`.
  const preferred = await supabase
    .from("addresses")
    .select("*")
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("last_used_at", { ascending: false })
  if (!preferred.error) return (preferred.data ?? []) as Address[]

  const legacy = await supabase
    .from("addresses")
    .select("*")
    .order("created_at", { ascending: false })
  if (legacy.error) return []
  return ((legacy.data ?? []) as Address[]).filter((a) => !a.deleted_at)
}

/** Direcciones guardadas del navegador sin sesión (por `guest_token`). */
async function fetchGuestAddresses(): Promise<Address[]> {
  const token = ensureGuestToken()
  if (!token) return []
  try {
    const res = await fetch(`/api/addresses/guest?guest_token=${encodeURIComponent(token)}`)
    if (!res.ok) return []
    const data = (await res.json()) as { addresses?: Address[] }
    return Array.isArray(data.addresses) ? data.addresses : []
  } catch {
    return []
  }
}

export function useCheckoutOrder(options: CheckoutOrderOptions) {
  const {
    city,
    address,
    schedule,
    phone,
    email,
    coupon,
    cartItems,
    selectedBumps,
    effectiveSubtotal,
    deliveryFee,
    total,
    leadSource,
    saveDefault,
    saveCard,
    autoSelectSavedAddress = false,
    setAddress,
    setPhone,
    setEmail,
    onAfterOrderCreated,
    onPaid,
  } = options

  // Callbacks que cada flujo define por render; se mantienen en refs para que
  // las funciones del hook sean estables y el payload nunca quede stale.
  const onAfterOrderCreatedRef = useRef(onAfterOrderCreated)
  const onPaidRef = useRef(onPaid)
  useEffect(() => {
    onAfterOrderCreatedRef.current = onAfterOrderCreated
  }, [onAfterOrderCreated])
  useEffect(() => {
    onPaidRef.current = onPaid
  }, [onPaid])

  // ── Estado de sesión + detección de tarjeta guardada ──
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(() =>
    // `null` = sesión aún sin resolver. Sin Supabase configurado no existe
    // sesión posible (createClient() devuelve null), así que se arranca como
    // invitado para que el libro de direcciones anónimo —que vive en
    // /api/addresses/guest, no en el cliente de auth— cargue igual.
    isSupabaseConfigured() ? null : false
  )
  const [savedCard, setSavedCard] = useState<{
    hasSavedCard: boolean
    last4?: string
    brand?: string
  } | null>(null)
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null)
  const [loadingSavedAddresses, setLoadingSavedAddresses] = useState(false)
  const [deletingAddressId, setDeletingAddressId] = useState<number | null>(null)

  // ── Estado del flujo de pago (compartido por ambos flujos) ──
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null)
  const [showStripeForm, setShowStripeForm] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null)
  const [earnedCashback, setEarnedCashback] = useState<{
    credits: number
    tier: string | null
  } | null>(null)
  const [repurchaseCoupon, setRepurchaseCoupon] = useState<RepurchaseCouponInfo | null>(null)
  const [orderTrackingToken, setOrderTrackingToken] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // ── Sesión + precarga de dirección anónima ──
  useEffect(() => {
    let cancelled = false

    // Datos que la DIRECCIÓN no guarda (la dirección la resuelve
    // refreshSavedAddresses con el libro del servidor y localStorage como
    // respaldo): teléfono y email del último checkout.
    const prefillGuestContact = () => {
      const last = getLastAddress()
      if (!last) return
      setPhone((prev) => last.phone ?? prev)
      setEmail((prev) => (prev || last.email) ?? "")
    }

    const supabase = createClient()
    if (!supabase) {
      // Sin Supabase configurado no hay sesión que resolver (el estado inicial
      // ya es "invitado"): solo se precargan teléfono y email.
      prefillGuestContact()
      return
    }
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return
        const user = data.user
        const loggedIn = !!user
        setIsLoggedIn(loggedIn)
        if (!loggedIn) {
          prefillGuestContact()
        } else {
          // Logueado: pre-llenar email del auth y teléfono desde profiles.phone.
          setEmail((prev) => (prev ? prev : user.email ?? ""))
          void supabase
            .from("profiles")
            .select("phone")
            .eq("id", user.id)
            .maybeSingle()
            .then(({ data: profile }) => {
              if (cancelled || !profile?.phone) return
              setPhone((prev) => (prev ? prev : profile.phone))
            })
        }
      })
      .catch(() => {
        // La sesión no se pudo resolver (red o servidor de auth caído): se opera
        // como invitado en lugar de quedarse en `null`, que dejaba el checkout
        // sin libro de direcciones. El servidor manda: con cookie válida el
        // pedido se vincula al usuario igual (ver src/app/api/orders/route.ts).
        if (cancelled) return
        setIsLoggedIn(false)
        prefillGuestContact()
      })
    return () => {
      cancelled = true
    }
  }, [setAddress, setPhone, setEmail])

  // ── Detección de tarjeta guardada (Express Checkout, solo sesión) ──
  useEffect(() => {
    if (isLoggedIn !== true) {
      return
    }
    let cancelled = false
    fetch("/api/payments/stripe/saved-card")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { hasSavedCard?: boolean; last4?: string; brand?: string } | null) => {
        if (cancelled) return
        setSavedCard(
          data
            ? { hasSavedCard: !!data.hasSavedCard, last4: data.last4, brand: data.brand }
            : { hasSavedCard: false }
        )
      })
      .catch(() => {
        if (!cancelled) setSavedCard({ hasSavedCard: false })
      })
    return () => {
      cancelled = true
    }
  }, [isLoggedIn])

  // ── Carga del libro de direcciones (reutilizable tras crear una orden) ──
  const refreshSavedAddresses = useCallback(
    async (opts?: { autoSelect?: boolean }) => {
      // Con la sesión aún sin resolver no se consulta: el efecto vuelve a
      // ejecutarse cuando `isLoggedIn` ya es true/false.
      if (isLoggedIn === null) return
      setLoadingSavedAddresses(true)
      try {
        const rows = isLoggedIn ? await fetchOwnAddresses() : await fetchGuestAddresses()
        setSavedAddresses(rows)
        if (!opts?.autoSelect) return

        const preferredAddr = pickPreferredAddress(rows)
        if (preferredAddr) {
          setSelectedAddressId(preferredAddr.id)
          setAddress(toAddressForm(preferredAddr))
        } else {
          setSelectedAddressId(null)
          // Sin direcciones en el servidor: se conserva lo que el usuario ya
          // haya escrito y, si el formulario está vacío, se precarga el
          // respaldo de localStorage (navegadores sin libro aún).
          const last = getLastAddress()
          if (last) setAddress((prev) => (prev.street ? prev : toAddressForm(last)))
        }
      } finally {
        setLoadingSavedAddresses(false)
      }
    },
    [isLoggedIn, setAddress]
  )

  // ── Al resolver la sesión: reclama direcciones anónimas (si hay cuenta) y
  //    carga el libro de direcciones (invitado o usuario) ──
  useEffect(() => {
    if (isLoggedIn === null) return
    if (isLoggedIn) claimGuestAddresses()
    // Se difiere para no disparar setState de forma síncrona dentro del efecto
    // (evita renders en cascada; ver react-hooks/set-state-in-effect).
    const timeout = setTimeout(() => {
      void refreshSavedAddresses({ autoSelect: autoSelectSavedAddress })
    }, 0)
    return () => clearTimeout(timeout)
  }, [isLoggedIn, refreshSavedAddresses, autoSelectSavedAddress])

  // ── Dirección guardada seleccionada + detección de formulario sin editar ──
  const selectedSavedAddress =
    savedAddresses.find((a) => a.id === selectedAddressId) ?? null

  const selectedAddressUnedited =
    selectedSavedAddress !== null && addressesMatch(selectedSavedAddress, address)

  // ── Eliminar una dirección guardada (papelera: los pedidos históricos la
  //    siguen referenciando, ver migración 00117) ──
  const deleteSavedAddress = useCallback(
    async (id: number): Promise<boolean> => {
      setDeletingAddressId(id)
      try {
        if (isLoggedIn === true) {
          const supabase = createClient()
          if (!supabase) return false
          const { error } = await supabase
            .from("addresses")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", id)
          if (error) {
            setCheckoutError("No se pudo eliminar la dirección. Intenta de nuevo.")
            return false
          }
        } else {
          const token = getGuestToken()
          if (!token) return false
          const res = await fetch("/api/addresses/guest", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guest_token: token, address_id: id }),
          })
          if (!res.ok) {
            setCheckoutError("No se pudo eliminar la dirección. Intenta de nuevo.")
            return false
          }
        }

        const remaining = savedAddresses.filter((a) => a.id !== id)
        setSavedAddresses(remaining)
        if (selectedAddressId === id) {
          // La dirección borrada era la seleccionada: se limpia la selección
          // y, si el formulario aún la mostraba sin editar, el formulario.
          setSelectedAddressId(null)
          if (selectedSavedAddress && addressesMatch(selectedSavedAddress, address)) {
            setAddress(DEFAULT_ADDRESS_FORM)
          }
        }
        return true
      } catch {
        setCheckoutError("No se pudo eliminar la dirección. Intenta de nuevo.")
        return false
      } finally {
        setDeletingAddressId(null)
      }
    },
    [isLoggedIn, savedAddresses, selectedAddressId, selectedSavedAddress, address, setAddress]
  )

  // ── Captura de lead onBlur (fire-and-forget, fail-open) ──
  const captureLead = useCallback(
    (value: string) => {
      const cleaned = value.trim()
      if (!cleaned) return
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(cleaned)) return
      void fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleaned,
          phone: phone.trim() || undefined,
          source: leadSource,
          coupon_code: coupon?.code ?? undefined,
        }),
      })
        .then(() => AnalyticsEvents.lead())
        .catch(() => {
          // Fail-open: nunca bloquear el checkout por captura de leads
        })
    },
    [phone, coupon?.code, leadSource]
  )

  // ── Creación de orden (payload unificado; el servidor valida bumps/reglas) ──
  const createOrder = useCallback(
    async (method: PaymentMethod = "card"): Promise<CreatedOrder | null> => {
      if (!city) {
        setCheckoutError("No se pudo determinar tu ciudad. Recarga la página.")
        return null
      }
      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city_id: city.id,
            ...(isLoggedIn === false ? { guest_token: getGuestToken() ?? undefined } : {}),
            ...(selectedAddressUnedited && selectedAddressId
              ? { address_id: selectedAddressId }
              : {}),
            ...(saveDefault !== undefined && isLoggedIn === true
              ? { save_default: saveDefault }
              : {}),
            address: {
              label: address.label,
              street: address.street,
              number: address.number,
              interior: address.interior,
              neighborhood: address.neighborhood,
              zip_code: address.zip_code,
              references: address.references,
            },
            schedule: { date: schedule.date, time: schedule.time },
            payment_method: method,
            phone,
            email: email.trim() || undefined,
            subtotal: effectiveSubtotal,
            delivery_fee: deliveryFee,
            total,
            coupon_code: coupon?.code,
            // Atribución UTM de la campaña de origen (migración 00061). El
            // servidor la persiste en orders.utm_* para medir conversión.
            utm: getStoredUtm() ?? undefined,
            items: [
              // Las líneas en 0 (vaciadas con "−" en el checkout) no viajan:
              // POST /api/orders exige quantity > 0 y las ignoraría igual.
              ...cartItems
                .filter((item) => item.quantity > 0)
                .map((item) => ({
                  product_id: item.product_id,
                  quantity: item.quantity,
                  unit_price: item.sale_price ?? item.price,
                  name: item.name,
                })),
              ...selectedBumps
                .filter((b) => b.quantity > 0)
                .map((b) => ({
                  product_id: b.productId,
                  quantity: b.quantity,
                  unit_price: b.unitPrice,
                  name: b.name ?? `Artículo especial #${b.productId}`,
                  item_type: "bump" as const,
                })),
            ],
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          // `detail` es el mensaje real del fallo (p. ej. columna faltante en
          // la BD): se muestra junto al error genérico para diagnosticarlo.
          setCheckoutError(
            data.detail
              ? `${data.error || "Error al crear el pedido"} — ${data.detail}`
              : data.error || "Error al crear el pedido"
          )
          return null
        }

        if (isLoggedIn === false) {
          if (data.guestToken) saveGuestToken(data.guestToken)
          saveLastAddress({ ...address, phone, email: email.trim() || undefined })
        }

        if (!data.orderId) {
          setCheckoutError("No se pudo crear el pedido. Intenta de nuevo.")
          return null
        }

        onAfterOrderCreatedRef.current?.()

        const repurchaseCoupon = (data.repurchaseCoupon ?? null) as RepurchaseCouponInfo | null
        setRepurchaseCoupon(repurchaseCoupon)
        const trackingToken = (data.trackingToken ?? null) as string | null
        setOrderTrackingToken(trackingToken)

        return {
          orderId: data.orderId,
          cashback: {
            credits: data.cashbackCredits ?? 0,
            tier: data.cashbackTier ?? null,
          },
          repurchaseCoupon,
          trackingToken,
        }
      } catch (err) {
        setCheckoutError(
          err instanceof Error ? err.message : "Error de conexión. Intenta de nuevo."
        )
        return null
      }
    },
    [
      city,
      isLoggedIn,
      selectedAddressUnedited,
      selectedAddressId,
      saveDefault,
      address,
      schedule,
      phone,
      email,
      effectiveSubtotal,
      deliveryFee,
      total,
      coupon,
      cartItems,
      selectedBumps,
    ]
  )

  // ── Crea el PaymentIntent y muestra el formulario de Stripe ──
  const initializeCardPayment = useCallback(
    async (
      orderId: number,
      cashback: { credits: number; tier: string | null } | null
    ) => {
      setCreatedOrderId(orderId)
      setEarnedCashback(cashback)
      try {
        const guestToken = isLoggedIn === false ? getGuestToken() ?? undefined : undefined
        const intentResponse = await fetch("/api/payments/stripe/create-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: orderId,
            type: "main",
            ...(saveCard !== undefined ? { save_card: saveCard } : {}),
            ...(guestToken ? { guest_token: guestToken } : {}),
            ...(email.trim() ? { customer_email: email.trim() } : {}),
          }),
        })
        const intentData = await intentResponse.json()
        if (!intentResponse.ok || !intentData.clientSecret) {
          setCheckoutError(
            intentData.error || "No se pudo inicializar el pago con Stripe."
          )
          setIsProcessing(false)
          return
        }
        setStripeClientSecret(intentData.clientSecret)
        setShowStripeForm(true)
        setIsProcessing(false)
      } catch (intentErr) {
        setCheckoutError(
          intentErr instanceof Error
            ? intentErr.message
            : "Error de conexión al inicializar el pago."
        )
        setIsProcessing(false)
      }
    },
    [isLoggedIn, saveCard, email]
  )

  // ── Pago confirmado: delega el post-pago al flujo (onPaid) ──
  const handleStripeSuccess = useCallback(
    (
      paymentIntentId: string,
      opts?: {
        orderId?: number
        cashback?: { credits: number; tier: string | null } | null
      }
    ) => {
      const finalOrderId = opts?.orderId ?? createdOrderId
      const finalCashback = opts?.cashback ?? earnedCashback
      onPaidRef.current({
        orderId: finalOrderId,
        cashback: finalCashback,
        paymentIntentId,
        repurchaseCoupon,
        trackingToken: orderTrackingToken,
      })
    },
    [createdOrderId, earnedCashback, repurchaseCoupon, orderTrackingToken]
  )

  const handleStripeBack = useCallback(() => {
    setShowStripeForm(false)
    setStripeClientSecret(null)
  }, [])

  // ── Place order: reintento del intent, o crea la orden y paga ──
  const handlePlaceOrder = useCallback(
    async (method: PaymentMethod = "card") => {
      if (!city) return
      setIsProcessing(true)
      setCheckoutError(null)
      try {
        // Reintento tras un fallo al crear el intent: la orden ya existe.
        if (method === "card" && createdOrderId) {
          await initializeCardPayment(createdOrderId, earnedCashback)
          return
        }
        const created = await createOrder(method)
        if (!created) {
          setIsProcessing(false)
          return
        }
        if (method === "card") {
          await initializeCardPayment(created.orderId, created.cashback)
          return
        }
        // Métodos no-tarjeta: el flujo navega a la confirmación directo.
        onPaidRef.current({
          orderId: created.orderId,
          cashback: created.cashback,
          paymentIntentId: "",
          repurchaseCoupon: created.repurchaseCoupon ?? null,
          trackingToken: created.trackingToken ?? null,
        })
      } catch (err) {
        setCheckoutError(
          err instanceof Error ? err.message : "Error de conexión. Intenta de nuevo."
        )
        setIsProcessing(false)
      }
    },
    [city, createdOrderId, earnedCashback, initializeCardPayment, createOrder]
  )

  // ── Express Checkout: cobra con la tarjeta guardada (off-session) ──
  const handleExpressCheckout = useCallback(async () => {
    if (!city) return
    setIsProcessing(true)
    setCheckoutError(null)

    let orderId = createdOrderId
    let cashback = earnedCashback
    try {
      if (!orderId) {
        const created = await createOrder("card")
        if (!created) {
          setIsProcessing(false)
          return
        }
        orderId = created.orderId
        cashback = created.cashback
        setCreatedOrderId(orderId)
        setEarnedCashback(cashback)
      }

      const response = await fetch("/api/payments/stripe/express-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      })
      const data = await response.json()
      if (!response.ok) {
        setCheckoutError(data.error || "No se pudo completar el pago rápido.")
        setIsProcessing(false)
        return
      }

      if (data.status === "succeeded") {
        setSavedCard({ hasSavedCard: true })
        handleStripeSuccess(data.paymentIntentId as string, { orderId, cashback })
        return
      }

      if (data.status === "requires_action" && data.clientSecret) {
        // 3DS / SCA: confirma con if_required; si el banco exige redirección,
        // Stripe.js la maneja sola y el webhook confirma la orden.
        const { loadStripe } = await import("@stripe/stripe-js")
        const stripe = await loadStripe(
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
        )
        if (!stripe) {
          setCheckoutError("No se pudo iniciar la verificación de tu banco.")
          setIsProcessing(false)
          return
        }
        const { error } = await stripe.confirmPayment({
          clientSecret: data.clientSecret,
          redirect: "if_required",
        })
        if (error) {
          setCheckoutError(
            error.message || "Tu banco no confirmó el pago. Intenta de nuevo."
          )
          setIsProcessing(false)
          return
        }
        setSavedCard({ hasSavedCard: true })
        handleStripeSuccess(data.paymentIntentId as string, { orderId, cashback })
        return
      }

      // declined / no_saved_card / cualquier otro: fail-open, se cae al flujo
      // normal con el formulario de Stripe (la orden queda pendiente e intacta).
      if (data.status === "no_saved_card") {
        setSavedCard({ hasSavedCard: false })
        setCheckoutError(
          "No encontramos una tarjeta guardada. Guarda una la próxima vez para pagar con 1 clic."
        )
      } else {
        setCheckoutError(
          "No pudimos cobrar con tu tarjeta guardada. Completa el pago abajo."
        )
      }
      // Inicializa el flujo normal con el mismo pedido ya creado.
      await initializeCardPayment(orderId, cashback)
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : "Error de conexión. Intenta de nuevo."
      )
      setIsProcessing(false)
    }
  }, [city, createdOrderId, earnedCashback, createOrder, initializeCardPayment, handleStripeSuccess])

  return {
    isLoggedIn,
    savedCard,
    setSavedCard,
    savedAddresses,
    selectedAddressId,
    setSelectedAddressId,
    selectedSavedAddress,
    selectedAddressUnedited,
    loadingSavedAddresses,
    refreshSavedAddresses,
    deleteSavedAddress,
    deletingAddressId,
    captureLead,
    createOrder,
    initializeCardPayment,
    handlePlaceOrder,
    handleExpressCheckout,
    handleStripeSuccess,
    handleStripeBack,
    stripeClientSecret,
    setStripeClientSecret,
    showStripeForm,
    setShowStripeForm,
    createdOrderId,
    setCreatedOrderId,
    earnedCashback,
    setEarnedCashback,
    checkoutError,
    setCheckoutError,
    isProcessing,
    setIsProcessing,
  }
}
