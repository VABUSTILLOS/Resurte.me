"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Lock, Trophy } from "lucide-react";
import {
  getUserPurchaseHistory,
  getTotalRewards,
  getWalletHistory,
} from "@/lib/wallet-actions";
import { useLoyaltyTier } from "./LoyaltyTierCard";
import { useQualifyingStreak } from "./use-qualifying-streak";
import { ACHIEVEMENTS } from "./types";
import type { AchievementStats } from "./types";

/**
 * Insignias desbloqueables calculadas 100% con datos reales ya expuestos
 * por los server actions del monedero (sin backend nuevo).
 */
export function AchievementsSection() {
  const { tier, loading: tierLoading } = useLoyaltyTier();
  const { streak, loading: streakLoading } = useQualifyingStreak();
  const [stats, setStats] = useState<Omit<AchievementStats, "tier" | "weekStreak"> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [history, rewards, wallet] = await Promise.all([
          getUserPurchaseHistory(0, 1),
          getTotalRewards(),
          getWalletHistory(0, 50),
        ]);
        if (cancelled) return;
        const redemptions = wallet.transactions.filter((t) => Number(t.amount) < 0).length;
        setStats({
          totalOrders: history.total,
          totalRewards: rewards,
          totalRedemptions: redemptions,
        });
      } catch {
        if (!cancelled) {
          setStats({ totalOrders: 0, totalRewards: 0, totalRedemptions: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || tierLoading || streakLoading || !stats) {
    return (
      <div className="mx-4 mt-4 rounded-2xl bg-white border border-cream-300 shadow-sm p-4 md:mx-6 lg:mx-0 animate-pulse">
        <div className="h-3 w-24 rounded bg-cream-100 mb-3" />
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-cream-100" />
          ))}
        </div>
      </div>
    );
  }

  const full: AchievementStats = { ...stats, tier, weekStreak: streak };
  const unlockedCount = ACHIEVEMENTS.filter((a) => a.isUnlocked(full)).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.4 }}
      className="mx-4 mt-4 rounded-2xl bg-white border border-cream-300 shadow-sm p-4 md:mx-6 lg:mx-0"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
          <Trophy className="h-4 w-4 text-amber-600" />
        </div>
        <p className="text-warm-700 text-[13px] font-bold">Tus logros</p>
        <span className="ml-auto text-[#6e737b] text-[11px] font-medium">
          {unlockedCount} de {ACHIEVEMENTS.length}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {ACHIEVEMENTS.map((a) => {
          const unlocked = a.isUnlocked(full);
          return (
            <div
              key={a.id}
              title={a.description}
              className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition-colors ${
                unlocked
                  ? "bg-brand-50 border-brand-200"
                  : "bg-cream-50 border-cream-300 opacity-70"
              }`}
            >
              <span className={`text-xl ${unlocked ? "" : "grayscale"}`}>
                {a.icon}
              </span>
              <p className="text-warm-700 text-[10px] font-semibold leading-tight">
                {a.title}
              </p>
              {unlocked ? (
                <span className="text-brand-500 text-[9px] font-bold">Desbloqueado</span>
              ) : (
                <span className="flex items-center gap-0.5 text-[#6e737b] text-[9px]">
                  <Lock className="h-2.5 w-2.5" /> Bloqueado
                </span>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
