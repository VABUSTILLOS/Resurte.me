"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useEscapeKey } from "@/hooks/use-escape-key"
import { trackEvent } from "@/lib/analytics"
import {
  Store,
  ChefHat,
  Coffee,
  Pizza,
  UtensilsCrossed,
  Sparkles,
  ArrowRight,
  Check,
  Zap,
  ShoppingCart,
  X,
} from "lucide-react"

const ONBOARDING_KEY = "onboarding-wizard-completed"

type BusinessType = "taqueria" | "fonda" | "restaurante" | "cafeteria" | "pizzeria" | "otro"

interface BusinessOption {
  id: BusinessType
  label: string
  icon: typeof Store
  emoji: string
}

const BUSINESS_OPTIONS: BusinessOption[] = [
  { id: "taqueria", label: "Taquería", icon: ChefHat, emoji: "🌮" },
  { id: "fonda", label: "Fonda / Cocina económica", icon: UtensilsCrossed, emoji: "🍲" },
  { id: "restaurante", label: "Restaurante", icon: Store, emoji: "🍽️" },
  { id: "cafeteria", label: "Cafetería", icon: Coffee, emoji: "☕" },
  { id: "pizzeria", label: "Pizzería", icon: Pizza, emoji: "🍕" },
  { id: "otro", label: "Otro", icon: Store, emoji: "🏪" },
]

const BUDGET_OPTIONS = [
  { value: 5000, label: "$5,000", desc: "Negocio pequeño" },
  { value: 15000, label: "$15,000", desc: "Negocio mediano" },
  { value: 35000, label: "$35,000", desc: "Negocio grande" },
  { value: 70000, label: "$70,000+", desc: "Alto volumen" },
]

const CATEGORY_OPTIONS = [
  { id: "frutas-verduras", label: "Frutas y Verduras", emoji: "🥬" },
  { id: "carnes-aves", label: "Carnes y Aves", emoji: "🥩" },
  { id: "abarrotes", label: "Abarrotes", emoji: "📦" },
  { id: "lacteos", label: "Lácteos y Huevos", emoji: "🧀" },
  { id: "bebidas", label: "Bebidas", emoji: "🥤" },
  { id: "panaderia", label: "Panadería", emoji: "🍞" },
  { id: "limpieza", label: "Limpieza", emoji: "🧹" },
  { id: "congelados", label: "Congelados", emoji: "❄️" },
]

interface OnboardingData {
  businessType: BusinessType | null
  monthlyBudget: number
  categories: string[]
  completedAt: string | null
}

const STEPS = [
  { id: "business", title: "¿Qué tipo de negocio tienes?", subtitle: "Selecciona la opción que mejor describa tu restaurante" },
  { id: "budget", title: "¿Cuánto gastas al mes en insumos?", subtitle: "Esto nos ayuda a recomendarte productos adecuados" },
  { id: "categories", title: "¿Qué productos compras más?", subtitle: "Selecciona tus categorías principales" },
  { id: "done", title: "¡Todo listo!", subtitle: "Estamos listos para ayudarte a crecer" },
]

