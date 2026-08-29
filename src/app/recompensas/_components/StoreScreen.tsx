"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Sparkles, TrendingUp, Users, X } from "lucide-react";
import type { ServiceItem, Tier } from "./types";
import { useLoyaltyTier } from "./LoyaltyTierCard";
import { SERVICES } from "./services-data";
import { formatNumber } from "@/lib/money";

export { SERVICES };

const tierConfig: Record<Tier, { label: string; bg: string; text: string; border: string }> = {
  verde: {
    label: "Verde",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-700/30",
  },
  plata: {
    label: "Plata",
    bg: "bg-slate-50",
    text: "text-slate-600",
    border: "border-slate-600/30",
  },
  oro: {
    label: "Oro",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-700/30",
  },
  diamante: {
    label: "Diamante",
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-700/30",
  },
};

const categories = [
  { id: "all", label: "Todos", icon: "🏪" },
  { id: "presencia", label: "Presencia", icon: "🗺️" },
  { id: "trafico", label: "Tráfico", icon: "📣" },
  { id: "infraestructura", label: "Infra", icon: "💻" },
] as const;

interface StoreScreenProps {
  onServiceSelect: (service: ServiceItem) => void;
  onOpenCalculator: (service?: ServiceItem) => void;
  balance?: number;
}

