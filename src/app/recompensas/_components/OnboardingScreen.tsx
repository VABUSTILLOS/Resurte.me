"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Users,
  ArrowRight,
  CreditCard,
  Repeat,
  TrendingUp,
  Clock,
} from "lucide-react";
import { TIER_CONFIGS, TIER_ORDER } from "./types";
import type { Tier } from "./types";
import { SERVICES } from "./StoreScreen";
import { formatNumber } from "@/lib/money";
interface OnboardingScreenProps {
  onComplete: () => void;
  isAuthenticated: boolean;
}

const steps = [
  {
    id: "welcome",
    title: "Convierte tus compras en crecimiento",
    subtitle:
      "Cada compra de insumos para tu restaurante te acerca a un mejor nivel de recompensas. Canjea tu saldo por servicios de marketing, fotografía y desarrollo web.",
    illustration: "🚀",
    stat: "+500 restauranteros ya están creciendo",
  },
  {
    id: "tiers",
    title: "Tus niveles de recompensas",
    subtitle: "",
    illustration: "⭐",
    tiers: true,
  },
  {
    id: "calculator",
    title: "Cuánto Poder le puedes dar a tu restaurante",
    subtitle: "Descubre los beneficios que puedes obtener para tu restaurante",
    illustration: "⚡",
    calculator: true,
  },
  {
    id: "invitation",
    title: "¿Listo para comenzar?",
    subtitle: "Pon a prueba Resurte.me y empieza a potenciar tu restaurante.",
    illustration: "🍳",
  },
];

