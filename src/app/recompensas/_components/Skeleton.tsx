"use client";

import { motion } from "framer-motion";

function Skeleton({
  className = "",
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className={`relative overflow-hidden rounded-xl bg-white/5 ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </motion.div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="px-4 pt-2 pb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-48" delay={0.05} />
        </div>
        <Skeleton className="h-10 w-10 rounded-xl" delay={0.1} />
      </div>

      {/* Wallet Banner */}
      <Skeleton className="h-48 w-full rounded-3xl" delay={0.15} />

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2.5">
        <Skeleton className="h-24 rounded-2xl" delay={0.2} />
        <Skeleton className="h-24 rounded-2xl" delay={0.25} />
        <Skeleton className="h-24 rounded-2xl" delay={0.3} />
      </div>

      {/* Activity feed */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" delay={0.35} />
        <Skeleton className="h-14 rounded-xl" delay={0.4} />
        <Skeleton className="h-14 rounded-xl" delay={0.45} />
        <Skeleton className="h-14 rounded-xl" delay={0.5} />
      </div>
    </div>
  );
}
