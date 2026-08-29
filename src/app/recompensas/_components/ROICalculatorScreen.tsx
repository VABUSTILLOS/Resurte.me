"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Clock, Wallet, ArrowRight, Sparkles } from "lucide-react";
import type { ServiceItem } from "./types";
import { CASHBACK_RATE } from "./types";
import { SERVICES } from "./StoreScreen";
import { formatNumber } from "@/lib/money";

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

  const cashbackRate = CASHBACK_RATE;
  // In growth mode, simulate a 40% spend increase
  const effectiveSpend = growthMode ? Math.round(monthlySpend * 1.4) : monthlySpend;
  const monthlyCashback = Math.round(effectiveSpend * cashbackRate);
  const monthsToUnlock = Math.max(1, Math.ceil(selectedService.cost / monthlyCashback));
  const totalAccumulated = monthsToUnlock * monthlyCashback;
  const monthsAtCurrentSpend = Math.max(1, Math.ceil(selectedService.cost / Math.round(monthlySpend * cashbackRate)));

  return (
    <div className="flex flex-col min-h-screen bg-cream-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-cream-300">
        <button
          onClick={onClose}
          aria-label="Cerrar calculadora"
          className="rounded-xl bg-white border border-cream-300 shadow-sm p-2 text-[#5c6069] hover:text-warm-700 transition-colors touch-target"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-warm-700 text-lg font-bold">Proyección de Crecimiento</h1>
          <p className="text-[#5c6069] text-xs">Descubre cuánto necesitas consumir para desbloquear cada servicio</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-6 space-y-5">
        {/* Service Goal Picker */}
        <div>
          <label htmlFor="roi-service" className="text-[#5c6069] text-xs uppercase tracking-wider font-semibold">
            ¿Qué servicio quieres desbloquear?
          </label>
          <select
            id="roi-service"
            value={targetServiceId}
            onChange={(e) => setTargetServiceId(e.target.value)}
            className="mt-2 w-full rounded-xl bg-white border border-cream-300 shadow-sm px-4 py-3 text-warm-700 text-sm 
              appearance-none cursor-pointer focus:outline-none focus:border-brand-500"
          >
            {SERVICES.map((s) => (
              <option key={s.id} value={s.id} className="bg-white">
                {s.icon} {s.name} — ${formatNumber(s.cost)} Créditos
              </option>
            ))}
          </select>
        </div>

        {/* Monthly Spend Slider */}
        <div className="rounded-2xl bg-white border border-cream-300 shadow-sm p-5">
          <div className="flex justify-between items-baseline">
            <label className="text-[#5c6069] text-xs uppercase tracking-wider font-semibold">
              Tu gasto mensual en insumos
            </label>
            <motion.span
              key={monthlySpend}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className="text-warm-700 text-2xl font-bold tabular-nums"
            >
              ${formatNumber(monthlySpend)}
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
              className="w-full h-2 rounded-full bg-cream-100 appearance-none cursor-pointer accent-brand-500
                [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-brand-500/30"
            />
            {/* Tick marks */}
            <div className="flex justify-between mt-1">
              <span className="text-[#6e737b] text-[10px]">$5K</span>
              <span className="text-[#6e737b] text-[10px]">$50K</span>
              <span className="text-[#6e737b] text-[10px]">$100K</span>
              <span className="text-[#6e737b] text-[10px]">$150K</span>
            </div>
          </div>
        </div>

        {/* Growth Mode Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-amber-50 border border-amber-200 p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-700" />
                <p className="text-amber-800 text-sm font-semibold">Acelerador de Crecimiento</p>
              </div>
              <p className="text-[#5c6069] text-xs mt-1">
                ¿Qué pasaría si aumentaras tu consumo un <strong className="text-amber-800">40%</strong>?
              </p>
            </div>
            {/* Custom toggle */}
            <button
              onClick={() => setGrowthMode(!growthMode)}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                growthMode ? "bg-amber-500" : "bg-cream-300"
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
              <div className="rounded-xl bg-cream-100 p-3 text-center">
                <p className="text-[#6e737b] text-[10px]">Consumo actual</p>
                <p className="text-warm-700 text-lg font-bold tabular-nums mt-1">
                  ${formatNumber(monthlySpend)}
                </p>
                <p className="text-[#6e737b] text-[10px]">+${formatNumber(Math.round(monthlySpend * cashbackRate))}/mes en recompensas</p>
              </div>
              <div className="rounded-xl bg-white border border-amber-700/30 p-3 text-center">
                <p className="text-amber-700 text-[10px]">Consumo acelerado</p>
                <p className="text-amber-700 text-lg font-bold tabular-nums mt-1">
                  ${formatNumber(effectiveSpend)}
                </p>
                <p className="text-amber-700 text-[10px]">+${formatNumber(monthlyCashback)}/mes en recompensas</p>
              </div>
            </motion.div>
          )}

          <p className={`text-xs mt-3 text-center transition-opacity ${growthMode ? "text-amber-800" : "text-[#6e737b]"}`}>
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
          className="rounded-2xl bg-white border border-cream-300 shadow-sm p-5"
        >
          <h2 className="text-brand-500 text-sm uppercase tracking-wider font-semibold mb-4">
            Tu proyección personalizada
          </h2>

          <div className="space-y-3">
            <ResultRow
              label="Recompensas mensuales estimadas"
              value={`$${formatNumber(monthlyCashback)} Créditos`}
              icon={<TrendingUp className="h-5 w-5 text-brand-500" />}
            />

            <ResultRow
              label={`Tiempo para "${selectedService.name.slice(0, 25)}..."`}
              value={
                monthsToUnlock === 1 ? "⚡ 1 mes" : `${monthsToUnlock} meses`
              }
              icon={<Clock className="h-5 w-5 text-amber-700" />}
              highlight
            />

            <ResultRow
              label="Recompensas acumuladas en el período"
              value={`$${formatNumber(totalAccumulated)} Créditos`}
              icon={<Wallet className="h-5 w-5 text-brand-500" />}
            />
          </div>

          {/* Visual comparison */}
          <div className="mt-5 rounded-xl bg-cream-100 p-4">
            <p className="text-[#5c6069] text-xs mb-3">
              Lo que gastas HOY vs. lo que recibes para crecer MAÑANA:
            </p>
            <div className="flex items-end gap-3 h-20">
              <div className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-warm-700 font-bold text-sm tabular-nums">
                  ${formatNumber(monthlySpend)}
                </span>
                <motion.div
                  className="w-full rounded-t-lg bg-cream-300"
                  initial={{ height: 0 }}
                  animate={{ height: "100%" }}
                  transition={{ duration: 0.8 }}
                />
                <span className="text-[#6e737b] text-[10px]">Insumos</span>
              </div>
              <ArrowRight className="h-5 w-5 text-[#6e737b] flex-shrink-0 mb-5" />
              <div className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-brand-500 font-bold text-sm tabular-nums">
                  ${formatNumber(monthlyCashback)}
                </span>
                <motion.div
                  className="w-full rounded-t-lg bg-brand-500"
                  initial={{ height: 0 }}
                  animate={{
                    height: `${Math.min((monthlyCashback / monthlySpend) * 100 * 0.8, 80)}%`,
                  }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                />
                <span className="text-brand-500 text-[10px]">Recompensas</span>
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
          ? "bg-amber-50 border border-amber-200"
          : "bg-cream-100"
      }`}
    >
      {icon}
      <div className="flex-1">
        <p className="text-[#5c6069] text-xs">{label}</p>
        <p
          className={`text-lg font-bold tabular-nums ${
            highlight ? "text-amber-800" : "text-brand-500"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
