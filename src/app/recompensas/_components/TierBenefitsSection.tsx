"use client";

import { motion } from "framer-motion";
import { Check, Lock, Star } from "lucide-react";
import { TIER_BENEFITS, TIER_CONFIGS, TIER_ORDER, TIER_REQUIREMENTS } from "./types";
import { useLoyaltyTier } from "./LoyaltyTierCard";
import { CollapsibleSection } from "./CollapsibleSection";

/**
 * Comparativa de los 4 niveles del programa de recompensas.
 * Muestra % de cashback, beneficios y requisito (semanas calificadas) de cada
 * nivel, y resalta el nivel actual del usuario.
 */
export function TierBenefitsSection() {
  const { tier: currentTier, loading } = useLoyaltyTier();
  const currentIdx = TIER_ORDER.indexOf(currentTier);

  return (
    <CollapsibleSection
      className="mx-4 mt-6 md:mx-0"
      title={
        <>
          <Star className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-bold text-warm-700">
            Beneficios por nivel
          </h2>
        </>
      }
      subtitle={
        <p className="mb-4 text-xs text-[#5c6069]">
          Sube de nivel con semanas calificadas (compra semanal desde $2,500) y
          aumenta tu cashback.
        </p>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TIER_ORDER.map((tier, i) => {
          const cfg = TIER_CONFIGS[tier];
          const required = TIER_REQUIREMENTS[tier];
          const isCurrent = !loading && tier === currentTier;
          const isUnlocked = !loading && i <= currentIdx;

          return (
            <motion.article
              key={tier}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
              className={`relative flex flex-col rounded-2xl border bg-white p-4 shadow-sm ${
                isCurrent
                  ? `${cfg.borderColor} ring-2 ring-offset-1 ${cfg.borderColor.replace("border-", "ring-")}`
                  : "border-cream-300"
              }`}
            >
              {isCurrent && (
                <span
                  className={`absolute -top-2.5 left-4 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
                    tier === "verde"
                      ? "bg-emerald-600"
                      : tier === "plata"
                        ? "bg-slate-500"
                        : tier === "oro"
                          ? "bg-amber-600"
                          : "bg-violet-600"
                  }`}
                >
                  Tu nivel
                </span>
              )}

              <div className="mb-2 flex items-center justify-between">
                <h3 className={`text-sm font-bold ${cfg.textColor}`}>
                  {cfg.name}
                </h3>
                {isUnlocked ? (
                  <Check className={`h-4 w-4 ${cfg.textColor}`} aria-label="Nivel desbloqueado" />
                ) : (
                  <Lock className="h-4 w-4 text-[#6e737b]" aria-label="Nivel bloqueado" />
                )}
              </div>

              <p className={`mb-1 text-2xl font-black tabular-nums ${cfg.textColor}`}>
                {cfg.rate}%
                <span className="ml-1 text-xs font-medium text-[#5c6069]">
                  cashback
                </span>
              </p>

              <p className="mb-3 text-[11px] text-[#6e737b]">
                {required === 1
                  ? "Desde tu primera semana calificada"
                  : `${required} semanas calificadas en el mes`}
              </p>

              <ul className="space-y-1.5">
                {TIER_BENEFITS[tier].map((benefit) => (
                  <li key={benefit} className="flex items-start gap-1.5">
                    <Check className={`mt-0.5 h-3 w-3 flex-shrink-0 ${cfg.textColor}`} />
                    <span className="text-[11px] leading-snug text-[#5c6069]">
                      {benefit}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.article>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