export function StoreScreen({ onServiceSelect, onOpenCalculator, balance = 0 }: StoreScreenProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [detailService, setDetailService] = useState<ServiceItem | null>(null);
  const { monthlyCashback } = useLoyaltyTier();

  const filtered =
    activeCategory === "all"
      ? SERVICES
      : SERVICES.filter((s) => s.category === activeCategory);

  // Datos reales del monedero y del nivel actual
  const monthsToUnlockOf = (cost: number) =>
    monthlyCashback > 0 ? Math.ceil(cost / monthlyCashback) : 1;

  return (
    <div className="px-4 pt-4 pb-6 md:px-6 lg:px-8 lg:max-w-6xl lg:mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-500" />
          <h1 className="text-warm-700 text-lg font-bold">Tienda de Crecimiento</h1>
        </div>
        <p className="text-[#5c6069] text-[13px] mt-0.5">
          Convierte tus recompensas en clientes nuevos. Tus recompensas ya son tuyas.
        </p>
      </motion.div>

      {/* Category filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide scroll-fade-x snap-x snap-mandatory mb-3">
        {categories.map((cat) => {
          const count =
            cat.id === "all"
              ? SERVICES.length
              : SERVICES.filter((s) => s.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium 
                whitespace-nowrap transition-all snap-start touch-target ${
                  activeCategory === cat.id
                   ? "bg-brand-500 text-white shadow-sm"
                   : "bg-white border border-cream-300 text-[#5c6069] hover:bg-cream-100"
                }`}
            >
              <span>{cat.icon}</span>
              {cat.label}
              <span
                className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${
                  activeCategory === cat.id
                    ? "bg-white/20 text-white"
                    : "bg-cream-100 text-[#6e737b]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Service Grid */}
      <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((service, i) => {
            const monthsToUnlock = monthsToUnlockOf(service.cost);
            const isUnlocked = balance >= service.cost;
            const tier = tierConfig[service.tier];

            return (
              <motion.div
                key={service.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
              >
                <ServiceCard
                  service={service}
                  isUnlocked={isUnlocked}
                  monthsToUnlock={monthsToUnlock}
                  tier={tier}
                  balance={balance}
                  onSelect={() => setDetailService(service)}
                  onRedeem={() => onServiceSelect(service)}
                  onCalculator={() => onOpenCalculator(service)}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="mt-4 rounded-2xl border border-cream-300 bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">🛍️</p>
          <p className="mt-2 text-sm font-bold text-warm-700">
            No hay servicios en esta categoría todavía
          </p>
          <p className="mt-1 text-xs text-[#5c6069]">
            Estamos preparando más servicios. Mientras tanto, explora las demás
            categorías.
          </p>
        </div>
      )}

      {/* Detail Bottom Sheet */}
      <AnimatePresence>
        {detailService && (
          <ServiceDetailSheet
            service={detailService}
            balance={balance}
            monthlyCashback={monthlyCashback}
            onClose={() => setDetailService(null)}
            onRedeem={() => {
              onServiceSelect(detailService);
              setDetailService(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ServiceCard({
  service,
  isUnlocked,
  monthsToUnlock,
  tier,
  balance,
  onSelect,
  onRedeem,
  onCalculator,
}: {
  service: ServiceItem;
  isUnlocked: boolean;
  monthsToUnlock: number;
  tier: { label: string; bg: string; text: string; border: string };
  balance: number;
  onSelect: () => void;
  onRedeem: () => void;
  onCalculator: () => void;
}) {
  const remaining = service.cost - balance;
  // Simulated social proof counters
  const socialProofCounts: Record<string, string> = {
    "google-maps": "247 restaurantes",
    "foto-profesional": "189 restaurantes",
    "redes-sociales": "312 restaurantes",
    "meta-ads": "156 restaurantes",
    "google-ads": "134 restaurantes",
    "tiktok": "98 restaurantes",
    "menu-digital": "73 restaurantes",
    "ecommerce": "41 restaurantes",
    "web-completa": "28 restaurantes",
  };

  return (
    <div
      onClick={onSelect}
      className={`group relative overflow-hidden rounded-2xl border transition-all 
        active:scale-[0.98] cursor-pointer ${
          isUnlocked
            ? "border-brand-200 bg-white shadow-sm hover:border-brand-500"
            : "border-cream-300 bg-white shadow-sm hover:border-warm-300"
        }`}
    >
      {/* Unlocked glow */}
      {isUnlocked && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-brand-50 to-transparent"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* Tier Badge */}
      <div className="absolute top-3 left-3 z-10">
        <span
          className={`inline-flex items-center gap-1 rounded-full ${tier.bg} ${tier.text} 
            ${tier.border} border px-2.5 py-0.5 text-[10px] font-bold`}
        >
          {tier.label}
        </span>
      </div>

      {/* Unlocked badge */}
      {isUnlocked && (
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300 }}
          className="absolute top-3 right-3 z-10"
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-500 border border-brand-200 px-2.5 py-0.5 text-[10px] font-bold">
            <CheckCircle className="h-3 w-3" /> Disponible
          </span>
        </motion.div>
      )}

      <div className="p-3 pt-8">
        {/* Icon + Name */}
        <div className="flex items-start gap-3">
          <motion.div
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-cream-100 text-xl"
            whileHover={{ scale: 1.1, rotate: -5 }}
          >
            {service.icon}
          </motion.div>
          <div className="flex-1 min-w-0">
            <h3 className="text-warm-700 font-bold text-sm leading-tight">{service.name}</h3>
            <p className="text-[#5c6069] text-xs mt-0.5 line-clamp-2">{service.description}</p>
          </div>
        </div>

        {/* Impact Badge */}
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-brand-50 border border-brand-200 px-2.5 py-1">
          <TrendingUp className="h-3 w-3 text-brand-500 flex-shrink-0" />
          <p className="text-brand-500 text-[10px] font-medium leading-tight">
            {service.estimatedImpact}
          </p>
        </div>

        {/* Social Proof */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <Users className="h-3 w-3 text-[#6e737b]" />
          <span className="text-[#6e737b] text-[10px]">
            {socialProofCounts[service.id] || "0 restaurantes"} ya lo canjearon
          </span>
        </div>

        {/* Cost + CTA */}
        <div className="mt-2.5 flex items-center justify-between">
          <div>
            <p className="text-[#6e737b] text-[10px] uppercase tracking-wider">Costo en recompensas</p>
            <p className="text-brand-500 font-bold text-lg tabular-nums">
              ${formatNumber(service.cost)}
            </p>
          </div>

          {isUnlocked ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                onRedeem();
              }}
              className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white 
                shadow-sm transition-all hover:bg-brand-600 touch-target"
            >
              Canjear ahora
            </motion.button>
          ) : (
            <div className="text-right">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCalculator();
                }}
                className="text-amber-700 text-[10px] font-medium hover:underline"
              >
                Te faltan ${formatNumber(remaining)}
              </button>
              <p className="text-[#6e737b] text-[10px] mt-0.5">
                ~{monthsToUnlock} {monthsToUnlock === 1 ? "mes" : "meses"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceDetailSheet({
  service,
  balance,
  monthlyCashback,
  onClose,
  onRedeem,
}: {
  service: ServiceItem;
  balance: number;
  monthlyCashback: number;
  onClose: () => void;
  onRedeem: () => void;
}) {
  const isUnlocked = balance >= service.cost;
  const remaining = service.cost - balance;
  const monthsToUnlock =
    monthlyCashback > 0 ? Math.ceil(service.cost / monthlyCashback) : 1;
  const tier = tierConfig[service.tier];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl bg-white shadow-lg 
          border border-cream-300 px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto"
      >
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-cream-300" />

        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 rounded-full bg-cream-100 p-3 text-[#5c6069] hover:text-warm-700 touch-target"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cream-100 text-3xl mb-4">
          {service.icon}
        </div>

        {/* Tier + Name */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`rounded-full ${tier.bg} ${tier.text} border ${tier.border} px-2 py-0.5 text-xs font-bold`}>
            {tier.label}
          </span>
          <span className="text-[#6e737b] text-xs">• {service.category === "presencia" ? "Presencia" : service.category === "trafico" ? "Tráfico" : "Infraestructura"}</span>
        </div>
        <h2 className="text-warm-700 text-xl font-bold">{service.name}</h2>
        <p className="text-[#5c6069] text-sm mt-2">{service.description}</p>

        {/* Deliverables */}
        <div className="mt-4 rounded-xl bg-cream-100 border border-cream-300 p-4">
          <p className="text-[#6e737b] text-xs uppercase tracking-wider font-semibold mb-2">Entregables</p>
          <ul className="space-y-1.5">
            {service.deliverables.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-warm-700">
                <CheckCircle className="h-4 w-4 text-brand-500 flex-shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>

        {/* Impact */}
        <div className="mt-3 rounded-xl bg-brand-50 border border-brand-200 p-3">
          <p className="text-brand-500 text-sm font-medium">{service.estimatedImpact}</p>
        </div>

        {/* Testimonial */}
        {service.testimonials && (
          <div className="mt-3 rounded-xl bg-violet-50 border border-violet-700/30 p-3">
            <p className="text-violet-700 text-xs italic">💬 &ldquo;{service.testimonials}&rdquo;</p>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-5 flex items-center justify-between border-t border-cream-300 pt-4">
          <div>
            <p className="text-[#6e737b] text-xs">Costo en recompensas</p>
            <p className="text-brand-500 font-bold text-xl tabular-nums">
              ${formatNumber(service.cost)}
            </p>
          </div>
          {isUnlocked ? (
            <button
              onClick={onRedeem}
              className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white 
                shadow-sm hover:bg-brand-600 active:scale-95 transition-all"
            >
              Canjear ahora
            </button>
          ) : (
            <div className="text-right">
              <p className="text-amber-700 text-xs font-medium">
                Te faltan ${formatNumber(remaining)}
              </p>
              <p className="text-[#6e737b] text-xs mt-0.5">
                ~{monthsToUnlock} {monthsToUnlock === 1 ? "mes" : "meses"} con tu consumo actual
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
