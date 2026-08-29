"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, Star, CheckCircle, Lock, HelpCircle } from "lucide-react";
import { GrowthWalletBanner } from "./GrowthWalletBanner";
import { QuickActions } from "./QuickActions";
import { ActivityFeed } from "./ActivityFeed";
import { NotificationBell } from "./NotificationBell";
import { ImpactStories } from "./ImpactStories";
import { SERVICES } from "./StoreScreen";
import { TIER_CONFIGS } from "./types";
import { LoyaltyTierBanner, useLoyaltyTier, TIER_ORDER } from "./LoyaltyTierCard";
import { TierBenefitsSection } from "./TierBenefitsSection";
import { MonthlyGoalCard } from "./MonthlyGoalCard";
import { AchievementsSection } from "./AchievementsSection";
import { ReferralDashboard } from "@/components/referral-dashboard";
import { useOnboardingCompleted } from "@/components/onboarding-wizard";
import { createClient } from "@/lib/supabase/client";
import {
  getWalletBalance,
  getWalletHistory,
  getTotalRewards,
} from "@/lib/wallet-actions";
import { localMonthYear } from "@/lib/utils";
import { formatNumber } from "@/lib/money";
import type { Tier } from "./types";
import type { ServiceItem } from "./types";
import type { WalletTransaction } from "@/types";

