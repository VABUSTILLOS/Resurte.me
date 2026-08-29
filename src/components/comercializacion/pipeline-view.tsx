"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronRight, ChevronLeft } from "lucide-react"
import { EmptyState } from "./ui"
import { useToast } from "@/components/toast"
import { updateProspect } from "@/lib/comercializacion/actions"
import {
  PROSPECT_STATUS_LABEL,
  type Prospect,
  type ProspectStatus,
} from "@/lib/comercializacion/types"

const PIPELINE_COLUMNS: ProspectStatus[] = [
  "nuevo",
  "contactado",
  "en_seguimiento",
  "cliente_activo",
  "inactivo",
  "perdido",
]

const COLUMN_ACCENT: Record<ProspectStatus, string> = {
  nuevo: "border-t-blue-400",
  contactado: "border-t-cyan-400",
  en_seguimiento: "border-t-amber-400",
  cliente_activo: "border-t-[#0E7A0E]",
  inactivo: "border-t-gray-300",
  perdido: "border-t-red-300",
}

export function PipelineView({
  prospects,
  onChanged,
}: {
  prospects: Prospect[]
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [updating, setUpdating] = useState<number | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<ProspectStatus | null>(null)

  async function moveStatus(p: Prospect, next: ProspectStatus) {
    if (next === p.status) return
    setUpdating(p.id)
    try {
      await updateProspect(p.id, { status: next })
      toast(`${p.name} → ${PROSPECT_STATUS_LABEL[next]}`)
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cambiar el estado", "error")
    } finally {
      setUpdating(null)
    }
  }

  function handleDrop(col: ProspectStatus) {
    setDropTarget(null)
    if (draggingId === null) return
    const prospect = prospects.find((p) => p.id === draggingId)
    setDraggingId(null)
    if (prospect) void moveStatus(prospect, col)
  }

  if (prospects.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100">
        <EmptyState
          title="No hay prospectos en el pipeline"
          subtitle="Crea prospectos o ajusta los filtros para ver el pipeline."
        />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-start">
      {PIPELINE_COLUMNS.map((col, colIdx) => {
        const items = prospects.filter((p) => p.status === col)
        const prevCol = colIdx > 0 ? PIPELINE_COLUMNS[colIdx - 1] : undefined
        const nextCol = colIdx < PIPELINE_COLUMNS.length - 1 ? PIPELINE_COLUMNS[colIdx + 1] : undefined
        return (
          <div
            key={col}
            onDragOver={(e) => {
              if (draggingId !== null) {
                e.preventDefault()
                if (dropTarget !== col) setDropTarget(col)
              }
            }}
            onDragLeave={() => {
              if (dropTarget === col) setDropTarget(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              handleDrop(col)
            }}
            className={`bg-gray-50 rounded-2xl border border-t-4 ${COLUMN_ACCENT[col]} p-2 min-h-[120px] transition-colors ${
              dropTarget === col
                ? "border-[#0E7A0E] bg-[#0E7A0E]/5"
                : "border-gray-100"
            }`}
          >
            <div className="flex items-center justify-between px-1.5 py-1">
              <p className="text-xs font-bold text-gray-700">
                {PROSPECT_STATUS_LABEL[col]}
              </p>
              <span className="text-[10px] font-bold text-gray-400 bg-white rounded-full px-1.5 py-0.5">
                {items.length}
              </span>
            </div>
            <ul className="space-y-2 mt-1">
              {items.map((p) => (
                <li
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(p.id)
                    e.dataTransfer.effectAllowed = "move"
                    e.dataTransfer.setData("text/plain", String(p.id))
                  }}
                  onDragEnd={() => {
                    setDraggingId(null)
                    setDropTarget(null)
                  }}
                  className={`bg-white rounded-xl border border-gray-100 shadow-sm p-2.5 cursor-grab active:cursor-grabbing ${
                    draggingId === p.id ? "opacity-40" : ""
                  }`}
                >
                  <Link
                    href={`/comercializacion/prospectos/${p.id}`}
                    className="block group"
                  >
                    <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#0E7A0E]">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {p.restaurant_name ?? p.phone ?? "—"}
                    </p>
                  </Link>
                  <div className="flex items-center justify-between mt-1.5">
                    {prevCol ? (
                      <button
                        onClick={() => moveStatus(p, prevCol)}
                        disabled={updating === p.id}
                        className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                        title={`Mover a ${PROSPECT_STATUS_LABEL[prevCol]}`}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span />
                    )}
                    {nextCol ? (
                      <button
                        onClick={() => moveStatus(p, nextCol)}
                        disabled={updating === p.id}
                        className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                        title={`Mover a ${PROSPECT_STATUS_LABEL[nextCol]}`}
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                </li>
              ))}
              {items.length === 0 ? (
                <li className="text-[11px] text-gray-300 text-center py-3">
                  Sin prospectos
                </li>
              ) : null}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
