"use client"

// ============================================================
// Comandero de mesas (`/panel/foodos/mesas`).
//
// El mesero trae el teléfono en la mano y camina entre mesas, así que la
// pantalla es un mapa, no una lista: se toca la mesa, no se busca la cuenta.
//
// Decisiones que la pantalla hace visibles:
//   * El mapa se lee de un vistazo: verde libre, ámbar ocupada, azul con la
//     cuenta pedida. El color lo decide `tableStatus` en el módulo puro, no
//     esta pantalla, para que la cocina y el cajero vean lo mismo.
//   * Se puede tomar el pedido **con la caja cerrada**: la cocina no espera al
//     arqueo. Sólo el cobro exige turno abierto, y se dice antes de intentarlo.
//   * Una ronda a cocina es una fila propia. La cuenta se arma sumando esas
//     filas, así que pedir en dos rondas no sobrescribe lo ya pedido.
//   * Los totales que se ven son vista previa con las mismas funciones que usa
//     el servidor (`accountTotals`, `computeOrderTotals`). El importe que se
//     cobra lo decide el servidor.
//   * Dividir la cuenta no crea varias ventas: se cobra una vez con un desglose
//     de varias formas de pago, para que el arqueo cuente la mesa una sola vez.
//   * En modo acomodo se arrastra; la posición se acota también en servidor
//     porque el salón se edita desde varios dispositivos.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  cancelTicket,
  closeTable,
  deleteTable,
  deleteZone,
  getMesasData,
  mergeTables,
  moveTable,
  openTable,
  requestBill,
  saveTable,
  saveZone,
  sendToKitchen,
  setGuests,
  transferTable,
  type MesasBranch,
  type MesasData,
  type MesasOverride,
} from "../mesas-actions"
import { getFoodosPanelData } from "../actions"
import { createClient } from "@/lib/supabase/client"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import NivelGate from "@/components/panel/foodos/nivel-gate"
import { useEntitlements } from "@/components/panel/foodos/entitlements-context"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { ItemOptionsModal } from "@/app/r/[slug]/_components/item-options-modal"
import { t } from "@/lib/i18n/es"
import { cartLineKey, computeOrderTotals, formatMoney, unitPriceWithModifiers } from "@/lib/foodos"
import {
  FOODOS_PAYMENT_METHODS,
  validatePaymentBreakdown,
  type FoodosPaymentMethod,
} from "@/lib/foodos-payments"
import {
  accountTotals,
  activeTablesInZone,
  aggregateAccountItems,
  clampPosition,
  elapsedMinutes,
  isOpenComanda,
  maxAccountParts,
  nextTableLabel,
  openTicketByTable,
  ordersByTicket,
  sortZones,
  splitAmount,
  sumGuests,
  tableStatus,
  tablesInZone,
  TABLE_MIN_SIZE,
  ZONE_DEFAULT_HEIGHT,
  ZONE_DEFAULT_WIDTH,
  type MesasTable,
  type MesasZone,
  type TableShape,
  type TableStatus,
  type TableTicket,
} from "@/lib/foodos-tables"
import type {
  FoodosCombo,
  FoodosMenuItem,
  FoodosOrderItem,
  FoodosOrderItemModifier,
  FoodosPaymentBreakdown,
  FoodosRestaurant,
} from "@/types/foodos"
import {
  ArrowLeftRight,
  Banknote,
  Check,
  ChefHat,
  CircleAlert,
  Clock,
  CreditCard,
  Grid2x2Plus,
  Landmark,
  LayoutGrid,
  Loader2,
  Lock,
  MessageCircle,
  Merge,
  Minus,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Search,
  Store,
  Trash2,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react"

const FEATURE = "comandero" as const

const EMPTY_DATA: MesasData = {
  restaurant: { id: "", name: "", slug: null, timezone: "America/Mexico_City" },
  branches: [],
  zones: [],
  tables: [],
  tickets: [],
  orders: [],
  shiftId: null,
  categories: [],
  items: [],
  combos: [],
  optionGroups: [],
  optionValues: [],
  overrides: [],
}

/** Una línea de la ronda que todavía no va a cocina. */
interface RoundLine {
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

/**
 * Ancho mínimo del lienzo. En un teléfono de 360 px un salón de 1000×700
 * dibujado a lo ancho deja mesas de 23 px, imposibles de tocar; con este
 * mínimo la mesa más chica pasa de 44 px y el mapa se recorre deslizando.
 */
const CANVAS_MIN_WIDTH = 760

const METHOD_ICON: Record<string, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Landmark,
  branch: Store,
  whatsapp: MessageCircle,
}

const SHAPE_CLASS: Record<TableShape, string> = {
  square: "rounded-xl",
  round: "rounded-full",
  rect: "rounded-xl",
}

const STATUS_CLASS: Record<TableStatus, string> = {
  free: "border-emerald-200 bg-emerald-50 text-emerald-900",
  occupied: "border-amber-200 bg-amber-50 text-amber-900",
  billing: "border-sky-300 bg-sky-50 text-sky-900",
}

const STATUS_BADGE: Record<TableStatus, string> = {
  free: "bg-emerald-100 text-emerald-700",
  occupied: "bg-amber-100 text-amber-800",
  billing: "bg-sky-100 text-sky-800",
}

const STATUS_LABEL_KEY: Record<TableStatus, string> = {
  free: "foodos.mesas.stateFree",
  occupied: "foodos.mesas.stateOccupied",
  billing: "foodos.mesas.stateBilling",
}

const TIP_PRESETS = [0, 0.1, 0.15, 0.2]

function methodLabel(method: string): string {
  if (method === "cash") return t("foodos.mostrador.payCash")
  if (method === "card") return t("foodos.mostrador.payCard")
  if (method === "transfer") return t("foodos.mostrador.payTransfer")
  if (method === "branch") return t("foodos.mostrador.payBranch")
  if (method === "whatsapp") return t("foodos.mostrador.payWhatsapp")
  return method
}

function parseAmount(raw: string): number {
  return Number(raw.replace(",", ".")) || 0
}

function toOrderItems(lines: RoundLine[]): FoodosOrderItem[] {
  return lines.map((line) => ({
    item_id: line.item_id,
    name: line.name,
    price: line.unitPrice,
    qty: line.qty,
    ...(line.combo_id ? { combo_id: line.combo_id } : {}),
    ...(line.modifiers.length ? { modifiers: line.modifiers } : {}),
  }))
}

/** Tamaño de la mesa en unidades del lienzo; crece con los lugares. */
function tableBox(table: MesasTable): { w: number; h: number } {
  const base = Math.min(120, Math.max(TABLE_MIN_SIZE, 40 + table.seats * 8))
  return table.shape === "rect" ? { w: base * 1.5, h: base } : { w: base, h: base }
}

export default function MesasPage() {
  const { can } = useEntitlements()
  const canMesas = can(FEATURE)

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [branches, setBranches] = useState<MesasBranch[]>([])
  const [branchId, setBranchId] = useState("")
  const [data, setData] = useState<MesasData>(EMPTY_DATA)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const [zoneId, setZoneId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  // El arrastre escribe en un borrador local que se persiste al soltar. El
  // acomodo bueno es el del servidor, así que cada carga limpia el borrador.
  const [posDraft, setPosDraft] = useState<Record<string, { x: number; y: number }>>({})

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    origX: number
    origY: number
    scaleX: number
    scaleY: number
    x: number
    y: number
    moved: boolean
  } | null>(null)

  // Hojas de la mesa
  const [openTableFor, setOpenTableFor] = useState<MesasTable | null>(null)
  const [guestsDraft, setGuestsDraft] = useState(2)
  const [accountTable, setAccountTable] = useState<MesasTable | null>(null)

  // Ronda en captura
  const [pickerOpen, setPickerOpen] = useState(false)
  const [roundLines, setRoundLines] = useState<RoundLine[]>([])
  const [roundNote, setRoundNote] = useState("")
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [modalItem, setModalItem] = useState<FoodosMenuItem | null>(null)

  // Cobro
  const [chargeOpen, setChargeOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<FoodosPaymentMethod>("cash")
  const [combined, setCombined] = useState(false)
  const [parts, setParts] = useState<PaymentPartDraft[]>([])
  const [receivedDraft, setReceivedDraft] = useState("")
  const [tipDraft, setTipDraft] = useState("")
  const [tipPercent, setTipPercent] = useState<number | null>(null)
  const [couponDraft, setCouponDraft] = useState("")
  const [coupon, setCoupon] = useState<string | null>(null)
  const [sale, setSale] = useState<{
    folio: string
    total: number
    change: number | null
    orderId: string
  } | null>(null)

  // Mover / unir / cancelar / dividir
  const [transferOpen, setTransferOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitParts, setSplitParts] = useState(2)

  // Acomodo
  const [layoutSheet, setLayoutSheet] = useState<{
    kind: "zone" | "table"
    zone?: MesasZone
    table?: MesasTable
  } | null>(null)
  const [zoneNameDraft, setZoneNameDraft] = useState("")
  const [tableDraft, setTableDraft] = useState({
    label: "",
    seats: 4,
    shape: "square" as TableShape,
    isActive: true,
  })

  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (scopeBranch: string) => {
    try {
      const panel = await getFoodosPanelData()
      setRestaurant(panel.restaurant)
      setBranches(panel.branches ?? [])
      if (!panel.restaurant) return
      setData((await getMesasData(panel.restaurant.id, scopeBranch || null)) ?? EMPTY_DATA)
      setPosDraft({})
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.mesas.loadError"),
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

  // Reloj del mapa: el tiempo sentado es la señal más útil del salón.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // ------------------------------------------------------------
  // Tiempo real
  // ------------------------------------------------------------

  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => {
      void load(branchId)
    }, 700)
  }, [load, branchId])

  useEffect(() => {
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!restaurant) return
    const supabase = createClient()
    if (!supabase) return

    const channel = supabase
      .channel(`foodos-mesas-${restaurant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "foodos_table_tickets", filter: `restaurant_id=eq.${restaurant.id}` },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "foodos_orders", filter: `restaurant_id=eq.${restaurant.id}` },
        () => scheduleReload()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurant, scheduleReload])

  // ------------------------------------------------------------
  // Salón
  // ------------------------------------------------------------

  const zones = useMemo(() => sortZones(data.zones), [data.zones])

  // La zona activa se deriva en vez de guardarse: si viviera en estado habría
  // que corregirla con un efecto cada vez que el mapa se recarga desde el
  // servidor. `zoneId` es sólo la zona que pidió el usuario.
  const activeZoneId = zoneId && zones.some((z) => z.id === zoneId) ? zoneId : zones[0]?.id ?? null
  const zone = zones.find((z) => z.id === activeZoneId) ?? null
  const zoneTables = useMemo(
    () => (zone ? tablesInZone(data.tables, zone.id) : []),
    [data.tables, zone]
  )

  // Acomodo que manda el servidor; encima va el borrador del arrastre.
  const basePositions = useMemo(() => {
    const next: Record<string, { x: number; y: number }> = {}
    for (const table of data.tables) next[table.id] = { x: table.pos_x, y: table.pos_y }
    return next
  }, [data.tables])

  const positionOf = useCallback(
    (table: MesasTable) =>
      posDraft[table.id] ?? basePositions[table.id] ?? { x: table.pos_x, y: table.pos_y },
    [posDraft, basePositions]
  )

  const ticketByTable = useMemo(() => openTicketByTable(data.tickets), [data.tickets])
  const ordersByTicketId = useMemo(() => ordersByTicket(data.orders), [data.orders])

  /** Cuenta abierta de una mesa, con sus pedidos. */
  const accountOf = useCallback(
    (table: MesasTable) => {
      const ticket = ticketByTable.get(table.id) ?? null
      const orders = ticket ? ordersByTicketId.get(ticket.id) ?? [] : []
      // Las comandas pendientes son lo que se va a cobrar; la cuenta ya cobrada
      // no existe mientras el ticket esté abierto, pero el filtro lo deja claro.
      const pending = orders.filter((order) => isOpenComanda(order))
      return { ticket, orders, pending, totals: accountTotals(pending) }
    },
    [ticketByTable, ordersByTicketId]
  )

  const zoneStats = useMemo(() => {
    const openTickets = zoneTables
      .map((table) => ticketByTable.get(table.id))
      .filter((ticket): ticket is TableTicket => !!ticket)
    const occupied = openTickets.length
    return {
      free: zoneTables.length - occupied,
      occupied,
      guests: sumGuests(openTickets),
    }
  }, [zoneTables, ticketByTable])

  const branch = branches.find((b) => b.id === branchId) ?? null
  const dineInOff = !!branch && !branch.dine_in_active

  // ------------------------------------------------------------
  // Acomodo
  // ------------------------------------------------------------

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, table: MesasTable, activeZone: MesasZone) => {
    if (!editing) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const current = positionOf(table)
    dragRef.current = {
      id: table.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: current.x,
      origY: current.y,
      scaleX: activeZone.width / rect.width,
      scaleY: activeZone.height / rect.height,
      x: current.x,
      y: current.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const dragMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    // Cinco píxeles de tolerancia: un toque con el dedo tiembla y no debe
    // contar como arrastre ni mover la mesa.
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
    drag.moved = true
    drag.x = drag.origX + dx * drag.scaleX
    drag.y = drag.origY + dy * drag.scaleY
    setPosDraft((prev) => ({ ...prev, [drag.id]: { x: drag.x, y: drag.y } }))
  }

  const endDrag = async (event: React.PointerEvent<HTMLButtonElement>, table: MesasTable, activeZone: MesasZone) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (!drag.moved) {
      // Sin movimiento fue un toque: en modo acomodo abre el editor de la mesa.
      setLayoutSheet({ kind: "table", table })
      setTableDraft({ label: table.label, seats: table.seats, shape: table.shape, isActive: table.is_active })
      return
    }
    if (!restaurant) return
    const clamped = clampPosition(drag.x, drag.y, activeZone, TABLE_MIN_SIZE)
    setPosDraft((prev) => ({ ...prev, [drag.id]: clamped }))
    const res = await moveTable({
      restaurant_id: restaurant.id,
      id: drag.id,
      pos_x: clamped.x,
      pos_y: clamped.y,
    })
    if (!res.ok) setNotice({ ok: false, text: res.error ?? t("foodos.mesas.actionError") })
    else setPosDraft((prev) => {
      // Guardado: el servidor ya es la fuente del acomodo de esta mesa.
      const next = { ...prev }
      delete next[drag.id]
      return next
    })
  }

  const submitZone = async () => {
    if (!restaurant) return
    setBusy(true)
    try {
      const res = await saveZone({
        restaurant_id: restaurant.id,
        branch_id: branchId || null,
        id: layoutSheet?.zone?.id,
        name: zoneNameDraft,
        sort_order: layoutSheet?.zone?.sort_order ?? zones.length,
        width: layoutSheet?.zone?.width ?? ZONE_DEFAULT_WIDTH,
        height: layoutSheet?.zone?.height ?? ZONE_DEFAULT_HEIGHT,
      })
      if (!res.ok) {
        setNotice({ ok: false, text: res.error ?? t("foodos.mesas.actionError") })
        return
      }
      setLayoutSheet(null)
      setNotice({ ok: true, text: t("foodos.mesas.saved") })
      await refresh()
      if (res.id) setZoneId(res.id)
    } finally {
      setBusy(false)
    }
  }

  const removeZone = async () => {
    if (!restaurant || !layoutSheet?.zone) return
    setBusy(true)
    try {
      const res = await deleteZone({ restaurant_id: restaurant.id, id: layoutSheet.zone.id })
      if (!res.ok) {
        setNotice({ ok: false, text: res.error ?? t("foodos.mesas.actionError") })
        return
      }
      setLayoutSheet(null)
      setZoneId(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const submitTable = async () => {
    if (!restaurant || !zone) return
    setBusy(true)
    try {
      const existing = layoutSheet?.table
      const res = await saveTable({
        restaurant_id: restaurant.id,
        branch_id: branchId || null,
        id: existing?.id,
        zone_id: zone.id,
        label: tableDraft.label,
        seats: tableDraft.seats,
        shape: tableDraft.shape,
        // Sin mesa previa, la nueva nace al centro del lienzo; después se arrastra.
        pos_x: existing ? positionOf(existing).x : zone.width / 2,
        pos_y: existing ? positionOf(existing).y : zone.height / 2,
        is_active: tableDraft.isActive,
      })
      if (!res.ok) {
        setNotice({ ok: false, text: res.error ?? t("foodos.mesas.actionError") })
        return
      }
      setLayoutSheet(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const removeTable = async () => {
    if (!restaurant || !layoutSheet?.table) return
    setBusy(true)
    try {
      const res = await deleteTable({ restaurant_id: restaurant.id, id: layoutSheet.table.id })
      if (!res.ok) {
        setNotice({ ok: false, text: res.error ?? t("foodos.mesas.actionError") })
        return
      }
      setLayoutSheet(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const addTableQuick = () => {
    if (!zone) return
    const labels = zoneTables.map((table) => table.label)
    setTableDraft({ label: nextTableLabel(labels), seats: 4, shape: "square", isActive: true })
    setLayoutSheet({ kind: "table" })
  }

  // ------------------------------------------------------------
  // Cuentas
  // ------------------------------------------------------------

  const runAccountAction = async (
    action: () => Promise<{ ok: boolean; error?: string }>,
    okText?: string
  ): Promise<boolean> => {
    setBusy(true)
    try {
      const res = await action()
      if (!res.ok) {
        setNotice({ ok: false, text: res.error ?? t("foodos.mesas.actionError") })
        return false
      }
      if (okText) setNotice({ ok: true, text: okText })
      await refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  const submitOpenTable = async () => {
    if (!restaurant || !openTableFor) return
    const ok = await runAccountAction(() =>
      openTable({
        restaurant_id: restaurant.id,
        table_id: openTableFor.id,
        guests: guestsDraft,
      })
    )
    if (!ok) return
    const table = openTableFor
    setOpenTableFor(null)
    setAccountTable(table)
  }

  const bumpGuests = async (ticket: TableTicket, next: number) => {
    if (!restaurant) return
    await runAccountAction(() =>
      setGuests({ restaurant_id: restaurant.id, ticket_id: ticket.id, guests: next })
    )
  }

  const toggleBill = async (ticket: TableTicket, requested: boolean) => {
    if (!restaurant) return
    await runAccountAction(() =>
      requestBill({ restaurant_id: restaurant.id, ticket_id: ticket.id, requested })
    )
  }

  const submitTransfer = async (target: MesasTable) => {
    if (!restaurant || !accountTable) return
    const ticket = ticketByTable.get(accountTable.id)
    if (!ticket) return
    const ok = await runAccountAction(
      () => transferTable({ restaurant_id: restaurant.id, ticket_id: ticket.id, table_id: target.id }),
      t("foodos.mesas.transferOk")
    )
    if (!ok) return
    setTransferOpen(false)
    setAccountTable(target)
  }

  const submitMerge = async (source: MesasTable) => {
    if (!restaurant || !accountTable) return
    const targetTicket = ticketByTable.get(accountTable.id)
    const sourceTicket = ticketByTable.get(source.id)
    if (!targetTicket || !sourceTicket) return
    const ok = await runAccountAction(
      () =>
        mergeTables({
          restaurant_id: restaurant.id,
          source_ticket_id: sourceTicket.id,
          target_ticket_id: targetTicket.id,
        }),
      t("foodos.mesas.mergeOk")
    )
    if (!ok) return
    setMergeOpen(false)
  }

  const submitCancel = async () => {
    if (!restaurant || !accountTable) return
    const ticket = ticketByTable.get(accountTable.id)
    if (!ticket) return
    const ok = await runAccountAction(
      () => cancelTicket({ restaurant_id: restaurant.id, ticket_id: ticket.id }),
      t("foodos.mesas.cancelOk")
    )
    if (!ok) return
    setCancelOpen(false)
    setAccountTable(null)
  }

  // ------------------------------------------------------------
  // Ronda
  // ------------------------------------------------------------

  const overrideByItem = useMemo(() => {
    const map = new Map<string, MesasOverride>()
    for (const o of data.overrides) map.set(o.item_id, o)
    return map
  }, [data.overrides])

  const priceFor = useCallback(
    (item: FoodosMenuItem): number => overrideByItem.get(item.id)?.price ?? item.price,
    [overrideByItem]
  )

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

  const countByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of data.items) {
      if (!item.category_id) continue
      map.set(item.category_id, (map.get(item.category_id) ?? 0) + 1)
    }
    return map
  }, [data.items])

  const activeCombos = useMemo(() => data.combos.filter((c) => c.is_active), [data.combos])

  const pushLine = useCallback((line: Omit<RoundLine, "key">) => {
    const key = cartLineKey(line)
    setRoundLines((prev) => {
      const index = prev.findIndex((l) => l.key === key)
      if (index === -1) return [...prev, { ...line, key }]
      const next = prev.slice()
      const current = next[index]
      if (!current) return prev
      next[index] = { ...current, qty: Math.min(50, current.qty + line.qty) }
      return next
    })
  }, [])

  const addItem = useCallback(
    (item: FoodosMenuItem, modifiers: FoodosOrderItemModifier[] = []) => {
      pushLine({
        item_id: item.id,
        name: item.name,
        qty: 1,
        unitPrice: unitPriceWithModifiers(priceFor(item), modifiers),
        modifiers,
      })
    },
    [priceFor, pushLine]
  )

  const addCombo = useCallback(
    (combo: FoodosCombo) => {
      pushLine({
        item_id: combo.id,
        combo_id: combo.id,
        name: combo.name,
        qty: 1,
        unitPrice: combo.price,
        modifiers: [],
      })
    },
    [pushLine]
  )

  const setLineQty = (key: string, qty: number) => {
    setRoundLines((prev) =>
      prev.flatMap((line) =>
        line.key === key ? (qty <= 0 ? [] : [{ ...line, qty: Math.min(50, qty) }]) : [line]
      )
    )
  }

  const roundTotals = useMemo(
    () => computeOrderTotals(toOrderItems(roundLines), 0, 0, 0),
    [roundLines]
  )
  const roundCount = roundLines.reduce((total, line) => total + line.qty, 0)

  const sendRound = async () => {
    if (!restaurant || !accountTable || roundLines.length === 0) return
    const ticket = ticketByTable.get(accountTable.id)
    if (!ticket) {
      setNotice({ ok: false, text: t("foodos.mesas.tableNotFound") })
      return
    }
    const ok = await runAccountAction(
      () =>
        sendToKitchen({
          restaurant_id: restaurant.id,
          ticket_id: ticket.id,
          items: toOrderItems(roundLines),
          note: roundNote.trim() || null,
        }),
      t("foodos.mesas.sendOk")
    )
    if (!ok) return
    setRoundLines([])
    setRoundNote("")
    setPickerOpen(false)
  }

  // ------------------------------------------------------------
  // Cobro
  // ------------------------------------------------------------

  const account = accountTable ? accountOf(accountTable) : null
  const accountLines = useMemo(
    () => (account ? aggregateAccountItems(account.pending) : []),
    [account]
  )

  const tip = parseAmount(tipDraft)
  const totals = useMemo(
    () => computeOrderTotals(accountLines, 0, 0, tip),
    [accountLines, tip]
  )
  const previewSubtotal = useMemo(
    () => computeOrderTotals(accountLines, 0, 0, 0).subtotal,
    [accountLines]
  )

  const methodParts = useMemo(
    () => parts.map((p) => ({ method: p.method, amount: parseAmount(p.amount) })),
    [parts]
  )
  const cashPart = methodParts.filter((p) => p.method === "cash").reduce((sum, p) => sum + p.amount, 0)
  const partsTotal = methodParts.reduce((sum, p) => sum + p.amount, 0)
  const remaining = Math.round((totals.total - partsTotal) * 100) / 100
  const over = Math.max(0, -remaining)
  const usesCash = combined ? cashPart > 0 : paymentMethod === "cash"
  const received = parseAmount(receivedDraft)
  const previewChange =
    usesCash && received > 0
      ? Math.max(0, received - (combined ? cashPart : totals.total))
      : null

  const breakdown = useMemo<FoodosPaymentBreakdown | undefined>(() => {
    if (!combined) {
      if (paymentMethod !== "cash" || received <= 0) return undefined
      return { parts: [{ method: "cash", amount: totals.total }], received }
    }
    if (methodParts.length === 0) return undefined
    return { parts: methodParts, received: cashPart > 0 ? received : null }
  }, [combined, paymentMethod, received, totals.total, methodParts, cashPart])

  const breakdownError = useMemo(() => {
    if (!combined) return null
    const check = validatePaymentBreakdown(
      { parts: methodParts, received: cashPart > 0 ? received : null },
      totals.total
    )
    return check.ok ? null : check.error
  }, [combined, methodParts, cashPart, received, totals.total])

  const canCharge =
    accountLines.length > 0 &&
    !busy &&
    !!data.shiftId &&
    (combined ? !breakdownError && !!breakdown : !!paymentMethod)

  const applyTipPercent = (pct: number) => {
    setTipPercent(pct)
    setTipDraft(pct === 0 ? "" : (previewSubtotal * pct).toFixed(2))
  }

  const openCharge = () => {
    setPaymentMethod("cash")
    setCombined(false)
    setParts([])
    setReceivedDraft("")
    setTipDraft("")
    setTipPercent(null)
    setCouponDraft("")
    setCoupon(null)
    setChargeOpen(true)
  }

  const charge = async () => {
    if (!restaurant || !accountTable || !canCharge) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await closeTable({
        restaurant_id: restaurant.id,
        ticket_id: accountOf(accountTable).ticket?.id ?? "",
        items: accountLines,
        payment_method: breakdown ? null : paymentMethod,
        payment_breakdown: breakdown,
        tip,
        coupon_code: coupon,
      })

      if (!res.ok || !res.orderId || !res.folio) {
        setNotice({ ok: false, text: res.error ?? t("foodos.mostrador.chargeError") })
        return
      }

      if (res.error) setNotice({ ok: false, text: res.error })

      setSale({
        folio: res.folio,
        total: res.total ?? totals.total,
        change: previewChange,
        orderId: res.orderId,
      })
      setChargeOpen(false)
      setAccountTable(null)
      await refresh()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.mostrador.chargeError"),
      })
    } finally {
      setBusy(false)
    }
  }

  const openSplit = () => {
    setSplitParts(Math.min(2, maxAccountParts(account?.ticket ?? { guests: 2 })))
    setSplitOpen(true)
  }

  /** Reparte el total y prellena el cobro combinado: dividir es una sola venta. */
  const startSplitCharge = () => {
    const shares = splitAmount(totals.total, splitParts)
    setCombined(true)
    setPaymentMethod("cash")
    setParts(shares.map((amount) => ({ method: "cash" as FoodosPaymentMethod, amount: amount.toFixed(2) })))
    setSplitOpen(false)
    setTipDraft("")
    setTipPercent(null)
    setCouponDraft("")
    setCoupon(null)
    setReceivedDraft("")
    setChargeOpen(true)
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

  if (!canMesas) {
    return (
      <div className="space-y-6">
        <Header />
        <NivelGate feature={FEATURE} />
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

  const transferTargets = accountTable
    ? data.tables.filter((table) => {
        if (!table.is_active || table.id === accountTable.id) return false
        return !ticketByTable.has(table.id)
      })
    : []

  const mergeSources = accountTable
    ? data.tables.filter((table) => {
        if (table.id === accountTable.id) return false
        return ticketByTable.has(table.id)
      })
    : []

  return (
    <div className="space-y-4 pb-[calc(var(--floating-bottom-offset)+1rem)]">
      <Header />

      {/* La sucursal decide el salón: mezclar dos no tiene sentido. */}
      <div className="flex flex-wrap items-center gap-2">
        {branches.length > 1 ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">{t("foodos.mesas.branch")}</span>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value)
                setAccountTable(null)
                setRoundLines([])
              }}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">{t("foodos.mesas.allBranches")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {data.shiftId ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <Check className="w-3.5 h-3.5" aria-hidden />
            {t("foodos.mesas.shiftOk")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            <Lock className="w-3.5 h-3.5" aria-hidden />
            {t("foodos.mesas.shiftPending")}
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

      {!data.shiftId ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <CircleAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-sm text-amber-900">{t("foodos.mesas.shiftPendingHint")}</p>
              <Link
                href="/panel/foodos/caja"
                className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Banknote className="w-4 h-4" aria-hidden />
                {t("foodos.mesas.goToCaja")}
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {dineInOff ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("foodos.mesas.noDineIn")}</p>
      ) : null}

      {data.items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
          <p className="font-semibold text-gray-800">{t("foodos.mostrador.noItems")}</p>
          <p className="text-sm text-gray-500 mt-1">{t("foodos.mostrador.noItemsBody")}</p>
          <Link href="/panel/foodos/menu" className="inline-block mt-3 text-[#0E7A0E] font-semibold hover:underline">
            {t("foodos.mesas.goToMenu")}
          </Link>
        </div>
      ) : data.zones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <LayoutGrid className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
          <p className="font-semibold text-gray-800">{t("foodos.mesas.noTables")}</p>
          <p className="text-sm text-gray-500 mt-1">{t("foodos.mesas.noTablesBody")}</p>
          <button
            type="button"
            onClick={() => {
              setZoneNameDraft("")
              setLayoutSheet({ kind: "zone" })
            }}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {t("foodos.mesas.addZone")}
          </button>
        </div>
      ) : (
        <>
          {/* Zonas */}
          <div className="flex items-center gap-2">
            <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto overscroll-contain px-1 pb-1">
              {zones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  aria-pressed={z.id === zone?.id}
                  onClick={() => setZoneId(z.id)}
                  className={`shrink-0 min-h-[40px] rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                    z.id === zone?.id
                      ? "bg-[#0E7A0E] text-white"
                      : "bg-white text-gray-700 border border-gray-200"
                  }`}
                >
                  {z.name}
                  <span className={z.id === zone?.id ? "ml-1.5 text-white/70" : "ml-1.5 text-gray-400"}>
                    {activeTablesInZone(data.tables, z.id)}
                  </span>
                </button>
              ))}
              {editing ? (
                <button
                  type="button"
                  onClick={() => {
                    setZoneNameDraft("")
                    setLayoutSheet({ kind: "zone" })
                  }}
                  className="shrink-0 min-h-[40px] rounded-full border border-dashed border-gray-300 px-3.5 py-2 text-sm font-semibold text-gray-600"
                >
                  <Plus className="w-3.5 h-3.5 inline" aria-hidden /> {t("foodos.mesas.addZone")}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              aria-pressed={editing}
              onClick={() => setEditing((value) => !value)}
              className={`shrink-0 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
                editing ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-600"
              }`}
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden />
              {editing ? t("foodos.mesas.doneEditing") : t("foodos.mesas.editLayout")}
            </button>
          </div>

          {editing ? (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
              {t("foodos.mesas.editLayoutHint")}
            </p>
          ) : null}

          {/* Resumen del salón */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>{t("foodos.mesas.freeTables", { n: zoneStats.free })}</span>
            <span>{t("foodos.mesas.openTables", { n: zoneStats.occupied })}</span>
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" aria-hidden />
              {t("foodos.mesas.peopleInRoom", { n: zoneStats.guests })}
            </span>
          </div>

          {/* Mapa */}
          <div className="overflow-x-auto overscroll-contain rounded-2xl">
            <div
              ref={canvasRef}
              className="relative rounded-2xl border border-gray-200 bg-white"
              style={{
                minWidth: CANVAS_MIN_WIDTH,
                aspectRatio: zone ? `${zone.width} / ${zone.height}` : undefined,
              }}
            >
              {zoneTables.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-gray-500">{t("foodos.mesas.noTables")}</p>
                  {editing && zone ? (
                    <button
                      type="button"
                      onClick={addTableQuick}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      <Grid2x2Plus className="w-4 h-4" aria-hidden />
                      {t("foodos.mesas.addTable")}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {zone
                ? zoneTables.map((table) => {
                    const pos = positionOf(table)
                    const status = tableStatus(ticketByTable.get(table.id))
                    const { ticket, pending, totals: live } = accountOf(table)
                    const box = tableBox(table)
                    const minutes = ticket ? elapsedMinutes(ticket.opened_at, now) : 0
                    return (
                      <button
                        key={table.id}
                        type="button"
                        onPointerDown={(e) => startDrag(e, table, zone)}
                        onPointerMove={dragMove}
                        onPointerUp={(e) => void endDrag(e, table, zone)}
                        onPointerCancel={() => {
                          dragRef.current = null
                        }}
                        onClick={() => {
                          if (editing) return
                          if (status === "free") {
                            if (!table.is_active) {
                              setNotice({ ok: false, text: t("foodos.mesas.tableInactive") })
                              return
                            }
                            setGuestsDraft(Math.min(50, Math.max(1, table.seats)))
                            setOpenTableFor(table)
                            return
                          }
                          setAccountTable(table)
                        }}
                        style={{
                          left: `${(pos.x / zone.width) * 100}%`,
                          top: `${(pos.y / zone.height) * 100}%`,
                          width: `${(box.w / zone.width) * 100}%`,
                          height: `${(box.h / zone.height) * 100}%`,
                          transform: "translate(-50%, -50%)",
                          touchAction: editing ? "none" : "auto",
                        }}
                        aria-label={`${table.label} · ${t(STATUS_LABEL_KEY[status])}`}
                        className={`absolute flex flex-col items-center justify-center gap-0.5 border p-1 text-center transition-shadow ${SHAPE_CLASS[table.shape]} ${STATUS_CLASS[status]} ${
                          editing ? "cursor-grab shadow-md" : "hover:shadow-md"
                        } ${table.is_active ? "" : "opacity-50"}`}
                      >
                        <span className="max-w-full truncate text-xs font-black leading-tight">
                          {table.label}
                        </span>
                        <span className="max-w-full truncate text-[10px] leading-tight">
                          {t("foodos.mesas.seats", { n: table.seats })}
                        </span>
                        {status !== "free" && ticket ? (
                          <>
                            <span className="max-w-full truncate text-[10px] font-semibold leading-tight">
                              {t("foodos.mesas.guestsShort", { n: ticket.guests })} ·{" "}
                              {t("foodos.mesas.elapsed", { n: minutes })}
                            </span>
                            <span className="max-w-full truncate text-[10px] font-bold leading-tight">
                              {formatMoney(live.total)}
                              {pending.length > 1 ? ` · ${pending.length}` : ""}
                            </span>
                          </>
                        ) : null}
                      </button>
                    )
                  })
                : null}
            </div>
          </div>

          {editing && zone && zoneTables.length > 0 ? (
            <button
              type="button"
              onClick={addTableQuick}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700"
            >
              <Grid2x2Plus className="w-4 h-4" aria-hidden />
              {t("foodos.mesas.addTable")}
            </button>
          ) : null}
        </>
      )}

      {/* ---------------- Abrir cuenta ---------------- */}
      <BottomSheet
        open={!!openTableFor}
        onClose={() => setOpenTableFor(null)}
        ariaLabel={t("foodos.mesas.openAccount")}
      >
        {openTableFor ? (
          <div className="space-y-4 p-1">
            <h2 className="text-lg font-bold text-gray-900">
              {t("foodos.mesas.openAccountTitle", { label: openTableFor.label })}
            </h2>
            <p className="text-sm text-gray-600">{t("foodos.mesas.openAccountBody")}</p>

            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setGuestsDraft((value) => Math.max(1, value - 1))}
                aria-label={t("foodos.mesas.guestsLess")}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 text-gray-600"
              >
                <Minus className="w-5 h-5" aria-hidden />
              </button>
              <span className="min-w-[4rem] text-center" aria-live="polite">
                <span className="block text-3xl font-black text-gray-900">{guestsDraft}</span>
                <span className="block text-xs text-gray-500">{t("foodos.mesas.guestsLabel")}</span>
              </span>
              <button
                type="button"
                onClick={() => setGuestsDraft((value) => Math.min(50, value + 1))}
                aria-label={t("foodos.mesas.guestsMore")}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 text-gray-600"
              >
                <Plus className="w-5 h-5" aria-hidden />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpenTableFor(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={submitOpenTable}
                disabled={busy}
                className="flex-1 min-h-[44px] rounded-xl bg-[#0E7A0E] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {t("foodos.mesas.openAccount")}
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      {/* ---------------- Cuenta de la mesa ---------------- */}
      <BottomSheet
        open={!!accountTable && !chargeOpen && !pickerOpen && !transferOpen && !mergeOpen && !cancelOpen && !splitOpen}
        onClose={() => setAccountTable(null)}
        ariaLabel={accountTable ? t("foodos.mesas.accountTitle", { label: accountTable.label }) : ""}
      >
        {accountTable && account ? (
          <div className="space-y-4 p-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {t("foodos.mesas.accountTitle", { label: accountTable.label })}
                </h2>
                {account.ticket ? (
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_BADGE[tableStatus(account.ticket)]}`}>
                      {t(STATUS_LABEL_KEY[tableStatus(account.ticket)])}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" aria-hidden />
                      {t("foodos.mesas.elapsed", {
                        n: elapsedMinutes(account.ticket.opened_at, now),
                      })}
                    </span>
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setAccountTable(null)}
                aria-label={t("foodos.mesas.close")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>

            {/* Comensales: llega más gente a media comida. */}
            {account.ticket ? (
              <div className="flex items-center justify-between rounded-2xl border border-gray-200 p-3">
                <span className="text-sm font-semibold text-gray-700">{t("foodos.mesas.guestsLabel")}</span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const tk = account.ticket
                      if (tk) void bumpGuests(tk, Math.max(1, tk.guests - 1))
                    }}
                    disabled={busy || account.ticket.guests <= 1}
                    aria-label={t("foodos.mesas.guestsLess")}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 disabled:opacity-40"
                  >
                    <Minus className="w-4 h-4" aria-hidden />
                  </button>
                  <span className="min-w-[2rem] text-center font-bold text-gray-900" aria-live="polite">
                    {account.ticket.guests}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const tk = account.ticket
                      if (tk) void bumpGuests(tk, Math.min(50, tk.guests + 1))
                    }}
                    disabled={busy || account.ticket.guests >= 50}
                    aria-label={t("foodos.mesas.guestsMore")}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4" aria-hidden />
                  </button>
                </span>
              </div>
            ) : null}

            {/* Consumido */}
            {accountLines.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
                <p className="font-semibold text-gray-800">{t("foodos.mesas.accountEmpty")}</p>
                <p className="mt-1 text-sm text-gray-500">{t("foodos.mesas.accountEmptyHint")}</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
                {accountLines.map((line) => (
                  <li key={cartLineKey(line)} className="flex items-baseline justify-between gap-3 p-3 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold text-gray-900">{line.qty}× {line.name}</span>
                      {line.modifiers?.length ? (
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {line.modifiers.map((mod) => mod.value_name).join(", ")}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-semibold text-gray-900">
                      {formatMoney(line.price * line.qty)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Rondas ya mandadas: se pueden reimprimir desde el KDS. */}
            {account.pending.length > 0 ? (
              <section className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  {t("foodos.mesas.sentKitchen")}
                </h3>
                <ul className="space-y-1">
                  {account.pending.map((order) => (
                    <li key={order.id} className="flex items-center justify-between gap-2 text-xs text-gray-500">
                      <span>
                        {t("foodos.mesas.accountOpenedAt")}{" "}
                        {new Date(order.created_at).toLocaleTimeString("es-MX", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {order.note ? ` · ${order.note}` : ""}
                      </span>
                      <Link
                        href={`/panel/foodos/pedidos/${order.id}/print?kind=kitchen&auto=1`}
                        className="inline-flex items-center gap-1 font-semibold text-[#0E7A0E]"
                      >
                        <Printer className="w-3.5 h-3.5" aria-hidden />
                        {t("foodos.mostrador.salePrintKitchen")}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <dl className="space-y-1.5 rounded-2xl bg-gray-50 p-4 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-gray-500">{t("foodos.mesas.accountSubtotal")}</dt>
                <dd className="font-semibold text-gray-900">{formatMoney(account.totals.subtotal)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
                <dt className="font-bold text-gray-900">{t("foodos.mesas.accountTotal")}</dt>
                <dd className="text-lg font-black text-gray-900">{formatMoney(account.totals.total)}</dd>
              </div>
              <p className="text-xs text-gray-500">{t("foodos.mostrador.totalHint")}</p>
            </dl>

            {/* Acciones */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setRoundLines([])
                  setRoundNote("")
                  setQuery("")
                  setSelectedCategory(null)
                  setPickerOpen(true)
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700"
              >
                <Plus className="w-4 h-4" aria-hidden />
                {t("foodos.mesas.addItems")}
              </button>

              {account.ticket ? (
                <button
                  type="button"
                  onClick={() => {
                    const tk = account.ticket
                    if (tk) void toggleBill(tk, !tk.billing_requested_at)
                  }}
                  disabled={busy}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 ${
                    account.ticket.billing_requested_at
                      ? "bg-sky-100 text-sky-800"
                      : "border border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  <Receipt className="w-4 h-4" aria-hidden />
                  {account.ticket.billing_requested_at
                    ? t("foodos.mesas.requestBillOff")
                    : t("foodos.mesas.requestBill")}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setTransferOpen(true)}
                disabled={busy || transferTargets.length === 0}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 disabled:opacity-40"
              >
                <ArrowLeftRight className="w-4 h-4" aria-hidden />
                {t("foodos.mesas.transfer")}
              </button>

              <button
                type="button"
                onClick={() => setMergeOpen(true)}
                disabled={busy || mergeSources.length === 0}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 disabled:opacity-40"
              >
                <Merge className="w-4 h-4" aria-hidden />
                {t("foodos.mesas.merge")}
              </button>

              <button
                type="button"
                onClick={openSplit}
                disabled={busy || accountLines.length === 0}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 disabled:opacity-40"
              >
                <Users className="w-4 h-4" aria-hidden />
                {t("foodos.mesas.splitTitle")}
              </button>

              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                disabled={busy}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
                {t("foodos.mesas.cancelAccount")}
              </button>
            </div>

            <button
              type="button"
              onClick={openCharge}
              disabled={busy || accountLines.length === 0 || !data.shiftId}
              className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#0E7A0E] px-4 py-3.5 text-base font-bold text-white disabled:opacity-50"
            >
              <Banknote className="w-5 h-5" aria-hidden />
              {t("foodos.mesas.chargeAccount")}
            </button>
            <p className="text-xs text-gray-500">{t("foodos.mesas.chargeHint")}</p>
          </div>
        ) : null}
      </BottomSheet>

      {/* ---------------- Agregar platillos ---------------- */}
      <BottomSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        ariaLabel={t("foodos.mesas.addItems")}
      >
        <div className="space-y-3 p-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-gray-900">{t("foodos.mesas.addItems")}</h2>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label={t("foodos.mesas.close")}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("foodos.mostrador.searchPlaceholder")}
              aria-label={t("foodos.mostrador.search")}
              className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-3 text-sm"
            />
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto overscroll-contain px-1 pb-1">
            <button
              type="button"
              aria-pressed={selectedCategory === null}
              onClick={() => setSelectedCategory(null)}
              className={`shrink-0 min-h-[36px] rounded-full px-3.5 py-2 text-sm font-semibold ${
                selectedCategory === null
                  ? "bg-[#0E7A0E] text-white"
                  : "bg-white text-gray-700 border border-gray-200"
              }`}
            >
              {t("foodos.mostrador.allCategories")}
            </button>
            {data.categories
              .filter((c) => (countByCategory.get(c.id) ?? 0) > 0)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={selectedCategory === c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`shrink-0 min-h-[36px] rounded-full px-3.5 py-2 text-sm font-semibold ${
                    selectedCategory === c.id
                      ? "bg-[#0E7A0E] text-white"
                      : "bg-white text-gray-700 border border-gray-200"
                  }`}
                >
                  {c.name}
                  <span className={selectedCategory === c.id ? "ml-1.5 text-white/70" : "ml-1.5 text-gray-400"}>
                    {countByCategory.get(c.id) ?? 0}
                  </span>
                </button>
              ))}
          </div>

          {visibleItems.length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500">
              {t("foodos.mostrador.noResults")}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
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
                    <span className="mt-1 block text-sm font-bold text-[#0E7A0E]">{formatMoney(price)}</span>
                    {!available ? (
                      <span className="mt-1 inline-block text-[11px] font-semibold text-red-500">
                        {t("foodos.mostrador.unavailable")}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}

          {activeCombos.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900">{t("foodos.common.combos")}</h3>
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

          {/* Ronda en captura */}
          <section className="space-y-2 rounded-2xl border border-gray-200 p-3">
            <h3 className="text-sm font-bold text-gray-900">
              {t("foodos.mesas.pendingKitchen")}
              {roundCount > 0 ? (
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {t("foodos.mostrador.cartLines", { n: roundCount })}
                </span>
              ) : null}
            </h3>

            {roundLines.length === 0 ? (
              <p className="text-xs text-gray-500">{t("foodos.mesas.nothingToSend")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {roundLines.map((line) => (
                  <li key={line.key} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900">{line.name}</span>
                      <span className="block text-xs text-gray-500">
                        {formatMoney(line.unitPrice)}
                        {line.modifiers.length
                          ? ` · ${line.modifiers.map((mod) => mod.value_name).join(", ")}`
                          : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setLineQty(line.key, line.qty - 1)}
                        aria-label={t("foodos.mostrador.lineQty")}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600"
                      >
                        <Minus className="w-3.5 h-3.5" aria-hidden />
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-bold text-gray-900">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLineQty(line.key, line.qty + 1)}
                        aria-label={t("foodos.mostrador.lineQty")}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {roundLines.length > 0 ? (
              <p className="flex items-baseline justify-between border-t border-gray-200 pt-2 text-sm">
                <span className="text-gray-500">{t("foodos.mostrador.subtotal")}</span>
                <span className="font-bold text-gray-900">{formatMoney(roundTotals.total)}</span>
              </p>
            ) : null}

            <div>
              <label htmlFor="mesas-round-note" className="mb-1 block text-xs font-semibold text-gray-600">
                {t("foodos.mesas.roundNote")}
              </label>
              <input
                id="mesas-round-note"
                value={roundNote}
                onChange={(e) => setRoundNote(e.target.value)}
                placeholder={t("foodos.mesas.roundNotePlaceholder")}
                className="w-full min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={sendRound}
              disabled={busy || roundLines.length === 0}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[#0E7A0E] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ChefHat className="w-4 h-4" aria-hidden />}
              {busy ? t("foodos.mesas.sending") : t("foodos.mesas.sendKitchen")}
            </button>
          </section>
        </div>
      </BottomSheet>

      {/* ---------------- Mover de mesa ---------------- */}
      <BottomSheet
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        ariaLabel={t("foodos.mesas.transferTitle")}
      >
        <div className="space-y-3 p-1">
          <h2 className="text-lg font-bold text-gray-900">{t("foodos.mesas.transferTitle")}</h2>
          <p className="text-sm text-gray-600">{t("foodos.mesas.transferPick")}</p>
          {transferTargets.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {t("foodos.mesas.noTransferTarget")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {transferTargets.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void submitTransfer(table)}
                  className="min-h-[56px] rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50"
                >
                  {table.label}
                  <span className="mt-0.5 block text-[10px] text-emerald-700">
                    {t("foodos.mesas.seats", { n: table.seats })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* ---------------- Unir cuentas ---------------- */}
      <BottomSheet open={mergeOpen} onClose={() => setMergeOpen(false)} ariaLabel={t("foodos.mesas.mergeTitle")}>
        <div className="space-y-3 p-1">
          <h2 className="text-lg font-bold text-gray-900">{t("foodos.mesas.mergeTitle")}</h2>
          <p className="text-sm text-gray-600">{t("foodos.mesas.mergePick")}</p>
          {mergeSources.length === 0 ? (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {t("foodos.mesas.noMergeTarget")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {mergeSources.map((table) => {
                const other = accountOf(table)
                return (
                  <button
                    key={table.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void submitMerge(table)}
                    className="min-h-[56px] rounded-xl border border-amber-200 bg-amber-50 px-2 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"
                  >
                    {table.label}
                    <span className="mt-0.5 block text-[10px] text-amber-700">
                      {formatMoney(other.totals.total)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* ---------------- Cancelar cuenta ---------------- */}
      <BottomSheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        ariaLabel={t("foodos.mesas.cancelAccount")}
      >
        <div className="space-y-4 p-1">
          <h2 className="text-lg font-bold text-gray-900">
            {t("foodos.mesas.cancelAccountTitle", { label: accountTable?.label ?? "" })}
          </h2>
          <p className="text-sm text-gray-600">{t("foodos.mesas.cancelAccountBody")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              className="flex-1 min-h-[44px] rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={submitCancel}
              disabled={busy}
              className="flex-1 min-h-[44px] rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t("foodos.mesas.cancelAccount")}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ---------------- Dividir cuenta ---------------- */}
      <BottomSheet open={splitOpen} onClose={() => setSplitOpen(false)} ariaLabel={t("foodos.mesas.splitTitle")}>
        <div className="space-y-4 p-1">
          <h2 className="text-lg font-bold text-gray-900">{t("foodos.mesas.splitTitle")}</h2>
          <p className="text-sm text-gray-600">{t("foodos.mesas.splitBody")}</p>

          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setSplitParts((value) => Math.max(1, value - 1))}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 text-gray-600"
              aria-label={t("foodos.mesas.guestsLess")}
            >
              <Minus className="w-5 h-5" aria-hidden />
            </button>
            <span className="min-w-[4rem] text-center" aria-live="polite">
              <span className="block text-3xl font-black text-gray-900">{splitParts}</span>
              <span className="block text-xs text-gray-500">{t("foodos.mesas.splitPeople")}</span>
            </span>
            <button
              type="button"
              onClick={() =>
                setSplitParts((value) => Math.min(maxAccountParts(account?.ticket ?? { guests: 50 }), value + 1))
              }
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 text-gray-600"
              aria-label={t("foodos.mesas.guestsMore")}
            >
              <Plus className="w-5 h-5" aria-hidden />
            </button>
          </div>

          <ul className="space-y-1 rounded-2xl bg-gray-50 p-4 text-sm">
            {splitAmount(totals.total, splitParts).map((amount, index) => (
              <li key={index} className="flex items-baseline justify-between">
                <span className="text-gray-500">
                  {t("foodos.mesas.splitEach")} {index + 1}
                </span>
                <span className="font-semibold text-gray-900">{formatMoney(amount)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">{t("foodos.mesas.splitHint")}</p>

          <button
            type="button"
            onClick={startSplitCharge}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[#0E7A0E] px-4 py-3 text-sm font-bold text-white"
          >
            <Banknote className="w-4 h-4" aria-hidden />
            {t("foodos.mesas.chargeAccount")}
          </button>
        </div>
      </BottomSheet>

      {/* ---------------- Cobro ---------------- */}
      <BottomSheet open={chargeOpen} onClose={() => setChargeOpen(false)} ariaLabel={t("foodos.mostrador.payTitle")}>
        <div className="space-y-4 p-1">
          <h2 className="text-lg font-bold text-gray-900">
            {accountTable ? t("foodos.mesas.accountTitle", { label: accountTable.label }) : t("foodos.mostrador.payTitle")}
          </h2>

          <dl className="space-y-1.5 rounded-2xl bg-gray-50 p-4 text-sm">
            <Row label={t("foodos.mostrador.subtotal")} value={formatMoney(totals.subtotal)} />
            {totals.tip > 0 ? <Row label={t("foodos.mostrador.tip")} value={formatMoney(totals.tip)} /> : null}
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
                  aria-pressed={tipPercent === pct}
                  onClick={() => applyTipPercent(pct)}
                  className={`min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm font-semibold ${
                    tipPercent === pct ? "bg-[#0E7A0E] text-white" : "border border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  {pct === 0 ? t("foodos.mostrador.tipNone") : `${Math.round(pct * 100)}%`}
                </button>
              ))}
              <input
                value={tipDraft}
                onChange={(e) => setTipDraft(e.target.value)}
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
                value={couponDraft}
                onChange={(e) => setCouponDraft(e.target.value.toUpperCase())}
                placeholder={t("foodos.mostrador.couponPlaceholder")}
                aria-label={t("foodos.mostrador.coupon")}
                className="flex-1 min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm uppercase"
              />
              <button
                type="button"
                onClick={() => setCoupon(couponDraft.trim() || null)}
                className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700"
              >
                {t("foodos.mostrador.couponApply")}
              </button>
            </div>
            {coupon ? (
              <p className="text-xs text-gray-600">
                {coupon}{" "}
                <button type="button" onClick={() => setCoupon(null)} className="font-semibold text-red-600">
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
                  const active = paymentMethod === m
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPaymentMethod(m)}
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
              onClick={() => {
                setCombined((value) => {
                  const next = !value
                  if (next && parts.length === 0) {
                    setParts([{ method: "cash", amount: totals.total.toFixed(2) }])
                  }
                  return next
                })
              }}
              className={`min-h-[44px] w-full rounded-xl px-4 py-2.5 text-sm font-semibold ${
                combined ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-700"
              }`}
            >
              {t("foodos.mostrador.payCombined")}
            </button>

            {combined ? (
              <div className="space-y-2 rounded-2xl border border-gray-200 p-3">
                <p className="text-xs text-gray-500">{t("foodos.mostrador.payCombinedHint")}</p>
                {parts.map((part, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={part.method}
                      onChange={(e) => {
                        const next = parts.slice()
                        next[index] = { ...part, method: e.target.value as FoodosPaymentMethod }
                        setParts(next)
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
                      value={part.amount}
                      onChange={(e) => {
                        const next = parts.slice()
                        next[index] = { ...part, amount: e.target.value }
                        setParts(next)
                      }}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={t("foodos.mostrador.payParts")}
                      className="flex-1 min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setParts(parts.filter((_, i) => i !== index))}
                      aria-label={t("foodos.mostrador.payRemovePart")}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 text-gray-500"
                    >
                      <X className="w-4 h-4" aria-hidden />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setParts([...parts, { method: "cash", amount: "" }])}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700"
                >
                  <Plus className="w-4 h-4" aria-hidden />
                  {t("foodos.mostrador.payAddPart")}
                </button>

                <dl className="space-y-1 text-sm" aria-live="polite">
                  <Row
                    label={remaining > 0 ? t("foodos.mostrador.payRemaining") : t("foodos.mostrador.payExact")}
                    value={formatMoney(remaining)}
                  />
                  {over > 0 ? <Row label={t("foodos.mostrador.payOver")} value={formatMoney(over)} /> : null}
                </dl>

                {breakdownError ? (
                  <p role="status" aria-live="polite" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                    {breakdownError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {usesCash ? (
              <div className="space-y-2 rounded-2xl border border-gray-200 p-3">
                <label htmlFor="mesas-received" className="mb-1 block text-xs font-semibold text-gray-600">
                  {t("foodos.mostrador.payReceived")}
                </label>
                <input
                  id="mesas-received"
                  value={receivedDraft}
                  onChange={(e) => setReceivedDraft(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                />
                <p className="text-xs text-gray-500">{t("foodos.mostrador.payReceivedHint")}</p>
                {previewChange != null ? (
                  <div className="flex items-baseline justify-between text-sm" aria-live="polite">
                    <span className="font-semibold text-gray-700">{t("foodos.mostrador.payChange")}</span>
                    <span className="text-lg font-black text-[#0E7A0E]">{formatMoney(previewChange)}</span>
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
            onClick={charge}
            disabled={!canCharge}
            className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#0E7A0E] px-4 py-3.5 text-base font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Check className="w-5 h-5" aria-hidden />}
            {busy ? t("foodos.mostrador.charging") : t("foodos.mostrador.charge")}
          </button>
        </div>
      </BottomSheet>

      {/* ---------------- Venta registrada ---------------- */}
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
                  {t("foodos.mostrador.saleFolio")}:{" "}
                  <strong className="text-gray-900">{sale.folio}</strong>
                </p>
              </div>
            </div>

            <dl className="space-y-1.5 rounded-2xl bg-gray-50 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">{t("foodos.mostrador.saleTotal")}</dt>
                <dd className="font-bold text-gray-900">{formatMoney(sale.total)}</dd>
              </div>
              {sale.change != null && sale.change > 0 ? (
                <div className="flex items-baseline justify-between">
                  <dt className="text-gray-500">{t("foodos.mostrador.saleChange")}</dt>
                  <dd className="text-lg font-black text-[#0E7A0E]">{formatMoney(sale.change)}</dd>
                </div>
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

            <button
              type="button"
              onClick={() => setSale(null)}
              className="w-full min-h-[44px] rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white"
            >
              {t("foodos.mostrador.saleNew")}
            </button>
          </div>
        ) : null}
      </BottomSheet>

      {/* ---------------- Acomodo: zona ---------------- */}
      <BottomSheet
        open={layoutSheet?.kind === "zone"}
        onClose={() => setLayoutSheet(null)}
        ariaLabel={t("foodos.mesas.addZone")}
      >
        <div className="space-y-4 p-1">
          <h2 className="text-lg font-bold text-gray-900">
            {layoutSheet?.zone ? t("foodos.mesas.zoneName") : t("foodos.mesas.addZone")}
          </h2>
          <div>
            <label htmlFor="mesas-zone-name" className="mb-1 block text-xs font-semibold text-gray-600">
              {t("foodos.mesas.zoneName")}
            </label>
            <input
              id="mesas-zone-name"
              value={zoneNameDraft}
              onChange={(e) => setZoneNameDraft(e.target.value)}
              placeholder={t("foodos.mesas.zoneNamePlaceholder")}
              className="w-full min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            {layoutSheet?.zone ? (
              <button
                type="button"
                onClick={removeZone}
                disabled={busy}
                className="min-h-[44px] rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 disabled:opacity-50"
              >
                {t("foodos.mesas.zoneDelete")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={submitZone}
              disabled={busy || !zoneNameDraft.trim()}
              className="flex-1 min-h-[44px] rounded-xl bg-[#0E7A0E] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? t("foodos.mesas.saving") : t("foodos.mesas.zoneSave")}
            </button>
          </div>
          <p className="text-xs text-gray-500">{t("foodos.mesas.zoneDeleteConfirm")}</p>
        </div>
      </BottomSheet>

      {/* ---------------- Acomodo: mesa ---------------- */}
      <BottomSheet
        open={layoutSheet?.kind === "table"}
        onClose={() => setLayoutSheet(null)}
        ariaLabel={t("foodos.mesas.addTable")}
      >
        <div className="space-y-4 p-1">
          <h2 className="text-lg font-bold text-gray-900">
            {layoutSheet?.table ? tableDraft.label : t("foodos.mesas.addTable")}
          </h2>

          <div>
            <label htmlFor="mesas-table-label" className="mb-1 block text-xs font-semibold text-gray-600">
              {t("foodos.mesas.tableLabel")}
            </label>
            <input
              id="mesas-table-label"
              value={tableDraft.label}
              onChange={(e) => setTableDraft((draft) => ({ ...draft, label: e.target.value }))}
              placeholder={t("foodos.mesas.tableLabelPlaceholder")}
              className="w-full min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-gray-200 p-3">
            <span className="text-sm font-semibold text-gray-700">{t("foodos.mesas.tableSeats")}</span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTableDraft((draft) => ({ ...draft, seats: Math.max(1, draft.seats - 1) }))}
                aria-label={t("foodos.mesas.guestsLess")}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600"
              >
                <Minus className="w-4 h-4" aria-hidden />
              </button>
              <span className="min-w-[2rem] text-center font-bold text-gray-900">{tableDraft.seats}</span>
              <button
                type="button"
                onClick={() => setTableDraft((draft) => ({ ...draft, seats: Math.min(50, draft.seats + 1) }))}
                aria-label={t("foodos.mesas.guestsMore")}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600"
              >
                <Plus className="w-4 h-4" aria-hidden />
              </button>
            </span>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-gray-600">{t("foodos.mesas.tableShape")}</span>
            <div className="grid grid-cols-3 gap-2">
              {(["square", "round", "rect"] as TableShape[]).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  aria-pressed={tableDraft.shape === shape}
                  onClick={() => setTableDraft((draft) => ({ ...draft, shape }))}
                  className={`min-h-[44px] rounded-xl px-2 py-2.5 text-xs font-semibold ${
                    tableDraft.shape === shape
                      ? "bg-[#0E7A0E] text-white"
                      : "border border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  {shape === "square"
                    ? t("foodos.mesas.shapeSquare")
                    : shape === "round"
                      ? t("foodos.mesas.shapeRound")
                      : t("foodos.mesas.shapeRect")}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-gray-200 p-3">
            <input
              type="checkbox"
              checked={tableDraft.isActive}
              onChange={(e) => setTableDraft((draft) => ({ ...draft, isActive: e.target.checked }))}
              className="h-5 w-5 rounded border-gray-300"
            />
            <span className="text-sm font-semibold text-gray-700">{t("foodos.mesas.tableActive")}</span>
          </label>

          <div className="flex gap-2">
            {layoutSheet?.table ? (
              <button
                type="button"
                onClick={removeTable}
                disabled={busy}
                className="min-h-[44px] rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 disabled:opacity-50"
              >
                {t("foodos.mesas.tableDelete")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={submitTable}
              disabled={busy || !tableDraft.label.trim()}
              className="flex-1 min-h-[44px] rounded-xl bg-[#0E7A0E] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? t("foodos.mesas.saving") : t("foodos.mesas.tableSave")}
            </button>
          </div>
          {layoutSheet?.table ? (
            <p className="text-xs text-gray-500">{t("foodos.mesas.tableDeleteConfirm")}</p>
          ) : null}
        </div>
      </BottomSheet>

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

      <ToolGuideHost
        toolKey="mesas"
        pathname="/panel/foodos/mesas"
        slug={restaurant.slug}
        icon="🍽️"
        title={t("foodos.mesas.title")}
        subtitle={t("foodos.mesas.guideSubtitle")}
      />
    </div>
  )
}

function Header() {
  return (
    <header className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#0E7A0E]/10">
        <LayoutGrid className="w-5 h-5 text-[#0E7A0E]" aria-hidden />
      </span>
      <div>
        <h1 className="text-xl font-black text-gray-900">{t("foodos.mesas.title")}</h1>
        <p className="text-sm text-gray-500">{t("foodos.mesas.subtitle")}</p>
      </div>
    </header>
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
