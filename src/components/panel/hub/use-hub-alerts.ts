"use client"

import { useMemo } from "react"
import {
  AlertTriangle, AlertCircle, TrendingUp, Calendar, ClipboardCheck, Zap, Flame, Gift, UtensilsCrossed,
} from "lucide-react"
import { foodCostStatus, type PanelConfig } from "@/lib/panel-config"
import { isCurrentMonth, isLowStock, isOutOfStock } from "@/lib/panel-utils"
import { normalizeName } from "@/lib/normalize"
import { hubEntryTotal, type HubAlert, type HubCollection, type HubComandas, type HubMesasInfo, type HubTodaySales, type HubVenta } from "./hub-data"
import type { SharedDish } from "@/hooks/use-local-storage"
import type { WasteEntry } from "@/components/panel/mermas/mermas-shared"
import type { InventoryItem } from "@/components/panel/inventario/inventario-shared"
import type { ShoppingItem } from "@/components/panel/temporada/temporada-shared"
import type { Cliente } from "@/components/panel/ventas/ventas-shared"

interface UseHubAlertsArgs {
  selectedCollection: HubCollection | null
  activeComandas: HubComandas
  mesasInfo: HubMesasInfo
  todaySales: HubTodaySales | null
  ventasEntries: HubVenta[]
  ventasUmbralTicket: number
  ventasMetaDia: number
  inventarioItems: InventoryItem[]
  sharedDishes: SharedDish[]
  mermaEntries: WasteEntry[]
  monthlyGoal: number
  shoppingList: ShoppingItem[]
  aperturaChecked: string[]
  projectionShortfall: number
  covers: number
  clientes: Cliente[]
  panelCfg: PanelConfig
}

