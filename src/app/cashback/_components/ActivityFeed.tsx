"use client";

import { motion } from "framer-motion";
import { CheckCircle, Clock, TrendingUp } from "lucide-react";
import type { ActivityItem } from "./types";

const sampleActivities: ActivityItem[] = [
  {
    id: "1",
    type: "invoice",
    title: "Pedido #1024 — Frutas, carnes y lácteos",
    amount: 750,
    date: "Hoy, 14:32",
    status: "completed",
  },
  {
    id: "2",
    type: "redemption",
    title: "Optimización Google Maps",
    amount: -2800,
    date: "Ayer, 10:15",
    status: "completed",
  },
  {
    id: "3",
    type: "invoice",
    title: "Pedido #1020 — Abarrotes y verduras",
    amount: 620,
    date: "15 Jul, 09:45",
    status: "completed",
  },
  {
    id: "4",
    type: "invoice",
    title: "Pedido #1018 — Carnes y especias",
    amount: 340,
    date: "14 Jul, 16:20",
    status: "pending",
  },
  {
    id: "5",
    type: "milestone",
    title: "¡Llegaste a $10,000 acumulados!",
    amount: 0,
    date: "10 Jul",
    status: "completed",
  },
];

const iconMap = {
  invoice: TrendingUp,
  redemption: CheckCircle,
  milestone: ({ className }: { className?: string }) => (
    <span className={className}>🎉</span>
  ),
};

export function ActivityFeed() {
  return (
    <div className="mx-4 mt-6 md:mx-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white text-base font-bold">Actividad Reciente</h2>
        <button className="text-emerald-400 text-xs font-medium">Ver todo →</button>
      </div>

      <div className="space-y-2">
        {sampleActivities.map((activity, i) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i + 0.5, duration: 0.35 }}
            className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/5 p-3"
          >
            {/* Icon */}
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
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
              <p className="text-white text-sm font-medium truncate">{activity.title}</p>
              <p className="text-gray-500 text-xs">{activity.date}</p>
            </div>

            {/* Amount */}
            {activity.amount !== 0 && (
              <span
                className={`text-sm font-bold tabular-nums ${
                  activity.amount > 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {activity.amount > 0 ? "+" : ""}
                ${Math.abs(activity.amount).toLocaleString("es-MX")} MXN
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
