"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Sparkles, Check } from "lucide-react"
import { MAX_BUMPS } from "@/lib/checkout-config"
import type { OrderBump } from "@/lib/order-bumps"
import { AnalyticsEvents } from "@/lib/analytics"

export interface SelectedBump {
  ruleId: number
  productId: number
  quantity: number
  unitPrice: number
  /** Nombre del producto del bump (para mostrarlo en el resumen del review). */
  name?: string
  /** Imagen del producto del bump (para mostrarla en el resumen del review). */
  imageUrl?: string
}

/**
 * Clave de sessionStorage que transporta los bumps seleccionados entre la
 * página /cart (desktop) y /checkout. El drawer móvil usa el CustomEvent
 * CHECKOUT_DRAWER_EVENT en su lugar; aquí no aplica.
 */
export const BUMPS_STORAGE_KEY = "resurte:selected-bumps"

/**
 * Estado de diagnóstico expuesto en `window.__resurteBumpsDebug` para
 * depurar en producción por qué un usuario no ve los order bumps.
 * Es aditivo y no altera el render ni el flujo del checkout.
 */
export interface BumpCardsDebug {
  /** true cuando este componente está montado; false = la sonda global lo
   *  inicializó desde el layout (BumpCards no se renderiza en esta vista). */
  mounted?: boolean
  status: "idle" | "loading" | "ok" | "empty" | "error"
  cartKey: string
  bumpCount: number
  lastError?: string
  /** ISO timestamp de la última carga exitosa de la API. */
  loadedAt?: string
  /** Nº de reintentos realizados ante fallo (p.ej. 429 rate-limit). */
  retries?: number
  /** Campos adicionales que la sonda global (BumpsDebugProbe) escribe cuando
   *  BumpCards NO está montado. */
  note?: string
  pageUrl?: string
  cartCount?: number
  cartItems?: Array<{ product_id: number; quantity: number; name: string }>
  ts?: string
}

declare global {
  interface Window {
    __resurteBumpsDebug?: BumpCardsDebug
  }
}

interface BumpCardsProps {
  /** product_id → quantity del carrito (para derivar reglas server-side). */
  cartItems: { product_id: number; quantity: number }[]
  /** Bumps seleccionados (controlado desde el drawer). */
  selected: SelectedBump[]
  onChange: (selected: SelectedBump[]) => void
}

/**
 * Tarjetas de order bumps condicionales (mecánica ThriveCart).
 *
 * Consulta POST /api/cart/bumps con los items del carrito y renderiza hasta
 * MAX_BUMPS tarjetas con checkbox. El estado de selección es local (prop
 * controlada); NO toca CartProvider ni los componentes base del carrito.
 *
 * Fallback seguro: si la API falla o no hay bumps, renderiza null — el
 * checkout nunca se bloquea por esto.
 */
