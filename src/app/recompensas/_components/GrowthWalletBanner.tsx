"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Sparkles, Zap, Gift } from "lucide-react";

interface GrowthWalletBannerProps {
  balance: number;
  nextUnlock: {
    name: string;
    cost: number;
    progressPercent: number;
  };
  /** Créditos estimados que acumulas por mes. Si no se provee, se omite la proyección de meses. */
  monthlyEarnings?: number;
}

export function GrowthWalletBanner({ balance, nextUnlock, monthlyEarnings }: GrowthWalletBannerProps) {
  // remaining se calcula desde el progreso real (progressPercent ya refleja
  // el balance). Antes se mezclaba balance * progressPercent, lo que
  // inflaba el monto restante y mostraba el progreso al revés.
  const remaining = Math.max(
    0,
    Math.round(nextUnlock.cost * (1 - nextUnlock.progressPercent / 100))
  );
  const isNearUnlock = nextUnlock.progressPercent >= 85;
  const isAlmostThere = nextUnlock.progressPercent >= 70;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
      className="relative mx-4 mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-4 shadow-2xl shadow-emerald-900/40 md:mx-0"
    >
      {/* Animated background glows */}
      <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-emerald-400 opacity-10 blur-3xl" />
      <motion.div
        className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-teal-300 opacity-10 blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.15, 0.1] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      {/* Extra pulse on near-unlock */}
      {isNearUnlock && (
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-amber-400 opacity-5 blur-3xl"
          animate={{ scale: [1, 1.3, 1], opacity: [0.05, 0.1, 0.05] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      <div className="relative z-10">
        {/* Label */}
        <div className="flex items-center gap-2">
          <motion.div
            animate={isNearUnlock ? { rotate: [0, 8, -8, 0], scale: [1, 1.2, 1] } : { rotate: [0, 5, -5, 0] }}
            transition={{ duration: isNearUnlock ? 1 : 2, repeat: Infinity, repeatDelay: isNearUnlock ? 0 : 3 }}
          >
            <Sparkles className={`h-4 w-4 ${isNearUnlock ? "text-amber-300" : "text-emerald-300"}`} />
          </motion.div>
          <p className={`text-sm font-medium tracking-wide uppercase ${isNearUnlock ? "text-amber-200" : "text-emerald-200"}`}>
            Tu Cartera de Crecimiento
          </p>
          {/* Milestone badge */}
          {isNearUnlock && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-1 rounded-full bg-amber-500/30 border border-amber-400/30 px-2 py-0.5 text-[10px] font-bold text-amber-300"
            >
              <Zap className="h-2.5 w-2.5" /> ¡Casi!
            </motion.span>
          )}
        </div>

        {/* Balance */}
        <div className="mt-1">
          <AnimatedBalance target={balance} isNearUnlock={isNearUnlock} />
          <div className="mt-0.5 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-emerald-300" />
            <span className="text-emerald-300 text-[11px] font-medium">
              +12% vs mes pasado
            </span>
          </div>
        </div>

        {/* Progress + Next Unlock */}
        <div className="mt-3 flex items-center gap-3">
          <ProgressRing percent={nextUnlock.progressPercent} size={52} isNearUnlock={isNearUnlock} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className={`text-[10px] uppercase tracking-wider font-medium ${isNearUnlock ? "text-amber-200" : "text-emerald-200"}`}>
                Próximo desbloqueo
              </p>
              {isAlmostThere && (
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Gift className={`h-3 w-3 ${isNearUnlock ? "text-amber-300" : "text-emerald-300"}`} />
                </motion.div>
              )}
            </div>
            <p className={`font-semibold text-[13px] leading-tight mt-0.5 ${isNearUnlock ? "text-amber-200" : "text-white"}`}>
              {nextUnlock.name}
            </p>
            <p className={`text-[11px] mt-0.5 ${isNearUnlock ? "text-amber-300 font-medium" : "text-emerald-300"}`}>
              {isNearUnlock
                ? `⚡ ¡Solo te faltan $${Math.round(remaining).toLocaleString("es-MX")}!`
                : `Te faltan $${Math.round(remaining).toLocaleString("es-MX")} para desbloquearlo`}
            </p>
          </div>
        </div>

        {/* Quick earn estimate */}
        {typeof monthlyEarnings === "number" && monthlyEarnings > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/10 border border-white/10 px-3 py-1.5">
            <span className="text-[11px] text-white/70">
              Con tu consumo actual, lo desbloqueas en <strong className="text-white">~{Math.max(1, Math.ceil(nextUnlock.cost / monthlyEarnings))} {Math.ceil(nextUnlock.cost / monthlyEarnings) === 1 ? "mes" : "meses"}</strong>
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function AnimatedBalance({ target, isNearUnlock }: { target: number; isNearUnlock: boolean }) {
  const [displayed, setDisplayed] = useState(0);
  const prevTarget = useRef(target);

  useEffect(() => {
    const start = prevTarget.current;
    const diff = target - start;
    const duration = 800;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(start + diff * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
    prevTarget.current = target;
  }, [target]);

  return (
    <motion.h1
      className={`text-[2.5rem] leading-none font-black tabular-nums tracking-tight ${isNearUnlock ? "text-amber-200" : "text-white"}`}
      initial={{ scale: 0.9 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
    >
      ${displayed.toLocaleString("es-MX")}
      <span className="ml-1 text-lg font-semibold text-emerald-200">Créditos</span>
    </motion.h1>
  );
}

function ProgressRing({
  percent,
  size = 64,
  isNearUnlock = false,
}: {
  percent: number;
  size?: number;
  isNearUnlock?: boolean;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Glow on near-unlock */}
      {isNearUnlock && (
        <motion.div
          className="absolute -inset-1 rounded-full bg-amber-400/20 blur-md"
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90 relative z-10">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-emerald-800/60"
        />
        {/* Progress ring */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
          className={isNearUnlock ? "stroke-amber-400" : "stroke-emerald-300"}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <motion.span
          className={`text-xs font-bold tabular-nums ${isNearUnlock ? "text-amber-300" : "text-white"}`}
          animate={isNearUnlock ? { scale: [1, 1.15, 1] } : {}}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          {percent}%
        </motion.span>
      </div>
    </div>
  );
}
