"use client";

import { useEffect, useState } from "react";
import { getUserPurchaseHistory } from "@/lib/wallet-actions";
import { QUALIFYING_WEEK_MIN } from "@/lib/utils";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Timestamp del lunes (00:00 local) de la semana ISO de una fecha. */
function mondayOfWeek(d: Date): number {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}

/**
 * Racha de semanas calificadas consecutivas (gasto >= QUALIFYING_WEEK_MIN
 * por semana, solo pedidos pagados y no cancelados). Si la semana actual
 * aún no califica, la racha se ancla a la semana anterior.
 */
export function useQualifyingStreak(): { streak: number; loading: boolean } {
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { orders } = await getUserPurchaseHistory(0, 50);
        if (cancelled) return;

        const weeklySpend = new Map<number, number>();
        for (const o of orders) {
          if (o.payment_status !== "paid" || o.status === "cancelled") continue;
          const monday = mondayOfWeek(new Date(o.created_at));
          weeklySpend.set(monday, (weeklySpend.get(monday) ?? 0) + Number(o.total));
        }

        const qualifies = (monday: number) =>
          (weeklySpend.get(monday) ?? 0) >= QUALIFYING_WEEK_MIN;

        let cursor = mondayOfWeek(new Date());
        if (!qualifies(cursor)) cursor -= WEEK_MS;

        let count = 0;
        while (qualifies(cursor)) {
          count += 1;
          cursor -= WEEK_MS;
        }
        if (!cancelled) setStreak(count);
      } catch {
        // Mantener racha en 0
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { streak, loading };
}
