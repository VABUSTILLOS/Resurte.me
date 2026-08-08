"use client"

import { useState, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
import { usePanelConfig } from "@/lib/panel-config"
import { useToast } from "@/components/toast"
import { normalizeName } from "@/lib/normalize"
import { uid } from "@/lib/ids"
import { convertQty } from "@/lib/panel-units"
import { todayStr, dateLabel } from "@/lib/panel-utils"
import { t } from "@/lib/i18n/es"
import Link from "next/link"
import { ArrowLeft, Copy, Flame, AlertCircle, Receipt } from "lucide-react"
import {
  SaleEntry,
  Cliente,
  Mesa,
  Empleado,
  Fichaje,
  TarjetaRegalo,
  entryTotal,
} from "@/components/panel/ventas/ventas-shared"
import {
  buildClientesLines,
  buildCorteLines,
  buildGerencialLines,
  buildHorasLines,
  buildResumenLines,
} from "@/lib/ventas/reportes"
import { useVentasStats } from "@/hooks/use-ventas-stats"
import SalesGoals from "@/components/panel/ventas/SalesGoals"
import SaleForm, { SaleFormData } from "@/components/panel/ventas/SaleForm"
import FrequentCustomers from "@/components/panel/ventas/FrequentCustomers"
import DiningTables from "@/components/panel/ventas/DiningTables"
import RelojChecador from "@/components/panel/ventas/RelojChecador"
import GiftCards from "@/components/panel/ventas/GiftCards"
import AntifraudAlerts from "@/components/panel/ventas/AntifraudAlerts"
import DayStats from "@/components/panel/ventas/DayStats"
import CorteCaja from "@/components/panel/ventas/CorteCaja"
import ManagementReport from "@/components/panel/ventas/ManagementReport"
import WeekTrend from "@/components/panel/ventas/WeekTrend"
import TopSellers from "@/components/panel/ventas/TopSellers"
import EntriesList from "@/components/panel/ventas/EntriesList"
import AllTimeTip from "@/components/panel/ventas/AllTimeTip"
import DeleteConfirmModal from "@/components/panel/ventas/DeleteConfirmModal"

interface InventoryItemLike {
  id: string
  name: string
  stock: number
  minStock: number
  unit: string
  pricePerUnit: number
  category?: string
}

interface StockMovementLike {
  fecha: string
  itemId: string
  itemName: string
  tipo: "entrada" | "salida" | "ajuste"
  delta: number
  motivo: string
}

export default function VentasPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const { toast } = useToast()
  const [sharedDishes] = useSharedDishes(slug)

  const [entries, setEntries] = useLocalStorage<SaleEntry[]>("ventas-entries", [], slug)
  const panelCfg = usePanelConfig(slug)
  const [inventarioItems, setInventarioItems] = useLocalStorage<InventoryItemLike[]>("inventario-items", [], slug)
  const [, setMovements] = useLocalStorage<StockMovementLike[]>("inventario-movimientos", [], slug)
  const [deductStock, setDeductStock] = useLocalStorage<boolean>("ventas-descontar-stock", false, slug)
  const [dailyGoal, setDailyGoal] = useLocalStorage<number>("ventas-meta-dia", 0, slug)
  const [monthlyGoal, setMonthlyGoal] = useLocalStorage<number>("ventas-meta-mes", 0, slug)
  const [ticketThreshold, setTicketThreshold] = useLocalStorage<number>("ventas-umbral-ticket", 3000, slug)
  const [clientes, setClientes] = useLocalStorage<Cliente[]>("clientes", [], slug)
  const [puntosTasa, setPuntosTasa] = useLocalStorage<number>("ventas-puntos-tasa", 100, slug)
  const [puntosCanje, setPuntosCanje] = useLocalStorage<number>("ventas-puntos-canje", 1, slug)
  const [tipoCambio, setTipoCambio] = useLocalStorage<number>("ventas-tipo-cambio", 1, slug)
  const [mesas, setMesas] = useLocalStorage<Mesa[]>("mesas", [], slug)
  const [empleados, setEmpleados] = useLocalStorage<Empleado[]>("reloj-empleados", [], slug)
  const [fichajes, setFichajes] = useLocalStorage<Fichaje[]>("reloj-fichajes", [], slug)
  const [tarjetas, setTarjetas] = useLocalStorage<TarjetaRegalo[]>("tarjetas-regalo", [], slug)
  const [comisiones, setComisiones] = useLocalStorage<Record<string, number>>("ventas-comisiones", {}, slug)
  // Keep comanda statuses in sync: deleting a sale must remove its comanda status
  const [, setComandaStatuses] = useLocalStorage<Record<string, unknown>>("comanda-statuses", {}, slug)
  // Live tick for "tiempo ocupado" / fichajes abiertos
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])
  const [showGoals, setShowGoals] = useState(false)
  const [showClientes, setShowClientes] = useState(false)
  const [showMesas, setShowMesas] = useState(false)
  const [showReloj, setShowReloj] = useState(false)
  const [showTarjetas, setShowTarjetas] = useState(false)
  const [mesaName, setMesaName] = useState("")
  const [mesaCapacidad, setMesaCapacidad] = useState("")
  const [mesaZona, setMesaZona] = useState("")
  const [mesaEditId, setMesaEditId] = useState<string | null>(null)
  const [mesaDeleteId, setMesaDeleteId] = useState<string | null>(null)
  const [empNombre, setEmpNombre] = useState("")
  const [empRol, setEmpRol] = useState("")
  const [empTarifa, setEmpTarifa] = useState("")
  const [empEditId, setEmpEditId] = useState<string | null>(null)
  const [empDeleteId, setEmpDeleteId] = useState<string | null>(null)
  const [tarjetaMonto, setTarjetaMonto] = useState("")
  const [clienteName, setClienteName] = useState("")
  const [clientePhone, setClientePhone] = useState("")
  const [clientePts, setClientePts] = useState("")
  const [clienteEditId, setClienteEditId] = useState<string | null>(null)
  const [clienteDeleteId, setClienteDeleteId] = useState<string | null>(null)
  const [goalFormDia, setGoalFormDia] = useState("")
  const [goalFormMes, setGoalFormMes] = useState("")
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [showAll, setShowAll] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [reportPeriod, setReportPeriod] = useState<"hoy" | "7d" | "30d">("hoy")

  // ── Derived ────────────────────────────────────────────
  const dishCost = (id: string) => {
    const dish = sharedDishes.find((d) => d.id === id)
    if (!dish) return 0
    return dish.ingredients.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  }
  const dishPrice = (id: string) => sharedDishes.find((d) => d.id === id)?.sellingPrice || 0

  const {
    dayEntries,
    mesasOcupadasHoy,
    dayStats,
    monthRevenue,
    dailyGoalPct,
    monthlyGoalPct,
    projectedRevenue,
    onPace,
    topSellers,
    methodBreakdown,
    channelBreakdown,
    weekTrend,
    allTimeStats,
    fraudAlerts,
    reportEntries,
    reportStats,
    reportTop,
    reportMethods,
    reportChannels,
    comisionesHoy,
    comisionesReporte,
    fichajesHoy,
    empleadosHoy,
    comparison,
  } = useVentasStats({
    entries,
    selectedDate,
    now,
    dailyGoal,
    monthlyGoal,
    ticketThreshold,
    reportPeriod,
    comisiones,
    empleados,
    fichajes,
  })

  // ── Sales goals (daily / monthly) ─────────────────────
  const saveGoals = () => {
    const d = parseFloat(goalFormDia)
    const m = parseFloat(goalFormMes)
    if (!Number.isNaN(d) && d >= 0) setDailyGoal(d)
    if (!Number.isNaN(m) && m >= 0) setMonthlyGoal(m)
    setShowGoals(false)
    toast("Metas de venta guardadas", "success")
  }

  const ficharEntrada = (empleadoId: string) => {
    const open = fichajes.find((f) => f.empleadoId === empleadoId && !f.salida)
    if (open) {
      toast("Ya tiene un fichaje de entrada abierto", "warning")
      return
    }
    setFichajes((prev) => [...prev, { id: uid("fichaje"), empleadoId, entrada: new Date().toISOString() }])
    toast("Entrada registrada", "success")
  }

  const ficharSalida = (empleadoId: string) => {
    const open = fichajes.find((f) => f.empleadoId === empleadoId && !f.salida)
    if (!open) {
      toast("No hay fichaje de entrada abierto", "warning")
      return
    }
    setFichajes((prev) => prev.map((f) => (f.id === open.id ? { ...f, salida: new Date().toISOString() } : f)))
    toast("Salida registrada", "success")
  }

  const saveEmpleado = () => {
    const nombre = empNombre.trim()
    const tarifa = parseFloat(empTarifa)
    if (!nombre || Number.isNaN(tarifa) || tarifa < 0) {
      toast("Completa nombre y tarifa válida", "warning")
      return
    }
    setEmpleados((prev) => {
      const id = empEditId || uid("empleado")
      const exists = prev.some((e) => e.id === id)
      const nuevo: Empleado = { id, nombre, rol: empRol.trim() || undefined, tarifa }
      return exists ? prev.map((e) => (e.id === id ? nuevo : e)) : [...prev, nuevo]
    })
    setEmpNombre("")
    setEmpRol("")
    setEmpTarifa("")
    setEmpEditId(null)
    toast(empEditId ? "Empleado actualizado" : "Empleado agregado", "success")
  }

  const copyHoras = () => {
    if (fichajesHoy.rows.length === 0) {
      toast("No hay fichajes para ese día", "warning")
      return
    }
    const lines = buildHorasLines({ collectionName: selectedCollection?.name, dateLabel: dateLabel(selectedDate), fichajesHoy })
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Reporte de horas copiado", "success")
  }

  // ── Tarjetas de regalo ────────────────────────────────
  const emitirTarjeta = () => {
    const monto = parseFloat(tarjetaMonto)
    if (Number.isNaN(monto) || monto <= 0) {
      toast("Ingresa un monto válido", "warning")
      return
    }
    const code = `RT-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    setTarjetas((prev) => [...prev, { id: uid("tarjeta"), codigo: code, monto, saldo: monto, estado: "activa", creada: new Date().toISOString() }])
    setTarjetaMonto("")
    toast(`Tarjeta ${code} emitida con $${monto.toFixed(0)}`, "success")
  }

  const copyCodigoTarjeta = (codigo: string) => {
    navigator.clipboard.writeText(codigo)
    toast("Código copiado", "success")
  }

  // ── Comparativa contra período anterior ──────────────
  const copyGerencial = () => {
    const label = reportPeriod === "hoy" ? "Hoy" : reportPeriod === "7d" ? "Últimos 7 días" : "Últimos 30 días"
    const lines = buildGerencialLines({
      collectionName: selectedCollection?.name,
      periodLabel: label,
      stats: reportStats,
      comisionesReporte,
      tipoCambio,
      methods: reportMethods,
      channels: reportChannels,
      top: reportTop,
      comparison,
    })
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Reporte gerencial copiado", "success")
  }

  // ── Actions ────────────────────────────────────────────
  const handleAddEntry = (data: SaleFormData) => {
    const dish = sharedDishes.find((d) => d.id === data.dishId)
    if (!dish) {
      toast("Selecciona un platillo del menú costeado", "warning")
      return
    }
    const qty = data.qty
    if (qty <= 0) {
      toast("La cantidad debe ser mayor a 0", "error")
      return
    }
    if (!data.date) {
      toast("Selecciona una fecha", "warning")
      return
    }
    const unitCost = dishCost(dish.id)
    const mods = (dish.modificadores || []).filter((m) => data.mods.includes(m.id))
    const modTotal = mods.reduce((s, m) => s + m.precio, 0)
    const unitPrice = dish.sellingPrice + modTotal
    const discountValue = data.discountValue ? Math.max(0, parseFloat(data.discountValue) || 0) : 0
    // Loyalty redemption: convert points to a peso discount (monto)
    const redeemPts = data.redeemPts ? Math.max(0, parseInt(data.redeemPts) || 0) : 0
    const redeemValue = data.clienteId && redeemPts > 0 ? Math.min(redeemPts * puntosCanje, qty * unitPrice) : 0
    const entry: SaleEntry = {
      id: uid("sale"),
      dishId: dish.id,
      dishName: dish.name,
      quantity: qty,
      date: data.date,
      unitPrice,
      unitCost,
      paymentMethod: data.payment,
      channel: data.channel,
      clienteId: data.clienteId,
      mesaId: data.mesaId,
      modificadores: mods.length > 0 ? mods.map((m) => ({ nombre: m.nombre, precio: m.precio })) : undefined,
      discount: redeemValue > 0
        ? { type: "monto", value: redeemValue }
        : discountValue > 0 ? { type: data.discountType, value: discountValue } : undefined,
      createdAt: new Date().toISOString(),
    }
    const total = entryTotal(entry)

    // Gift card payment: validate the code covers the total and reduce its balance
    if (data.payment === "regalo") {
      const code = (data.giftCode || "").trim().toUpperCase()
      const card = tarjetas.find((t) => t.codigo === code && t.estado === "activa" && t.saldo > 0)
      if (!card) {
        toast("Código de tarjeta de regalo no válido o sin saldo", "warning")
        return
      }
      if (card.saldo < total) {
        toast(`El saldo de la tarjeta ($${card.saldo.toFixed(0)}) no cubre el total ($${total.toFixed(0)})`, "warning")
        return
      }
      setTarjetas((prev) =>
        prev.map((t) => {
          if (t.id !== card.id) return t
          const saldo = Math.max(0, t.saldo - total)
          return { ...t, saldo, estado: saldo <= 0 ? "agotada" : "activa" }
        }),
      )
    }

    setEntries((prev) => [...prev, entry])
    setSelectedDate(data.date)

    // Loyalty: accumulate points, visits and spend for the assigned client
    if (data.clienteId) {
      const total = entryTotal(entry)
      const earned = Math.floor(total / (puntosTasa > 0 ? puntosTasa : 100))
      setClientes((prev) =>
        prev.map((c) =>
          c.id === data.clienteId
            ? {
                ...c,
                puntos: Math.max(0, c.puntos + earned - redeemPts),
                visitas: c.visitas + 1,
                totalGastado: c.totalGastado + total,
              }
            : c,
        ),
      )
    }

    // Optional: deduct dish ingredients from inventory (opt-in)
    let deducted = 0
    if (deductStock) {
      const deductions = new Map<string, { itemId: string; itemName: string; neededQty: number }>()
      dish.ingredients.forEach((ing) => {
        const key = normalizeName(ing.ingredientName)
        if (!key) return
        const totalQty = (ing.quantity || 0) * qty
        if (totalQty <= 0) return
        const item = inventarioItems.find((i) => normalizeName(i.name) === key)
        if (!item) return
        // Convert the recipe quantity (in the ingredient's unit) to the inventory item's unit
        const neededQty = convertQty(totalQty, ing.unit || "g", item.unit) ?? totalQty
        deductions.set(item.id, {
          itemId: item.id,
          itemName: item.name,
          neededQty: (deductions.get(item.id)?.neededQty || 0) + neededQty,
        })
      })
      if (deductions.size > 0) {
        setInventarioItems((prev) =>
          prev.map((i) => {
            const d = deductions.get(i.id)
            return d ? { ...i, stock: Math.max(0, i.stock - d.neededQty) } : i
          })
        )
        const newMovements: StockMovementLike[] = Array.from(deductions.values()).map((d) => ({
          fecha: new Date().toISOString(),
          itemId: d.itemId,
          itemName: d.itemName,
          tipo: "salida",
          delta: -d.neededQty,
          motivo: `Venta: ${dish.name} ×${qty}`,
        }))
        setMovements((prev) => [...newMovements, ...prev].slice(0, 500))
      }
      deducted = deductions.size
    }

    if (deductStock) {
      toast(
        deducted > 0
          ? `${qty} × ${dish.name} registrado · ${deducted} insumo${deducted > 1 ? "s" : ""} descontado${deducted > 1 ? "s" : ""} del inventario`
          : `${qty} × ${dish.name} registrado (ningún ingrediente coincide con tu inventario)`,
        "success",
      )
    } else {
      toast(`${qty} × ${dish.name} registrado${qty > 1 ? "s" : ""}`, "success")
    }
  }

  const adjustQty = (id: string, delta: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, quantity: Math.max(1, e.quantity + delta) } : e))
    )
  }

  const deleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    // Remove the orphaned comanda status so it doesn't linger forever
    setComandaStatuses((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    setDeleteConfirm(null)
    toast("Venta eliminada", "warning")
  }

  // ── Clientes frecuentes ────────────────────────────────
  const saveCliente = () => {
    const name = clienteName.trim()
    if (!name) {
      toast("Escribe el nombre del cliente", "warning")
      return
    }
    const pts = Math.max(0, clientePts ? parseInt(clientePts) || 0 : 0)
    if (clienteEditId) {
      setClientes((prev) =>
        prev.map((c) =>
          c.id === clienteEditId
            ? { ...c, nombre: name, telefono: clientePhone.trim() || undefined, puntos: pts }
            : c,
        ),
      )
      toast("Cliente actualizado", "success")
    } else {
      setClientes((prev) => [
        ...prev,
        { id: uid("cliente"), nombre: name, telefono: clientePhone.trim() || undefined, puntos: pts, visitas: 0, totalGastado: 0, createdAt: new Date().toISOString() },
      ])
      toast("Cliente agregado", "success")
    }
    setClienteName("")
    setClientePhone("")
    setClientePts("")
    setClienteEditId(null)
  }

  const startEditCliente = (c: Cliente) => {
    setClienteEditId(c.id)
    setClienteName(c.nombre)
    setClientePhone(c.telefono || "")
    setClientePts(String(c.puntos))
  }

  const confirmDeleteCliente = () => {
    if (!clienteDeleteId) return
    setClientes((prev) => prev.filter((c) => c.id !== clienteDeleteId))
    setClienteDeleteId(null)
    toast("Cliente eliminado", "warning")
  }

  // ── Mesas CRUD ──────────────────────────────────────────
  const saveMesa = () => {
    const nombre = mesaName.trim()
    if (!nombre) {
      toast("Escribe el nombre de la mesa", "warning")
      return
    }
    const capacidad = Math.max(1, mesaCapacidad ? parseInt(mesaCapacidad) || 1 : 1)
    if (mesaEditId) {
      setMesas((prev) =>
        prev.map((m) => (m.id === mesaEditId ? { ...m, nombre, capacidad, zona: mesaZona.trim() || undefined } : m)),
      )
      toast("Mesa actualizada", "success")
    } else {
      setMesas((prev) => [...prev, { id: uid("mesa"), nombre, capacidad, zona: mesaZona.trim() || undefined }])
      toast("Mesa agregada", "success")
    }
    setMesaName("")
    setMesaCapacidad("")
    setMesaZona("")
    setMesaEditId(null)
  }

  const startEditMesa = (m: Mesa) => {
    setMesaEditId(m.id)
    setMesaName(m.nombre)
    setMesaCapacidad(String(m.capacidad))
    setMesaZona(m.zona || "")
  }

  const confirmDeleteMesa = () => {
    if (!mesaDeleteId) return
    setMesas((prev) => prev.filter((m) => m.id !== mesaDeleteId))
    setMesaDeleteId(null)
    toast("Mesa eliminada", "warning")
  }

  const confirmDeleteEmpleado = () => {
    if (!empDeleteId) return
    setEmpleados((prev) => prev.filter((e) => e.id !== empDeleteId))
    setEmpDeleteId(null)
    toast("Empleado eliminado", "warning")
  }

  const copyClientes = () => {
    if (clientes.length === 0) {
      toast("No hay clientes registrados", "warning")
      return
    }
    const lines = buildClientesLines({ collectionName: selectedCollection?.name, clientes })
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Clientes copiados", "success")
  }

  const copySummary = () => {
    const lines = buildResumenLines({
      collectionName: selectedCollection?.name,
      dateLabel: dateLabel(selectedDate),
      stats: dayStats,
      methods: methodBreakdown,
      channels: channelBreakdown,
      top: topSellers,
      tipoCambio,
      clientes,
      mesas,
      entries: dayEntries,
    })
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Resumen del día copiado", "success")
  }

  const copyCorte = () => {
    const lines = buildCorteLines({
      collectionName: selectedCollection?.name,
      dateLabel: dateLabel(selectedDate),
      stats: dayStats,
      methods: methodBreakdown,
      channels: channelBreakdown,
      comisionesHoy,
      mesasOcupadas: mesasOcupadasHoy.size,
      tipoCambio,
      entries: dayEntries,
    })
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Corte de caja copiado", "success")
  }

  const visibleEntries = showAll ? entries : dayEntries

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Selecciona tu tipo de restaurante para registrar tus ventas del día y conocer tu margen real.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{t("ventas.title")}</h2>
            {entries.length > 0 && (
              <button
                onClick={copySummary}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                title="Copiar resumen del día seleccionado"
                aria-label="Copiar resumen de ventas"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar resumen
              </button>
            )}
            <Link
              href="/panel/comanda"
              className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-lg transition-colors"
              title="Ver monitor de producción en cocina"
              aria-label="Abrir monitor de cocina"
            >
              <Flame className="w-3.5 h-3.5" />
              Monitor de cocina
            </Link>
          </div>
          <p className="text-sm text-gray-400">
            {selectedCollection.name} — registra tus ventas y conoce tu margen real
          </p>
        </div>
      </div>

      {sharedDishes.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold mb-0.5">Aún no tienes platillos costeados</p>
            <p>Costa tu menú primero para que las ventas calculen el costo real de cada platillo.</p>
          </div>
          <Link href="/panel/costeo" className="ml-auto text-xs font-semibold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors shrink-0">
            Ir a Costeo
          </Link>
        </div>
      )}

      {/* ── Register sale form ───────────────────────────── */}
      <SaleForm
        sharedDishes={sharedDishes}
        entries={entries}
        clientes={clientes}
        mesas={mesas}
        puntosTasa={puntosTasa}
        puntosCanje={puntosCanje}
        deductStock={deductStock}
        dishCost={dishCost}
        dishPrice={dishPrice}
        onToggleDeductStock={setDeductStock}
        onAdd={handleAddEntry}
        onEscape={() => setDeleteConfirm(null)}
        toast={toast}
      />

      {/* ── Sales goals ──────────────────────────────────── */}
      <SalesGoals
        showGoals={showGoals}
        goalFormDia={goalFormDia}
        goalFormMes={goalFormMes}
        dailyGoal={dailyGoal}
        monthlyGoal={monthlyGoal}
        dayStats={dayStats}
        dailyGoalPct={dailyGoalPct}
        monthlyGoalPct={monthlyGoalPct}
        monthRevenue={monthRevenue}
        projectedRevenue={projectedRevenue}
        onPace={onPace}
        comisiones={comisiones}
        onToggle={() => {
          if (!showGoals) {
            setGoalFormDia(String(dailyGoal || ""))
            setGoalFormMes(String(monthlyGoal || ""))
          }
          setShowGoals(!showGoals)
        }}
        onGoalFormDiaChange={setGoalFormDia}
        onGoalFormMesChange={setGoalFormMes}
        onSave={saveGoals}
        onComisionChange={(key, value) =>
          setComisiones((prev) => ({ ...prev, [key]: Math.max(0, parseFloat(value) || 0) }))
        }
      />

      {/* ── Clientes frecuentes ──────────────────────────── */}
      <FrequentCustomers
        clientes={clientes}
        showClientes={showClientes}
        clienteName={clienteName}
        clientePhone={clientePhone}
        clientePts={clientePts}
        clienteEditId={clienteEditId}
        clienteDeleteId={clienteDeleteId}
        puntosTasa={puntosTasa}
        puntosCanje={puntosCanje}
        tipoCambio={tipoCambio}
        onCopy={copyClientes}
        onToggle={() => setShowClientes(!showClientes)}
        onNameChange={setClienteName}
        onPhoneChange={setClientePhone}
        onPtsChange={setClientePts}
        onSave={saveCliente}
        onCancel={() => {
          setClienteEditId(null)
          setClienteName("")
          setClientePhone("")
          setClientePts("")
        }}
        onEdit={startEditCliente}
        onDeleteClick={(id) => setClienteDeleteId(id)}
        onCancelDelete={() => setClienteDeleteId(null)}
        onConfirmDelete={confirmDeleteCliente}
        onPuntosTasaChange={setPuntosTasa}
        onPuntosCanjeChange={setPuntosCanje}
        onTipoCambioChange={setTipoCambio}
      />

      {/* ── Mesas del salón ──────────────────────────────── */}
      <DiningTables
        mesas={mesas}
        showMesas={showMesas}
        mesasOcupadasHoy={mesasOcupadasHoy}
        now={now}
        mesaName={mesaName}
        mesaCapacidad={mesaCapacidad}
        mesaZona={mesaZona}
        mesaEditId={mesaEditId}
        mesaDeleteId={mesaDeleteId}
        onToggle={() => setShowMesas(!showMesas)}
        onNameChange={setMesaName}
        onCapacidadChange={setMesaCapacidad}
        onZonaChange={setMesaZona}
        onSave={saveMesa}
        onCancel={() => {
          setMesaEditId(null)
          setMesaName("")
          setMesaCapacidad("")
          setMesaZona("")
        }}
        onEdit={startEditMesa}
        onDeleteClick={(id) => setMesaDeleteId(id)}
        onCancelDelete={() => setMesaDeleteId(null)}
        onConfirmDelete={confirmDeleteMesa}
      />

      {/* ── Reloj checador ───────────────────────────────── */}
      <RelojChecador
        showReloj={showReloj}
        empleadoCount={empleados.length}
        empleadosHoy={empleadosHoy}
        fichajesHoy={fichajesHoy}
        empNombre={empNombre}
        empRol={empRol}
        empTarifa={empTarifa}
        empEditId={empEditId}
        empDeleteId={empDeleteId}
        selectedDate={selectedDate}
        onToggle={() => setShowReloj(!showReloj)}
        onNombreChange={setEmpNombre}
        onRolChange={setEmpRol}
        onTarifaChange={setEmpTarifa}
        onSave={saveEmpleado}
        onCancel={() => {
          setEmpEditId(null)
          setEmpNombre("")
          setEmpRol("")
          setEmpTarifa("")
        }}
        onFicharEntrada={ficharEntrada}
        onFicharSalida={ficharSalida}
        onEdit={(e) => {
          setEmpEditId(e.id)
          setEmpNombre(e.nombre)
          setEmpRol(e.rol || "")
          setEmpTarifa(String(e.tarifa))
        }}
        onDeleteClick={(id) => setEmpDeleteId(id)}
        onCancelDelete={() => setEmpDeleteId(null)}
        onConfirmDelete={confirmDeleteEmpleado}
        onCopyHoras={copyHoras}
      />

      {/* ── Tarjetas de regalo ───────────────────────────── */}
      <GiftCards
        tarjetas={tarjetas}
        showTarjetas={showTarjetas}
        tarjetaMonto={tarjetaMonto}
        onToggle={() => setShowTarjetas(!showTarjetas)}
        onMontoChange={setTarjetaMonto}
        onEmitir={emitirTarjeta}
        onCopyCodigo={copyCodigoTarjeta}
      />

      {/* ── Antifraud alerts ─────────────────────────────── */}
      <AntifraudAlerts
        fraudAlerts={fraudAlerts}
        ticketThreshold={ticketThreshold}
        tipoCambio={tipoCambio}
        onTicketThresholdChange={setTicketThreshold}
        onTipoCambioChange={setTipoCambio}
      />

      {/* ── Day stats ────────────────────────────────────── */}
      <DayStats
        hasEntries={entries.length > 0}
        dayStats={dayStats}
        selectedDate={selectedDate}
        showAll={showAll}
        tipoCambio={tipoCambio}
        panelCfg={panelCfg}
        onDateChange={(v) => {
          setSelectedDate(v || todayStr())
          setShowAll(false)
        }}
        onToggleShowAll={() => setShowAll(!showAll)}
        onFocusFirstDish={() => document.getElementById("venta-dish")?.focus()}
      />

      {entries.length > 0 && (
        <>
          <CorteCaja
            methodBreakdown={methodBreakdown}
            revenue={dayStats.revenue}
            dayEntryCount={dayEntries.length}
            selectedDateLabel={dateLabel(selectedDate)}
            tipoCambio={tipoCambio}
            onCopy={copyCorte}
          />

          <ManagementReport
            reportPeriod={reportPeriod}
            reportStats={reportStats}
            reportEntries={reportEntries}
            reportMethods={reportMethods}
            reportChannels={reportChannels}
            reportTop={reportTop}
            comparison={comparison}
            tipoCambio={tipoCambio}
            onPeriodChange={setReportPeriod}
            onCopy={copyGerencial}
          />

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <WeekTrend weekTrend={weekTrend} />
            <TopSellers
              topSellers={topSellers}
              totalUnits={dayStats.units}
              selectedDateLabel={dateLabel(selectedDate)}
            />
          </div>

          <EntriesList
            showAll={showAll}
            entriesCount={entries.length}
            dayEntriesCount={dayEntries.length}
            units={dayStats.units}
            selectedDateLabel={dateLabel(selectedDate)}
            visibleEntries={visibleEntries}
            clientes={clientes}
            dishCost={dishCost}
            onAdjustQty={adjustQty}
            onDeleteClick={(id) => setDeleteConfirm(id)}
          />
        </>
      )}

      {/* All-time tip */}
      <AllTimeTip
        hasEntries={entries.length > 0}
        allTimeStats={allTimeStats}
        foodCostRedAbove={panelCfg.foodCostRedAbove}
      />

      {/* Delete confirm */}
      <DeleteConfirmModal
        entryId={deleteConfirm}
        deductStock={deductStock}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={deleteEntry}
      />
    </div>
  )
}
