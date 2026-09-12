"use client"

// Tarjeta de primeros pasos del hub: guía al restaurante nuevo por el loop
// mínimo viable (costeo → inventario → primera venta → auto-descuento).
// Se oculta sola cuando todo está completo y se puede descartar (persistido
// por colección en `hub-onboarding-dismissed`).

import Link from "next/link"
import { CheckCircle2, Circle, X, Sparkles } from "lucide-react"

export interface GettingStartedStep {
  key: string
  label: string
  description: string
  href: string
  done: boolean
}

export default function GettingStartedCard({
  steps,
  onDismiss,
}: {
  steps: GettingStartedStep[]
  onDismiss: () => void
}) {
  const doneCount = steps.filter((s) => s.done).length

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-100 p-4 sm:p-5 mb-4 sm:mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <h3 className="font-bold text-gray-900 text-sm">Primeros pasos</h3>
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
            {doneCount}/{steps.length}
          </span>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Ocultar primeros pasos"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                step.done
                  ? "bg-white/50 text-gray-400"
                  : "bg-white border border-emerald-100 hover:border-emerald-300 hover:shadow-sm"
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-gray-300 shrink-0" />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${step.done ? "line-through" : "text-gray-900"}`}>
                  {i + 1}. {step.label}
                </p>
                {!step.done && (
                  <p className="text-xs text-gray-400 truncate">{step.description}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
