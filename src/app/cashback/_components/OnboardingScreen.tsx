"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  TrendingUp,
  Store,
  ShoppingBag,
  Users,
  ArrowRight,
} from "lucide-react";
interface OnboardingScreenProps {
  onComplete: () => void;
}

const steps = [
  {
    id: "welcome",
    title: "Convierte tus compras en crecimiento",
    subtitle:
      "Cada vez que compras insumos para tu restaurante, acumulas saldo que puedes canjear por servicios de marketing y desarrollo web profesionales.",
    illustration: "🚀",
    stat: "+500 restauranteros ya están creciendo",
  },
  {
    id: "how-it-works",
    title: "Así de simple funciona",
    subtitle: "",
    illustration: "🔄",
    features: [
      { icon: ShoppingBag, label: "Compras tus insumos", desc: "Como siempre lo haces, con tus proveedores de confianza." },
      { icon: TrendingUp, label: "Acumulas cashback", desc: "5% del valor de tus facturas va a tu Cartera de Crecimiento." },
      { icon: Store, label: "Canjeas por servicios", desc: "Elige entre marketing digital, fotografía, o desarrollo web." },
    ],
  },
  {
    id: "business-info",
    title: "Cuéntanos de tu restaurante",
    subtitle: "Personalizamos las recomendaciones de crecimiento para tu negocio.",
    illustration: "🏪",
    fields: true,
  },
  {
    id: "auto-cashback",
    title: "Tu cashback es automático",
    subtitle: "Sin escanear tickets. Sin conectar proveedores. Cada compra en Resurte.me genera cashback al instante.",
    illustration: "⚡",
    autoInfo: true,
  },
];

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState(0);
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantType, setRestaurantType] = useState("");
  const [monthlySpend, setMonthlySpend] = useState(32000);

  const isLast = step === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Progress bar */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <motion.div
              key={i}
              className="flex-1 h-1 rounded-full overflow-hidden bg-gray-800"
            >
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.5, delay: i === step ? 0.2 : 0 }}
              />
            </motion.div>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-2 tabular-nums">
          {step + 1} / {steps.length}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-4 pt-8 pb-6">
        <AnimatePresence mode="wait">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="flex-1 flex flex-col items-center text-center"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="text-7xl mb-6"
              >
                🚀
              </motion.div>

              <h1 className="text-white text-3xl font-black leading-tight max-w-xs md:max-w-lg md:text-4xl">
                Convierte tus compras en crecimiento
              </h1>
              <p className="text-gray-400 text-sm mt-4 max-w-xs md:max-w-lg leading-relaxed md:text-base">
                Cada vez que compras insumos para tu restaurante, acumulas saldo que
                puedes canjear por servicios de marketing y desarrollo web.
              </p>

              <div className="mt-8 rounded-2xl bg-emerald-500/10 border border-emerald-500/15 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-400 text-sm font-medium">
                    +500 restauranteros ya están creciendo
                  </span>
                </div>
              </div>

              <p className="text-white text-3xl font-black leading-tight mt-6 max-w-xs md:max-w-lg md:text-4xl">
                Potencia tu negocio haciendo lo que ya haces
              </p>
            </motion.div>
          )}

          {/* Step 1: How it works */}
          {step === 1 && (
            <motion.div
              key="how"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="flex-1"
            >
              <div className="text-center mb-8">
                <span className="text-5xl">🔄</span>
                <h2 className="text-white text-2xl font-black mt-3">Así de simple funciona</h2>
              </div>

              <div className="space-y-4">
                {[
                  {
                    icon: ShoppingBag,
                    color: "bg-emerald-500/15 text-emerald-400",
                    label: "1. Compras tus insumos",
                    desc: "Como siempre lo has hecho, con tus proveedores de confianza.",
                  },
                  {
                    icon: TrendingUp,
                    color: "bg-amber-500/15 text-amber-400",
                    label: "2. Acumulas cashback",
                    desc: "El 5% del valor de tus facturas va directo a tu Cartera de Crecimiento.",
                  },
                  {
                    icon: Store,
                    color: "bg-violet-500/15 text-violet-400",
                    label: "3. Canjeas por servicios",
                    desc: "Elige entre marketing digital, fotografía profesional, o desarrollo web.",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 * i }}
                    className="flex items-start gap-4 rounded-2xl bg-white/5 border border-white/10 p-4"
                  >
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.color} flex-shrink-0`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{item.label}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: Business Info */}
          {step === 2 && (
            <motion.div
              key="business"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="flex-1"
            >
              <div className="text-center mb-8">
                <span className="text-5xl">🏪</span>
                <h2 className="text-white text-2xl font-black mt-3">Cuéntanos de tu restaurante</h2>
                <p className="text-gray-400 text-sm mt-2">
                  Personalizamos tus oportunidades de crecimiento.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">
                    Nombre de tu restaurante
                  </label>
                  <input
                    type="text"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="Ej. Taquería El Pariente"
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-sm
                      focus:outline-none focus:border-emerald-500/50 placeholder:text-gray-600"
                  />
                </div>

                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">
                    Tipo de cocina
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Mexicana", "Italiana", "Japonesa", "Mariscos", "Carnes", "Otra"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setRestaurantType(t)}
                        className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                          restaurantType === t
                            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/30"
                            : "bg-white/5 text-gray-400 hover:bg-white/10"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">
                    Gasto mensual aprox. en insumos
                  </label>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-white text-2xl font-bold tabular-nums">
                      ${monthlySpend.toLocaleString("es-MX")}
                    </span>
                    <span className="text-gray-500 text-sm">MXN</span>
                  </div>
                  <input
                    type="range"
                    min={5000}
                    max={150000}
                    step={1000}
                    value={monthlySpend}
                    onChange={(e) => setMonthlySpend(Number(e.target.value))}
                    className="w-full h-2 rounded-full bg-gray-700 appearance-none cursor-pointer accent-emerald-500
                      [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-emerald-400"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-gray-600 text-[10px]">$5K</span>
                    <span className="text-gray-600 text-[10px]">$150K</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Auto Cashback */}
          {step === 3 && (
            <motion.div
              key="auto-cashback"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="flex-1 flex flex-col items-center text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-7xl mb-6"
              >
                ⚡
              </motion.div>

              <h2 className="text-white text-2xl font-black">Tu cashback es automático</h2>
              <p className="text-gray-400 text-sm mt-3 max-w-xs leading-relaxed">
                Sin escanear tickets. Sin conectar proveedores. Cada compra que hagas en
                Resurte.me genera cashback al instante en tu Cartera de Crecimiento.
              </p>

              {/* How it works visually */}
              <div className="mt-8 w-full space-y-4">
                {[
                  {
                    icon: "🛒",
                    title: "Haces tu pedido en Resurte.me",
                    desc: "Compras tus insumos como siempre. Frutas, carnes, lácteos, abarrotes — todo en un solo lugar.",
                    color: "border-emerald-500/20 bg-emerald-500/5",
                  },
                  {
                    icon: "💰",
                    title: "El cashback se acredita al instante",
                    desc: "El 5% del valor de tu pedido va directo a tu Cartera de Crecimiento. Sin hacer nada más.",
                    color: "border-amber-500/20 bg-amber-500/5",
                  },
                  {
                    icon: "🚀",
                    title: "Lo canjeas por servicios de marketing",
                    desc: "Cuando tengas saldo suficiente, elige entre campañas publicitarias, fotografía profesional, o desarrollo web.",
                    color: "border-violet-500/20 bg-violet-500/5",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 * i }}
                    className={`flex items-start gap-4 rounded-2xl border ${item.color} p-4 text-left`}
                  >
                    <span className="text-2xl flex-shrink-0">{item.icon}</span>
                    <div>
                      <p className="text-white font-semibold text-sm">{item.title}</p>
                      <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Reassurance */}
              <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 p-4 w-full">
                <p className="text-gray-400 text-xs text-center">
                  📊 En promedio, un restaurante genera <strong className="text-emerald-400">$1,600 MXN/mes</strong> en cashback
                  solo con sus compras normales de insumos.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom CTA */}
        <div className="mt-6 space-y-3">
          <button
            onClick={handleNext}
            className="w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white 
              shadow-lg shadow-emerald-900/40 transition-all active:scale-[0.98] hover:bg-emerald-500
              flex items-center justify-center gap-2"
          >
            {isLast ? (
              <>
                <Sparkles className="h-5 w-5" />
                Comenzar a crecer
              </>
            ) : (
              <>
                Continuar
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="w-full text-gray-500 text-sm py-2 hover:text-gray-400 transition-colors"
            >
              Volver
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
