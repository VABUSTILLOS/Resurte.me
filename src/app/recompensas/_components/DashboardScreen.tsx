"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, Star, CheckCircle, Lock } from "lucide-react";
import { GrowthWalletBanner } from "./GrowthWalletBanner";
import { QuickActions } from "./QuickActions";
import { ActivityFeed } from "./ActivityFeed";
import { NotificationBell } from "./NotificationBell";
import { ImpactStories } from "./ImpactStories";
import { SERVICES } from "./StoreScreen";
import { TIER_CONFIGS } from "./types";
import { LoyaltyTierBanner, useLoyaltyTier, TIER_ORDER } from "./LoyaltyTierCard";
import { ReferralDashboard } from "@/components/referral-dashboard";
import { createClient } from "@/lib/supabase/client";
import type { Tier } from "./types";
import type { ServiceItem } from "./types";
import type { WalletTransaction } from "@/types";

interface DashboardScreenProps {
  onOpenCalculator: (service?: ServiceItem) => void;
  onServiceSelect: (service: ServiceItem) => void;
  onNavigateStore?: () => void;
  onViewOrders?: () => void;
  walletView?: boolean;
  profileView?: boolean;
  referralView?: boolean;
  /** Saldo real de la wallet (fetched por la página) */
  balance?: number;
}

export function DashboardScreen({
  onOpenCalculator,
  onNavigateStore,
  onViewOrders,
  walletView,
  profileView,
  referralView,
  balance = 0,
}: DashboardScreenProps) {
  if (walletView) {
    return <WalletView />;
  }
  if (profileView) {
    return <ProfileView />;
  }
  if (referralView) {
    return <ReferralDashboard />;
  }

  // Pick 3 featured services for the home preview
  const featuredServices = SERVICES.filter((s) =>
    ["google-maps", "meta-ads", "menu-digital"].includes(s.id)
  ).sort((a, b) => a.cost - b.cost);

  return (
    <div className="pt-1 pb-4 md:max-w-none lg:max-w-6xl lg:mx-auto">
      {/* Top Header with Notifications */}
      <div className="flex items-center justify-between px-4 mb-2 md:px-6 lg:px-8">
        <div>
          <p className="text-gray-400 text-[11px]">Buenos días</p>
          <BusinessName />
        </div>
        <NotificationBell />
      </div>

      {/* Main Dashboard Grid */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-6 lg:px-8">
        {/* Left Column: Wallet + Quick Actions */}
        <div className="lg:col-span-2">
          <div className="px-0 md:px-6 lg:px-0">
            <LoyaltyTierBanner />
            <GrowthWalletBanner
              balance={balance}
              nextUnlock={{
                name: "Campaña Meta Ads — Nivel Plata",
                cost: 16000,
                progressPercent: Math.min(Math.round((balance / 16000) * 100), 100),
              }}
            />
          </div>

          <QuickActions onViewOrders={onViewOrders} onBrowseStore={onNavigateStore} />

          {/* Cashback Disclaimer */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="mx-4 mt-2.5 rounded-xl bg-amber-500/5 border border-amber-500/10 px-4 py-2 md:mx-6 lg:mx-0"
          >
            <p className="text-amber-400/60 text-[11px] leading-relaxed">
              ⓘ Tus Créditos solo pueden canjearse por servicios en la Tienda de Crecimiento. No son canjeables por dinero en efectivo.
            </p>
          </motion.div>

          {/* Store Preview Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="mx-4 mt-4 md:mx-6 lg:mx-0"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-white text-[13px] font-bold">Tienda de Crecimiento</p>
              <button
                onClick={onNavigateStore}
                className="flex items-center gap-1 text-emerald-400 text-xs font-medium hover:underline"
              >
                Ver todo <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {featuredServices.map((svc) => (
                <motion.button
                  key={svc.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={onNavigateStore}
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 p-3 text-center hover:border-white/20 transition-colors"
                >
                  <span className="text-2xl">{svc.icon}</span>
                  <p className="text-white text-[10px] font-medium leading-tight line-clamp-2">
                    {svc.name}
                  </p>
                  <p className="text-emerald-400 text-[10px] font-bold">
                    ${svc.cost.toLocaleString("es-MX")}
                  </p>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Impact Teaser */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="mx-4 mt-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 
              border border-emerald-500/15 p-3 md:mx-6 lg:mx-0"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 0 1 5.814-5.519l2.74-1.22m0 0-5.94-2.28m5.94 2.28-2.28 5.941" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-white text-[13px] font-semibold">
                  Con tu consumo actual, en 3 meses desbloqueas tu Campaña Meta Ads
                </p>
                <button
                  onClick={() => onOpenCalculator()}
                  className="mt-1.5 text-emerald-400 text-xs font-medium hover:underline"
                >
                  Calcular proyección exacta →
                </button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Column: Activity + Stories */}
        <div className="lg:col-span-1 mt-4 lg:mt-0">
          <div className="md:px-6 lg:px-0">
            <ActivityFeed />
          </div>
          <ImpactStories />
        </div>
      </div>
    </div>
  );
}

/** Nombre real del negocio desde el perfil del usuario logueado */
function BusinessName() {
  const [name, setName] = useState<string>("Restaurante");
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  );

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      try {
        const { data: { session } } = await supabase!.auth.getSession();
        if (!session?.user?.id) return;
        const { data: profile } = await supabase!
          .from("profiles")
          .select("full_name")
          .eq("id", session.user.id)
          .single();
        if (profile?.full_name) setName(profile.full_name);
      } catch {
        // Keep default
      }
    })();
  }, [supabase]);

  return (
    <p className="text-white text-base font-bold">{name} 🌅</p>
  );
}

