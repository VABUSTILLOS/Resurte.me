"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Star, Award, Zap } from "lucide-react"
import { TIER_BENEFITS, TIER_CONFIGS, TIER_ORDER } from "./types"
import type { Tier } from "./types"
import { getMonthlyCashbackProgress } from "@/lib/wallet-actions"
import { formatNumber } from "@/lib/money"

interface TierData {
  tier: Tier
  weekCount: number
  monthlySpend: number
  monthlyCashback: number
}

const NEXT_TIER_LABEL: Record<Tier, string> = {
  verde: "2 semanas para desbloquear Plata y ganar 10%",
  plata: "3 semanas para desbloquear Oro y ganar 15%",
  oro: "4 semanas para desbloquear Diamante y ganar 20%",
  diamante: "¡Nivel máximo alcanzado! Sigue comprando para mantenerlo",
}

const TIER_PROGRESS_COLOR: Record<Tier, string> = {
  verde: "#047857",
  plata: "#64748b",
  oro: "#b45309",
  diamante: "#7c3aed",
}

/** Acentos AA-safe sobre fondo blanco por nivel (chips en *-50 con borde al 30%). */
const TIER_ACCENT: Record<Tier, { text: string; chip: string }> = {
  verde: { text: "text-emerald-700", chip: "bg-emerald-50 border-emerald-700/30" },
  plata: { text: "text-slate-600", chip: "bg-slate-50 border-slate-600/30" },
  oro: { text: "text-amber-700", chip: "bg-amber-50 border-amber-700/30" },
  diamante: { text: "text-violet-700", chip: "bg-violet-50 border-violet-700/30" },
}

// (El umbral $2,500 de "semana calificada" vive en src/lib/utils.ts como
// QUALIFYING_WEEK_MIN, usado por la server action getMonthlyCashbackProgress.)

export function useLoyaltyTier() {
  const [data, setData] = useState<TierData>({
    tier: "verde",
    weekCount: 0,
    monthlySpend: 0,
    monthlyCashback: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchTier() {
      try {
        const progress = await getMonthlyCashbackProgress()
        if (cancelled || !progress) return

        const tier = progress.currentTier.toLowerCase() as Tier
        // Cashback estimado del mes: gasto × tasa del nivel actual
        const monthlyCashback = Math.round(
          progress.monthlySpend * (progress.currentTierPct / 100)
        )

        setData({
          tier,
          weekCount: progress.weeksWithPurchases,
          monthlySpend: progress.monthlySpend,
          monthlyCashback,
        })
      } catch {
        // Keep defaults
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchTier()

    return () => {
      cancelled = true
    }
  }, [])

  return { ...data, loading }
}

function LoyaltyTierCard({
  tier,
  weekCount,
  monthlySpend,
  monthlyCashback,
  loading,
}: TierData & { loading?: boolean }) {
  const cfg = TIER_CONFIGS[tier]
  const benefits = TIER_BENEFITS[tier]
  const nextTierIdx = TIER_ORDER.indexOf(tier) + 1
  const weeksNeeded = Math.min(nextTierIdx + 1, 4)
  const progressPercent = Math.min((weekCount / weeksNeeded) * 100, 100)
  const isMaxTier = tier === "diamante"
  const progressColor = TIER_PROGRESS_COLOR[tier]
  const accent = TIER_ACCENT[tier]

  if (loading) {
    return (
      <div className="mx-4 mt-3 animate-pulse rounded-2xl bg-white border border-cream-300 shadow-sm p-5 md:mx-0">
        <div className="h-4 w-32 rounded bg-cream-100 mb-3" />
        <div className="h-8 w-48 rounded bg-cream-100 mb-2" />
        <div className="h-3 w-full rounded bg-cream-100" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
      className="relative mx-4 mt-3 overflow-hidden rounded-2xl bg-white border border-cream-300 shadow-sm p-5 md:mx-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Award className={`h-5 w-5 ${accent.text}`} />
          <p className="text-warm-700 text-sm font-bold">Tu Nivel de Recompensas</p>
        </div>
        <motion.span
          key={tier}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`rounded-full px-3 py-1 text-xs font-bold border ${accent.chip} ${accent.text}`}
        >
          Nivel {cfg.name}
        </motion.span>
      </div>

      {/* Rate display */}
      <div className="flex items-end gap-3 mb-5">
        <motion.span
          key={cfg.rate}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`text-4xl font-black tabular-nums leading-none ${accent.text}`}
        >
          {cfg.rate}%
        </motion.span>
        <span className="text-[#5c6069] text-sm pb-1">
          cashback en tus compras
        </span>
      </div>

      {/* Progress bar */}
      {!isMaxTier && (
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[#5c6069]">
              {weekCount} de {weeksNeeded} semanas este mes
            </span>
            <span className={accent.text}>{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-2 rounded-full bg-cream-100 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: progressColor }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            />
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <Zap className="h-3 w-3 text-amber-700" />
            <p className="text-[#6e737b] text-[10px]">
              {NEXT_TIER_LABEL[tier]}
            </p>
          </div>
        </div>
      )}

      {isMaxTier && (
        <div className="mb-4 rounded-lg bg-cream-100 border border-cream-300 px-3 py-2">
          <p className="text-[#5c6069] text-xs">
            🏆 ¡Eres parte del 1% de nuestros clientes! Has alcanzado el nivel
            máximo de recompensas.
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-xl bg-cream-100 border border-cream-300 p-3">
          <p className="text-[#6e737b] text-[10px] uppercase tracking-wider">
            Gasto este mes
          </p>
          <p className="text-warm-700 text-base font-bold tabular-nums mt-0.5">
            ${formatNumber(monthlySpend)}
          </p>
        </div>
        <div className="rounded-xl bg-cream-100 border border-cream-300 p-3">
          <p className="text-[#6e737b] text-[10px] uppercase tracking-wider">
            Cashback estimado
          </p>
          <p
            className={`text-base font-bold tabular-nums mt-0.5 ${accent.text}`}
          >
            +${formatNumber(monthlyCashback)}
          </p>
        </div>
      </div>

      {/* Benefits */}
      <div className="space-y-1.5">
        {benefits.map((benefit, i) => (
          <motion.div
            key={benefit}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            className="flex items-start gap-2"
          >
            <Star
              className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${accent.text}`}
            />
            <span className="text-[#5c6069] text-xs">{benefit}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

export { TIER_ORDER }

/** Self-contained wrapper that fetches its own tier data via useLoyaltyTier */
export function LoyaltyTierBanner() {
  const { tier, weekCount, monthlySpend, monthlyCashback, loading } =
    useLoyaltyTier()

  return (
    <LoyaltyTierCard
      tier={tier}
      weekCount={weekCount}
      monthlySpend={monthlySpend}
      monthlyCashback={monthlyCashback}
      loading={loading}
    />
  )
}