interface DashboardScreenProps {
  onOpenCalculator: (service?: ServiceItem) => void;
  onServiceSelect: (service: ServiceItem) => void;
  onNavigateStore?: () => void;
  onViewOrders?: () => void;
  onScanInvoice?: () => void;
  onShowOnboarding?: () => void;
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
  onScanInvoice,
  onShowOnboarding,
  walletView,
  profileView,
  referralView,
  balance = 0,
}: DashboardScreenProps) {
  const onboardingCompleted = useOnboardingCompleted()

  if (walletView) {
    return <WalletView />;
  }
  if (profileView) {
    return <ProfileView onShowOnboarding={onShowOnboarding} />;
  }
  if (referralView) {
    return <ReferralDashboard />;
  }

  // Pick featured services for the home preview (3 destacados + más baratos hasta 6)
  const featuredServices = (() => {
    const featured = SERVICES.filter((s) =>
      ["google-maps", "meta-ads", "menu-digital"].includes(s.id)
    ).sort((a, b) => a.cost - b.cost);
    const rest = SERVICES.filter((s) => !featured.includes(s))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, Math.max(0, 6 - featured.length));
    return [...featured, ...rest];
  })();

  return (
    <div className="pt-1 pb-4 md:max-w-none">
      {/* Top Header with Notifications */}
      <div className="flex items-center justify-between px-4 mb-2 md:px-6 lg:px-8">
        <div>
          <p className="text-[#6e737b] text-[11px]">Buenos días</p>
          <BusinessName />
        </div>
        <NotificationBell />
      </div>

      {/* Welcome banner — visible after completing el onboarding */}
      {onboardingCompleted && (
        <div className="px-4 mb-3 md:px-6 lg:px-8">
          <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 flex items-start gap-3">
            <CheckCircle className="h-4 w-4 text-brand-500 flex-shrink-0 mt-0.5" />
            <p className="text-warm-700 text-xs leading-relaxed">
              <span className="font-semibold">¡Bienvenido a Resurte!</span> Ya completaste tu
              onboarding. Explora tus recompensas y el catálogo de servicios para hacer crecer tu
              negocio.
            </p>
          </div>
        </div>
      )}

      {/* Main Dashboard Grid — 12 col en lg: 8 principal + 4 lateral.
          En móvil el orden lo marcan las clases order-*:
          wallet+nivel → mes → acciones → actividad → logros → tienda → teaser → beneficios → historias */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-6 lg:px-8">
        {/* Hero: monedero + nivel lado a lado en desktop */}
        <div className="order-1 md:px-6 lg:order-none lg:col-span-8 lg:col-start-1 lg:row-start-1 lg:px-0">
          <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
            <LoyaltyTierBanner />
            <div className="flex flex-col gap-2">
              <GrowthWalletBanner
                balance={balance}
                nextUnlock={{
                  name: "Campaña Meta Ads — Nivel Plata",
                  cost: 16000,
                  progressPercent: Math.min(Math.round((balance / 16000) * 100), 100),
                }}
              />
              <p className="mx-4 text-[10px] italic leading-relaxed text-[#6e737b] md:mx-0">
                ⓘ Tus Créditos solo pueden canjearse por servicios en la Tienda
                de Crecimiento. No son canjeables por dinero en efectivo.
              </p>
            </div>
          </div>
        </div>

        <div className="order-2 lg:order-none lg:col-span-8 lg:col-start-1 lg:row-start-2">
          <MonthlyGoalCard />
        </div>

        <div className="order-3 md:px-6 lg:order-none lg:col-span-8 lg:col-start-1 lg:row-start-3 lg:px-0">
          <QuickActions onViewOrders={onViewOrders} onBrowseStore={onNavigateStore} onScanInvoice={onScanInvoice} />
        </div>

        {/* Lateral: actividad reciente */}
        <div className="order-4 md:px-6 lg:order-none lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:self-start lg:px-0">
          <ActivityFeed />
        </div>

        {/* Lateral: logros */}
        <div className="order-5 lg:order-none lg:col-span-4 lg:col-start-9 lg:row-start-2 lg:self-start">
          <AchievementsSection />
        </div>

        {/* Store preview — carrusel en móvil, grid 3×2 en desktop */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="order-6 mx-4 md:mx-6 lg:order-none lg:col-span-8 lg:col-start-1 lg:row-start-4 lg:mx-0"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-warm-700 text-[13px] font-bold">Tienda de Crecimiento</p>
            <button
              onClick={onNavigateStore}
              className="flex items-center gap-1 text-brand-500 text-xs font-medium hover:underline"
            >
              Ver todo <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto snap-x scrollbar-hide max-md:-mx-4 max-md:px-4 max-md:pb-1 md:grid md:grid-cols-3 md:overflow-visible">
            {featuredServices.map((svc) => (
              <motion.button
                key={svc.id}
                whileTap={{ scale: 0.95 }}
                onClick={onNavigateStore}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-white border border-cream-300 shadow-sm p-3 text-center hover:border-brand-200 transition-colors max-md:w-32 max-md:flex-shrink-0 max-md:snap-start"
              >
                <span className="text-2xl">{svc.icon}</span>
                <p className="text-warm-700 text-[10px] font-medium leading-tight line-clamp-2">
                  {svc.name}
                </p>
                <p className="text-brand-500 text-[10px] font-bold">
                  ${formatNumber(svc.cost)}
                </p>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Lateral: teaser de proyección */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.4 }}
          className="order-7 mx-4 rounded-xl bg-brand-50 border border-brand-200 p-3 md:mx-6 lg:order-none lg:col-span-4 lg:col-start-9 lg:row-start-3 lg:self-start lg:mx-0"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100">
              <svg className="h-5 w-5 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 0 1 5.814-5.519l2.74-1.22m0 0-5.94-2.28m5.94 2.28-2.28 5.941" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-warm-700 text-[13px] font-semibold">
                Con tu consumo actual, en 3 meses desbloqueas tu Campaña Meta Ads
              </p>
              <button
                onClick={() => onOpenCalculator()}
                className="mt-1.5 text-brand-500 text-xs font-medium hover:underline"
              >
                Calcular proyección exacta →
              </button>
            </div>
          </div>
        </motion.div>

        {/* Beneficios por nivel — ancho completo, colapsable en móvil */}
        <div className="order-8 md:px-6 lg:order-none lg:col-span-12 lg:row-start-5 lg:px-0">
          <TierBenefitsSection />
        </div>

        {/* Historias de impacto — ancho completo, colapsable en móvil */}
        <div className="order-9 lg:order-none lg:col-span-12 lg:row-start-6">
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
    <p className="text-warm-700 text-base font-bold">{name} 🌅</p>
  );
}

function WalletView() {
  const { tier, monthlyCashback } = useLoyaltyTier()
  const currentTierConfig = TIER_CONFIGS[tier]

  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])

  useEffect(() => {
    let cancelled = false

    async function fetchWallet() {
      try {
        const wallet = await getWalletBalance()
        if (cancelled) return
        if (wallet) {
          setBalance(Number(wallet.balance_credits))
          const { transactions } = await getWalletHistory(0, 8)
          if (!cancelled) setTransactions(transactions)
        }
      } catch {
        // Keep defaults
      }
    }

    fetchWallet()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="px-4 pt-6 pb-6 md:px-6 lg:px-8 lg:max-w-6xl lg:mx-auto">
      <h1 className="text-warm-700 text-xl font-bold mb-5">Mis Pedidos</h1>

      {/* Cashback rate banner */}
      <div className="rounded-2xl bg-brand-50 border border-brand-200 p-5 mb-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-${currentTierConfig.color}-500/20 flex-shrink-0`}>
            <Star className={`h-5 w-5 text-${currentTierConfig.color}-400`} />
          </div>
          <div className="flex-1">
            <p className="text-warm-700 text-sm font-semibold">
              Tus recompensas: <span className={currentTierConfig.textColor}>5% a 20% según nivel</span>
            </p>
            <p className="text-[#5c6069] text-xs mt-1">
              Actualmente estás en nivel{" "}
              <span className={`font-bold ${currentTierConfig.textColor}`}>{currentTierConfig.name}</span>{" "}
              recibiendo <span className={`font-bold ${currentTierConfig.textColor}`}>{currentTierConfig.rate}%</span> de recompensas.
              Tus compras generan créditos automáticamente.
            </p>
          </div>
        </div>
      </div>

      {/* Balance Card */}
      <div className="rounded-2xl bg-white border border-cream-300 shadow-sm p-5 mb-4">
        <p className="text-[#5c6069] text-xs uppercase tracking-wider">Saldo Total</p>
        <p className="text-warm-700 text-4xl font-black tabular-nums mt-1">
          ${formatNumber(balance)} <span className="text-xl text-[#5c6069]">Créditos</span>
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-brand-50 border border-brand-200 p-3">
            <p className="text-[#5c6069] text-[10px] uppercase tracking-wider">Recompensas este mes</p>
            <p className="text-brand-500 text-lg font-bold tabular-nums mt-0.5">
              +${formatNumber(monthlyCashback)}
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-[#5c6069] text-[10px] uppercase tracking-wider">% Actual</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${currentTierConfig.textColor}`}>
              {currentTierConfig.rate}%
            </p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="mb-4">
        <p className="text-warm-700 text-sm font-bold mb-3">Movimientos recientes</p>
        {transactions.length === 0 ? (
          <div className="rounded-xl bg-white border border-cream-300 p-6 text-center">
            <p className="text-[#6e737b] text-sm">
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
                className="flex items-center gap-3 rounded-xl bg-white border border-cream-300 p-3"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${
                  Number(tx.amount) > 0 ? "bg-brand-50" : "bg-red-50"
                }`}>
                  <TrendingUp className={`h-4 w-4 ${Number(tx.amount) > 0 ? "text-brand-500" : "text-red-600"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-warm-700 text-sm font-medium truncate">
                    {tx.order_id ? `Pedido #${tx.order_id}` : tx.concept}
                  </p>
                  <p className="text-[#6e737b] text-[10px]">
                    {new Date(tx.created_at).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${Number(tx.amount) > 0 ? "text-brand-500" : "text-red-600"}`}>
                    {Number(tx.amount) > 0 ? "+" : ""}${formatNumber(Math.abs(Number(tx.amount)))}
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

function ProfileView({ onShowOnboarding }: { onShowOnboarding?: () => void }) {
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

        const monthYear = localMonthYear()
        const { count: monthCount } = await supabase!
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("month_year", monthYear)
          .neq("status", "cancelled")
        setOrdersThisMonth(monthCount ?? 0)

        setTotalRewards(await getTotalRewards())
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
      <h1 className="text-warm-700 text-xl font-bold mb-5">Mi Perfil</h1>

      <div className="rounded-2xl bg-white border border-cream-300 shadow-sm p-5 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-brand-500 flex items-center justify-center text-white text-xl font-bold">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-warm-700 font-bold text-lg">{fullName}</p>
            <p className="text-[#5c6069] text-sm">Socio Resurte</p>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-6">
        <ProfileRow label="Pedidos este mes" value={ordersThisMonth === null ? "—" : String(ordersThisMonth)} />
        <ProfileRow label="Meses en el programa" value={monthsInProgram === null ? "—" : String(monthsInProgram)} />
        <ProfileRow label="Total recompensas acumuladas" value={`$${formatNumber(Math.round(totalRewards))} Créditos`} />
      </div>

      {/* Tier Progression Ladder */}
      <div className="mb-6">
        <h2 className="text-warm-700 text-sm font-bold mb-4">Tu progreso de niveles</h2>
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
                    : "bg-cream-100 border-cream-300 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Tier badge */}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${
                    isUnlocked ? `bg-${cfg.color}-500/20` : "bg-cream-300"
                  }`}>
                    {isUnlocked ? (
                      <CheckCircle className={`h-5 w-5 ${cfg.textColor}`} />
                    ) : (
                      <Lock className="h-5 w-5 text-[#6e737b]" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-bold ${isUnlocked ? cfg.textColor : "text-[#6e737b]"}`}>
                        {cfg.name}
                      </p>
                      {isCurrent && (
                       <span className="rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-bold text-brand-500">
                          Actual
                        </span>
                      )}
                    </div>
                    <p className="text-[#5c6069] text-[10px] mt-0.5">
                      {cfg.rate}% recompensas · {cond.label}
                    </p>

                    {/* Progress bar for next tier */}
                    {isNext && (
                      <div className="mt-2">
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-[#5c6069]">
                          {weekCount} de {cond.weeks} semanas este mes
                          </span>
                          <span className={cfg.textColor}>
                          {cond.weeks > 0 ? Math.round((weekCount / cond.weeks) * 100) : 100}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-cream-300 overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full bg-${cfg.color}-500`}
                            initial={{ width: 0 }}
                          animate={{ width: `${cond.weeks > 0 ? (weekCount / cond.weeks) * 100 : 100}%` }}
                            transition={{ duration: 0.8, delay: 0.3 }}
                          />
                        </div>
                        <p className="text-[#6e737b] text-[9px] mt-1">
                          Semana calificada: ${formatNumber(cond.minWeekly)} o más acumulados
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

      {/* Volver a ver el onboarding */}
      {onShowOnboarding && (
        <button
          onClick={onShowOnboarding}
          className="mb-6 w-full rounded-2xl bg-white border border-cream-300 shadow-sm p-4 flex items-center gap-3 text-left hover:border-brand-200 transition-colors"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 flex-shrink-0">
            <HelpCircle className="h-4.5 w-4.5 text-brand-500" />
          </div>
          <div className="flex-1">
            <p className="text-warm-700 text-sm font-semibold">¿Cómo funciona?</p>
            <p className="text-[#6e737b] text-[11px]">
              Vuelve a ver la guía del programa de recompensas
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#6e737b]" />
        </button>
      )}

      {/* Invite */}
      <div className="rounded-2xl bg-violet-50 border border-violet-200 p-4">
        <p className="text-warm-700 text-sm font-semibold">🎁 Crecer juntos sabe mejor</p>
        <p className="text-[#5c6069] text-xs mt-1">
          Invita a otro restaurantero y ambos ganan $100 Créditos en recompensas.
        </p>
        <button
          onClick={inviteShare}
          className="mt-3 w-full rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white active:scale-[0.98] transition-transform touch-target"
        >
          Compartir invitación
        </button>
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white border border-cream-300 p-4">
      <span className="text-[#5c6069] text-sm">{label}</span>
      <span className="text-warm-700 font-semibold">{value}</span>
    </div>
  );
}
