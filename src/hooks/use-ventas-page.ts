"use client"

import { useState, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useSharedDishes } from "@/hooks/use-local-storage"
import { useSyncedStorage } from "@/hooks/use-synced-storage"
import { useSyncedRows } from "@/hooks/use-synced-rows"
import { usePanelConfig } from "@/lib/panel-config"
import { useToast } from "@/components/toast"
import { normalizeName } from "@/lib/normalize"
import { uid } from "@/lib/ids"
import { convertQty } from "@/lib/panel-units"
import { todayStr, dateLabel, toNonNegativeNumber, toInt } from "@/lib/panel-utils"
import { SaleEntry, entryTotal } from "@/components/panel/ventas/ventas-shared"
import { useClientesCrud, useMesasCrud, useEmpleadosCrud, useTarjetasCrud } from "@/hooks/use-ventas-crud"
import {
  buildClientesLines,
  buildCorteLines,
  buildGerencialLines,
  buildHorasLines,
  buildResumenLines,
} from "@/lib/ventas/reportes"
import { useVentasStats } from "@/hooks/use-ventas-stats"
import type { SaleFormData } from "@/components/panel/ventas/SaleForm"

export interface InventoryItemLike {
  id: string
  name: string
  stock: number
  minStock: number
  unit: string
  pricePerUnit: number
  category?: string
}

export interface StockMovementLike {
  id?: string // asignado por useSyncedRows al primer set
  fecha: string
  itemId: string
  itemName: string
  tipo: "entrada" | "salida" | "ajuste"
  delta: number
  motivo: string
}

type DishIngredient = { ingredientName: string; quantity: number; unit: string }

/**
 * Calcula cuánto descuenta del inventario una venta de `qty` platillos,
 * empatando ingredientes de la receta con items por nombre normalizado.
 */
