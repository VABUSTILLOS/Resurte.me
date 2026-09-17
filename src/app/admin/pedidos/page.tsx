"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  getAdminOrders,
  type AdminOrder,
} from "../actions"
import {
  STATUS_LABEL,
  STATUS_COLOR,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/order-labels"
import { Search, RefreshCw, X, Printer, Bike, Download, Loader2, AlertTriangle, Undo2 } from "lucide-react"
import { toCsv, downloadCsv } from "@/lib/csv"
import type { OrderStatus } from "@/types"
import { ToastProvider, useToast } from "@/components/toast"
import { useEscapeKey } from "@/hooks/use-escape-key"
import { useOrderAutoRefresh } from "@/hooks/use-order-auto-refresh"
import { formatRelativeTime } from "@/lib/relative-time"
import {
  normalizeDateRange,
  ORDER_PAYMENT_STATUS_VALUES,
  orderFilterQuery,
  parseOrderFilterParams,
  type OrderPaymentStatusFilter,
  parseSavedFilters,
  serializeSavedFilters,
  makeSavedFilter,
  SAVED_FILTERS_STORAGE_KEY,
  type SavedOrderFilter,
} from "@/lib/order-filters"
import { activeDrivers, type DriverLike } from "@/lib/drivers"
import {
  BULK_STATUS_TARGETS,
  areAllSelected,
  bulkAssignDriverConfirmMessage,
  bulkCancelConfirmMessage,
  bulkConfirmPaymentConfirmMessage,
  bulkOutcomeMessage,
  bulkOutcomeTone,
  bulkUndoMessage,
  bulkUndoOutcomeMessage,
  isBulkActionUndoable,
  isPartiallySelected,
  partitionForDriver,
  partitionForPayment,
  partitionForStatus,
  pruneSelection,
  selectAll,
  summarizeBulkResult,
  toggleSelection,
  type BulkAction,
  type BulkResult,
  type Selection,
} from "@/lib/order-bulk"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { orderCustomerLabel } from "@/lib/admin/order-selects"
import { ProofSection } from "./proof-section"

function formatAdminAddress(a: NonNullable<AdminOrder["address"]>): string {
  const parts = [
    `${a.street} ${a.number}`,
    a.interior ? `Int. ${a.interior}` : null,
    a.neighborhood ? `Col. ${a.neighborhood}` : null,
    a.zip_code ? `CP ${a.zip_code}` : null,
    a.city,
    a.state,
  ].filter(Boolean)
  return parts.join(", ")
}

const STATUS_FILTERS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "Todos", value: "all" },
  { label: "Pendientes", value: "pending" },
  { label: "Confirmados", value: "confirmed" },
  { label: "Preparando", value: "preparing" },
  { label: "En camino", value: "out_for_delivery" },
  { label: "Entregados", value: "delivered" },
  { label: "Cancelados", value: "cancelled" },
]

export default function AdminOrdersPage() {
  return (
    <ToastProvider>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Cargando pedidos...
          </div>
        }
      >
        <AdminOrdersContent />
      </Suspense>
    </ToastProvider>
  )
}