export function BumpCards({ cartItems, selected, onChange }: BumpCardsProps) {
  const [bumps, setBumps] = useState<OrderBump[]>([])
  // Marca la clave del carrito ya cargada para derivar "loading" sin llamar
  // setState sincrónicamente dentro del efecto (regla react-hooks).
  const [loadedFor, setLoadedFor] = useState<string>("")
  // Última respuesta exitosa por cartKey. Si la API falla (rate-limit 429,
  // red…), conservamos los bumps ya mostrados en lugar de colapsar a null.
  const [lastGood, setLastGood] = useState<{ key: string; bumps: OrderBump[] }>({
    key: "",
    bumps: [],
  })
  // Estado de diagnóstico para window.__resurteBumpsDebug.
  const [lastError, setLastError] = useState<string | undefined>(undefined)
  const [loadedAt, setLoadedAt] = useState<string | undefined>(undefined)
  const [retries, setRetries] = useState(0)
  const cartKey = cartItems.map((i) => `${i.product_id}:${i.quantity}`).join("|")
  const loading = cartKey !== "" && loadedFor !== cartKey

  // Instrumentación de diagnóstico temporal: expone en window el estado real
  // del fetch para que un usuario logueado pueda reportar exactamente qué ve:
  //   copy(JSON.stringify(window.__resurteBumpsDebug, null, 2))
  // Se retira tras confirmar la causa raíz del reporte "no veo bumps logueado".
  useEffect(() => {
    const status: BumpCardsDebug["status"] =
      cartKey === ""
        ? "idle"
        : loading
          ? "loading"
          : bumps.length > 0
            ? "ok"
            : "empty"
    window.__resurteBumpsDebug = {
      mounted: true,
      status,
      cartKey,
      bumpCount: bumps.length,
      lastError: lastError ?? undefined,
      loadedAt: loadedAt ?? undefined,
      retries: retries,
    }
  }, [cartKey, loading, bumps, lastError, loadedAt, retries])

  // Re-enriquece los bumps seleccionados con el nombre e imagen reales del
  // producto cuando la data de reglas está disponible. Los bumps persistidos
  // en sessionStorage antes de añadir los campos `name`/`imageUrl` (o con datos
  // desactualizados) llegarían al resumen del review como "Artículo especial
  // #X" o con ícono genérico; aquí se resuelven por ruleId para que SIEMPRE
  // se muestre el producto real.
  useEffect(() => {
    if (bumps.length === 0 || selected.length === 0) return
    const productByRule = new Map(bumps.map((b) => [b.ruleId, b.product]))
    let changed = false
    const next = selected.map((s) => {
      const product = productByRule.get(s.ruleId)
      if (!product) return s
      const patch: Partial<SelectedBump> = {}
      if (product.name && product.name !== s.name) patch.name = product.name
      if (product.image_url && product.image_url !== s.imageUrl)
        patch.imageUrl = product.image_url
      if (Object.keys(patch).length === 0) return s
      changed = true
      return { ...s, ...patch }
    })
    if (changed) onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bumps])

  useEffect(() => {
    if (!cartItems || cartItems.length === 0) return
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const apply = (data: OrderBump[]) => {
      if (cancelled) return
      setBumps(data)
      setLastGood({ key: cartKey, bumps: data })
      setLastError(undefined)
      setLoadedAt(new Date().toISOString())
      // Descarta selecciones previas de bumps que ya no aplican.
      const valid = new Set(data.map((b) => b.ruleId))
      onChange(selected.filter((s) => valid.has(s.ruleId)))
      setLoadedFor(cartKey)
    }

    const attempt = (isRetry: boolean) => {
      fetch("/api/cart/bumps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cartItems }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`bumps http ${res.status}`)
          return res.json()
        })
        .then((data: { bumps?: OrderBump[] }) => {
          apply(data.bumps ?? [])
        })
        .catch((err: unknown) => {
          if (cancelled) return
          const message = err instanceof Error ? err.message : String(err)
          setLastError(message)
          if (!isRetry) {
            // Primer fallo (p.ej. 429 rate-limit): reintentar con backoff.
            setRetries((r) => r + 1)
            retryTimer = setTimeout(() => attempt(true), 2000)
          } else {
            // Fallo confirmado: mantener la última respuesta buena del mismo
            // carrito; solo colapsar si nunca hubo datos para este carrito.
            console.warn("[BumpCards] fallo al cargar order bumps, usando caché", cartKey)
            if (lastGood.key === cartKey && lastGood.bumps.length > 0) {
              setBumps(lastGood.bumps)
            } else {
              setBumps([])
            }
            setLoadedFor(cartKey)
          }
        })
    }

    attempt(false)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey])

  if (loading && bumps.length === 0) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-20 bg-gray-100 rounded-xl" />
        <div className="h-20 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (bumps.length === 0) return null

  const toggle = (bump: OrderBump) => {
    const isSelected = selected.some((s) => s.ruleId === bump.ruleId)
    let next: SelectedBump[]
    if (isSelected) {
      next = selected.filter((s) => s.ruleId !== bump.ruleId)
    } else if (selected.length < MAX_BUMPS) {
      next = [
        ...selected,
        {
          ruleId: bump.ruleId,
          productId: bump.product.id,
          quantity: 1,
          unitPrice: bump.price,
          name: bump.product.name,
          imageUrl: bump.product.image_url || undefined,
        },
      ]
    } else {
      return // ya hay MAX_BUMPS seleccionados
    }
    onChange(next)
    // Evento de selección de bump: mide el AOV incremental de esta mecánica.
    // add_to_cart es el evento estándar (GA4/Meta) más cercano a "agregó un
    // artículo especial a su pedido"; se registra con el precio con descuento.
    if (!isSelected) {
      AnalyticsEvents.addToCart({
        id: bump.product.id,
        name: bump.product.name,
        price: bump.price,
        quantity: 1,
      })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-[#B87A3A]" />
        <p className="text-xs font-semibold text-[#B87A3A] uppercase tracking-wide">
          Agrega a tu pedido
        </p>
      </div>
      {bumps.map((bump) => {
        const isSelected = selected.some((s) => s.ruleId === bump.ruleId)
        return (
          <motion.div
            key={bump.ruleId}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            whileTap={{ scale: 0.99 }}
            className="w-full"
          >
            <button
              type="button"
              onClick={() => toggle(bump)}
              aria-pressed={isSelected}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
                isSelected
                  ? "border-brand-500 bg-brand-50"
                  : "border-gray-200 bg-white hover:border-brand-200"
              }`}
            >
              <div className="w-14 h-14 rounded-lg bg-[#F7F5F0] flex items-center justify-center shrink-0 overflow-hidden">
                {bump.product.image_url ? (
                  <img
                    src={bump.product.image_url}
                    alt={bump.product.name}
                    loading="lazy"
                    width={56}
                    height={56}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <Sparkles className="w-5 h-5 text-[#C7C8CD]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-1.5">
                  {bump.badgeLabel ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 shrink-0">
                      <Sparkles className="w-3 h-3" />
                      {bump.badgeLabel}
                    </span>
                  ) : bump.discount_pct > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5 shrink-0">
                      <Check className="w-3 h-3" />
                      Ahorra {Math.round(bump.discount_pct * 100)}% al agregar ahora
                    </span>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-gray-900 leading-tight mt-1">
                  {bump.title}
                </p>
                <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                  {bump.description}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm font-bold text-brand-700">
                    ${bump.price.toFixed(2)}
                  </span>
                  {bump.original_price > bump.price && (
                    <span className="text-xs text-gray-400 line-through">
                      ${bump.original_price.toFixed(2)}
                    </span>
                  )}
                  {bump.discount_pct > 0 && (
                    <span className="text-[10px] font-semibold text-white bg-brand-600 px-1.5 py-0.5 rounded">
                      -{Math.round(bump.discount_pct * 100)}%
                    </span>
                  )}
                </div>
              </div>
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isSelected ? "border-brand-600 bg-brand-600" : "border-gray-300"
                }`}
              >
                {isSelected && <Check className="w-4 h-4 text-white" />}
              </div>
            </button>
          </motion.div>
        )
      })}
      <p className="text-[11px] text-gray-400">
        Hasta {MAX_BUMPS} artículos especiales por pedido.
      </p>
    </div>
  )
}
