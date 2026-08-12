"use client"

import { useCallback, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ChevronLeft, ChevronRight, X, HelpCircle, FlaskConical, Check,
} from "lucide-react"
import ExampleMock from "./example-mock"
import type { ToolGuideConfig } from "./tool-guides"
import { DEMO_BANNER_TEXT } from "./tool-demo"

interface ToolGuideProps {
  guide: ToolGuideConfig
  open: boolean
  onClose: () => void
  /** true si el usuario ya marcó "ya lo vi" antes (para ocultar el botón) */
  seen?: boolean
  /** Bandera del modo demo de la herramienta */
  demoOn?: boolean
  onToggleDemo?: () => void
  /** Permite ocultar el botón de demo (ej. cuando no hay data de ejemplo) */
  showDemoToggle?: boolean
  /** Persiste si el panel fue colapsado (usa el estado del hook) */
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

/**
 * Panel lateral fijo de guía paso a paso. En desktop es una barra lateral
 * derecha colapsable (no bloquea el uso de la herramienta); en mobile se
 * convierte en drawer con backdrop. Queda por encima de la top bar (z-40),
 * la navegación (z-40) y el overlay de demo (z-[80]).
 */
export default function ToolGuide({
  guide, open, onClose, demoOn = false,
  onToggleDemo, showDemoToggle = true, collapsed = false, onToggleCollapsed,
}: ToolGuideProps) {
  const [stepIndex, setStepIndex] = useState(0)

  const step = guide.steps[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === guide.steps.length - 1
  const progress = ((stepIndex + 1) / guide.steps.length) * 100

  const next = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, guide.steps.length - 1))
  }, [guide.steps.length])

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0))
  }, [])

  const handleDismiss = useCallback(() => {
    onClose()
  }, [onClose])

  const handleToggleDemo = useCallback(() => {
    onToggleDemo?.()
    if (!demoOn) onClose() // al activar el demo, cierra la guía para que vea la herramienta
  }, [onToggleDemo, demoOn, onClose])

  if (!step) return null

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop en mobile */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[85] bg-black/40 lg:hidden"
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: collapsed ? "calc(100% - 44px)" : 0 }}
            transition={{ type: "tween", duration: 0.25 }}
            className={`fixed top-0 right-0 bottom-0 z-[90] flex flex-col bg-white border-l border-gray-100 shadow-2xl lg:shadow-xl
              w-[calc(100vw-3rem)] max-w-sm lg:max-w-sm lg:w-96`}
            aria-label={`Guía paso a paso de ${guide.tool}`}
          >
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-gray-100">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl shrink-0" aria-hidden>{guide.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{guide.tool}</p>
                    <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                      <HelpCircle className="w-3 h-3" />
                      Guía paso a paso
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onToggleCollapsed && (
                    <button
                      onClick={onToggleCollapsed}
                      className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                      aria-label={collapsed ? "Expandir guía" : "Colapsar guía"}
                      title={collapsed ? "Expandir" : "Colapsar"}
                    >
                      <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                    aria-label="Cerrar guía"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress */}
              <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] font-medium text-gray-400">
                Paso {stepIndex + 1} de {guide.steps.length}
              </p>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.18 }}
                >
                  <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">{step.title}</h3>
                  <p className="text-[13px] leading-relaxed text-gray-500">{step.description}</p>

                  {step.example && step.example.length > 0 && (
                    <div className="mt-3">
                      <ExampleMock fields={step.example} title="Cómo se verá en activo" />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Demo toggle */}
              {showDemoToggle && (
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-[11px] font-bold text-amber-700">¿Quieres ver la herramienta con datos de ejemplo?</p>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-amber-700/80">
                    {DEMO_BANNER_TEXT}
                  </p>
                  <button
                    onClick={handleToggleDemo}
                    className={`mt-2.5 w-full text-xs font-bold rounded-lg px-3 py-2 transition-colors ${
                      demoOn
                        ? "bg-gray-900 text-white hover:bg-gray-700"
                        : "bg-amber-500 text-white hover:bg-amber-600"
                    }`}
                  >
                    {demoOn ? "Salir del modo demo" : "Ver con datos de ejemplo"}
                  </button>
                </div>
              )}
            </div>

            {/* Footer nav */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
              <button
                onClick={prev}
                disabled={isFirst}
                className="flex items-center gap-1 text-xs font-semibold text-gray-500 disabled:opacity-30 px-2.5 py-2 rounded-lg hover:bg-gray-50 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Atrás
              </button>

              <div className="flex-1" />

              {isLast ? (
                <button
                  onClick={handleDismiss}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-lg transition-colors"
                >
                  <Check className="w-4 h-4" />
                  ¡Listo!
                </button>
              ) : (
                <button
                  onClick={next}
                  className="flex items-center gap-1 text-xs font-bold text-white bg-gray-900 hover:bg-gray-700 px-3.5 py-2 rounded-lg transition-colors"
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