function AdminOrdersContent() {
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // A15 ronda 2 — los filtros viven en la URL para que las alertas del
  // dashboard puedan enlazar al subconjunto exacto de pedidos.
  const initialFilters = useMemo(
    () => parseOrderFilterParams(searchParams),
    [searchParams]
  )
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">(
    initialFilters.status
  )
  // Filtro por estado de pago: llega por URL desde el desglose del embudo de
  // conversión, que enlaza cada desenlace a los pedidos que lo componen.
  const [paymentStatusFilter, setPaymentStatusFilter] =
    useState<OrderPaymentStatusFilter>(initialFilters.paymentStatus)
  const [search, setSearch] = useState(initialFilters.search)
  const [debouncedSearch, setDebouncedSearch] = useState(initialFilters.search)
  // Fase 9 — rango de fechas (YYYY-MM-DD) y presets guardados en localStorage.
  // Lazy init: lee localStorage en el primer render del cliente (este componente
  // no hace SSR de datos, no hay riesgo de mismatch de hidratación).
  const [fromDate, setFromDate] = useState(initialFilters.from)
  const [toDate, setToDate] = useState(initialFilters.to)
  const [savedFilters, setSavedFilters] = useState<SavedOrderFilter[]>(() => {
    try {
      return parseSavedFilters(localStorage.getItem(SAVED_FILTERS_STORAGE_KEY))
    } catch {
      // localStorage no disponible (modo privado/SSR): presets vacíos
      return []
    }
  })
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [drivers, setDrivers] = useState<DriverLike[]>([])
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null)
  // Fase 14 — selección múltiple para acciones masivas
  const [selected, setSelected] = useState<Selection>(() => new Set<number>())
  const [bulkTarget, setBulkTarget] = useState("")
  const [bulkDriverId, setBulkDriverId] = useState("")
  const [bulkRunning, setBulkRunning] = useState(false)
  // Última acción masiva que movió dinero, para ofrecer deshacer. Solo se
  // guarda la confirmación de pago (ver isBulkActionUndoable).
  const [undoable, setUndoable] = useState<{ ids: number[] } | null>(null)
  const [undoRunning, setUndoRunning] = useState(false)
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEscapeKey(useCallback(() => setSelectedOrder(null), []), !!selectedOrder)

  const assignableDrivers = useMemo(() => activeDrivers(drivers), [drivers])

  // Debounce: el filtro se aplica en SQL, no sobre la página cargada.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  // A15 ronda 2 — sincroniza los filtros activos a la URL (sin recargar ni
  // scroll) para que la vista sea compartible y las alertas del dashboard
  // puedan enlazar al subconjunto exacto de pedidos.
  useEffect(() => {
    const qs = orderFilterQuery({
      status: statusFilter,
      paymentStatus: paymentStatusFilter,
      search: debouncedSearch,
      from: fromDate,
      to: toDate,
    })
    router.replace(qs ? `?${qs}` : pathname, { scroll: false })
  }, [debouncedSearch, statusFilter, paymentStatusFilter, fromDate, toDate, router, pathname])

  // Repartidores para asignación (migración 00076). Se conservan también los
  // inactivos para poder etiquetar pedidos ya cerrados; el selector solo
  // ofrece los activos (ver `assignableDrivers`).
  useEffect(() => {
    fetch("/api/admin/drivers", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { drivers?: DriverLike[] } | null) => {
        if (data?.drivers) setDrivers(data.drivers)
      })
      .catch(() => {})
  }, [refreshKey])

  async function assignDriver(orderId: number, driverId: number | null) {
    setUpdatingId(orderId)
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: driverId }),
      })
      const data = await res.json()
      if (res.ok) {
        toast(
          driverId
            ? `Repartidor asignado al pedido #${orderId}`
            : `Repartidor desasignado del pedido #${orderId}`,
          "success"
        )
        setSelectedOrder((prev) =>
          prev && prev.id === orderId ? { ...prev, driver_id: driverId } : prev
        )
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, driver_id: driverId } : o))
        )
      } else {
        toast(data.error || "Error al asignar el repartidor", "error")
      }
    } catch {
      toast("Error de conexión", "error")
    } finally {
      setUpdatingId(null)
    }
  }

  // Fase 3 — id del pedido más reciente conocido, para detectar altas nuevas
  // durante el auto-refresh y avisar con un toast.
  const lastTopIdRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchOrders() {
      setLoading(true)
      try {
        const { fromIso, toExclusiveIso } = normalizeDateRange({ from: fromDate, to: toDate })
        const { orders: data, hasMore: more } = await getAdminOrders(100, undefined, {
          status: statusFilter,
          paymentStatus: paymentStatusFilter,
          search: debouncedSearch,
          from: fromIso,
          toExclusive: toExclusiveIso,
        })
        if (!cancelled) {
          setOrders(data)
          setHasMore(more)
          setError(null)
          if (data[0]) lastTopIdRef.current = data[0].id
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar los pedidos")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchOrders()
    return () => {
      cancelled = true
    }
  }, [refreshKey, statusFilter, paymentStatusFilter, debouncedSearch, fromDate, toDate])

  // Fase 3 — auto-refresh silencioso cada 30 s (pausado en segundo plano).
  // Mantiene los filtros activos y avisa si entra un pedido nuevo.
  const silentRefresh = useCallback(async () => {
    try {
      const { fromIso, toExclusiveIso } = normalizeDateRange({ from: fromDate, to: toDate })
      const { orders: data, hasMore: more } = await getAdminOrders(100, undefined, {
        status: statusFilter,
        paymentStatus: paymentStatusFilter,
        search: debouncedSearch,
        from: fromIso,
        toExclusive: toExclusiveIso,
      })
      const topId = data[0]?.id ?? null
      if (
        lastTopIdRef.current !== null &&
        topId !== null &&
        topId !== lastTopIdRef.current
      ) {
        toast("Nuevo pedido recibido", "success")
      }
      if (topId !== null) lastTopIdRef.current = topId
      setOrders(data)
      setHasMore(more)
    } catch {
      // Silencioso: el siguiente ciclo de 30 s lo reintenta
    }
  }, [statusFilter, paymentStatusFilter, debouncedSearch, fromDate, toDate, toast])

  useOrderAutoRefresh(silentRefresh, 30_000)

  async function loadOlder() {
    const lastOrder = orders[orders.length - 1]
    if (!lastOrder || loadingMore) return
    setLoadingMore(true)
    try {
      const cursor = lastOrder.created_at
      const { fromIso, toExclusiveIso } = normalizeDateRange({ from: fromDate, to: toDate })
      const { orders: older, hasMore: more } = await getAdminOrders(100, cursor, {
        status: statusFilter,
        paymentStatus: paymentStatusFilter,
        search: debouncedSearch,
        from: fromIso,
        toExclusive: toExclusiveIso,
      })
      setOrders((prev) => [...prev, ...older])
      setHasMore(more)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar más pedidos")
    } finally {
      setLoadingMore(false)
    }
  }

  function refresh() {
    setRefreshKey((k) => k + 1)
  }

  // Exporta a CSV los pedidos cargados (respetando el filtro/búsqueda SQL ya
  // aplicados). Para el historial completo hay que pulsar "Cargar anteriores".
  function exportCsv(subset: AdminOrder[] = filtered, suffix = "") {
    if (subset.length === 0) return
    const csv = toCsv(
      ["Pedido", "Cliente", "Dirección", "Subtotal", "Envío", "Descuento", "Cupón", "Total", "Método de pago", "Estado de pago", "Estado", "Origen", "Repartidor", "Fecha"],
      subset.map((o) => [
        o.id,
        orderCustomerLabel(o),
        o.address ? formatAdminAddress(o.address) : "",
        o.subtotal.toFixed(2),
        o.delivery_fee.toFixed(2),
        o.discount ? o.discount.toFixed(2) : "",
        o.coupon_code ?? "",
        o.total.toFixed(2),
        o.payment_method ? (PAYMENT_METHOD_LABEL[o.payment_method] ?? o.payment_method) : "",
        PAYMENT_STATUS_LABEL[o.payment_status] ?? o.payment_status,
        STATUS_LABEL[o.status] ?? o.status,
        o.source,
        o.driver_id ?? "",
        new Date(o.created_at).toLocaleString("es-MX"),
      ])
    )
    const stamp = dayKeyOf(DEFAULT_TIMEZONE)
    downloadCsv(`pedidos-${suffix ? `${suffix}-` : ""}${stamp}.csv`, csv)
    toast(`${subset.length} pedido${subset.length !== 1 ? "s" : ""} exportados a CSV`, "success")
  }

  // El filtrado por estatus, fechas y la búsqueda ya se aplicaron en SQL.
  const filtered = orders

  // Fase 9 — guardar/aplicar/borrar presets de filtros
  function persistSavedFilters(next: SavedOrderFilter[]) {
    setSavedFilters(next)
    try {
      localStorage.setItem(SAVED_FILTERS_STORAGE_KEY, serializeSavedFilters(next))
    } catch {
      // sin localStorage: el preset vive solo en memoria esta sesión
    }
  }

  function saveCurrentFilter() {
    const name = window.prompt("Nombre para este filtro:")
    const preset = makeSavedFilter(name ?? "", {
      status: statusFilter,
      search,
      from: fromDate,
      to: toDate,
      paymentStatus: paymentStatusFilter,
    })
    if (!preset) return
    persistSavedFilters([...savedFilters.filter((f) => f.name !== preset.name), preset])
    toast(`Filtro "${preset.name}" guardado`, "success")
  }

  function applySavedFilter(f: SavedOrderFilter) {
    setStatusFilter(f.status as OrderStatus | "all")
    // Presets guardados antes de esta ronda no traen estado de pago: "all".
    setPaymentStatusFilter(
      f.paymentStatus &&
        (ORDER_PAYMENT_STATUS_VALUES as readonly string[]).includes(f.paymentStatus)
        ? (f.paymentStatus as OrderPaymentStatusFilter)
        : "all"
    )
    setSearch(f.search)
    setFromDate(f.from)
    setToDate(f.to)
  }

  function removeSavedFilter(name: string) {
    persistSavedFilters(savedFilters.filter((f) => f.name !== name))
  }

  async function updatePayment(id: number) {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_status: "paid" }),
      })
      if (res.ok) {
        toast(`Pago del pedido #${id} confirmado. El cashback se abonó a la wallet del cliente.`, "success")
        refresh()
      } else {
        const data = await res.json()
        toast(data.error || "Error al confirmar el pago", "error")
      }
    } catch {
      toast("Error de conexión", "error")
    } finally {
      setUpdatingId(null)
    }
  }

  async function updateStatus(id: number, newStatus: string) {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.workflow?.length) {
          console.info("WhatsApp workflows triggered:", data.workflow)
        }
        toast(`Estado del pedido #${id} actualizado a ${newStatus}`, "success")
        refresh()
      } else {
        toast("Error al actualizar el estado", "error")
      }
    } catch {
      toast("Error de conexión", "error")
    } finally {
      setUpdatingId(null)
    }
  }

  // Fase 14 — acciones masivas.
  //
  // La selección se poda contra lo visible en cada render en vez de guardarse
  // ya podada: `pruneSelection` devuelve la MISMA referencia cuando no hay
  // nada que quitar, así que la memo no se invalida sola y no hace falta
  // sincronizar estado dentro de un efecto.
  const visibleIds = useMemo(() => filtered.map((o) => o.id), [filtered])
  const selection = useMemo(() => pruneSelection(selected, visibleIds), [selected, visibleIds])
  const selectedIds = useMemo(() => [...selection], [selection])
  const selectedCount = selectedIds.length
  const allSelected = areAllSelected(visibleIds, selection)
  const partiallySelected = isPartiallySelected(visibleIds, selection)

  // El checkbox "todos" es de tres estados; `indeterminate` solo existe como
  // propiedad del DOM, no como atributo JSX.
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallySelected
  }, [partiallySelected])

  function toggleOne(id: number) {
    setSelected((prev) => toggleSelection(prev, id))
  }

  function toggleAll() {
    setSelected(allSelected ? new Set<number>() : selectAll(visibleIds))
  }

  async function patchOrder(id: number, body: Record<string, unknown>): Promise<BulkResult> {
    try {
      const res = await fetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) return { id, ok: true }
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      return { id, ok: false, error: data?.error }
    } catch {
      return { id, ok: false, error: "Error de conexión" }
    }
  }

  /**
   * Fan-out secuencial al PATCH que ya existe por pedido.
   *
   * A propósito NO hay endpoint batch: cada pedido arrastra efectos propios
   * (reversión del cupón, cashback a la wallet, workflows de WhatsApp, audit
   * log) que un batch tendría que duplicar y podría perder. Secuencial y no
   * en paralelo para no saturar Supabase ni disparar los workflows a la vez.
   */
  async function runBulk(
    action: BulkAction,
    eligible: number[],
    skipped: number,
    bodyFor: () => Record<string, unknown>
  ) {
    setBulkRunning(true)
    try {
      const results: BulkResult[] = []
      for (const id of eligible) results.push(await patchOrder(id, bodyFor()))
      const outcome = summarizeBulkResult(results, skipped)
      toast(bulkOutcomeMessage(outcome), bulkOutcomeTone(outcome))
      setSelected(new Set<number>())
      // Se registran los ids que sí se aplicaron (no los omitidos ni los que
      // fallaron), y solo cuando la acción movió dinero. Cualquier acción
      // posterior reemplaza el deshacer pendiente.
      setUndoable(
        outcome.ok > 0 && isBulkActionUndoable(action)
          ? { ids: results.filter((r) => r.ok).map((r) => r.id) }
          : null
      )
      if (outcome.ok > 0) refresh()
    } finally {
      setBulkRunning(false)
    }
  }

  function bulkChangeStatus() {
    if (!bulkTarget) return
    const { eligible, skipped } = partitionForStatus(filtered, selection, bulkTarget)
    // La cancelación masiva revierte cupones y marca pagos pendientes como
    // fallidos: es la única acción destructiva, así que se confirma aparte.
    if (bulkTarget === "cancelled" && eligible.length > 0) {
      if (!window.confirm(bulkCancelConfirmMessage(eligible.length))) return
    }
    void runBulk("status", eligible, skipped.length, () => ({ status: bulkTarget }))
  }

  function bulkConfirmPayment() {
    const { eligible, skipped } = partitionForPayment(filtered, selection)
    // Confirmar el pago abona cashback real a la wallet de cada cliente: es la
    // única acción masiva de dinero, así que se confirma antes de ejecutarse.
    if (eligible.length > 0 && !window.confirm(bulkConfirmPaymentConfirmMessage(eligible.length))) {
      return
    }
    void runBulk("payment", eligible, skipped.length, () => ({ payment_status: "paid" }))
  }

  function bulkAssignDriver() {
    if (!bulkDriverId) return
    const { eligible, skipped } = partitionForDriver(filtered, selection)
    const driverName =
      assignableDrivers.find((d) => String(d.id) === bulkDriverId)?.name ?? "el repartidor"
    if (eligible.length > 0 && !window.confirm(bulkAssignDriverConfirmMessage(eligible.length, driverName))) {
      return
    }
    void runBulk("driver", eligible, skipped.length, () => ({ driver_id: Number(bulkDriverId) }))
  }

  /**
   * Deshace la última confirmación masiva de pago.
   *
   * La reversión del cashback la hace el trigger de la base (00146); aquí solo
   * se pide la transición `paid -> pending` y se reporta el resultado.
   */
  async function undoLastBulk() {
    if (!undoable || undoable.ids.length === 0) return
    const ids = undoable.ids
    setUndoRunning(true)
    try {
      const res = await fetch("/api/admin/orders/undo-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = (await res.json().catch(() => null)) as {
        ok?: number
        failed?: number
        error?: string
      } | null
      if (!res.ok) {
        toast(data?.error ?? "No se pudo deshacer", "error")
        return
      }
      const outcome = { ok: data?.ok ?? 0, skipped: 0, failed: data?.failed ?? 0 }
      toast(bulkUndoOutcomeMessage(outcome), bulkOutcomeTone(outcome))
      setUndoable(null)
      if (outcome.ok > 0) refresh()
    } catch {
      toast("Error de conexión", "error")
    } finally {
      setUndoRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
        Cargando pedidos...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-red-600 text-sm font-medium">{error}</p>
        <p className="text-gray-400 text-xs mt-1">Verifica que estés autenticado como administrador.</p>
        {/* Fase 7 — recuperación ante error sin recargar la página */}
        <button
          type="button"
          onClick={refresh}
          className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""} · datos reales de Supabase
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Fase 4 — exporta los pedidos actualmente filtrados */}
          <button
            type="button"
            onClick={() => exportCsv()}
            disabled={filtered.length === 0}
            title="Descargar los pedidos filtrados en CSV (Excel)"
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refrescar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por #pedido, cliente o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fase 9 — rango de fechas + filtros guardados */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500" htmlFor="filter-from">Desde</label>
          <input
            id="filter-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-brand-500"
          />
          <label className="text-xs text-gray-500" htmlFor="filter-to">Hasta</label>
          <input
            id="filter-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-brand-500"
          />
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => { setFromDate(""); setToDate("") }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500" htmlFor="filter-payment-status">
            Pago
          </label>
          <select
            id="filter-payment-status"
            value={paymentStatusFilter}
            onChange={(e) =>
              setPaymentStatusFilter(e.target.value as OrderPaymentStatusFilter)
            }
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-brand-500"
          >
            <option value="all">Cualquiera</option>
            {ORDER_PAYMENT_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_STATUS_LABEL[value] ?? value}
              </option>
            ))}
          </select>
          {paymentStatusFilter !== "all" && (
            <button
              type="button"
              onClick={() => setPaymentStatusFilter("all")}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveCurrentFilter}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-dashed border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            + Guardar filtro
          </button>
          {savedFilters.map((f) => (
            <span
              key={f.name}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-50 border border-brand-100 text-xs text-brand-700"
            >
              <button
                type="button"
                onClick={() => applySavedFilter(f)}
                className="font-medium hover:underline"
                title={`Estado: ${f.status || "todos"} · Buscar: ${f.search || "—"} · ${f.from || "…"} a ${f.to || "…"}`}
              >
                {f.name}
              </button>
              <button
                type="button"
                onClick={() => removeSavedFilter(f.name)}
                aria-label={`Eliminar filtro ${f.name}`}
                className="text-brand-400 hover:text-brand-700"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Fase 14 — barra de acciones masivas (aparece al seleccionar filas) */}
      {selectedCount > 0 && (
        <div
          role="region"
          aria-label="Acciones masivas"
          className="flex flex-wrap items-center gap-2 mb-4 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5"
        >
          <span className="text-xs font-semibold text-brand-700 mr-1">
            {selectedCount} seleccionado{selectedCount !== 1 ? "s" : ""}
          </span>

          <select
            value={bulkTarget}
            onChange={(e) => setBulkTarget(e.target.value)}
            disabled={bulkRunning}
            aria-label="Estado destino para los pedidos seleccionados"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 disabled:opacity-50"
          >
            <option value="">Cambiar estado a…</option>
            {BULK_STATUS_TARGETS.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value] ?? value}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={bulkChangeStatus}
            disabled={!bulkTarget || bulkRunning}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Aplicar
          </button>

          <button
            type="button"
            onClick={bulkConfirmPayment}
            disabled={bulkRunning}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors"
          >
            Confirmar pago
          </button>

          <select
            value={bulkDriverId}
            onChange={(e) => setBulkDriverId(e.target.value)}
            disabled={bulkRunning}
            aria-label="Repartidor para los pedidos seleccionados"
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 disabled:opacity-50"
          >
            <option value="">Asignar repartidor…</option>
            {assignableDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={bulkAssignDriver}
            disabled={!bulkDriverId || bulkRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Bike className="w-3.5 h-3.5" />
            Asignar
          </button>

          <button
            type="button"
            onClick={() => exportCsv(filtered.filter((o) => selection.has(o.id)), "seleccion")}
            disabled={bulkRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar selección
          </button>

          {bulkRunning && (
            <span role="status" className="text-xs text-brand-700">
              Aplicando…
            </span>
          )}

          <button
            type="button"
            onClick={() => setSelected(new Set<number>())}
            disabled={bulkRunning}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Limpiar
          </button>
        </div>
      )}

      {/* Deshacer de la última acción masiva que movió dinero */}
      {undoable && undoable.ids.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
          <span className="text-xs text-amber-800">{bulkUndoMessage(undoable.ids.length)}</span>

          <button
            type="button"
            onClick={() => void undoLastBulk()}
            disabled={undoRunning}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            {undoRunning ? "Revirtiendo…" : "Deshacer"}
          </button>
          <button
            type="button"
            onClick={() => setUndoable(null)}
            disabled={undoRunning}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Descartar
          </button>
        </div>
      )}

      {/* Orders table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-400 font-medium">
                <th className="px-3 py-3 w-10">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Seleccionar todos los pedidos visibles"
                    className="w-4 h-4 align-middle accent-brand-600 cursor-pointer"
                  />
                </th>
                <th className="px-5 py-3">Pedido</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Dirección</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Pago</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Origen</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selection.has(order.id)}
                      onChange={() => toggleOne(order.id)}
                      aria-label={`Seleccionar pedido #${order.id}`}
                      className="w-4 h-4 align-middle accent-brand-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-500">#{order.id}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {orderCustomerLabel(order)}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500 max-w-[180px]">
                    {order.address ? (
                      <span className="block truncate" title={formatAdminAddress(order.address)}>
                        {order.address.street} {order.address.number}
                        {order.address.neighborhood ? `, ${order.address.neighborhood}` : ""}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-semibold text-gray-900">
                    ${order.total.toFixed(2)}
                    {order.discount ? (
                      <span className="block text-[10px] font-medium text-green-600">
                        −${order.discount.toFixed(2)} de cupón
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <span className="text-xs text-gray-600">
                          {order.payment_method ? PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method : "—"}
                        </span>
                        <span
                          className={`ml-2 text-[10px] font-medium ${
                            order.payment_status === "paid" ? "text-green-600" :
                            order.payment_status === "failed" ? "text-red-600" : "text-amber-600"
                          }`}
                        >
                          {PAYMENT_STATUS_LABEL[order.payment_status]}
                        </span>
                      </div>
                      {order.payment_status === "pending" && order.payment_method !== "card" && (
                        <button
                          type="button"
                          disabled={updatingId === order.id}
                          className="ml-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors"
                          onClick={() => updatePayment(order.id)}
                        >
                          {updatingId === order.id ? "..." : "Confirmar pago"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={order.status}
                      disabled={updatingId === order.id}
                      className={`text-xs font-medium border rounded-lg px-2 py-1 cursor-pointer disabled:opacity-50 ${STATUS_COLOR[order.status]}`}
                      onChange={(e) => updateStatus(order.id, e.target.value)}
                    >
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    {/* Evidencia faltante: avisa, no bloquea (00154). */}
                    {order.status === "delivered" && !order.delivery_proof_path && (
                      <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-600">
                        <AlertTriangle className="w-3 h-3" />
                        Sin comprobante
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {order.source === "whatsapp" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full font-medium">
                        WhatsApp
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Web</span>
                    )}
                  </td>
                  {/* Fase 7 — fecha relativa con la absoluta en el tooltip */}
                  <td
                    className="px-5 py-3 text-xs text-gray-400"
                    title={new Date(order.created_at).toLocaleString("es-MX")}
                  >
                    {formatRelativeTime(order.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="text-brand-600 hover:text-brand-700 text-xs font-medium"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-gray-400 text-sm">
                    No hay pedidos que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Cargar más (paginación por cursor) */}
        {hasMore && (
          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingMore}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingMore ? "Cargando…" : "Cargar pedidos anteriores"}
            </button>
          </div>
        )}
      </div>

      {/* Order detail modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Pedido #{selectedOrder.id}</h2>
                <p className="text-xs text-gray-400">
                  {orderCustomerLabel(selectedOrder)} ·{" "}
                  {new Date(selectedOrder.created_at).toLocaleString("es-MX", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                aria-label="Cerrar detalle"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {selectedOrder.address && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1">Dirección de entrega</p>
                  <p className="text-sm text-gray-700">{formatAdminAddress(selectedOrder.address)}</p>
                  {selectedOrder.address.references ? (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Ref: {selectedOrder.address.references}
                    </p>
                  ) : null}
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-400 mb-1.5">
                  Productos ({selectedOrder.items.length})
                </p>
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {selectedOrder.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm text-gray-700">
                        {item.quantity}× {item.product_name ?? `Producto #${item.product_id}`}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        ${(item.unit_price * item.quantity).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span>${selectedOrder.subtotal.toFixed(2)}</span>
                </div>
                {selectedOrder.discount ? (
                  <div className="flex justify-between text-green-600">
                    <span>
                      Descuento{selectedOrder.coupon_code ? ` (${selectedOrder.coupon_code})` : ""}
                    </span>
                    <span>−${selectedOrder.discount.toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-gray-500">
                  <span>Envío</span>
                  <span>${selectedOrder.delivery_fee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100">
                  <span>Total</span>
                  <span>${selectedOrder.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-2 text-xs">
                <span className={`px-2 py-1 rounded-lg font-medium ${STATUS_COLOR[selectedOrder.status]}`}>
                  {STATUS_LABEL[selectedOrder.status]}
                </span>
                <span className="px-2 py-1 rounded-lg bg-gray-50 text-gray-500 font-medium">
                  {selectedOrder.payment_method
                    ? PAYMENT_METHOD_LABEL[selectedOrder.payment_method] ?? selectedOrder.payment_method
                    : "—"}
                </span>
                <span className="px-2 py-1 rounded-lg bg-gray-50 text-gray-500 font-medium">
                  {PAYMENT_STATUS_LABEL[selectedOrder.payment_status]}
                </span>
              </div>

              {/* Repartidor asignado (migración 00076) */}
              {assignableDrivers.length > 0 &&
                selectedOrder.status !== "cancelled" &&
                selectedOrder.status !== "delivered" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Bike className="w-4 h-4 text-gray-400 shrink-0" />
                    <select
                      value={selectedOrder.driver_id ?? ""}
                      disabled={updatingId === selectedOrder.id}
                      onChange={(e) =>
                        void assignDriver(
                          selectedOrder.id,
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-2 bg-white disabled:opacity-50"
                      aria-label="Asignar repartidor"
                    >
                      <option value="">Sin repartidor asignado</option>
                      {assignableDrivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              {selectedOrder.driver_id != null &&
                (selectedOrder.status === "delivered" || selectedOrder.status === "cancelled") && (
                  <p className="text-xs text-gray-400 flex items-center gap-1.5">
                    <Bike className="w-3.5 h-3.5" />
                    Repartidor:{" "}
                    {drivers.find((d) => d.id === selectedOrder.driver_id)?.name ??
                      `#${selectedOrder.driver_id}`}
                  </p>
                )}

              {/* Comprobante de entrega (migración 00154) */}
              <ProofSection
                orderId={selectedOrder.id}
                proofPath={selectedOrder.delivery_proof_path ?? null}
                status={selectedOrder.status}
                onChanged={refresh}
              />

              {/* Imprimir ticket */}
              <a
                href={`/admin/pedidos/${selectedOrder.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full mt-1 px-4 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir ticket
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
