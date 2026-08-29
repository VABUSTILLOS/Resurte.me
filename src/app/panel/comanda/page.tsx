"use client"

import { useState, useMemo, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useSyncedStorage } from "@/hooks/use-synced-storage"
import { useSyncedRows } from "@/hooks/use-synced-rows"
import { useToast } from "@/components/toast"
import { t } from "@/lib/i18n/es"
import { todayStr, dateLabel } from "@/lib/panel-utils"
import { ChefHat } from "lucide-react"
import { nowMs, entryTime } from "@/components/panel/comanda/comanda-shared"
import type { SaleEntryLike, MesaLike, ComandaStatus, StatusKey, ComandaRow } from "@/components/panel/comanda/comanda-shared"
import { CHANNELS } from "@/components/panel/comanda/comanda-shared"
import ComandaHeader from "@/components/panel/comanda/comanda-header"
import ComandaControls from "@/components/panel/comanda/comanda-controls"
import ChannelFilters from "@/components/panel/comanda/channel-filters"
import ProductionStats from "@/components/panel/comanda/production-stats"
import ProductionInsights from "@/components/panel/comanda/production-insights"
import type { InProductionGroup, DishAvgTime } from "@/components/panel/comanda/production-insights"
import KitchenBoard from "@/components/panel/comanda/kitchen-board"
import ComandaList from "@/components/panel/comanda/comanda-list"
import ComandaEmpty from "@/components/panel/comanda/comanda-empty"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"

