"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Target, TrendingUp, Sparkles, CalendarClock } from "lucide-react";
import { getMonthlyCashbackProgress, getWeekProgress } from "@/lib/wallet-actions";
import { formatNumber } from "@/lib/money";
import { TIER_REQUIREMENTS } from "./types";

type MonthlyProgress = Awaited<ReturnType<typeof getMonthlyCashbackProgress>>;
type WeekProgressData = Awaited<ReturnType<typeof getWeekProgress>>;

/** Semanas calificadas necesarias para un "mes perfecto" (nivel máximo). */
const PERFECT_MONTH_WEEKS = TIER_REQUIREMENTS.diamante;

function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "Último día de la semana";
  if (daysLeft === 1) return "Queda 1 día";
  return `Quedan ${daysLeft} días`;
}

function weekStatusCopy(week: NonNullable<WeekProgressData>): string {
  if (week.qualifies) {
    const base = `Semana calificada: tus Créditos se abonan al ${week.tierPct}%.`;
    if (!week.nextTier || week.weeksToNextTier === null) return base;
    const weeks = week.weeksToNextTier;
    return `${base} Con ${weeks} ${weeks === 1 ? "semana más" : "semanas más"} este mes subes a ${week.nextTier} (${week.nextTierPct}%).`;
  }
  if (week.weekSpend <= 0) {
    return `Aún no compras esta semana. Llega a $${formatNumber(week.qualifyingMin)} para calificarla.`;
  }
  return `Te faltan $${formatNumber(Math.round(week.remainingToQualify))} para calificar la semana.`;
}

export function MonthlyGoalCard() {
  const [progress, setProgress] = useState<MonthlyProgress>(null);
  const [week, setWeek] = useState<WeekProgressData>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [monthly, weekly] = await Promise.all([
          getMonthlyCashbackProgress(),
          getWeekProgress(),
        ]);
        if (!cancelled) {
          setProgress(monthly);
          setWeek(weekly);
        }
      } catch {
        // Mantener estado vacío
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-4 mt-3 rounded-2xl bg-white border border-cream-300 shadow-sm p-4 md:mx-6 lg:mx-0 animate-pulse">
        <div className="h-3 w-32 rounded bg-cream-100 mb-3" />
        <div className="h-2 w-full rounded-full bg-cream-100" />
      </div>
    );
  }

  const weeks = progress?.weeksWithPurchases ?? 0;
  const hasActivity = (progress?.totalOrdersThisMonth ?? 0) > 0;
  const weekPct = Math.min((weeks / PERFECT_MONTH_WEEKS) * 100, 100);
  const isPerfect = weeks >= PERFECT_MONTH_WEEKS;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.3 }}
      className="mx-4 mt-3 rounded-2xl bg-white border border-cream-300 shadow-sm p-4 md:mx-6 lg:mx-0"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50">
          <Target className="h-4 w-4 text-brand-500" />
        </div>
        <p className="text-warm-700 text-[13px] font-bold">Tu mes en progreso</p>
        {isPerfect && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-brand-500 text-[10px] font-bold">
            <Sparkles className="h-3 w-3" /> ¡Mes perfecto!
          </span>
        )}
      </div>

      {!hasActivity ? (
        <p className="text-[#5c6069] text-xs leading-relaxed">
          Aún no tienes pedidos este mes. Haz tu primera compra de insumos y
          empieza a acumular Créditos y semanas calificadas.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-[#5c6069]">Semanas calificadas</span>
            <span className="text-warm-700 font-bold">
              {weeks} de {PERFECT_MONTH_WEEKS}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-cream-100 overflow-hidden mb-3">
            <motion.div
              className="h-full rounded-full bg-brand-500"
              initial={{ width: 0 }}
              animate={{ width: `${weekPct}%` }}
              transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-cream-50 border border-cream-300 px-2.5 py-2 text-center">
              <p className="text-warm-700 text-sm font-bold">
                {progress?.totalOrdersThisMonth ?? 0}
              </p>
              <p className="text-[#6e737b] text-[10px]">pedidos</p>
            </div>
            <div className="rounded-xl bg-cream-50 border border-cream-300 px-2.5 py-2 text-center">
              <p className="text-warm-700 text-sm font-bold">
                ${formatNumber(Math.round(progress?.monthlySpend ?? 0))}
              </p>
              <p className="text-[#6e737b] text-[10px]">comprado</p>
            </div>
            <div className="rounded-xl bg-brand-50 border border-brand-200 px-2.5 py-2 text-center">
              <p className="text-brand-500 text-sm font-bold flex items-center justify-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                ${formatNumber(Math.round(progress?.totalCashbackThisMonth ?? 0))}
              </p>
              <p className="text-[#6e737b] text-[10px]">Créditos del mes</p>
            </div>
          </div>
        </>
      )}

      {week && (
        <div className="mt-3.5 border-t border-cream-300 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50">
              <CalendarClock className="h-4 w-4 text-brand-500" />
            </div>
            <p className="text-warm-700 text-[13px] font-bold">Esta semana</p>
            <span
              className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                week.daysLeft <= 0
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-cream-50 border-cream-300 text-[#5c6069]"
              }`}
            >
              {daysLeftLabel(week.daysLeft)}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-[#5c6069]">
              ${formatNumber(Math.round(week.weekSpend))} de $
              {formatNumber(week.qualifyingMin)}
            </span>
            {week.qualifies && (
              <span className="text-brand-500 font-bold">Calificada</span>
            )}
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={week.qualifyingMin}
            aria-valuenow={Math.min(Math.round(week.weekSpend), week.qualifyingMin)}
            aria-label="Gasto de la semana hacia el mínimo para calificar"
            className="h-2 w-full rounded-full bg-cream-100 overflow-hidden mb-2"
          >
            <motion.div
              className={`h-full rounded-full ${week.qualifies ? "bg-brand-500" : "bg-amber-400"}`}
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min((week.weekSpend / week.qualifyingMin) * 100, 100)}%`,
              }}
              transition={{ delay: 0.55, duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <p className="text-[#5c6069] text-xs leading-relaxed">
            {weekStatusCopy(week)}
          </p>
        </div>
      )}
    </motion.div>
  );
}
