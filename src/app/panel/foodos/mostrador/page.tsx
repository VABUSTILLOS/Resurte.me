"use client"

// ============================================================
// Punto de venta de mostrador (`/panel/foodos/mostrador`).
//
// El cajero cobra de pie, con el cliente enfrente y gente esperando. La pantalla
// sigue ese orden: menú arriba, ticket en una hoja inferior, cobro al final.
//
// Decisiones que la pantalla hace visibles:
//   * Sin turno abierto no se vende. No es un candado caprichoso: una venta sin
//     turno desaparece del corte del día, así que el menú se cambia por el aviso
//     y un enlace directo a la caja.
//   * El total que se cobra lo calcula el servidor. La suma de aquí es una vista
//     previa con la misma función (`computeOrderTotals`) para que el cajero no
//     espere, no una segunda aritmética que pueda divergir.
//   * La tarifa de entrega se cotiza contra el servidor antes de cobrar: una
//     dirección fuera de zona o un pedido bajo el mínimo tienen que verse antes
//     de tomar el dinero.
//   * El cambio lo recalcula el servidor a partir del efectivo recibido; se
//     manda dentro del desglose para que quede en el ticket y en el arqueo.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  createMostradorSale,
  getMostradorData,
  quoteMostradorDelivery,
  type MostradorBranch,
  type MostradorData,
  type MostradorOverride,
  type MostradorService,
} from "../mostrador-actions"
import { getFoodosPanelData } from "../actions"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import ToolPreviewNotice from "@/components/panel/foodos/tool-preview-notice"
import { useTierGuard } from "@/hooks/use-tier-guard"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { ItemOptionsModal } from "@/app/r/[slug]/_components/item-options-modal"
import { t } from "@/lib/i18n/es"
import { cartLineKey, computeOrderTotals, formatMoney, unitPriceWithModifiers } from "@/lib/foodos"
import { FOODOS_PAYMENT_METHODS, validatePaymentBreakdown, type FoodosPaymentMethod } from "@/lib/foodos-payments"
import type {
  FoodosCombo,
  FoodosMenuItem,
  FoodosOrderItem,
  FoodosOrderItemModifier,
  FoodosPaymentBreakdown,
  FoodosRestaurant,
} from "@/types/foodos"
import {
  Banknote,
  Check,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Landmark,
  Loader2,
  Lock,
  MessageCircle,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  UtensilsCrossed,
  X,
} from "lucide-react"

const FEATURE = "pos_mostrador" as const

const EMPTY_DATA: MostradorData = {
  restaurant: { id: "", name: "", slug: null, timezone: "America/Mexico_City" },
  branches: [],
  categories: [],
  items: [],
  combos: [],
  optionGroups: [],
  optionValues: [],
  overrides: [],
  shift: null,
}

/**
 * Una partida del ticket.
 *
 * `key` es la clave de línea de `cartLineKey`: dos toques sobre el mismo
 * platillo con los mismos modificadores suman cantidad en lugar de duplicar el
 * renglón, que es lo que el cajero espera al repetir un taco.
 */
interface CartLine {
  key: string
  item_id: string
  combo_id?: string
  name: string
  qty: number
  unitPrice: number
  modifiers: FoodosOrderItemModifier[]
}

interface PaymentPartDraft {
  method: FoodosPaymentMethod
  amount: string
}

const SERVICE_ORDER: MostradorService[] = ["takeaway", "delivery", "dine_in"]

const SERVICE_LABEL: Record<MostradorService, string> = {
  takeaway: "foodos.mostrador.serviceTakeaway",
  delivery: "foodos.mostrador.serviceDelivery",
  dine_in: "foodos.mostrador.serviceDineIn",
}

const SERVICE_ICON: Record<MostradorService, typeof Store> = {
  takeaway: ShoppingBag,
  delivery: Truck,
  dine_in: UtensilsCrossed,
}

const METHOD_LABEL: Record<string, string> = {
  cash: "foodos.mostrador.payCash",
  card: "foodos.mostrador.payCard",
  transfer: "foodos.mostrador.payTransfer",
  branch: "foodos.mostrador.payBranch",
  whatsapp: "foodos.mostrador.payWhatsapp",
}

const METHOD_ICON: Record<string, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Landmark,
  branch: Store,
  whatsapp: MessageCircle,
}

const TIP_PRESETS = [0, 0.1, 0.15, 0.2]

function methodLabel(method: string): string {
  return t(METHOD_LABEL[method] ?? "foodos.mostrador.payCash")
}

/** Convierte las partidas del ticket al formato que valida el servidor. */
function toOrderItems(lines: CartLine[]): FoodosOrderItem[] {
  return lines.map((l) => ({
    item_id: l.item_id,
    name: l.name,
    price: l.unitPrice,
    qty: l.qty,
    combo_id: l.combo_id,
    modifiers: l.modifiers.length ? l.modifiers : undefined,
  }))
}

/** Parseo tolerante de un importe escrito a mano ("150", "150.5", "150,50"). */
function parseAmount(raw: string): number {
  return Number(raw.replace(",", ".")) || 0
}

