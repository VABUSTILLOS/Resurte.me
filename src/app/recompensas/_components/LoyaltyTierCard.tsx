"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { Star, Award, Zap } from "lucide-react"
import { TIER_CONFIGS } from "./types"
import type { Tier } from "./types"

const TIER_ORDER: Tier[] = ["verde", "plata", "oro", "diamante"]

interface TierData {
  tier: Tier
  weekCount: number
  monthlySpend: number
  monthlyCashback: number
}

const TIER_BENEFITS: Record<Tier, string[]> = {
  verde: [
    "5% de cashback en todas tus compras",
    "Acceso a monedero digital",
    "Soporte por WhatsApp",
  ],
  plata: [
    "10% de cashback en todas tus compras",
    "Prioridad en entregas programadas",
    "Acceso a herramientas de costeo",
  ],
  oro: [
    "15% de cashback en todas tus compras",
    "Envío gratis en pedidos desde $1,500",
    "Asesor de cuenta dedicado",
    "Acceso anticipado a nuevos productos",
  ],
  diamante: [
    "20% de cashback en todas tus compras",
    "Envío gratis sin mínimo",
    "Asesor de cuenta VIP 24/7",
    "Productos exclusivos por mayoreo",
    "Invitación a eventos de la industria",
  ],
}

const NEXT_TIER_LABEL: Record<Tier, string> = {
  verde: "2 semanas para desbloquear Plata y ganar 10%",
  plata: "3 semanas para desbloquear Oro y ganar 15%",
  oro: "4 semanas para desbloquear Diamante y ganar 20%",
  diamante: "¡Nivel máximo alcanzado! Sigue comprando para mantenerlo",
}

const TIER_PROGRESS_COLOR: Record<Tier, string> = {
  verde: "#10b981",
  plata: "#94a3b8",
  oro: "#f59e0b",
  diamante: "#8b5cf6",
}

/** Semana ISO de una fecha (1-53), igual que EXTRACT(WEEK ...) en Postgres */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** Mínimo acumulado por semana para que cuente como "semana calificada" */
export const QUALIFYING_WEEK_MIN = 2500

export function useLoyaltyTier() {
  const [data, setData] = useState<TierData>({
    tier: "verde",
    weekCount: 0,
    monthlySpend: 0,
    monthlyCashback: 0,
  })
  const [loading, setLoading] = useState(true)
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  )

  useEffect(() => {
    let cancelled = false

    async function fetchTier() {
      if (!supabase) {
        setLoading(false)
        return
      }

      try {
        const {
          data: { session },
        } = await supabase!.auth.getSession()
        if (!session?.user?.id) {
          setLoading(false)
          return
        }

        const monthYear = new Date().toISOString().slice(0, 7)

        const { data: orders, error } = await supabase!
          .from("orders")
          .select("created_at, total")
          .eq("user_id", session.user.id)
          .eq("month_year", monthYear)
          .neq("status", "cancelled")

        if (error || !orders?.length) {
          setData((prev) => ({ ...prev, weekCount: 0, tier: "verde" }))
          setLoading(false)
          return
        }

        // Agrupar gasto por semana ISO: una semana califica si acumula >= $2,500
        const spendByWeek = new Map<number, number>()
        for (const o of orders) {
          const createdAt = o.created_at ? new Date(o.created_at) : null
          const week = createdAt && !isNaN(createdAt.getTime()) ? isoWeek(createdAt) : 0
          spendByWeek.set(week, (spendByWeek.get(week) ?? 0) + Number(o.total ?? 0))
        }

        const weekCount = Array.from(spendByWeek.values()).filter(
          (spend) => spend >= QUALIFYING_WEEK_MIN
        ).length
        const monthlySpend = orders.reduce(
          (sum, o) => sum + Number(o.total ?? 0),
          0
        )

        const tierMap: Record<number, Tier> = {
          0: "verde",
          1: "verde",
          2: "plata",
          3: "oro",
        }
        const tier: Tier = tierMap[weekCount] ?? "diamante"
        const rate = TIER_CONFIGS[tier].rate
        const monthlyCashback = Math.round(monthlySpend * (rate / 100))

        setData({ tier, weekCount, monthlySpend, monthlyCashback })
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
  }, [supabase])

  return { ...data, loading }
}

export function LoyaltyTierCard({
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

  if (loading) {
    return (
      <div className="mx-4 mt-3 animate-pulse rounded-2xl bg-white/5 border border-white/10 p-5 md:mx-0">
        <div className="h-4 w-32 rounded bg-white/10 mb-3" />
        <div className="h-8 w-48 rounded bg-white/10 mb-2" />
        <div className="h-3 w-full rounded bg-white/10" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
      className={`relative mx-4 mt-3 overflow-hidden rounded-2xl border p-5 md:mx-0 ${cfg.bgColor} ${cfg.borderColor}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Award className={`h-5 w-5 ${cfg.textColor}`} />
          <p className="text-white text-sm font-bold">Tu Nivel de Recompensas</p>
        </div>
        <motion.span
          key={tier}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`rounded-full px-3 py-1 text-xs font-bold border ${cfg.borderColor} ${cfg.textColor}`}
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
          className={`text-4xl font-black tabular-nums leading-none ${cfg.textColor}`}
        >
          {cfg.rate}%
        </motion.span>
        <span className="text-gray-400 text-sm pb-1">
          cashback en tus compras
        </span>
      </div>

      {/* Progress bar */}
      {!isMaxTier && (
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-400">
              {weekCount} de {weeksNeeded} semanas este mes
            </span>
            <span className={cfg.textColor}>{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: progressColor }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            />
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <Zap className="h-3 w-3 text-amber-400" />
            <p className="text-gray-500 text-[10px]">
              {NEXT_TIER_LABEL[tier]}
            </p>
          </div>
        </div>
      )}

      {isMaxTier && (
        <div className="mb-4 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
          <p className="text-gray-300 text-xs">
            🏆 ¡Eres parte del 1% de nuestros clientes! Has alcanzado el nivel
            máximo de recompensas.
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Gasto este mes
          </p>
          <p className="text-white text-base font-bold tabular-nums mt-0.5">
            ${monthlySpend.toLocaleString("es-MX")}
          </p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">
            Cashback estimado
          </p>
          <p
            className={`text-base font-bold tabular-nums mt-0.5 ${cfg.textColor}`}
          >
            +${monthlyCashback.toLocaleString("es-MX")}
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
              className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${cfg.textColor}`}
            />
            <span className="text-gray-400 text-xs">{benefit}</span>
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
