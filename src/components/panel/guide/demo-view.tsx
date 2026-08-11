"use client"

import type { ToolDemoConfig } from "./tool-demo"

interface DemoViewProps {
  demo: ToolDemoConfig
  icon?: string
  title?: string
  subtitle?: string
}

/**
 * Vista de presentación del modo demo: renderiza las estadísticas y listas
 * del dataset de ejemplo como si la herramienta estuviera en activo.
 * Es 100% presentación — no hay inputs ni escrituras.
 */
export default function DemoView({ demo, icon, title, subtitle }: DemoViewProps) {
  const toneText = {
    default: "text-gray-900",
    positive: "text-[#0E7A0E]",
    warning: "text-amber-600",
    danger: "text-red-600",
  } as const

  return (
    <div className="space-y-6">
      {title && (
        <div className="flex items-center gap-3">
          {icon && <span className="text-3xl" aria-hidden>{icon}</span>}
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
          </div>
        </div>
      )}

      {demo.stats && demo.stats.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {demo.stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs font-medium text-gray-400 mb-1.5">{s.label}</p>
              <p className={`text-xl font-bold ${toneText[s.tone ?? "default"]}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {demo.list && demo.list.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {demo.list.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg w-7 text-center shrink-0" aria-hidden>{item.emoji ?? "•"}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${toneText[item.tone ?? "default"]}`}>{item.title}</p>
                  <p className="text-xs text-gray-400">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {demo.form && demo.form.length > 0 && (
        <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4 space-y-3">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
            Así se pre-llenarían tus formularios
          </p>
          <div className="space-y-2">
            {demo.form.map((f) => (
              <div key={f.label} className="bg-white rounded-lg border border-emerald-100 px-3 py-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-gray-400">{f.label}</span>
                <span className="text-[12px] font-semibold text-gray-800">{f.value}</span>
              </div>
            ))}
          </div>
          <p className="text-[9.5px] leading-snug text-emerald-800/80">
            Estos son datos de ejemplo para que veas cómo se verá tu herramienta en activo.
          </p>
        </div>
      )}
    </div>
  )
}