function WalletView() {
  const { tier, monthlyCashback } = useLoyaltyTier()
  const currentTierConfig = TIER_CONFIGS[tier]

  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  )

  useEffect(() => {
    if (!supabase) return

    async function fetchWallet() {
      try {
        const { data: { session } } = await supabase!.auth.getSession()
        if (!session?.user?.id) return

        const { data: wallet } = await supabase!
          .from("wallets")
          .select("id, balance_credits")
          .eq("user_id", session.user.id)
          .single()

        if (wallet) {
          setBalance(Number(wallet.balance_credits))

          const { data: txs } = await supabase!
            .from("wallet_transactions")
            .select("id, wallet_id, amount, concept, order_id, created_at")
            .eq("wallet_id", wallet.id)
            .order("created_at", { ascending: false })
            .limit(8)

          if (txs) setTransactions(txs as WalletTransaction[])
        }
      } catch {
        // Keep defaults
      }
    }

    fetchWallet()
  }, [supabase])

  return (
    <div className="px-4 pt-6 pb-6 md:px-6 lg:px-8 lg:max-w-6xl lg:mx-auto">
      <h1 className="text-white text-xl font-bold mb-5">Mis Pedidos</h1>

      {/* Cashback rate banner */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-900/40 to-teal-900/40 border border-emerald-500/20 p-5 mb-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-${currentTierConfig.color}-500/20 flex-shrink-0`}>
            <Star className={`h-5 w-5 text-${currentTierConfig.color}-400`} />
          </div>
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">
              Tus recompensas: <span className={currentTierConfig.textColor}>5% a 20% según nivel</span>
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Actualmente estás en nivel{" "}
              <span className={`font-bold ${currentTierConfig.textColor}`}>{currentTierConfig.name}</span>{" "}
              recibiendo <span className={`font-bold ${currentTierConfig.textColor}`}>{currentTierConfig.rate}%</span> de recompensas.
              Tus compras generan créditos automáticamente.
            </p>
          </div>
        </div>
      </div>

      {/* Balance Card */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-5 mb-4">
        <p className="text-gray-400 text-xs uppercase tracking-wider">Saldo Total</p>
        <p className="text-white text-4xl font-black tabular-nums mt-1">
          ${balance.toLocaleString("es-MX")} <span className="text-xl text-gray-400">Créditos</span>
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/15 p-3">
            <p className="text-gray-400 text-[10px] uppercase tracking-wider">Recompensas este mes</p>
            <p className="text-emerald-400 text-lg font-bold tabular-nums mt-0.5">
              +${monthlyCashback.toLocaleString("es-MX")}
            </p>
          </div>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/15 p-3">
            <p className="text-gray-400 text-[10px] uppercase tracking-wider">% Actual</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${currentTierConfig.textColor}`}>
              {currentTierConfig.rate}%
            </p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="mb-4">
        <p className="text-white text-sm font-bold mb-3">Movimientos recientes</p>
        {transactions.length === 0 ? (
          <div className="rounded-xl bg-white/5 border border-white/5 p-6 text-center">
            <p className="text-gray-500 text-sm">
              Aún no tienes movimientos. ¡Haz tu primera compra y empieza a generar créditos!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/5 p-3"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${
                  Number(tx.amount) > 0 ? "bg-emerald-500/15" : "bg-red-500/15"
                }`}>
                  <TrendingUp className={`h-4 w-4 ${Number(tx.amount) > 0 ? "text-emerald-400" : "text-red-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {tx.order_id ? `Pedido #${tx.order_id}` : tx.concept}
                  </p>
                  <p className="text-gray-500 text-[10px]">
                    {new Date(tx.created_at).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${Number(tx.amount) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {Number(tx.amount) > 0 ? "+" : ""}${Math.abs(Number(tx.amount)).toLocaleString("es-MX")}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileView() {
  const { tier, weekCount } = useLoyaltyTier()
  const currentTierIdx = TIER_ORDER.indexOf(tier)

  const [fullName, setFullName] = useState("Restaurante")
  const [ordersThisMonth, setOrdersThisMonth] = useState<number | null>(null)
  const [totalRewards, setTotalRewards] = useState(0)
  const [monthsInProgram, setMonthsInProgram] = useState<number | null>(null)
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  )

  useEffect(() => {
    if (!supabase) return

    async function fetchProfile() {
      try {
        const { data: { session } } = await supabase!.auth.getSession()
        if (!session?.user?.id) return
        const userId = session.user.id

        const { data: profile } = await supabase!
          .from("profiles")
          .select("full_name, created_at")
          .eq("id", userId)
          .single()

        if (profile) {
          if (profile.full_name) setFullName(profile.full_name)
          if (profile.created_at) {
            const months = Math.max(
              1,
              Math.floor(
                (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30)
              )
            )
            setMonthsInProgram(months)
          }
        }

        const monthYear = new Date().toISOString().slice(0, 7)
        const { count: monthCount } = await supabase!
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("month_year", monthYear)
          .neq("status", "cancelled")
        setOrdersThisMonth(monthCount ?? 0)

        const { data: wallet } = await supabase!
          .from("wallets")
          .select("id")
          .eq("user_id", userId)
          .single()
        if (wallet) {
          const { data: txs } = await supabase!
            .from("wallet_transactions")
            .select("amount")
            .eq("wallet_id", wallet.id)
            .gt("amount", 0)
          if (txs) {
            setTotalRewards(txs.reduce((sum, t) => sum + Number(t.amount), 0))
          }
        }
      } catch {
        // Keep defaults
      }
    }

    fetchProfile()
  }, [supabase])

  // Tier unlock conditions
  const tierConditions: Record<Tier, { weeks: number; minWeekly: number; label: string }> = {
    verde: { weeks: 0, minWeekly: 0, label: "Primera compra" },
    plata: { weeks: 2, minWeekly: 2500, label: "2+ semanas calificadas al mes" },
    oro: { weeks: 3, minWeekly: 2500, label: "3+ semanas calificadas al mes" },
    diamante: { weeks: 4, minWeekly: 2500, label: "4+ semanas calificadas al mes" },
  };

  const inviteShare = async () => {
    const msg = "🚀 Te invito a Resurte.me — genera Créditos en tus compras de insumos que puedes canjear por marketing digital, fotografía profesional, menús interactivos y más. ¡Crecer juntos sabe mejor! https://resurte.me/invite";
    if (navigator.share) {
      try { await navigator.share({ title: "Resurte.me", text: msg }); return; } catch {}
    }
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank");
  };

  return (
    <div className="px-4 pt-6 pb-6 md:px-6 lg:px-8 lg:max-w-6xl lg:mx-auto">
      <h1 className="text-white text-xl font-bold mb-5">Mi Perfil</h1>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-5 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xl font-bold">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-white font-bold text-lg">{fullName}</p>
            <p className="text-gray-400 text-sm">Socio Resurte</p>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-6">
        <ProfileRow label="Pedidos este mes" value={ordersThisMonth === null ? "—" : String(ordersThisMonth)} />
        <ProfileRow label="Meses en el programa" value={monthsInProgram === null ? "—" : String(monthsInProgram)} />
        <ProfileRow label="Total recompensas acumuladas" value={`$${Math.round(totalRewards).toLocaleString("es-MX")} Créditos`} />
      </div>

      {/* Tier Progression Ladder */}
      <div className="mb-6">
        <h2 className="text-white text-sm font-bold mb-4">Tu progreso de niveles</h2>
        <div className="space-y-3">
          {TIER_ORDER.map((tier, idx) => {
            const cfg = TIER_CONFIGS[tier];
            const cond = tierConditions[tier];
            const isUnlocked = idx <= currentTierIdx;
            const isCurrent = idx === currentTierIdx;
            const isNext = idx === currentTierIdx + 1;

            return (
              <motion.div
                key={tier}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`relative rounded-xl border p-4 ${
                  isUnlocked
                    ? `${cfg.bgColor} ${cfg.borderColor}`
                    : "bg-white/5 border-white/10 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Tier badge */}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${
                    isUnlocked ? `bg-${cfg.color}-500/20` : "bg-gray-800"
                  }`}>
                    {isUnlocked ? (
                      <CheckCircle className={`h-5 w-5 ${cfg.textColor}`} />
                    ) : (
                      <Lock className="h-5 w-5 text-gray-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-bold ${isUnlocked ? cfg.textColor : "text-gray-500"}`}>
                        {cfg.name}
                      </p>
                      {isCurrent && (
                        <span className="rounded-full bg-emerald-600/30 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                          Actual
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-[10px] mt-0.5">
                      {cfg.rate}% recompensas · {cond.label}
                    </p>

                    {/* Progress bar for next tier */}
                    {isNext && (
                      <div className="mt-2">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-gray-500">
                          {weekCount} de {cond.weeks} semanas este mes
                          </span>
                          <span className={cfg.textColor}>
                          {cond.weeks > 0 ? Math.round((weekCount / cond.weeks) * 100) : 100}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full bg-${cfg.color}-500`}
                            initial={{ width: 0 }}
                          animate={{ width: `${cond.weeks > 0 ? (weekCount / cond.weeks) * 100 : 100}%` }}
                            transition={{ duration: 0.8, delay: 0.3 }}
                          />
                        </div>
                        <p className="text-gray-600 text-[9px] mt-1">
                          Semana calificada: ${cond.minWeekly.toLocaleString("es-MX")} o más acumulados
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Invite */}
      <div className="rounded-2xl bg-gradient-to-br from-purple-600/20 to-purple-800/20 border border-purple-500/15 p-4">
        <p className="text-white text-sm font-semibold">🎁 Crecer juntos sabe mejor</p>
        <p className="text-gray-400 text-xs mt-1">
          Invita a otro restaurantero y ambos ganan $100 Créditos en recompensas.
        </p>
        <button
          onClick={inviteShare}
          className="mt-3 w-full rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white active:scale-[0.98] transition-transform"
        >
          Compartir invitación
        </button>
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/5 p-4">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  );
}
