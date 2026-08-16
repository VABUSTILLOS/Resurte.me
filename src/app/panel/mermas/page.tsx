"use client"

import { useState, useMemo, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { usePanelConfig } from "@/lib/panel-config"
import { useToast } from "@/components/toast"
import { Trash2 } from "lucide-react"
import { isCurrentMonth } from "@/lib/panel-utils"
import { CAUSAS, nextWasteId } from "@/components/panel/mermas/mermas-shared"
import type { WasteEntry } from "@/components/panel/mermas/mermas-shared"
import MermaHeader from "@/components/panel/mermas/merma-header"
import DateFilter from "@/components/panel/mermas/date-filter"
import type { DateFilterValue } from "@/components/panel/mermas/date-filter"
import TotalLossBanner from "@/components/panel/mermas/total-loss-banner"
import MermaEntriesList from "@/components/panel/mermas/merma-entries-list"
import MermaForm from "@/components/panel/mermas/merma-form"
import CategoryBreakdown from "@/components/panel/mermas/category-breakdown"
import TopCauses from "@/components/panel/mermas/top-causes"
import TrendsPanel from "@/components/panel/mermas/trends-panel"
import MonthlyGoal from "@/components/panel/mermas/monthly-goal"
import TipsPanel from "@/components/panel/mermas/tips-panel"
import DeleteConfirmModal from "@/components/panel/mermas/delete-confirm-modal"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"

export default function MermasPage() {
  const { selectedCollection } = useRestaurant()
  const { toast } = useToast()
  const slug = selectedCollection?.slug || null
  const [entries, setEntries] = useLocalStorage<WasteEntry[]>("mermas-entries", [], slug)
  const [showForm, setShowForm] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("frutas_verduras")
  const [amountKg, setAmountKg] = useState("")
  const [costPerKg, setCostPerKg] = useState("")
  const [note, setNote] = useState("")
  const [selectedCause, setSelectedCause] = useState("preparacion")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedTip, setExpandedTip] = useState<string | null>(null)
  const [showTrends, setShowTrends] = useState(false)
  const [showTrendChart, setShowTrendChart] = useState(false)
  const [showMonthlyGoal, setShowMonthlyGoal] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [dateFilter, setDateFilter] = useState<DateFilterValue>("all")
  const [monthlyGoal, setMonthlyGoal] = useLocalStorage<number>("merma-monthly-goal", 0, slug)
  const panelCfg = usePanelConfig(slug)

  // Filtro por rango de fechas — calculado siempre (nunca después de un early return)
  const filteredEntries = useMemo(() => {
    if (dateFilter === "all") return entries
    const now = new Date()
    const cutoff = new Date()
    if (dateFilter === "week") cutoff.setDate(now.getDate() - 7)
    else if (dateFilter === "month") cutoff.setDate(now.getDate() - 30)
    return entries.filter((e) => new Date(e.date) >= cutoff)
  }, [entries, dateFilter])

  function resetForm() {
    setAmountKg("")
    setCostPerKg("")
    setNote("")
    setSelectedCause(CAUSAS[0]!.key)
    setEditingId(null)
  }

  function addEntry() {
    const kg = parseFloat(amountKg)
    const cost = parseFloat(costPerKg)
    if (!selectedCategory || !selectedCause) {
      toast("Selecciona categoría y causa", "error")
      return
    }
    if (isNaN(kg) || kg <= 0) {
      toast("La cantidad debe ser mayor a 0 kg", "error")
      return
    }
    if (isNaN(cost) || cost < 0) {
      toast("El costo por kg no puede ser negativo", "error")
      return
    }

    if (editingId) {
      setEntries((prev) => prev.map((e) => e.id === editingId ? {
        ...e,
        category: selectedCategory,
        cause: selectedCause,
        amountKg: kg,
        costPerKg: cost,
        note: note.trim() || undefined,
      } : e))
      toast("Entrada de merma actualizada", "success")
    } else {
      setEntries((prev) => [...prev, {
        id: nextWasteId(),
        category: selectedCategory,
        cause: selectedCause,
        amountKg: kg,
        costPerKg: cost,
        date: new Date().toISOString(),
        note: note.trim() || undefined,
      }])
      toast("Entrada de merma registrada", "warning")
    }
    resetForm()
    setShowForm(false)
  }

  function startEditEntry(entry: WasteEntry) {
    setEditingId(entry.id)
    setSelectedCategory(entry.category)
    setSelectedCause(entry.cause || CAUSAS[0]!.key)
    setAmountKg(String(entry.amountKg))
    setCostPerKg(String(entry.costPerKg))
    setNote(entry.note || "")
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    resetForm()
  }

  function removeEntry(id: string) {
    setDeleteConfirmId(id)
  }

  function confirmDeleteEntry() {
    if (deleteConfirmId) {
      setEntries((prev) => prev.filter((e) => e.id !== deleteConfirmId))
      toast("Entrada de merma eliminada", "error")
      setDeleteConfirmId(null)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault()
        setShowForm(true)
        setEditingId(null)
        setAmountKg("")
        setCostPerKg("")
        setNote("")
        setSelectedCause(CAUSAS[0]!.key)
      }
      if (e.key === "Escape") {
        if (deleteConfirmId) setDeleteConfirmId(null)
        else if (showForm) cancelForm()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  // Warn before leaving if the add/edit form has unsaved changes
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (showForm) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [showForm])

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <Trash2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Selecciona tu tipo de restaurante para recibir consejos de reducción de merma personalizados.
        </p>
      </div>
    )
  }

  const totalLoss = filteredEntries.reduce((sum, e) => sum + (e.amountKg * e.costPerKg), 0)
  const monthLoss = entries
    .filter((e) => isCurrentMonth(e.date))
    .reduce((sum, e) => sum + e.amountKg * e.costPerKg, 0)
  const goalProgress = monthlyGoal > 0 ? (monthLoss / monthlyGoal) * 100 : 0

  return (
    <div>
      <MermaHeader collectionName={selectedCollection.name} />

      <DateFilter
        dateFilter={dateFilter}
        onFilterChange={setDateFilter}
        filteredCount={filteredEntries.length}
        totalCount={entries.length}
      />

      <TotalLossBanner totalLoss={totalLoss} entryCount={filteredEntries.length} />

      <MermaEntriesList
        entries={filteredEntries}
        showEmptyState={filteredEntries.length === 0 && !showForm}
        onOpenForm={() => setShowForm(true)}
        onEdit={startEditEntry}
        onDelete={removeEntry}
      />

      <MermaForm
        showForm={showForm}
        editingId={editingId}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        amountKg={amountKg}
        onAmountKgChange={setAmountKg}
        costPerKg={costPerKg}
        onCostPerKgChange={setCostPerKg}
        note={note}
        onNoteChange={setNote}
        selectedCause={selectedCause}
        onCauseChange={setSelectedCause}
        onSave={addEntry}
        onCancel={cancelForm}
        onOpenForm={() => setShowForm(true)}
      />

      {entries.length > 0 && (
        <>
          <CategoryBreakdown
            entries={entries}
            totalLoss={totalLoss}
            open={showTrends}
            onToggle={() => setShowTrends(!showTrends)}
          />
          <TopCauses entries={entries} totalLoss={totalLoss} />
        </>
      )}

      {entries.length > 0 && (
        <TrendsPanel
          entries={entries}
          monthlyGoal={monthlyGoal}
          open={showTrendChart}
          onToggle={() => setShowTrendChart(!showTrendChart)}
        />
      )}

      <MonthlyGoal
        monthlyGoal={monthlyGoal}
        monthLoss={monthLoss}
        goalProgress={goalProgress}
        mermaMaxPct={panelCfg.mermaMaxPct}
        open={showMonthlyGoal}
        onToggle={() => setShowMonthlyGoal(!showMonthlyGoal)}
        onGoalChange={setMonthlyGoal}
      />

      <TipsPanel expandedTip={expandedTip} onToggleTip={(key) => setExpandedTip(expandedTip === key ? null : key)} />

      <div className="mt-4 bg-amber-50 rounded-xl p-4 border border-amber-100">
        <p className="text-xs text-amber-700">
          <strong>💡 Sabías que:</strong> La merma promedio en restaurantes mexicanos es del 8-12% del costo de alimentos. 
          Reducirla solo 2 puntos porcentuales puede aumentar tu utilidad neta hasta un 15%. 
          Resurte.me te ayuda con entregas frecuentes para que compres solo lo que necesitas.
        </p>
      </div>

      {deleteConfirmId && (
        <DeleteConfirmModal
          onConfirm={confirmDeleteEntry}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
      <ToolGuideHost toolKey="mermas" pathname="/panel/mermas" slug={slug} icon="🗑️" title="Control de mermas" subtitle={selectedCollection.name} />
    </div>
  )
}