export function OnboardingWizard({
  onComplete,
  startVisible = false,
}: {
  onComplete?: () => void
  startVisible?: boolean
}) {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  )
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(startVisible)
  const [data, setData] = useState<OnboardingData>({
    businessType: null,
    monthlyBudget: 15000,
    categories: [],
    completedAt: null,
  })
  const [saving, setSaving] = useState(false)

  // Check if onboarding is needed
  useEffect(() => {
    if (!supabase) return

    // El gate ya verificó sesión+localStorage; solo falta el trackEvent.
    if (startVisible) {
      trackEvent("onboarding_wizard_start", { step: 0 })
      return
    }

    async function check() {
      // Check localStorage first
      const completed = localStorage.getItem(ONBOARDING_KEY)
      if (completed === "true") {
        setVisible(false)
        return
      }

      // Check if user is authenticated
      const { data: { session } } = await supabase!.auth.getSession()
      if (!session?.user?.id) {
        setVisible(false)
        return
      }

      // Show onboarding
      setVisible(true)
      trackEvent("onboarding_wizard_start", { step: 0 })
    }

    // Small delay so page renders first
    const timer = setTimeout(check, 800)
    return () => clearTimeout(timer)
  }, [supabase, startVisible])

  const currentStep = STEPS[step] ?? STEPS[0]!
  const isLast = step === STEPS.length - 1

  const handleNext = () => {
    trackEvent("onboarding_wizard_step_complete", {
      step: step,
      step_id: currentStep.id,
    })

    if (isLast) {
      finishOnboarding()
    } else {
      setStep((s) => s + 1)
    }
  }

  /**
   * Salto seguro del wizard. Guarda el flag de completado para que nunca más
   * vuelva a aparecer (red de seguridad: si el overlay llega a mostrarse por
   * cualquier vía —bundle viejo cacheado, ruta de comercio, condición nueva—,
   * el usuario siempre tiene salida y no queda atrapado sin poder ver el carrito).
   */
  const handleDismiss = () => {
    trackEvent("onboarding_wizard_dismiss", {
      step: step,
      step_id: currentStep.id,
    })
    localStorage.setItem(ONBOARDING_KEY, "true")
    setVisible(false)
    onComplete?.()
  }

  const finishOnboarding = async () => {
    setSaving(true)
    trackEvent("onboarding_wizard_complete", {
      business_type: data.businessType ?? undefined,
      monthly_budget: data.monthlyBudget,
      categories: data.categories,
    })

    // Save to localStorage
    const onboardingData: OnboardingData = {
      ...data,
      completedAt: new Date().toISOString(),
    }
    localStorage.setItem(ONBOARDING_KEY, "true")
    localStorage.setItem("onboarding-wizard-data", JSON.stringify(onboardingData))

    // Try to save to profiles if possible
    if (supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.id) {
          await supabase
            .from("profiles")
            .upsert({
              id: session.user.id,
              metadata: {
                onboarding: onboardingData,
              },
            })
        }
      } catch {
        // Silent fail — localStorage is the source of truth
      }
    }

    setSaving(false)
    setVisible(false)
    onComplete?.()
  }

  const toggleCategory = (catId: string) => {
    setData((prev) => ({
      ...prev,
      categories: prev.categories.includes(catId)
        ? prev.categories.filter((c) => c !== catId)
        : [...prev.categories, catId],
    }))
  }

  useEscapeKey(handleDismiss, visible)

  if (!visible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Asistente de bienvenida"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header with progress */}
          <div className="px-6 pt-6 pb-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wider opacity-80">
                  Configuración inicial
                </span>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Cerrar configuración inicial"
                className="p-1.5 -m-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <h2 className="text-lg font-bold">{currentStep.title}</h2>
            <p className="text-emerald-100 text-xs mt-0.5">{currentStep.subtitle}</p>

            {/* Step pills */}
            <div className="flex gap-1.5 mt-4 pb-2">
              {STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className={`flex-1 h-1 rounded-full transition-colors ${
                    i <= step ? "bg-white" : "bg-white/20"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <AnimatePresence mode="wait">
              {/* Step 0: Business Type */}
              {step === 0 && (
                <motion.div
                  key="business"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="grid grid-cols-2 gap-3"
                >
                  {BUSINESS_OPTIONS.map((opt) => {
                    const selected = data.businessType === opt.id
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setData((d) => ({ ...d, businessType: opt.id }))}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          selected
                            ? "border-emerald-500 bg-emerald-50 shadow-sm"
                            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <span className="text-3xl">{opt.emoji}</span>
                        <span className={`text-xs font-semibold ${
                          selected ? "text-emerald-700" : "text-gray-700"
                        }`}>
                          {opt.label}
                        </span>
                      </button>
                    )
                  })}
                </motion.div>
              )}

              {/* Step 1: Monthly Budget */}
              {step === 1 && (
                <motion.div
                  key="budget"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-3"
                >
                  {(() => {
                    return BUDGET_OPTIONS.map((opt) => {
                    const selected = data.monthlyBudget === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setData((d) => ({ ...d, monthlyBudget: opt.value }))}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                          selected
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className="text-left">
                          <p className={`font-bold text-lg ${
                            selected ? "text-emerald-700" : "text-gray-900"
                          }`}>
                            {opt.label}
                          </p>
                          <p className="text-xs text-gray-500">{opt.desc}</p>
                        </div>
                        {selected && (
                          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                      </button>
                    )
                    })
                  })()}

                  {/* Custom amount */}
                  {(() => {
                    const isCustom = !BUDGET_OPTIONS.find((b) => b.value === data.monthlyBudget)
                    return (
                  <div className={`rounded-xl border-2 p-4 ${
                    isCustom && data.monthlyBudget > 0
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-200 bg-white"
                  }`}>
                    <p className="text-xs text-gray-500 mb-2">O ingresa tu presupuesto exacto</p>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-bold">$</span>
                      <input
                        type="number"
                        value={isCustom ? data.monthlyBudget : ""}
                        onChange={(e) =>
                          setData((d) => ({ ...d, monthlyBudget: Number(e.target.value) || 0 }))
                        }
                        placeholder="Ej: 25000"
                        className="flex-1 text-lg font-bold text-gray-900 bg-transparent border-none outline-none placeholder:text-gray-300"
                      />
                      <span className="text-gray-400 text-sm">MXN/mes</span>
                    </div>
                  </div>
                    )
                  })()}
                </motion.div>
              )}

              {/* Step 2: Categories */}
              {step === 2 && (
                <motion.div
                  key="categories"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="grid grid-cols-2 gap-2.5"
                >
                  {CATEGORY_OPTIONS.map((cat) => {
                    const selected = data.categories.includes(cat.id)
                    return (
                      <button
                        key={cat.id}
                        onClick={() => toggleCategory(cat.id)}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all ${
                          selected
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <span className="text-xl">{cat.emoji}</span>
                        <span className={`text-xs font-semibold text-left leading-tight ${
                          selected ? "text-emerald-700" : "text-gray-700"
                        }`}>
                          {cat.label}
                        </span>
                        {selected && (
                          <Check className="w-3.5 h-3.5 text-emerald-500 ml-auto flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </motion.div>
              )}

              {/* Step 3: Done */}
              {step === 3 && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-4"
                >
                  <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <ShoppingCart className="w-9 h-9 text-emerald-600" />
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed max-w-xs mx-auto">
                    Basado en tu negocio{" "}
                    <strong className="text-emerald-600">
                      {BUSINESS_OPTIONS.find((b) => b.id === data.businessType)?.label || "de alimentos"}
                    </strong>
                    , te mostraremos los productos más relevantes para ti.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {data.categories.slice(0, 4).map((catId) => {
                      const cat = CATEGORY_OPTIONS.find((c) => c.id === catId)
                      return cat ? (
                        <span key={cat.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                          {cat.emoji} {cat.label}
                        </span>
                      ) : null
                    })}
                    {data.categories.length > 4 && (
                      <span className="text-xs text-gray-400 self-center">
                        +{data.categories.length - 4} más
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            {step > 0 && step < 3 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                ← Atrás
              </button>
            )}
            {step === 0 ? (
              <button
                type="button"
                onClick={handleDismiss}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                Ahora no
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleNext}
              disabled={
                (step === 0 && !data.businessType) ||
                (step === 1 && data.monthlyBudget <= 0) ||
                saving
              }
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                (step === 0 && !data.businessType) || (step === 1 && data.monthlyBudget <= 0) || saving
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
              }`}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Guardando...
                </>
              ) : isLast ? (
                <>
                  <Zap className="w-4 h-4" />
                  Comenzar
                </>
              ) : (
                <>
                  Siguiente
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Hook to check if onboarding wizard is completed.
 * Returns true once the user has finished the wizard.
 */
export function useOnboardingCompleted(): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem(ONBOARDING_KEY) === "true"
}
