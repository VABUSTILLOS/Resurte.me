"use client"

import { useState } from "react"
import { useVentasPage } from "@/hooks/use-ventas-page"
import { t } from "@/lib/i18n/es"
import { entryTotal } from "@/components/panel/ventas/ventas-shared"
import { todayStr, dateLabel, toNonNegativeNumber } from "@/lib/panel-utils"
import Link from "next/link"
import { ArrowLeft, Copy, Flame, AlertCircle, Receipt } from "lucide-react"
import SalesGoals from "@/components/panel/ventas/SalesGoals"
import SaleForm from "@/components/panel/ventas/SaleForm"
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
import ConfirmDialog from "@/components/panel/ConfirmDialog"
import AppOrdersCard from "@/components/panel/ventas/app-orders-card"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"

export default function VentasPage() {
  const {
    // context
    selectedCollection,
    sharedDishes,
    panelCfg,
    toast,
    // state
    entries,
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
    weekTrend,
    allTimeStats,
    fraudAlerts,
    reportEntries,
    reportStats,
    reportTop,
    reportMethods,
    reportChannels,
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
  } = useVentasPage()

  const slug = selectedCollection?.slug ?? null
  const [tab, setTab] = useState<"hoy" | "analisis" | "extras">("hoy")

  const exportVentasCsv = () => {
    if (reportEntries.length === 0) return
    const header = "Fecha,Platillo,Cantidad,Precio unitario,Costo unitario,Total,Método de pago,Canal,Descuento"
    const rows = reportEntries.map((e) => {
      const discount = e.quantity * e.unitPrice - entryTotal(e)
      return [
        e.date,
        `"${e.dishName.replace(/"/g, '""')}"`,
        e.quantity,
        e.unitPrice.toFixed(2),
        e.unitCost.toFixed(2),
        entryTotal(e).toFixed(2),
        e.paymentMethod,
        e.channel,
        discount.toFixed(2),
      ].join(",")
    })
    const csv = [header, ...rows].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `ventas-${reportPeriod}-${slug || "panel"}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast("Ventas exportadas a CSV", "success")
  }

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

      {/* Mostrador vs. pedidos reales de la app (solo si hay restaurante FoodOS) */}
      <AppOrdersCard
        counterCount={entries.filter((e) => e.date.startsWith(todayStr())).length}
        counterRevenue={entries.filter((e) => e.date.startsWith(todayStr())).reduce((s, e) => s + entryTotal(e), 0)}
      />

      {/* ── Tabs: Hoy / Análisis / Extras ────────────────── */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit max-w-full overflow-x-auto" role="tablist" aria-label="Secciones de ventas">
        {([
          ["hoy", "Hoy"],
          ["analisis", "Análisis"],
          ["extras", "Extras"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "hoy" && (
        <>
          {/* ── Register sale form ───────────────────────────── */}
          <SaleForm
            sharedDishes={sharedDishes}
            entries={entries}
            clientes={clientesCrud.clientes}
            mesas={mesasCrud.mesas}
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

              <EntriesList
                showAll={showAll}
                entriesCount={entries.length}
                dayEntriesCount={dayEntries.length}
                units={dayStats.units}
                selectedDateLabel={dateLabel(selectedDate)}
                visibleEntries={visibleEntries}
                clientes={clientesCrud.clientes}
                dishCost={dishCost}
                onAdjustQty={adjustQty}
                onDeleteClick={(id) => setDeleteConfirm(id)}
              />
            </>
          )}
        </>
      )}

      {tab === "analisis" && (
        <>
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
            onToggle={toggleGoals}
            onGoalFormDiaChange={setGoalFormDia}
            onGoalFormMesChange={setGoalFormMes}
            onSave={saveGoals}
            onComisionChange={(key, value) =>
              setComisiones((prev) => ({ ...prev, [key]: toNonNegativeNumber(value) }))
            }
          />

          {entries.length > 0 && (
            <>
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
                onExportCsv={exportVentasCsv}
              />

              <div className="grid lg:grid-cols-2 gap-6 mb-6">
                <WeekTrend weekTrend={weekTrend} />
                <TopSellers
                  topSellers={topSellers}
                  totalUnits={dayStats.units}
                  selectedDateLabel={dateLabel(selectedDate)}
                />
              </div>
            </>
          )}

          {/* All-time tip */}
          <AllTimeTip
            hasEntries={entries.length > 0}
            allTimeStats={allTimeStats}
            foodCostRedAbove={panelCfg.foodCostRedAbove}
          />
        </>
      )}

      {tab === "extras" && (
        <>
          {/* ── Clientes frecuentes ──────────────────────────── */}
          <FrequentCustomers
            crud={clientesCrud}
            puntosTasa={puntosTasa}
            puntosCanje={puntosCanje}
            tipoCambio={tipoCambio}
            onCopy={copyClientes}
            onPuntosTasaChange={setPuntosTasa}
            onPuntosCanjeChange={setPuntosCanje}
            onTipoCambioChange={setTipoCambio}
          />

          {/* ── Mesas del salón ──────────────────────────────── */}
          <DiningTables crud={mesasCrud} mesasOcupadasHoy={mesasOcupadasHoy} now={now} />

          {/* ── Reloj checador ───────────────────────────────── */}
          <RelojChecador
            crud={empleadosCrud}
            empleadoCount={empleadosCrud.empleados.length}
            empleadosHoy={empleadosHoy}
            fichajesHoy={fichajesHoy}
            selectedDate={selectedDate}
            onCopyHoras={copyHoras}
          />

          {/* ── Tarjetas de regalo ───────────────────────────── */}
          <GiftCards crud={tarjetasCrud} />

          {/* ── Antifraud alerts ─────────────────────────────── */}
          <AntifraudAlerts
            fraudAlerts={fraudAlerts}
            ticketThreshold={ticketThreshold}
            tipoCambio={tipoCambio}
            onTicketThresholdChange={setTicketThreshold}
            onTipoCambioChange={setTipoCambio}
          />
        </>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title="¿Eliminar esta venta?"
        message={deductStock
          ? "Esta acción no se puede deshacer. El stock que se descontó al registrar esta venta no se repondrá automáticamente."
          : "Esta acción no se puede deshacer."}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => { if (deleteConfirm) deleteEntry(deleteConfirm) }}
      />

      {/* Guía paso a paso + modo demo */}
      <ToolGuideHost
        toolKey="ventas"
        pathname="/panel/ventas"
        slug={slug}
        icon="🧾"
        title="Ventas del día"
        subtitle={selectedCollection.name}
      />
    </div>
  )
}