export default function MostradorPage() {
  const { run, upsellDialog } = useTierGuard(FEATURE)

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [branches, setBranches] = useState<MostradorBranch[]>([])
  const [branchId, setBranchId] = useState("")
  const [data, setData] = useState<MostradorData>(EMPTY_DATA)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [modalItem, setModalItem] = useState<FoodosMenuItem | null>(null)

  const [lines, setLines] = useState<CartLine[]>([])
  const [service, setService] = useState<MostradorService>("takeaway")
  const [ticketOpen, setTicketOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const [paymentMethod, setPaymentMethod] = useState<FoodosPaymentMethod>("cash")
  const [combined, setCombined] = useState(false)
  const [parts, setParts] = useState<PaymentPartDraft[]>([])
  const [receivedDraft, setReceivedDraft] = useState("")

  const [tipDraft, setTipDraft] = useState("")
  const [tipPercent, setTipPercent] = useState<number | null>(null)
  const [couponDraft, setCouponDraft] = useState("")
  const [coupon, setCoupon] = useState<string | null>(null)

  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [tableNumber, setTableNumber] = useState("")
  const [note, setNote] = useState("")
  const [address, setAddress] = useState("")
  const [deliveryNotes, setDeliveryNotes] = useState("")

  const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
  const [quoting, setQuoting] = useState(false)

  const [charging, setCharging] = useState(false)
  const [sale, setSale] = useState<{
    folio: string
    total: number
    change: number | null
    orderId: string
  } | null>(null)

  const load = useCallback(async (scopeBranch: string) => {
    try {
      const panel = await getFoodosPanelData()
      setRestaurant(panel.restaurant)
      setBranches(panel.branches ?? [])
      if (!panel.restaurant) return
      setData((await getMostradorData(panel.restaurant.id, scopeBranch || null)) ?? EMPTY_DATA)
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.mostrador.chargeError"),
      })
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      await load(branchId)
      setLoading(false)
    }
    run()
  }, [load, branchId])

  const refresh = async () => {
    setRefreshing(true)
    await load(branchId)
    setRefreshing(false)
  }

  // ------------------------------------------------------------
  // Menú
  // ------------------------------------------------------------

  const branch = branches.find((b) => b.id === branchId) ?? null

  const overrideByItem = useMemo(() => {
    const map = new Map<string, MostradorOverride>()
    for (const o of data.overrides) map.set(o.item_id, o)
    return map
  }, [data.overrides])

  /** Precio del platillo en esta sucursal: el override manda sobre el menú base. */
  const priceFor = useCallback(
    (item: FoodosMenuItem): number => overrideByItem.get(item.id)?.price ?? item.price,
    [overrideByItem]
  )

  /** Disponibilidad efectiva: agotado en sucursal o agotado en el menú base. */
  const isAvailable = useCallback(
    (item: FoodosMenuItem): boolean => {
      if (overrideByItem.get(item.id)?.is_available === false) return false
      return item.is_available
    },
    [overrideByItem]
  )

  const groupsForItem = useCallback(
    (itemId: string) =>
      data.optionGroups.filter((g) => g.item_id === itemId).sort((a, b) => a.sort_order - b.sort_order),
    [data.optionGroups]
  )

  /** Sólo se abre el modal de opciones si el platillo realmente tiene grupos. */
  const itemHasOptions = useCallback(
    (itemId: string) => {
      const groupIds = new Set(groupsForItem(itemId).map((g) => g.id))
      return data.optionValues.some((v) => groupIds.has(v.group_id))
    },
    [data.optionValues, groupsForItem]
  )

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.items.filter((item) => {
      if (selectedCategory && item.category_id !== selectedCategory) return false
      if (!needle) return true
      return (
        item.name.toLowerCase().includes(needle) ||
        (item.description ?? "").toLowerCase().includes(needle)
      )
    })
  }, [data.items, query, selectedCategory])

  /** Platillos por categoría, para no ofrecer filtros que no llevan a nada. */
  const countByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of data.items) {
      if (!item.category_id) continue
      map.set(item.category_id, (map.get(item.category_id) ?? 0) + 1)
    }
    return map
  }, [data.items])

  const activeCombos = useMemo(() => data.combos.filter((c) => c.is_active), [data.combos])

  // ------------------------------------------------------------
  // Ticket
  // ------------------------------------------------------------

  const pushLine = (candidate: Omit<CartLine, "key" | "qty">) => {
    const key = cartLineKey(candidate)
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key)
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: Math.min(50, l.qty + 1) } : l))
      }
      return [...prev, { ...candidate, key, qty: 1 }]
    })
    setNotice(null)
  }

  const addItem = (item: FoodosMenuItem, modifiers: FoodosOrderItemModifier[] = []) => {
    pushLine({
      item_id: item.id,
      name: item.name,
      unitPrice: unitPriceWithModifiers(priceFor(item), modifiers),
      modifiers,
    })
  }

  const addCombo = (combo: FoodosCombo) => {
    // El combo viaja como una sola partida con `combo_id`: el servidor lo
    // re-precisa por su propio precio y no lo expande en sus componentes.
    pushLine({
      item_id: combo.id,
      combo_id: combo.id,
      name: combo.name,
      unitPrice: combo.price,
      modifiers: [],
    })
  }

  const setQty = (key: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, qty: Math.min(50, qty) } : l))
    )
  }

  const clearTicket = () => {
    setLines([])
    setParts([])
    setReceivedDraft("")
    setTipDraft("")
    setTipPercent(null)
    setCoupon(null)
    setCouponDraft("")
    setCustomerName("")
    setCustomerPhone("")
    setTableNumber("")
    setNote("")
    setAddress("")
    setDeliveryNotes("")
    setDeliveryFee(null)
    setConfirmClear(false)
  }

  const orderItems = useMemo(() => toOrderItems(lines), [lines])
  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines])

  // La barra del ticket flota en la misma franja que el FAB de WhatsApp; la
  // body class permite ocultarlo desde globals.css (mismo patrón que
  // `cart-bar-active` y `cookie-consent-visible`).
  useEffect(() => {
    if (count > 0) document.body.classList.add("has-mostrador-ticket-bar")
    else document.body.classList.remove("has-mostrador-ticket-bar")
    return () => document.body.classList.remove("has-mostrador-ticket-bar")
  }, [count])

  const tip = useMemo(() => parseAmount(tipDraft), [tipDraft])

  const previewSubtotal = useMemo(() => orderItems.reduce((s, i) => s + i.price * i.qty, 0), [orderItems])

  /**
   * Vista previa con la misma función que usa el servidor.
   *
   * El cupón y la tarifa de entrega definitivos los decide el servidor, así que
   * esta cifra puede moverse al cobrar; `totalHint` se lo advierte al cajero.
   */
  const totals = useMemo(
    () => computeOrderTotals(orderItems, deliveryFee ?? 0, 0, tip),
    [orderItems, deliveryFee, tip]
  )

  // ------------------------------------------------------------
  // Cobro
  // ------------------------------------------------------------

  const methodParts = useMemo(
    () => parts.map((p) => ({ method: p.method, amount: parseAmount(p.amount) })),
    [parts]
  )

  const cashPart = methodParts.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0)
  const partsSum = methodParts.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, totals.total - partsSum)
  const over = Math.max(0, partsSum - totals.total)

  const received = parseAmount(receivedDraft)

  const usesCash = combined ? cashPart > 0 : paymentMethod === "cash"
  const previewChange = usesCash ? Math.max(0, received - (combined ? cashPart : totals.total)) : null

  /**
   * Desglose que viaja al servidor.
   *
   * Se manda también cuando el pago es en efectivo a un solo método: es la única
   * forma de que el "recibido" y el cambio queden guardados, y sin ellos el
   * ticket no puede imprimir el cambio.
   */
  const breakdown = useMemo<FoodosPaymentBreakdown | undefined>(() => {
    const candidate: FoodosPaymentBreakdown = combined
      ? { parts: methodParts, received: cashPart > 0 ? received : null }
      : { parts: [{ method: "cash", amount: totals.total }], received }
    if (!combined && !usesCash) return undefined
    if (!combined && received <= 0) return undefined
    return candidate
  }, [combined, methodParts, cashPart, received, totals.total, usesCash])

  /** Mismo validador que usa el servidor, para no fallar con el cliente enfrente. */
  const breakdownError = useMemo(() => {
    if (!combined) return null
    const check = validatePaymentBreakdown(
      { parts: methodParts, received: cashPart > 0 ? received : null },
      totals.total
    )
    return check.ok ? null : check.error
  }, [combined, methodParts, cashPart, received, totals.total])

  const serviceAllowed = (s: MostradorService): boolean => {
    if (!branch) return true
    if (s === "takeaway") return branch.pickup_active
    if (s === "delivery") return branch.delivery_active
    return branch.dine_in_active
  }

  const canCharge =
    lines.length > 0 &&
    !charging &&
    !!data.shift &&
    serviceAllowed(service) &&
    (combined ? !breakdownError && !!breakdown : !!paymentMethod) &&
    (service !== "delivery" || !!address.trim())

  const applyTipPercent = (pct: number) => {
    setTipPercent(pct)
    setTipDraft(pct === 0 ? "" : (previewSubtotal * pct).toFixed(2))
  }

  const quoteDelivery = async () => {
    if (!restaurant || !address.trim()) return
    setQuoting(true)
    setNotice(null)
    try {
      const attempt = await run(() =>
        quoteMostradorDelivery({
          restaurant_id: restaurant.id,
          branch_id: branchId || null,
          subtotal: previewSubtotal,
          delivery_lat: null,
          delivery_lng: null,
        })
      )
      if (!attempt.ran) return
      const res = attempt.value
      if (!res.ok) {
        setDeliveryFee(null)
        setNotice({ ok: false, text: res.error ?? t("foodos.mostrador.chargeError") })
        return
      }
      setDeliveryFee(res.deliveryFee ?? 0)
      setNotice({
        ok: true,
        text: `${t("foodos.mostrador.deliveryFee")}: ${formatMoney(res.deliveryFee ?? 0)}`,
      })
    } catch (err) {
      setDeliveryFee(null)
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.mostrador.chargeError"),
      })
    } finally {
      setQuoting(false)
    }
  }

  const charge = async () => {
    if (!restaurant || !canCharge) return
    setCharging(true)
    setNotice(null)
    try {
      const attempt = await run(() =>
        createMostradorSale({
          restaurant_id: restaurant.id,
          branch_id: branchId || null,
          items: orderItems,
          service,
          // Exactamente uno de los dos: desglose o método único.
          payment_method: breakdown ? null : paymentMethod,
          payment_breakdown: breakdown,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          note: note.trim() || null,
          table_number: service === "dine_in" ? tableNumber.trim() || null : null,
          delivery_address: service === "delivery" ? address.trim() : null,
          delivery_notes: service === "delivery" ? deliveryNotes.trim() || null : null,
          tip,
          coupon_code: coupon,
        })
      )
      if (!attempt.ran) return
      const res = attempt.value

      if (!res.ok || !res.orderId || !res.folio) {
        setNotice({ ok: false, text: res.error ?? t("foodos.mostrador.chargeError") })
        return
      }

      setSale({
        folio: res.folio,
        total: res.total ?? totals.total,
        change: res.change ?? previewChange,
        orderId: res.orderId,
      })
      setTicketOpen(false)
      clearTicket()
      await refresh()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.mostrador.chargeError"),
      })
    } finally {
      setCharging(false)
    }
  }

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" aria-hidden />
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Store className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
          <p className="text-sm text-gray-500">{t("foodos.common.setupTitle")}</p>
          <Link
            href="/panel/foodos/restaurante"
            className="inline-block mt-3 text-[#0E7A0E] font-semibold hover:underline"
          >
            {t("foodos.common.setupTitle")}
          </Link>
        </div>
      </div>
    )
  }

  const noShift = !data.shift

  return (
    <div className="space-y-4 pb-[calc(var(--floating-bottom-offset)+5rem)]">
      <Header />

      <ToolPreviewNotice feature={FEATURE} />

      {/* El turno y los precios dependen de la sucursal, así que se elige primero. */}
      <div className="flex flex-wrap items-center gap-2">
        {branches.length > 1 ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">{t("foodos.mostrador.branch")}</span>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value)
                // La tarifa cotizada era de otra sucursal y el ticket puede
                // tener platillos que ahí no existen.
                setDeliveryFee(null)
                setLines([])
              }}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">{t("foodos.mostrador.allBranches")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {data.shift ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <Check className="w-3.5 h-3.5" aria-hidden />
            {t("foodos.mostrador.shiftOk")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            <Lock className="w-3.5 h-3.5" aria-hidden />
            {t("foodos.mostrador.noShiftTitle")}
          </span>
        )}

        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
          {refreshing ? t("foodos.caja.refreshing") : t("foodos.caja.refresh")}
        </button>
      </div>

      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-xl px-3 py-2 text-sm ${
            notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {noShift ? (
        <div className="bg-white rounded-2xl border border-amber-200 p-6">
          <div className="flex items-start gap-3">
            <CircleAlert className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" aria-hidden />
            <div>
              <h2 className="font-bold text-gray-900">{t("foodos.mostrador.noShiftTitle")}</h2>
              <p className="text-sm text-gray-600 mt-1">{t("foodos.mostrador.noShiftBody")}</p>
              <Link
                href="/panel/foodos/caja"
                className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Banknote className="w-4 h-4" aria-hidden />
                {t("foodos.mostrador.goToCaja")}
              </Link>
            </div>
          </div>
        </div>
      ) : data.items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
          <p className="font-semibold text-gray-800">{t("foodos.mostrador.noItems")}</p>
          <p className="text-sm text-gray-500 mt-1">{t("foodos.mostrador.noItemsBody")}</p>
          <Link href="/panel/foodos/menu" className="inline-block mt-3 text-[#0E7A0E] font-semibold hover:underline">
            {t("foodos.mostrador.goToMenu")}
          </Link>
        </div>
      ) : (
        <>
          {/* En el mostrador se busca más de lo que se navega. */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("foodos.mostrador.searchPlaceholder")}
              aria-label={t("foodos.mostrador.search")}
              className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white pl-9 pr-10 py-3 text-sm"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("common.cancel")}
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            ) : null}
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto overscroll-contain px-1 pb-1">
            <CategoryChip
              active={selectedCategory === null}
              onClick={() => setSelectedCategory(null)}
              label={t("foodos.mostrador.allCategories")}
              count={data.items.length}
            />
            {data.categories
              .filter((c) => (countByCategory.get(c.id) ?? 0) > 0)
              .map((c) => (
                <CategoryChip
                  key={c.id}
                  active={selectedCategory === c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  label={c.name}
                  count={countByCategory.get(c.id) ?? 0}
                />
              ))}
          </div>

          {visibleItems.length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500">
              {t("foodos.mostrador.noResults")}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {visibleItems.map((item) => {
                const available = isAvailable(item)
                const price = priceFor(item)
                const hasOptions = itemHasOptions(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!available}
                    onClick={() => (hasOptions ? setModalItem(item) : addItem(item))}
                    className="min-h-[44px] rounded-2xl border border-gray-100 bg-white p-3 text-left transition-colors hover:border-[#0E7A0E]/40 disabled:opacity-50"
                  >
                    <span className="block text-sm font-semibold text-gray-900 line-clamp-2">{item.name}</span>
                    <span className="mt-1 flex flex-wrap items-baseline gap-1.5">
                      <span className="text-sm font-bold text-[#0E7A0E]">{formatMoney(price)}</span>
                      {price !== item.price ? (
                        <span className="text-[11px] text-gray-400 line-through">{formatMoney(item.price)}</span>
                      ) : null}
                    </span>
                    {!available ? (
                      <span className="mt-1 inline-block text-[11px] font-semibold text-red-500">
                        {t("foodos.mostrador.unavailable")}
                      </span>
                    ) : hasOptions ? (
                      <span className="mt-1 inline-block text-[11px] font-semibold text-amber-600">
                        {t("foodos.mostrador.optionsTitle")}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}

          {activeCombos.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-gray-900">{t("foodos.common.combos")}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {activeCombos.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addCombo(c)}
                    className="min-h-[44px] rounded-2xl border border-amber-100 bg-amber-50/60 p-3 text-left"
                  >
                    <span className="block text-sm font-semibold text-gray-900 line-clamp-2">{c.name}</span>
                    <span className="mt-1 block text-sm font-bold text-[#0E7A0E]">{formatMoney(c.price)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {/* Barra del ticket: sólo con partidas, para no tapar el menú. Se ancla
          al carril flotante (--floating-bottom-offset) para no chocar con el FAB
          de herramientas del panel, y publica una body class para apartar al
          FAB de WhatsApp, que flota en la misma franja. */}
      {count > 0 ? (
        <div className="mostrador-ticket-bar fixed inset-x-0 bottom-[var(--floating-bottom-offset)] z-40 px-3">
          <div className="mx-auto flex max-w-2xl items-center rounded-2xl border border-gray-200 bg-white/95 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.14)] backdrop-blur">
            <button
              type="button"
              onClick={() => setTicketOpen(true)}
              className="flex w-full min-h-[48px] items-center justify-between gap-3 rounded-xl bg-[#0E7A0E] px-4 py-3 text-white"
            >
              <span className="flex items-center gap-2 font-semibold">
                <Receipt className="w-5 h-5" aria-hidden />
                {t("foodos.mostrador.openCart")}
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
                  {t("foodos.mostrador.cartLines", { n: count })}
                </span>
              </span>
              <span className="flex items-center gap-1 font-bold">
                {formatMoney(totals.total)}
                <ChevronRight className="w-4 h-4" aria-hidden />
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {modalItem ? (
        <ItemOptionsModal
          item={modalItem}
          groups={groupsForItem(modalItem.id)}
          values={data.optionValues}
          onConfirm={(modifiers) => {
            addItem(modalItem, modifiers)
            setModalItem(null)
          }}
          onClose={() => setModalItem(null)}
        />
      ) : null}

      <BottomSheet open={ticketOpen} onClose={() => setTicketOpen(false)} ariaLabel={t("foodos.mostrador.cartTitle")}>
        <TicketSheet
          lines={lines}
          count={count}
          totals={totals}
          service={service}
          branch={branch}
          paymentMethod={paymentMethod}
          combined={combined}
          parts={parts}
          remaining={remaining}
          over={over}
          previewChange={previewChange}
          cashPart={cashPart}
          usesCash={usesCash}
          receivedDraft={receivedDraft}
          breakdownError={breakdownError}
          tipDraft={tipDraft}
          tipPercent={tipPercent}
          couponDraft={couponDraft}
          coupon={coupon}
          customerName={customerName}
          customerPhone={customerPhone}
          tableNumber={tableNumber}
          note={note}
          address={address}
          deliveryNotes={deliveryNotes}
          deliveryFee={deliveryFee}
          quoting={quoting}
          charging={charging}
          canCharge={canCharge}
          serviceAllowed={serviceAllowed}
          onSetQty={setQty}
          onService={setService}
          onPaymentMethod={setPaymentMethod}
          onToggleCombined={(value) => {
            setCombined(value)
            if (value && parts.length === 0) setParts([{ method: "cash", amount: "" }])
          }}
          onParts={setParts}
          onReceivedDraft={setReceivedDraft}
          onTipDraft={setTipDraft}
          onTipPercent={applyTipPercent}
          onCouponDraft={setCouponDraft}
          onCoupon={setCoupon}
          onCustomerName={setCustomerName}
          onCustomerPhone={setCustomerPhone}
          onTableNumber={setTableNumber}
          onNote={setNote}
          onAddress={setAddress}
          onDeliveryNotes={setDeliveryNotes}
          onQuoteDelivery={quoteDelivery}
          onClear={() => setConfirmClear(true)}
          onCharge={charge}
        />
      </BottomSheet>

      <BottomSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        ariaLabel={t("foodos.mostrador.clearCartTitle")}
      >
        <div className="space-y-4 p-1">
          <h2 className="text-lg font-bold text-gray-900">{t("foodos.mostrador.clearCartTitle")}</h2>
          <p className="text-sm text-gray-600">{t("foodos.mostrador.clearCartBody")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="flex-1 min-h-[44px] rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={clearTicket}
              className="flex-1 min-h-[44px] rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white"
            >
              {t("foodos.mostrador.clearCart")}
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={!!sale} onClose={() => setSale(null)} ariaLabel={t("foodos.mostrador.saleTitle")}>
        {sale ? (
          <div className="space-y-4 p-1">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                <Check className="w-5 h-5 text-emerald-600" aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t("foodos.mostrador.saleTitle")}</h2>
                <p className="text-sm text-gray-500">
                  {t("foodos.mostrador.saleFolio")}: <strong className="text-gray-900">{sale.folio}</strong>
                </p>
              </div>
            </div>

            <dl className="space-y-1.5 rounded-2xl bg-gray-50 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">{t("foodos.mostrador.saleTotal")}</dt>
                <dd className="font-bold text-gray-900">{formatMoney(sale.total)}</dd>
              </div>
              {sale.change != null && sale.change > 0 ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <dt className="text-gray-500">{t("foodos.mostrador.saleChange")}</dt>
                    <dd className="text-lg font-black text-[#0E7A0E]">{formatMoney(sale.change)}</dd>
                  </div>
                  <p className="text-xs text-gray-500">{t("foodos.mostrador.saleChangeHint")}</p>
                </>
              ) : null}
            </dl>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Link
                href={`/panel/foodos/pedidos/${sale.orderId}/print?auto=1`}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0E7A0E] px-4 py-3 text-sm font-semibold text-white"
              >
                <Printer className="w-4 h-4" aria-hidden />
                {t("foodos.mostrador.salePrintTicket")}
              </Link>
              <Link
                href={`/panel/foodos/pedidos/${sale.orderId}/print?kind=kitchen&auto=1`}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700"
              >
                <Printer className="w-4 h-4" aria-hidden />
                {t("foodos.mostrador.salePrintKitchen")}
              </Link>
            </div>

            <div className="flex gap-2">
              <Link
                href="/panel/foodos/pedidos"
                className="flex-1 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700"
              >
                {t("foodos.mostrador.saleViewOrder")}
              </Link>
              <button
                type="button"
                onClick={() => setSale(null)}
                className="flex-1 min-h-[44px] rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white"
              >
                {t("foodos.mostrador.saleNew")}
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <ToolGuideHost
        toolKey="mostrador"
        pathname="/panel/foodos/mostrador"
        slug={restaurant.slug}
        icon="🧾"
        title={t("foodos.mostrador.title")}
        subtitle={t("foodos.mostrador.guideSubtitle")}
      />

      {upsellDialog}
    </div>
  )
}

function Header() {
  return (
    <header className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#0E7A0E]/10">
        <Store className="w-5 h-5 text-[#0E7A0E]" aria-hidden />
      </span>
      <div>
        <h1 className="text-xl font-black text-gray-900">{t("foodos.mostrador.title")}</h1>
        <p className="text-sm text-gray-500">{t("foodos.mostrador.subtitle")}</p>
      </div>
    </header>
  )
}

function CategoryChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 min-h-[36px] rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
        active ? "bg-[#0E7A0E] text-white" : "bg-white text-gray-700 border border-gray-200"
      }`}
    >
      {label}
      <span className={active ? "ml-1.5 text-white/70" : "ml-1.5 text-gray-400"}>{count}</span>
    </button>
  )
}

interface TicketSheetProps {
  lines: CartLine[]
  count: number
  totals: { subtotal: number; discount: number; total: number }
  service: MostradorService
  branch: MostradorBranch | null
  paymentMethod: FoodosPaymentMethod
  combined: boolean
  parts: PaymentPartDraft[]
  remaining: number
  over: number
  previewChange: number | null
  cashPart: number
  usesCash: boolean
  receivedDraft: string
  breakdownError: string | null
  tipDraft: string
  tipPercent: number | null
  couponDraft: string
  coupon: string | null
  customerName: string
  customerPhone: string
  tableNumber: string
  note: string
  address: string
  deliveryNotes: string
  deliveryFee: number | null
  quoting: boolean
  charging: boolean
  canCharge: boolean
  serviceAllowed: (s: MostradorService) => boolean
  onSetQty: (key: string, qty: number) => void
  onService: (s: MostradorService) => void
  onPaymentMethod: (m: FoodosPaymentMethod) => void
  onToggleCombined: (value: boolean) => void
  onParts: (parts: PaymentPartDraft[]) => void
  onReceivedDraft: (v: string) => void
  onTipDraft: (v: string) => void
  onTipPercent: (pct: number) => void
  onCouponDraft: (v: string) => void
  onCoupon: (code: string | null) => void
  onCustomerName: (v: string) => void
  onCustomerPhone: (v: string) => void
  onTableNumber: (v: string) => void
  onNote: (v: string) => void
  onAddress: (v: string) => void
  onDeliveryNotes: (v: string) => void
  onQuoteDelivery: () => void
  onClear: () => void
  onCharge: () => void
}

function TicketSheet(props: TicketSheetProps) {
  const {
    lines,
    totals,
    service,
    branch,
    combined,
    parts,
    cashPart,
    receivedDraft,
    deliveryFee,
    serviceAllowed,
  } = props

  return (
    <div className="space-y-5 p-1">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">{t("foodos.mostrador.cartTitle")}</h2>
        {lines.length > 0 ? (
          <button
            type="button"
            onClick={props.onClear}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
            {t("foodos.mostrador.clearCart")}
          </button>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
          <p className="font-semibold text-gray-700">{t("foodos.mostrador.cartEmpty")}</p>
          <p className="mt-1 text-sm text-gray-500">{t("foodos.mostrador.cartEmptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line.key} className="rounded-2xl border border-gray-100 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{line.name}</p>
                  {line.modifiers.length > 0 ? (
                    <p className="mt-0.5 text-xs text-gray-500">
                      {line.modifiers.map((m) => m.value_name).join(" · ")}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-gray-400">
                    {t("foodos.mostrador.lineUnit")}: {formatMoney(line.unitPrice)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-gray-900">
                  {formatMoney(line.unitPrice * line.qty)}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => props.onSetQty(line.key, line.qty - 1)}
                  aria-label={`${t("foodos.mostrador.lineQty")} −`}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 text-gray-700"
                >
                  <Minus className="w-4 h-4" aria-hidden />
                </button>
                <span className="min-w-8 text-center text-sm font-bold">{line.qty}</span>
                <button
                  type="button"
                  onClick={() => props.onSetQty(line.key, line.qty + 1)}
                  aria-label={`${t("foodos.mostrador.lineQty")} +`}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 text-gray-700"
                >
                  <Plus className="w-4 h-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => props.onSetQty(line.key, 0)}
                  className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-600"
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                  {t("foodos.mostrador.lineRemove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Tipo de servicio: lo que cambia el flujo, la comanda y la entrega. */}
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-gray-900">{t("foodos.mostrador.service")}</h3>
        <div className="grid grid-cols-3 gap-2">
          {SERVICE_ORDER.map((s) => {
            const Icon = SERVICE_ICON[s]
            const allowed = serviceAllowed(s)
            const active = service === s
            return (
              <button
                key={s}
                type="button"
                disabled={!allowed}
                aria-pressed={active}
                onClick={() => props.onService(s)}
                className={`min-h-[44px] rounded-xl px-3 py-2.5 text-xs font-semibold disabled:opacity-40 ${
                  active ? "bg-[#0E7A0E] text-white" : "border border-gray-200 bg-white text-gray-700"
                }`}
              >
                <Icon className="mx-auto mb-1 w-4 h-4" aria-hidden />
                {t(SERVICE_LABEL[s])}
              </button>
            )
          })}
        </div>
        {branch && !serviceAllowed(service) ? (
          <p className="text-xs text-amber-700">{t("foodos.mostrador.serviceUnavailable")}</p>
        ) : null}

        {service === "dine_in" ? (
          <Field
            label={t("foodos.mostrador.tableNumber")}
            value={props.tableNumber}
            onChange={props.onTableNumber}
            placeholder={t("foodos.mostrador.tableNumberPlaceholder")}
            inputMode="numeric"
          />
        ) : null}

        {service === "delivery" ? (
          <div className="space-y-2">
            <Field
              label={t("foodos.mostrador.address")}
              value={props.address}
              onChange={props.onAddress}
              placeholder={t("foodos.mostrador.addressPlaceholder")}
              multiline
            />
            <Field
              label={t("foodos.mostrador.deliveryNotes")}
              value={props.deliveryNotes}
              onChange={props.onDeliveryNotes}
              placeholder={t("foodos.mostrador.deliveryNotesPlaceholder")}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={props.onQuoteDelivery}
                disabled={props.quoting || !props.address.trim()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
              >
                {props.quoting ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                ) : (
                  <Truck className="w-4 h-4" aria-hidden />
                )}
                {props.quoting ? t("foodos.mostrador.deliveryQuoting") : t("foodos.mostrador.deliveryQuote")}
              </button>
              {deliveryFee != null ? (
                <span className="text-sm font-bold text-gray-900">
                  {t("foodos.mostrador.deliveryFee")}: {formatMoney(deliveryFee)}
                </span>
              ) : (
                <span className="text-xs text-gray-500">{t("foodos.mostrador.deliveryPending")}</span>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <Field
          label={t("foodos.mostrador.customerName")}
          value={props.customerName}
          onChange={props.onCustomerName}
          placeholder={t("foodos.mostrador.customerNamePlaceholder")}
        />
        <Field
          label={t("foodos.mostrador.customerPhone")}
          value={props.customerPhone}
          onChange={props.onCustomerPhone}
          placeholder={t("foodos.mostrador.customerPhonePlaceholder")}
          inputMode="tel"
        />
        <Field
          label={t("foodos.mostrador.note")}
          value={props.note}
          onChange={props.onNote}
          placeholder={t("foodos.mostrador.notePlaceholder")}
        />
      </section>

      {/* Totales: vista previa con la misma función que usa el servidor. */}
      <dl className="space-y-1.5 rounded-2xl bg-gray-50 p-4 text-sm">
        <Row label={t("foodos.mostrador.subtotal")} value={formatMoney(totals.subtotal)} />
        {deliveryFee != null ? (
          <Row label={t("foodos.mostrador.deliveryFee")} value={formatMoney(deliveryFee)} />
        ) : null}
        {totals.discount > 0 ? (
          <Row label={t("foodos.mostrador.discount")} value={`−${formatMoney(totals.discount)}`} />
        ) : null}
        <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
          <dt className="font-bold text-gray-900">{t("foodos.mostrador.total")}</dt>
          <dd className="text-lg font-black text-gray-900">{formatMoney(totals.total)}</dd>
        </div>
        <p className="text-xs text-gray-500">{t("foodos.mostrador.totalHint")}</p>
      </dl>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-gray-900">{t("foodos.mostrador.tip")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {TIP_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              aria-pressed={props.tipPercent === pct}
              onClick={() => props.onTipPercent(pct)}
              className={`min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm font-semibold ${
                props.tipPercent === pct ? "bg-[#0E7A0E] text-white" : "border border-gray-200 bg-white text-gray-700"
              }`}
            >
              {pct === 0 ? t("foodos.mostrador.tipNone") : `${Math.round(pct * 100)}%`}
            </button>
          ))}
          <input
            value={props.tipDraft}
            onChange={(e) => props.onTipDraft(e.target.value)}
            inputMode="decimal"
            placeholder={t("foodos.mostrador.tipPlaceholder")}
            aria-label={t("foodos.mostrador.tipCustom")}
            className="w-24 min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
          />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-gray-900">{t("foodos.mostrador.coupon")}</h3>
        <div className="flex gap-2">
          <input
            value={props.couponDraft}
            onChange={(e) => props.onCouponDraft(e.target.value.toUpperCase())}
            placeholder={t("foodos.mostrador.couponPlaceholder")}
            aria-label={t("foodos.mostrador.coupon")}
            className="flex-1 min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm uppercase"
          />
          <button
            type="button"
            onClick={() => props.onCoupon(props.couponDraft.trim() || null)}
            className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700"
          >
            {t("foodos.mostrador.couponApply")}
          </button>
        </div>
        {props.coupon ? (
          <p className="text-xs text-gray-600">
            {props.coupon}{" "}
            <button type="button" onClick={() => props.onCoupon(null)} className="font-semibold text-red-600">
              {t("foodos.mostrador.payRemovePart")}
            </button>
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-gray-900">{t("foodos.mostrador.payMethod")}</h3>

        {!combined ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {FOODOS_PAYMENT_METHODS.map((m) => {
              const Icon = METHOD_ICON[m] ?? Banknote
              const active = props.paymentMethod === m
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => props.onPaymentMethod(m)}
                  className={`min-h-[44px] rounded-xl px-2 py-2.5 text-xs font-semibold ${
                    active ? "bg-[#0E7A0E] text-white" : "border border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  <Icon className="mx-auto mb-1 w-4 h-4" aria-hidden />
                  {methodLabel(m)}
                </button>
              )
            })}
          </div>
        ) : null}

        <button
          type="button"
          aria-pressed={combined}
          onClick={() => props.onToggleCombined(!combined)}
          className={`min-h-[44px] w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${
            combined ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-700"
          }`}
        >
          {t("foodos.mostrador.payCombined")}
        </button>

        {combined ? (
          <div className="space-y-2 rounded-2xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{t("foodos.mostrador.payCombinedHint")}</p>
            {parts.map((p, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  value={p.method}
                  onChange={(e) => {
                    const next = parts.slice()
                    next[index] = { ...p, method: e.target.value as FoodosPaymentMethod }
                    props.onParts(next)
                  }}
                  aria-label={t("foodos.mostrador.payMethod")}
                  className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                >
                  {FOODOS_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {methodLabel(m)}
                    </option>
                  ))}
                </select>
                <input
                  value={p.amount}
                  onChange={(e) => {
                    const next = parts.slice()
                    next[index] = { ...p, amount: e.target.value }
                    props.onParts(next)
                  }}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={t("foodos.mostrador.payParts")}
                  className="flex-1 min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => props.onParts(parts.filter((_, i) => i !== index))}
                  aria-label={t("foodos.mostrador.payRemovePart")}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 text-gray-500"
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => props.onParts([...parts, { method: "cash", amount: "" }])}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700"
            >
              <Plus className="w-4 h-4" aria-hidden />
              {t("foodos.mostrador.payAddPart")}
            </button>

            <dl className="space-y-1 text-sm" aria-live="polite">
              <Row
                label={props.remaining > 0 ? t("foodos.mostrador.payRemaining") : t("foodos.mostrador.payExact")}
                value={formatMoney(props.remaining)}
              />
              {props.over > 0 ? (
                <Row label={t("foodos.mostrador.payOver")} value={formatMoney(props.over)} />
              ) : null}
            </dl>

            {props.breakdownError ? (
              <p role="status" aria-live="polite" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                {props.breakdownError}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Con efectivo de por medio el cambio se calcula sobre lo recibido. */}
        {props.usesCash ? (
          <div className="space-y-2 rounded-2xl border border-gray-200 p-3">
            <Field
              label={t("foodos.mostrador.payReceived")}
              value={receivedDraft}
              onChange={props.onReceivedDraft}
              placeholder="0"
              inputMode="decimal"
            />
            <p className="text-xs text-gray-500">{t("foodos.mostrador.payReceivedHint")}</p>
            {props.previewChange != null ? (
              <div className="flex items-baseline justify-between text-sm" aria-live="polite">
                <span className="font-semibold text-gray-700">{t("foodos.mostrador.payChange")}</span>
                <span className="text-lg font-black text-[#0E7A0E]">{formatMoney(props.previewChange)}</span>
              </div>
            ) : null}
            {combined && cashPart > 0 ? (
              <p className="text-xs text-gray-500">
                {t("foodos.mostrador.payCash")}: {formatMoney(cashPart)}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <button
        type="button"
        onClick={props.onCharge}
        disabled={!props.canCharge}
        className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#0E7A0E] px-4 py-3.5 text-base font-bold text-white disabled:opacity-50"
      >
        {props.charging ? (
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
        ) : (
          <Check className="w-5 h-5" aria-hidden />
        )}
        {props.charging ? t("foodos.mostrador.charging") : t("foodos.mostrador.charge")}
      </button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-semibold text-gray-900">{value}</dd>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  multiline,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  inputMode?: "text" | "numeric" | "decimal" | "tel"
  multiline?: boolean
}) {
  const id = `mostrador-${label.replace(/\s+/g, "-").toLowerCase()}`
  const shared =
    "w-full min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0E7A0E] focus:outline-none"
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-gray-600">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={shared}
        />
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode ?? "text"}
          className={shared}
        />
      )}
    </div>
  )
}
