"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, TrendingUp } from "lucide-react";
import type { ActivityItem } from "./types";
import { getWalletHistory } from "@/lib/wallet-actions";
import { formatNumber } from "@/lib/money";

// Mapea los movimientos reales del monedero a items de actividad.
// amount > 0 = cashback (invoice), amount < 0 = canje de servicio (redemption).
function toActivityItem(tx: {
  id: number;
  amount: number;
  concept: string;
  created_at: string;
}): ActivityItem {
  return {
    id: String(tx.id),
    type: tx.amount > 0 ? "invoice" : "redemption",
    title: tx.concept,
    amount: tx.amount,
    date: new Date(tx.created_at).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
    }),
    status: "completed",
  };
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchActivity() {
      try {
        const { transactions } = await getWalletHistory(0, 5);
        if (!cancelled) setActivities(transactions.map(toActivityItem));
      } catch {
        setActivities([]);
      }
    }

    fetchActivity();

    return () => {
      cancelled = true;
    };
  }, []);

  if (activities.length === 0) {
    return (
      <div className="mx-4 mt-4 md:mx-0">
        <h2 className="text-white text-[15px] font-bold mb-2">Actividad Reciente</h2>
        <div className="rounded-xl bg-white/5 border border-white/5 p-4">
          <p className="text-gray-500 text-xs">
            Aún no tienes movimientos. Tus cashbacks y canjes aparecerán aquí.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-4 md:mx-0">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white text-[15px] font-bold">Actividad Reciente</h2>
      </div>

      <div className="space-y-2">
        {activities.map((activity, i) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i + 0.5, duration: 0.35 }}
            className="flex items-center gap-2.5 rounded-xl bg-white/5 border border-white/5 p-2.5"
          >
            {/* Icon */}
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                activity.status === "pending"
                  ? "bg-amber-500/15"
                  : activity.type === "milestone"
                    ? "bg-purple-500/15"
                    : "bg-emerald-500/15"
              }`}
            >
              {activity.type === "milestone" ? (
                <span className="text-lg">🎉</span>
              ) : activity.status === "pending" ? (
                <Clock className="h-4 w-4 text-amber-400" />
              ) : activity.type === "redemption" ? (
                <CheckCircle className="h-4 w-4 text-emerald-400" />
              ) : (
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13px] font-medium truncate">{activity.title}</p>
              <p className="text-gray-500 text-[10px]">{activity.date}</p>
            </div>

            {/* Amount */}
            {activity.amount !== 0 && (
              <span
                className={`text-[13px] font-bold tabular-nums ${
                  activity.amount > 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {activity.amount > 0 ? "+" : ""}
                ${formatNumber(Math.abs(activity.amount))} Créditos
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