export function computeDeductions(
  ingredients: DishIngredient[],
  qty: number,
  inventarioItems: InventoryItemLike[],
) {
  const deductions = new Map<string, { itemId: string; itemName: string; neededQty: number }>()
  ingredients.forEach((ing) => {
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
  return deductions
}

/**
 * Estado y acciones del panel de ventas.
 *
 * Extraído de `src/app/panel/ventas/page.tsx` (Fase 18): la página ahora es
 * solo render. Este hook mantiene todo el estado (localStorage + cruds),
 * la lógica derivada (costos, stats) y los handlers (registrar venta con
 * descuento de inventario, metas, copiar reportes).
 */
export function useVentasPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const { toast } = useToast()
  const [sharedDishes] = useSharedDishes(slug)

  const [entries, setEntries] = useSyncedRows<SaleEntry>("ventas-entries", [], slug)
  const panelCfg = usePanelConfig(slug)
  const [inventarioItems, setInventarioItems] = useSyncedStorage<InventoryItemLike[]>("inventario-items", [], slug)
  const [, setMovements] = useSyncedRows<StockMovementLike>("inventario-movimientos", [], slug)
  const [deductStock, setDeductStock] = useSyncedStorage<boolean>("ventas-descontar-stock", false, slug)
  const [dailyGoal, setDailyGoal] = useSyncedStorage<number>("ventas-meta-dia", 0, slug)
  const [monthlyGoal, setMonthlyGoal] = useSyncedStorage<number>("ventas-meta-mes", 0, slug)
  const [ticketThreshold, setTicketThreshold] = useSyncedStorage<number>("ventas-umbral-ticket", 3000, slug)
  const [puntosTasa, setPuntosTasa] = useSyncedStorage<number>("ventas-puntos-tasa", 100, slug)
  const [puntosCanje, setPuntosCanje] = useSyncedStorage<number>("ventas-puntos-canje", 1, slug)
  const [tipoCambio, setTipoCambio] = useSyncedStorage<number>("ventas-tipo-cambio", 1, slug)
  const clientesCrud = useClientesCrud(slug)
  const mesasCrud = useMesasCrud(slug)
  const empleadosCrud = useEmpleadosCrud(slug)
  const tarjetasCrud = useTarjetasCrud(slug)
  const [comisiones, setComisiones] = useSyncedStorage<Record<string, number>>("ventas-comisiones", {}, slug)
  // Keep comanda statuses in sync: deleting a sale must remove its comanda status
  const [, setComandaStatuses] = useSyncedStorage<Record<string, unknown>>("comanda-statuses", {}, slug)
  // Live tick for "tiempo ocupado" / fichajes abiertos
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])
  const [showGoals, setShowGoals] = useState(false)
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
    empleados: empleadosCrud.empleados,
    fichajes: empleadosCrud.fichajes,
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

  const toggleGoals = () => {
    if (!showGoals) {
      setGoalFormDia(String(dailyGoal || ""))
      setGoalFormMes(String(monthlyGoal || ""))
    }
    setShowGoals(!showGoals)
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
    const discountValue = toNonNegativeNumber(data.discountValue)
    // Loyalty redemption: convert points to a peso discount (monto)
    const redeemPts = data.redeemPts ? Math.max(0, toInt(data.redeemPts)) : 0
    const redeemValue = data.clienteId && redeemPts > 0 ? Math.min(redeemPts * puntosCanje, qty * unitPrice) : 0
    // Deductions se calculan antes de crear la entrada para persistir
    // stockDeducted junto con la venta (permite revertir stock al borrarla).
    const deductions = deductStock ? computeDeductions(dish.ingredients, qty, inventarioItems) : new Map<string, { itemId: string; itemName: string; neededQty: number }>()
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
      stockDeducted: deductions.size > 0,
    }
    const total = entryTotal(entry)

    // Gift card payment: validate the code covers the total and reduce its balance
    if (data.payment === "regalo") {
      const code = (data.giftCode || "").trim().toUpperCase()
      const card = tarjetasCrud.tarjetas.find((t) => t.codigo === code && t.estado === "activa" && t.saldo > 0)
      if (!card) {
        toast("Código de tarjeta de regalo no válido o sin saldo", "warning")
        return
      }
      if (card.saldo < total) {
        toast(`El saldo de la tarjeta ($${card.saldo.toFixed(0)}) no cubre el total ($${total.toFixed(0)})`, "warning")
        return
      }
      tarjetasCrud.setTarjetas((prev) =>
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
      clientesCrud.setClientes((prev) =>
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
    const entry = entries.find((e) => e.id === id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
    // Remove the orphaned comanda status so it doesn't linger forever
    setComandaStatuses((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    // Revertir el stock que la venta descontó (según la receta actual del platillo)
    if (entry?.stockDeducted) {
      const dish = sharedDishes.find((d) => d.id === entry.dishId)
      if (dish) {
        const deductions = computeDeductions(dish.ingredients, entry.quantity, inventarioItems)
        if (deductions.size > 0) {
          setInventarioItems((prev) =>
            prev.map((i) => {
              const d = deductions.get(i.id)
              return d ? { ...i, stock: i.stock + d.neededQty } : i
            })
          )
          const restores: StockMovementLike[] = Array.from(deductions.values()).map((d) => ({
            fecha: new Date().toISOString(),
            itemId: d.itemId,
            itemName: d.itemName,
            tipo: "entrada",
            delta: d.neededQty,
            motivo: `Venta eliminada: ${entry.dishName} ×${entry.quantity}`,
          }))
          setMovements((prev) => [...restores, ...prev].slice(0, 500))
        }
      }
    }
    setDeleteConfirm(null)
    toast(
      entry?.stockDeducted ? "Venta eliminada · stock restaurado en inventario" : "Venta eliminada",
      "warning",
    )
  }

  const copyClientes = () => {
    if (clientesCrud.clientes.length === 0) {
      toast("No hay clientes registrados", "warning")
      return
    }
    const lines = buildClientesLines({ collectionName: selectedCollection?.name, clientes: clientesCrud.clientes })
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
      clientes: clientesCrud.clientes,
      mesas: mesasCrud.mesas,
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

  return {
    // context
    selectedCollection,
    sharedDishes,
    slug,
    panelCfg,
    toast,
    // state
    entries,
    inventarioItems,
    deductStock,
    setDeductStock,
    dailyGoal,
    monthlyGoal,
    ticketThreshold,
    setTicketThreshold,
    puntosTasa,
    setPuntosTasa,
    puntosCanje,
    setPuntosCanje,
    tipoCambio,
    setTipoCambio,
    clientesCrud,
    mesasCrud,
    empleadosCrud,
    tarjetasCrud,
    comisiones,
    setComisiones,
    now,
    showGoals,
    goalFormDia,
    setGoalFormDia,
    goalFormMes,
    setGoalFormMes,
    selectedDate,
    setSelectedDate,
    showAll,
    setShowAll,
    deleteConfirm,
    setDeleteConfirm,
    reportPeriod,
    setReportPeriod,
    // derived
    dishCost,
    dishPrice,
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
    visibleEntries,
    // actions
    saveGoals,
    toggleGoals,
    copyHoras,
    copyGerencial,
    handleAddEntry,
    adjustQty,
    deleteEntry,
    copyClientes,
    copySummary,
    copyCorte,
  }
}