export function OnboardingScreen({ onComplete, isAuthenticated }: OnboardingScreenProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [monthlySpend, setMonthlySpend] = useState(20000);

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
                Tus insumos ya trabajan para ti. Cada compra genera recompensas que
                puedes canjear por marketing digital, fotografía profesional, menús interactivos y más.
              </p>

              <div className="mt-8 rounded-2xl bg-emerald-500/10 border border-emerald-500/15 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-400 text-sm font-medium">
                    +500 restauranteros ya están creciendo
                  </span>
                </div>
              </div>

              <p className="text-white text-2xl font-bold leading-tight mt-6 max-w-xs md:max-w-lg md:text-3xl">
                Potencia tu negocio haciendo lo que ya haces
              </p>

              {/* Before vs After Illustration */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="mt-8 w-full max-w-sm md:max-w-md"
              >
                {/* Before: Antes */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 mb-3">
                  <p className="text-gray-500 text-[10px] uppercase tracking-widest text-center mb-3">Antes</p>
                  <div className="flex items-center gap-2">
                    {/* Left box: Insumos */}
                    <div className="flex-1 rounded-xl bg-gray-800/50 border border-gray-700/30 p-3 text-center">
                      <span className="text-2xl">🛒</span>
                      <p className="text-gray-400 text-[10px] mt-1.5 leading-tight">Comprar<br/>insumos</p>
                    </div>
                    {/* OR divider */}
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <div className="h-5 w-px bg-gray-700"></div>
                      <span className="text-[9px] font-bold text-gray-600">O</span>
                      <div className="h-5 w-px bg-gray-700"></div>
                    </div>
                    {/* Right box: Marketing */}
                    <div className="flex-1 rounded-xl bg-gray-800/50 border border-gray-700/30 p-3 text-center opacity-50">
                      <span className="text-2xl">📣</span>
                      <p className="text-gray-500 text-[10px] mt-1.5 leading-tight">Invertir en<br/>marketing</p>
                    </div>
                  </div>
                  <p className="text-gray-600 text-[10px] text-center mt-3">Tenías que elegir uno</p>
                </div>

                {/* Diferencia Resurte.me Badge */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.65, duration: 0.5 }}
                  className="mt-3 rounded-2xl bg-amber-500/10 border border-amber-500/15 px-5 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    <span className="text-amber-400 text-sm font-medium">
                      La diferencia Resurte.me
                    </span>
                  </div>
                </motion.div>

                {/* Transition Arrow */}
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.8, duration: 0.6 }}
                  className="flex items-center justify-center py-1 origin-left"
                >
                  <div className="flex items-center gap-1">
                    <motion.span
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-emerald-400 text-lg"
                    >
                      ↓
                    </motion.span>
                  </div>
                </motion.div>

                {/* After: Ahora */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9, duration: 0.5 }}
                  className="rounded-2xl bg-emerald-500/[0.08] border border-emerald-500/20 p-4"
                >
                  <p className="text-emerald-400 text-[10px] uppercase tracking-widest text-center mb-3">Ahora</p>
                  <div className="flex items-center gap-1.5">
                    {/* Insumos */}
                    <div className="flex-1 rounded-xl bg-emerald-600/20 border border-emerald-500/20 p-2.5 text-center">
                      <span className="text-xl">🛒</span>
                      <p className="text-emerald-300 text-[9px] mt-1">Insumos</p>
                    </div>
                    {/* Arrow */}
                    <span className="text-emerald-600 text-sm shrink-0">→</span>
                    {/* Cashback */}
                    <div className="flex-1 rounded-xl bg-amber-500/20 border border-amber-500/20 p-2.5 text-center">
                      <span className="text-xl">💰</span>
                      <p className="text-amber-300 text-[9px] mt-1">Recompensas</p>
                    </div>
                    {/* Arrow */}
                    <span className="text-emerald-600 text-sm shrink-0">→</span>
                    {/* Crecimiento */}
                    <div className="flex-1 rounded-xl bg-violet-500/20 border border-violet-500/20 p-2.5 text-center">
                      <span className="text-xl">🚀</span>
                      <p className="text-violet-300 text-[9px] mt-1">Marketing</p>
                    </div>
                  </div>
                  <p className="text-emerald-400/70 text-[10px] text-center mt-3 font-medium">
                    Todo con la misma compra
                  </p>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {/* Step 1: Tiers / Niveles */}
          {step === 1 && (
            <motion.div
              key="tiers"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="flex-1"
            >
              <div className="text-center mb-6">
                <span className="text-5xl">⭐</span>
                <h2 className="text-white text-2xl font-black mt-3 md:text-3xl">Tus niveles de recompensas</h2>
                <p className="text-gray-400 text-sm mt-2 max-w-xs mx-auto leading-relaxed">
                  Entre más compras, más ganas. Así de simple.
                </p>
              </div>

              {/* Tier Cards */}
              <div className="space-y-3">
                {TIER_ORDER.map((tier, i) => {
                  const cfg = TIER_CONFIGS[tier];
                  const tierEmojis: Record<Tier, string> = { verde: "🟢", plata: "🥈", oro: "🥇", diamante: "💎" };
                  return (
                    <motion.div
                      key={tier}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 * i }}
                      className={`flex items-center gap-4 rounded-2xl border ${cfg.borderColor} ${cfg.bgColor} p-4`}
                    >
                      {/* Rate badge */}
                      <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border ${cfg.borderColor} bg-gray-900/50`}>
                        <div className="text-center">
                          <span className={`text-lg font-black ${cfg.textColor} leading-none`}>{cfg.rate}%</span>
                          <span className="block text-[9px] text-gray-500">recompensas</span>
                        </div>
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${cfg.textColor}`}>
                          {tierEmojis[tier]} {cfg.name}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {i === 0 && "Empiezas aquí al registrarte"}
                          {i === 1 && "2+ semanas calificadas al mes ($2,500 acumulados)"}
                          {i === 2 && "3+ semanas calificadas al mes ($2,500 acumulados)"}
                          {i === 3 && "4+ semanas calificadas al mes ($2,500 acumulados)"}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Unlock criteria explainer */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-5 rounded-2xl bg-white/5 border border-white/10 p-4"
              >
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
                  ¿Cómo subes de nivel?
                </p>
                <div className="space-y-2.5">
                  {[
                    { icon: TrendingUp, text: "Volumen de compras mensual", desc: "A mayor ticket, más rápido subes" },
                    { icon: Repeat, text: "Frecuencia semanal", desc: "Comprando más semanas al mes aceleras tu nivel" },
                    { icon: CreditCard, text: "Suscripción recurrente", desc: "Domicilia tus favoritos y desbloquea el nivel Diamante" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 flex-shrink-0 mt-0.5">
                        <item.icon className="h-3.5 w-3.5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-white text-xs font-medium">{item.text}</p>
                        <p className="text-gray-500 text-[10px]">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Step 2: Calculator */}
          {step === 2 && (
            <motion.div
              key="calculator"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="flex-1"
            >
              <div className="text-center mb-6">
                <span className="text-5xl">⚡</span>
                <h2 className="text-white text-2xl font-black mt-3 md:text-3xl">
                  Cuánto Poder le puedes dar a tu restaurante
                </h2>
                <p className="text-gray-400 text-sm mt-2 max-w-xs mx-auto leading-relaxed">
                  Descubre los beneficios que puedes obtener para tu restaurante
                </p>
              </div>

              {/* Spend Slider */}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 mb-4">
                <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2 block">
                  Gasto mensual aprox. en insumos
                </label>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-white text-2xl font-bold tabular-nums">
                    ${formatNumber(monthlySpend)}
                  </span>
                  <span className="text-gray-500 text-sm">Créditos</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100000}
                  step={500}
                  value={monthlySpend}
                  onChange={(e) => setMonthlySpend(Number(e.target.value))}
                  className="w-full h-2 rounded-full bg-gray-700 appearance-none cursor-pointer accent-emerald-500
                    [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-emerald-400"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-gray-600 text-[10px]">$0</span>
                  <span className="text-gray-600 text-[10px]">$100K</span>
                </div>
              </div>

              {/* Cashback result */}
              {(() => {
                const cashbackAmount = Math.round(monthlySpend * 0.2);
                return (
                  <motion.div
                    key={cashbackAmount}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="rounded-2xl bg-violet-500/10 border border-violet-500/20 p-4 mb-5 text-center"
                  >
                    <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-1">
                      Tus recompensas mensuales estimadas
                    </p>
                    <p className="text-violet-300 text-3xl font-black tabular-nums">
                      ${formatNumber(cashbackAmount)}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      Tendrías{" "}
                      <strong className="text-violet-400">
                        ${formatNumber(cashbackAmount)}
                      </strong>{" "}
                      (el 20% de tu gasto mensual aprox. en insumos)
                    </p>
                  </motion.div>
                );
              })()}

              {/* Service examples */}
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-3 text-center">
                  Ejemplos de lo que puedes adquirir con tus recompensas
                </p>
                <div className="grid gap-2">
                  {SERVICES.filter((s) =>
                    ["google-maps", "foto-profesional", "redes-sociales", "google-ads", "menu-digital"].includes(s.id)
                  )
                    .sort((a, b) => a.cost - b.cost)
                    .map((svc) => {
                      const cashback = Math.round(monthlySpend * 0.2);
                      const monthsToUnlock = cashback > 0
                        ? Math.ceil(svc.cost / cashback)
                        : null;
                      return (
                        <motion.div
                          key={svc.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3"
                        >
                          <span className="text-2xl flex-shrink-0">{svc.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-bold truncate">
                              {svc.name}
                            </p>
                            <p className="text-gray-500 text-[10px]">
                              ${formatNumber(svc.cost)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-gray-600 text-xs flex-shrink-0">
                            <Clock className="h-3 w-3" />
                            <span>
                              {monthsToUnlock === null
                                ? "—"
                                : `${monthsToUnlock} ${monthsToUnlock === 1 ? "mes" : "meses"}`}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Invitation */}
          {step === 3 && (
            <motion.div
              key="invitation"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="flex-1 flex flex-col items-center text-center justify-center"
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="text-7xl mb-6"
              >
                🍳
              </motion.div>

              <h2 className="text-white text-3xl font-black leading-tight max-w-xs md:text-4xl md:max-w-md">
                ¿Listo para comenzar?
              </h2>

              <p className="text-gray-400 text-sm mt-4 max-w-xs md:max-w-sm leading-relaxed">
                Pon a prueba <strong className="text-emerald-400">Resurte.me</strong> y empieza a
                potenciar tu restaurante.
              </p>

              <p className="text-white text-xl font-bold mt-8 max-w-xs leading-snug">
                ¿Qué te hace falta en tu cocina?
              </p>

              <div className="mt-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/15 px-6 py-4">
                <p className="text-emerald-400/70 text-xs">
                  Sin inversión adicional. Solo haciendo lo que ya haces.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom CTA */}
        <div className="mt-6 space-y-3">
          {isLast && !isAuthenticated ? (
            <>
              <button
                onClick={() => router.push("/auth/register")}
                className="w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white 
                  shadow-lg shadow-emerald-900/40 transition-all active:scale-[0.98] hover:bg-emerald-500
                  flex items-center justify-center gap-2"
              >
                <Sparkles className="h-5 w-5" />
                Crear cuenta gratis
              </button>
              <button
                onClick={() => router.push("/auth/login")}
                className="w-full text-gray-400 text-sm py-2 hover:text-white transition-colors touch-target"
              >
                Ya tengo cuenta — Iniciar sesión
              </button>
            </>
          ) : (
            <>
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
                  className="w-full text-gray-500 text-sm py-2 hover:text-gray-400 transition-colors touch-target"
                >
                  Volver
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
