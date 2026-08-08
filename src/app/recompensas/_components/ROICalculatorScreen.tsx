"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Clock, Wallet, ArrowRight, Sparkles } from "lucide-react";
import type { ServiceItem } from "./types";
import { SERVICES } from "./StoreScreen";

interface ROICalculatorScreenProps {
  preselectedService: ServiceItem | null;
  onClose: () => void;
}

export function ROICalculatorScreen({ preselectedService, onClose }: ROICalculatorScreenProps) {
  const [targetServiceId, setTargetServiceId] = useState<string>(
    preselectedService?.id || "meta-ads"
  );
  const [monthlySpend, setMonthlySpend] = useState(32000);
  const [growthMode, setGrowthMode] = useState(false);

  const selectedService = useMemo(
    () => SERVICES.find((s) => s.id === targetServiceId) || SERVICES[0]!,
    [targetServiceId]
  );

  const cashbackRate = 0.05;
  // In growth mode, simulate a 40% spend increase
  const effectiveSpend = growthMode ? Math.round(monthlySpend * 1.4) : monthlySpend;
  const monthlyCashback = Math.round(effectiveSpend * cashbackRate);
  const monthsToUnlock = Math.max(1, Math.ceil(selectedService.cost / monthlyCashback));
  const totalAccumulated = monthsToUnlock * monthlyCashback;
  const monthsAtCurrentSpend = Math.max(1, Math.ceil(selectedService.cost / Math.round(monthlySpend * cashbackRate)));

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/10">
        <button
          onClick={onClose}
          className="rounded-xl bg-white/5 p-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-white text-lg font-bold">Proyección de Crecimiento</h1>
          <p className="text-gray-400 text-xs">Descubre cuánto necesitas consumir para desbloquear cada servicio</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-6 space-y-5">
        {/* Service Goal Picker */}
        <div>
          <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold">
            ¿Qué servicio quieres desbloquear?
          </label>
          <select
            value={targetServiceId}
            onChange={(e) => setTargetServiceId(e.target.value)}
            className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-sm 
              appearance-none cursor-pointer focus:outline-none focus:border-emerald-500/50"
          >
            {SERVICES.map((s) => (
              <option key={s.id} value={s.id} className="bg-gray-900">
                {s.icon} {s.name} — ${s.cost.toLocaleString("es-MX")} Créditos
              </option>
            ))}
          </select>
        </div>

        {/* Monthly Spend Slider */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
          <div className="flex justify-between items-baseline">
            <label className="text-gray-400 text-xs uppercase tracking-wider font-semibold">
              Tu gasto mensual en insumos
            </label>
            <motion.span
              key={monthlySpend}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className="text-white text-2xl font-bold tabular-nums"
            >
              ${monthlySpend.toLocaleString("es-MX")}
            </motion.span>
          </div>

          {/* Slider */}
          <div className="mt-4 relative">
            <input
              type="range"
              min={5000}
              max={150000}
              step={1000}
              value={monthlySpend}
              onChange={(e) => setMonthlySpend(Number(e.target.value))}
              className="w-full h-2 rounded-full bg-gray-700 appearance-none cursor-pointer accent-emerald-500
                [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-emerald-500/30"
            />
            {/* Tick marks */}
            <div className="flex justify-between mt-1">
              <span className="text-gray-600 text-[10px]">$5K</span>
              <span className="text-gray-600 text-[10px]">$50K</span>
              <span className="text-gray-600 text-[10px]">$100K</span>
              <span className="text-gray-600 text-[10px]">$150K</span>
            </div>
          </div>
        </div>

        {/* Growth Mode Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-gradient-to-br from-amber-500/5 to-amber-600/5 border border-amber-500/20 p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <p className="text-amber-400 text-sm font-semibold">Acelerador de Crecimiento</p>
              </div>
              <p className="text-gray-400 text-xs mt-1">
                ¿Qué pasaría si aumentaras tu consumo un <strong className="text-amber-300">40%</strong>?
              </p>
            </div>
            {/* Custom toggle */}
            <button
              onClick={() => setGrowthMode(!growthMode)}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                growthMode ? "bg-amber-500" : "bg-gray-700"
              }`}
            >
              <motion.div
                className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md"
                animate={{ left: growthMode ? "1.375rem" : "0.125rem" }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>

          {/* Comparison */}
          {growthMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-4 grid grid-cols-2 gap-3 overflow-hidden"
            >
              <div className="rounded-xl bg-gray-800/50 p-3 text-center">
                <p className="text-gray-500 text-[10px]">Consumo actual</p>
                <p className="text-white text-lg font-bold tabular-nums mt-1">
                  ${monthlySpend.toLocaleString("es-MX")}
                </p>
                <p className="text-gray-500 text-[10px]">+${Math.round(monthlySpend * cashbackRate).toLocaleString("es-MX")}/mes en recompensas</p>
              </div>
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-center">
                <p className="text-amber-400 text-[10px]">Consumo acelerado</p>
                <p className="text-amber-400 text-lg font-bold tabular-nums mt-1">
                  ${effectiveSpend.toLocaleString("es-MX")}
                </p>
                <p className="text-amber-400 text-[10px]">+${monthlyCashback.toLocaleString("es-MX")}/mes en recompensas</p>
              </div>
            </motion.div>
          )}

          <p className={`text-xs mt-3 text-center transition-opacity ${growthMode ? "text-amber-300/70" : "text-gray-600"}`}>
            {growthMode
              ? `Desbloquearías tu servicio en ${monthsToUnlock} ${monthsToUnlock === 1 ? "mes" : "meses"} en vez de ${monthsAtCurrentSpend}`
              : "Actívalo para ver cómo un mayor consumo acelera tu crecimiento"}
          </p>
        </motion.div>

        {/* Results Panel */}
        <motion.div
          key={growthMode ? "growth" : "normal"}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl bg-gradient-to-br from-emerald-900/50 to-teal-900/50 
            border border-emerald-500/20 p-5"
        >
          <h2 className="text-emerald-400 text-sm uppercase tracking-wider font-semibold mb-4">
            Tu proyección personalizada
          </h2>

          <div className="space-y-3">
            <ResultRow
              label="Recompensas mensuales estimadas"
              value={`$${monthlyCashback.toLocaleString("es-MX")} Créditos`}
              icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
            />

            <ResultRow
              label={`Tiempo para "${selectedService.name.slice(0, 25)}..."`}
              value={
                monthsToUnlock === 1 ? "⚡ 1 mes" : `${monthsToUnlock} meses`
              }
              icon={<Clock className="h-5 w-5 text-amber-400" />}
              highlight
            />

            <ResultRow
              label="Recompensas acumuladas en el período"
              value={`$${totalAccumulated.toLocaleString("es-MX")} Créditos`}
              icon={<Wallet className="h-5 w-5 text-emerald-400" />}
            />
          </div>

          {/* Visual comparison */}
          <div className="mt-5 rounded-xl bg-gray-900/50 p-4">
            <p className="text-gray-400 text-xs mb-3">
              Lo que gastas HOY vs. lo que recibes para crecer MAÑANA:
            </p>
            <div className="flex items-end gap-3 h-20">
              <div className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-white font-bold text-sm tabular-nums">
                  ${monthlySpend.toLocaleString("es-MX")}
                </span>
                <motion.div
                  className="w-full rounded-t-lg bg-gray-700"
                  initial={{ height: 0 }}
                  animate={{ height: "100%" }}
                  transition={{ duration: 0.8 }}
                />
                <span className="text-gray-500 text-[10px]">Insumos</span>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-600 flex-shrink-0 mb-5" />
              <div className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-emerald-400 font-bold text-sm tabular-nums">
                  ${monthlyCashback.toLocaleString("es-MX")}
                </span>
                <motion.div
                  className="w-full rounded-t-lg bg-emerald-600"
                  initial={{ height: 0 }}
                  animate={{
                    height: `${Math.min((monthlyCashback / monthlySpend) * 100 * 0.8, 80)}%`,
                  }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                />
                <span className="text-emerald-500 text-[10px]">Recompensas</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl p-4 ${
        highlight
          ? "bg-amber-500/10 border border-amber-500/20"
          : "bg-white/5"
      }`}
    >
      {icon}
      <div className="flex-1">
        <p className="text-gray-400 text-xs">{label}</p>
        <p
          className={`text-lg font-bold tabular-nums ${
            highlight ? "text-amber-400" : "text-white"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
