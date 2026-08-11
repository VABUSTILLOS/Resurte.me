"use client"

import type { ExampleField } from "./tool-guides"
import { GUIDE_NOTICE } from "./tool-guides"

interface ExampleMockProps {
  fields: ExampleField[]
  title?: string
}

/**
 * Mockup de campos llenos con data de ejemplo. Incluye el sello
 * "Datos de ejemplo" y la nota aclaratoria para que el usuario entienda
 * que solo está visualizando cómo se verá la herramienta en activo.
 */
export default function ExampleMock({ fields, title }: ExampleMockProps) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
          {title ?? "Vista previa"}
        </p>
        <span className="text-[9px] font-bold text-white bg-emerald-600 px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
          Datos de ejemplo
        </span>
      </div>
      <div className="rounded-lg bg-white border border-emerald-100 overflow-hidden">
        <div className="divide-y divide-gray-50">
          {fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
              <span className="text-[10px] text-gray-400">{f.label}</span>
              <span className="text-[11px] font-semibold text-gray-800 text-right">{f.value}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[9.5px] leading-snug text-emerald-800/80">{GUIDE_NOTICE}</p>
    </div>
  )
}