export default function ComandaPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const { toast } = useToast()
  const [entries] = useSyncedRows<SaleEntryLike>("ventas-entries", [], slug)
  const [mesas] = useSyncedStorage<MesaLike[]>("mesas", [], slug)
  const [statuses, setStatuses] = useSyncedStorage<Record<string, ComandaStatus>>("comanda-statuses", {}, slug)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [channelFilter, setChannelFilter] = useState<"todos" | string>("todos")
  const [mesaFilter, setMesaFilter] = useState<string>("todas")
  const [viewMode, setViewMode] = useState<"board" | "list">("board")
  const [sortNewest, setSortNewest] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Live tick so ages / elapsed production times refresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === selectedDate),
    [entries, selectedDate],
  )

  const comandas = useMemo(() => {
    const rows: ComandaRow[] = dayEntries.map((e) => ({
      entry: e,
      time: entryTime(e),
      status: statuses[e.id]?.status || "pendiente",
      startedAt: statuses[e.id]?.startedAt,
      readyAt: statuses[e.id]?.readyAt,
      hidden: !!statuses[e.id]?.hidden,
    }))
    return rows.filter((r) => !r.hidden)
  }, [dayEntries, statuses])

  const filtered = useMemo(() => {
    let rows = channelFilter === "todos" ? comandas : comandas.filter((c) => (c.entry.channel || "comedor") === channelFilter)
    if (mesaFilter !== "todas") rows = rows.filter((c) => c.entry.mesaId === mesaFilter)
    return rows.slice().sort((a, b) => (sortNewest ? b.time - a.time : a.time - b.time))
  }, [comandas, channelFilter, mesaFilter, sortNewest])

  // Mesas ocupadas del día (para el filtro)
  const mesasOcupadas = useMemo(() => {
    const usedIds = new Set(dayEntries.filter((e) => e.mesaId).map((e) => e.mesaId))
    return mesas.filter((m) => usedIds.has(m.id)).map((m) => ({ id: m.id, nombre: m.nombre }))
  }, [dayEntries, mesas])

  const mesaNombre = (id?: string) => (id ? mesas.find((m) => m.id === id)?.nombre || id : "")

  const byStatus = useMemo(() => {
    const map: Record<StatusKey, typeof filtered> = {
      pendiente: [],
      "en-cocina": [],
      listo: [],
    }
    filtered.forEach((c) => map[c.status as StatusKey].push(c))
    return map
  }, [filtered])

  const activeCount = comandas.filter((c) => c.status !== "listo").length
  const cookingCount = comandas.filter((c) => c.status === "en-cocina").length
  const listoCount = comandas.filter((c) => c.status === "listo").length

  // Production report: includes all "listo" comandas of the day (even hidden)
  const prodStats = useMemo(() => {
    const listos = dayEntries
      .map((e) => ({ e, s: statuses[e.id] }))
      .filter((x): x is { e: SaleEntryLike; s: ComandaStatus } => !!x.s && x.s.status === "listo")
    if (listos.length === 0) return { count: 0, avgMin: 0, totalMin: 0 }
    const totalMin = listos.reduce((sum, { e, s }) => {
      const start = s.startedAt || entryTime(e)
      const ready = s.readyAt || now
      return sum + Math.max(0, (ready - start) / 60000)
    }, 0)
    return { count: listos.length, avgMin: totalMin / listos.length, totalMin }
  }, [dayEntries, statuses, now])

  // "En producción ahora": group en-cocina by dishName with live elapsed average
  const inProduction = useMemo(() => {
    const map = new Map<string, InProductionGroup>()
    comandas.forEach((c) => {
      if (c.status !== "en-cocina") return
      const cur = map.get(c.entry.dishName)
      if (cur) {
        cur.count += c.entry.quantity
        cur.avgMin += now - (c.startedAt || c.time)
      } else {
        map.set(c.entry.dishName, { dishName: c.entry.dishName, count: c.entry.quantity, avgMin: now - (c.startedAt || c.time) })
      }
    })
    return Array.from(map.values()).map((g) => ({ ...g, avgMin: Math.max(0, g.avgMin / g.count / 60000) }))
  }, [comandas, now])

  // Average production time per dish over all "listo" comandas of the day
  const dishAvgTimes = useMemo(() => {
    const map = new Map<string, DishAvgTime>()
    dayEntries.forEach((e) => {
      const s = statuses[e.id]
      if (!s || s.status !== "listo") return
      const start = s.startedAt || entryTime(e)
      const ready = s.readyAt || now
      const mins = Math.max(0, (ready - start) / 60000)
      const cur = map.get(e.dishName)
      if (cur) {
        cur.count += 1
        cur.avgMin += mins
      } else {
        map.set(e.dishName, { dishName: e.dishName, count: 1, avgMin: mins })
      }
    })
    return Array.from(map.values())
      .map((g) => ({ dishName: g.dishName, count: g.count, avgMin: g.avgMin / g.count }))
      .sort((a, b) => b.avgMin - a.avgMin)
      .slice(0, 5)
  }, [dayEntries, statuses, now])

  const setComandaStatus = (id: string, patch: Partial<ComandaStatus> & { status: ComandaStatus["status"] }) => {
    setStatuses((prev) => {
      const base = prev[id] || { status: "pendiente" as const }
      return { ...prev, [id]: { ...base, ...patch } }
    })
  }

  const iniciar = (id: string, name: string) => {
    setComandaStatus(id, { status: "en-cocina", startedAt: nowMs() })
    toast(t("comanda.toastInKitchen", { name }), "success")
  }

  const listo = (id: string, name: string) => {
    setComandaStatus(id, { status: "listo", readyAt: nowMs() })
    toast(t("comanda.toastReady", { name }), "success")
  }

  const revertir = (id: string) => {
    setComandaStatus(id, { status: "pendiente", startedAt: undefined, readyAt: undefined })
    toast(t("comanda.toastReverted"), "warning")
  }

  const limpiarListos = () => {
    const ids = new Set(dayEntries.map((e) => e.id))
    setStatuses((prev) => {
      const next: Record<string, ComandaStatus> = {}
      Object.keys(prev).forEach((k) => {
        const entry = prev[k]!
        next[k] = ids.has(k) && entry.status === "listo" ? { ...entry, hidden: true } : entry
      })
      return next
    })
    toast(t("comanda.toastCleared"), "success")
  }

  const copyReporte = () => {
    const lines = [
      t("comanda.reportHeader", { date: dateLabel(selectedDate), collection: selectedCollection?.name || "" }),
      "",
      t("comanda.reportCounts", { active: activeCount, cooking: cookingCount, ready: listoCount }),
      prodStats.count > 0
        ? t(prodStats.count > 1 ? "comanda.reportAvgMany" : "comanda.reportAvgOne", { min: prodStats.avgMin.toFixed(0), count: prodStats.count })
        : t("comanda.reportAvgNone"),
      ...(inProduction.length > 0
        ? ["", t("comanda.reportInProduction"), ...inProduction.map((g) => t("comanda.reportDishLine", { name: g.dishName, count: g.count, min: g.avgMin.toFixed(0) }))]
        : []),
      ...(dishAvgTimes.length > 0
        ? ["", t("comanda.reportTimes"), ...dishAvgTimes.map((g) => t("comanda.reportTimeLine", { name: g.dishName, min: g.avgMin.toFixed(0), count: g.count }))]
        : []),
      ...(filtered.some((f) => f.entry.modificadores?.length)
        ? ["", t("comanda.reportModifiers"), ...filtered.filter((f) => f.entry.modificadores?.length).map((f) => t("comanda.reportModifierLine", { name: f.entry.dishName, mods: f.entry.modificadores!.map((m) => m.nombre).join(", "), qty: f.entry.quantity }))]
        : []),
      "",
      ...CHANNELS.filter((c) => filtered.some((f) => (f.entry.channel || "comedor") === c.key))
        .map((c) => `${c.icon} ${c.label}: ${filtered.filter((f) => (f.entry.channel || "comedor") === c.key).length}`),
      "",
      t("comanda.reportFooter"),
    ]
    navigator.clipboard.writeText(lines.join("\n"))
    toast(t("comanda.toastReportCopied"), "success")
  }

  // Ctrl+N → focus the new-sale CTA
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault()
        document.getElementById("comanda-nueva-venta")?.focus()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <ChefHat className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">{t("comanda.selectCuisineTitle")}</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          {t("comanda.selectCuisineDescription")}
        </p>
      </div>
    )
  }

  return (
    <div>
      <ComandaHeader
        collectionName={selectedCollection.name}
        hasComandas={comandas.length > 0}
        onCopyReporte={copyReporte}
      />

      <ComandaControls
        selectedDate={selectedDate}
        onDateChange={(d) => setSelectedDate(d)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sortNewest={sortNewest}
        onSortNewestToggle={() => setSortNewest(!sortNewest)}
        listoCount={listoCount}
        onLimpiarListos={limpiarListos}
      />

      <ChannelFilters
        channelFilter={channelFilter}
        onChannelFilterChange={setChannelFilter}
        mesaFilter={mesaFilter}
        onMesaFilterChange={setMesaFilter}
        comandas={comandas}
        mesasOcupadas={mesasOcupadas}
      />

      <ProductionStats
        activeCount={activeCount}
        cookingCount={cookingCount}
        listoCount={listoCount}
        avgMin={prodStats.avgMin}
        hasProd={prodStats.count > 0}
      />

      <ProductionInsights inProduction={inProduction} dishAvgTimes={dishAvgTimes} />

      {dayEntries.length === 0 ? (
        <ComandaEmpty dayEntriesLength={0} filteredLength={filtered.length} />
      ) : viewMode === "board" ? (
        <KitchenBoard
          byStatus={byStatus}
          now={now}
          onIniciar={iniciar}
          onListo={listo}
          onRevertir={revertir}
          mesaNombre={mesaNombre}
        />
      ) : (
        <ComandaList
          filtered={filtered}
          now={now}
          onIniciar={iniciar}
          onListo={listo}
          onRevertir={revertir}
          mesaNombre={mesaNombre}
        />
      )}

      {dayEntries.length > 0 && filtered.length === 0 && (
        <ComandaEmpty dayEntriesLength={dayEntries.length} filteredLength={filtered.length} />
      )}
      <ToolGuideHost toolKey="comanda" pathname="/panel/comanda" slug={slug} icon="👨‍🍳" title="Comanda (cocina)" subtitle={selectedCollection.name} />
    </div>
  )
}