export function useHubAlerts({
  selectedCollection, activeComandas, mesasInfo, todaySales, ventasEntries, ventasUmbralTicket,
  ventasMetaDia, inventarioItems, sharedDishes, mermaEntries, monthlyGoal, shoppingList,
  aperturaChecked, projectionShortfall, covers, clientes, panelCfg,
}: UseHubAlertsArgs): HubAlert[] {
  return useMemo(() => {
    if (!selectedCollection) return []
    const result: HubAlert[] = []

    // 0. Active kitchen orders
    if (activeComandas.active > 0) {
      result.push({
        id: "comandas-active",
        type: activeComandas.pendiente > 0 ? "warning" : "info",
        icon: Flame,
        title: `${activeComandas.active} comanda(s) activa(s) en cocina`,
        detail: `${activeComandas.pendiente} pendiente(s) · ${activeComandas.enCocina} en cocina — despacha el monitor de producción`,
        href: "/panel/comanda",
      })
    }

    // 0b. Mesas occupied for more than 3 hours
    if (mesasInfo.longCount > 0) {
      result.push({
        id: "mesas-long",
        type: "warning",
        icon: UtensilsCrossed,
        title: `${mesasInfo.longCount} mesa(s) ocupada(s) por más de 3 h`,
        detail: `${mesasInfo.longNames.slice(0, 2).join(", ")}${mesasInfo.longNames.length > 2 ? ` +${mesasInfo.longNames.length - 2} más` : ""} — revisa el servicio en mesas`,
        href: "/panel/ventas",
      })
    }

    // 1. Low stock from inventario
    const lowStock = inventarioItems.filter((i) => isLowStock(i.stock, i.minStock))
    const outOfStock = inventarioItems.filter((i) => isOutOfStock(i.stock))
    if (outOfStock.length > 0) {
      result.push({ id: "stock-out", type: "danger", icon: AlertTriangle, title: `${outOfStock.length} producto(s) agotado(s)`, detail: `${outOfStock.slice(0, 2).map((i) => i.name).join(", ")}${outOfStock.length > 2 ? ` +${outOfStock.length - 2} más` : ""}`, href: "/panel/inventario" })
    } else if (lowStock.length > 0) {
      result.push({ id: "stock-low", type: "warning", icon: AlertCircle, title: `${lowStock.length} producto(s) con stock bajo`, detail: `${lowStock.slice(0, 2).map((i) => `${i.name} (${i.stock} ${i.unit})`).join(", ")}${lowStock.length > 2 ? ` +${lowStock.length - 2} más` : ""}`, href: "/panel/inventario" })
    }

    // 2. High food cost dishes
    const highCostDishes = sharedDishes.filter((d) => {
      const cost = d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0)
      return d.sellingPrice > 0 && foodCostStatus((cost / d.sellingPrice) * 100, panelCfg) === "red"
    })
    if (highCostDishes.length > 0) {
      result.push({ id: "high-foodcost", type: "danger", icon: AlertTriangle, title: `${highCostDishes.length} platillo(s) con food cost > ${panelCfg.foodCostRedAbove}%`, detail: `${highCostDishes.map((d) => d.name).join(", ")}`, href: "/panel/rentabilidad" })
    }

    // 2b. Red food-cost dish with high sales volume (margin bleed amplified)
    if (highCostDishes.length > 0 && ventasEntries.length > 0) {
      const monthEntries = ventasEntries.filter((e) => isCurrentMonth(e.date))
      const unitsByDish = new Map<string, number>()
      monthEntries.forEach((e) => {
        const key = normalizeName(e.dishName)
        unitsByDish.set(key, (unitsByDish.get(key) || 0) + e.quantity)
      })
      const bleeding = highCostDishes
        .map((d) => ({ name: d.name, units: unitsByDish.get(normalizeName(d.name)) || 0 }))
        .filter((d) => d.units >= 10)
        .sort((a, b) => b.units - a.units)
      if (bleeding.length > 0) {
        result.push({
          id: "high-foodcost-volume",
          type: "danger",
          icon: AlertTriangle,
          title: `${bleeding.length} platillo(s) con margen rojo y alto volumen de ventas`,
          detail: `${bleeding.slice(0, 2).map((d) => `${d.name} (${d.units} vendidos este mes)`).join(", ")}${bleeding.length > 2 ? ` +${bleeding.length - 2} más` : ""} — cada venta agranda la pérdida de margen`,
          href: "/panel/rentabilidad",
        })
      }
    }

    // 2c. Low/out stock of an ingredient used in an active dish recipe
    if (sharedDishes.length > 0 && inventarioItems.length > 0) {
      const ingredientNames = new Set(
        sharedDishes.flatMap((d) => d.ingredients.map((i) => normalizeName(i.ingredientName))).filter(Boolean),
      )
      const critical = inventarioItems.filter(
        (i) => ingredientNames.has(normalizeName(i.name)) && (isOutOfStock(i.stock) || isLowStock(i.stock, i.minStock)),
      )
      if (critical.length > 0) {
        const out = critical.filter((i) => isOutOfStock(i.stock))
        result.push({
          id: "stock-ingredient-in-menu",
          type: out.length > 0 ? "danger" : "warning",
          icon: AlertCircle,
          title: `${critical.length} ingrediente(s) de tu menú con stock ${out.length > 0 ? "agotado" : "bajo"}`,
          detail: `${critical.slice(0, 2).map((i) => i.name).join(", ")}${critical.length > 2 ? ` +${critical.length - 2} más` : ""} — se usan en platillos de tu menú costeado`,
          href: "/panel/inventario",
        })
      }
    }

    // 3. Merma close to/exceeding goal
    if (monthlyGoal > 0) {
      const monthLoss = mermaEntries.filter((e) => isCurrentMonth(e.date)).reduce((s, e) => s + e.amountKg * e.costPerKg, 0)
      const pct = (monthLoss / monthlyGoal) * 100
      if (pct > 100) {
        result.push({ id: "merma-over-goal", type: "danger", icon: AlertTriangle, title: "Merma del mes excedió la meta", detail: `$${monthLoss.toFixed(0)} vs meta de $${monthlyGoal.toFixed(0)} (${pct.toFixed(0)}%)`, href: "/panel/mermas" })
      } else if (pct > 80) {
        result.push({ id: "merma-near-goal", type: "warning", icon: AlertCircle, title: "Merma cerca de la meta mensual", detail: `${pct.toFixed(0)}% de la meta alcanzada ($${monthLoss.toFixed(0)} de $${monthlyGoal.toFixed(0)})`, href: "/panel/mermas" })
      }
    }

    // 4. Temporada — seasonal produce available
    const currentMonth = new Date().getMonth() + 1
    if (shoppingList.length > 0) {
      result.push({ id: "seasonal-available", type: "info", icon: TrendingUp, title: `${shoppingList.length} productos en tu lista de compras estacional`, detail: `Ahorro estimado: $${shoppingList.reduce((s, i) => s + i.quantityKg * i.pricePerKg, 0).toFixed(0)}`, href: "/panel/temporada" })
    } else {
      const estacionalInfo = currentMonth >= 3 && currentMonth <= 5 ? "Primavera — ideal para verduras frescas y frutas" :
        currentMonth >= 6 && currentMonth <= 8 ? "Verano — mangos, aguacates, jitomates en su mejor momento" :
        currentMonth >= 9 && currentMonth <= 11 ? "Otoño — calabazas, chiles, granos de temporada" :
        "Invierno — cítricos y verduras de hoja verde en temporada"
      result.push({ id: "seasonal-tip", type: "info", icon: Calendar, title: "Productos de temporada disponibles", detail: estacionalInfo, href: "/panel/temporada" })
    }

    // 5. Apertura checklist low completion
    const aperturaTotal = 6 // approximate minimum for any collection
    const aperturaPct = aperturaTotal > 0 ? (aperturaChecked.length / aperturaTotal) * 100 : 0
    if (aperturaChecked.length > 0 && aperturaPct < 50) {
      result.push({ id: "apertura-incomplete", type: "warning", icon: AlertCircle, title: "Kit de apertura: menos del 50% completado", detail: `Solo ${aperturaChecked.length} de ~${aperturaTotal} pasos verificados`, href: "/panel/apertura" })
    } else if (aperturaChecked.length === 0 && aperturaTotal > 0) {
      result.push({ id: "apertura-not-started", type: "info", icon: ClipboardCheck, title: "Kit de apertura sin iniciar", detail: "Empieza a verificar los pasos para abrir tu restaurante", href: "/panel/apertura" })
    }

    // 6. Planned-menu stock projection alert
    if (projectionShortfall > 0 && sharedDishes.length > 0) {
      result.push({ id: "projection-shortfall", type: "warning", icon: AlertTriangle, title: `Te falta stock para tu menú planeado (${projectionShortfall} ingrediente${projectionShortfall !== 1 ? "s" : ""})`, detail: `Con ${covers} comensales planificados, revisa los faltantes calculados por receta`, href: "/panel/inventario" })
    }

    // 7. Sales goal — behind pace at midday
    if (ventasMetaDia > 0 && todaySales) {
      const hour = new Date().getHours()
      if (hour >= 14 && todaySales.revenue / ventasMetaDia < 0.5) {
        result.push({
          id: "ventas-goal-behind",
          type: "warning",
          icon: Zap,
          title: "Vas por debajo del 50% de tu meta de ventas",
          detail: `$${todaySales.revenue.toFixed(0)} de $${ventasMetaDia.toFixed(0)} (${Math.round((todaySales.revenue / ventasMetaDia) * 100)}%) — media jornada superada`,
          href: "/panel/ventas",
        })
      }
    }

    // 8. Irregular sales (antifraud heuristics on today's entries)
    if (todaySales && todaySales.count > 0) {
      const today = new Date().toISOString().slice(0, 10)
      const todayEntries = ventasEntries.filter((e) => e.date === today)
      const irregular = todayEntries.filter((e) => {
        const total = hubEntryTotal(e)
        if (ventasUmbralTicket > 0 && total > ventasUmbralTicket) return true
        if (e.quantity >= 20) return true
        if (e.discount && e.discount.type === "porcentaje" && e.discount.value > 30) return true
        if (e.unitPrice <= 0) return true
        return false
      })
      if (irregular.length > 0) {
        result.push({
          id: "ventas-irregular",
          type: "danger",
          icon: AlertTriangle,
          title: `Posibles ventas irregulares (${irregular.length})`,
          detail: `${irregular.slice(0, 2).map((e) => e.dishName).join(", ")}${irregular.length > 2 ? ` +${irregular.length - 2} más` : ""} — revisa el panel de alertas en Ventas`,
          href: "/panel/ventas",
        })
      }
    }

    // 9. Loyalty — frequent customers worth rewarding
    if (clientes.length > 0) {
      const frecuentes = clientes.filter((c) => c.visitas >= 10 || c.puntos >= 500)
      if (frecuentes.length > 0) {
        const top = [...frecuentes].sort((a, b) => (b.puntos + b.visitas * 10) - (a.puntos + a.visitas * 10))[0]!
        result.push({
          id: "clientes-frecuentes",
          type: "success",
          icon: Gift,
          title: `${frecuentes.length} cliente${frecuentes.length !== 1 ? "s" : ""} frecuente${frecuentes.length !== 1 ? "s" : ""} para premiar`,
          detail: `${top.nombre} tiene ${top.puntos} pts y ${top.visitas} visitas — ofrécele un descuento por fidelidad`,
          href: "/panel/ventas",
        })
      }
    }

    // Limit to alertCap
    return result.slice(0, panelCfg.alertCap)
  }, [selectedCollection, activeComandas, mesasInfo, todaySales, ventasEntries, ventasUmbralTicket, ventasMetaDia, inventarioItems, sharedDishes, mermaEntries, monthlyGoal, shoppingList, aperturaChecked, projectionShortfall, covers, clientes, panelCfg])
}
