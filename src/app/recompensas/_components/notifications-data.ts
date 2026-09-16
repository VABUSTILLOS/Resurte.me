import type { Notification, Tier } from "./types";
import { TIER_ORDER, TIER_CONFIGS, TIER_REQUIREMENTS } from "./types";
import { QUALIFYING_WEEK_MIN } from "@/lib/utils";
import { formatNumber } from "@/lib/money";
import type { WeekProgress } from "@/lib/wallet-progress";

/** Movimiento del monedero (forma de `wallet_transactions`). */
export interface WalletMovement {
  id: number;
  amount: number;
  concept: string;
  created_at: string;
}

export interface DeriveNotificationsInput {
  movements: WalletMovement[];
  tier: Tier;
  weekCount: number;
  /** Progreso de la semana en curso (opcional: activa los avisos semanales). */
  weekProgress?: WeekProgress | null;
  now?: Date;
}

const MAX_NOTIFICATIONS = 8;

/** "Ahora", "hace 5 min", "hace 3 h", "ayer", "hace 4 días" o fecha corta. */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/**
 * Deriva notificaciones "inteligentes" a partir de datos reales del programa
 * de recompensas (movimientos del monedero + progreso de nivel), sin backend
 * nuevo. Los IDs son deterministas para poder persistir el estado "leído".
 * Orden: relevancia (metas/nivel) primero, luego movimientos por fecha desc.
 */
export function deriveNotifications({
  movements,
  tier,
  weekCount,
  weekProgress = null,
  now = new Date(),
}: DeriveNotificationsInput): Notification[] {
  const derived: Notification[] = [];

  if (weekCount >= TIER_REQUIREMENTS.diamante) {
    // 1. Meta mensual: 4 semanas calificadas = nivel máximo desbloqueado.
    derived.push({
      id: `meta-mensual-${now.getFullYear()}-${now.getMonth()}`,
      type: "milestone",
      title: "¡Meta mensual alcanzada! 🎉",
      body: `Calificaste ${weekCount} semanas este mes: desbloqueaste el nivel ${TIER_CONFIGS.diamante.name} con ${TIER_CONFIGS.diamante.rate}% de cashback.`,
      timestamp: "Este mes",
      read: false,
      actionLabel: "Ver mi nivel",
    });
  } else {
    // 2. Progreso al siguiente nivel (si no estás en el máximo).
    const nextTier = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1];
    if (nextTier) {
      const remaining = TIER_REQUIREMENTS[nextTier] - weekCount;
      if (remaining > 0) {
        derived.push({
          id: `nivel-progreso-${tier}-${weekCount}`,
          type: "milestone",
          title: `Estás a ${remaining} semana${remaining === 1 ? "" : "s"} de subir a nivel ${TIER_CONFIGS[nextTier].name}`,
          body: `Suma compras desde $${formatNumber(QUALIFYING_WEEK_MIN)} por semana y gana ${TIER_CONFIGS[nextTier].rate}% de cashback en todo.`,
          timestamp: "Esta semana",
          read: false,
          actionLabel: "Ver mi nivel",
        });
      }
    }
    // 3. Racha de semanas calificadas (refuerzo de constancia).
    if (weekCount >= 2) {
      derived.push({
        id: `racha-semanas-${weekCount}`,
        type: "milestone",
        title: `Llevas ${weekCount} semanas calificadas seguidas`,
        body: "¡Constancia imparable! Cada semana calificada te acerca a un nivel con más cashback.",
        timestamp: "Este mes",
        read: false,
      });
    }
  }

  // 4. Avisos de la semana ISO en curso. Los IDs incluyen la semana, así que
  // el estado "leído" se reinicia solo cada lunes, sin backend nuevo.
  if (weekProgress) {
    const key = weekProgress.weekKey;
    if (weekProgress.qualifies) {
      derived.push({
        id: `semana-calificada-${key}`,
        type: "milestone",
        title: "Semana calificada ✅",
        body: `Sumaste $${formatNumber(Math.round(weekProgress.weekSpend))} esta semana: tus Créditos ya se abonan al ${weekProgress.tierPct}%.`,
        timestamp: "Esta semana",
        read: false,
        actionLabel: "Ver mi monedero",
      });
    } else if (weekProgress.weekSpend <= 0 && weekProgress.daysLeft <= 3) {
      derived.push({
        id: `semana-sin-compras-${key}`,
        type: "milestone",
        title:
          weekProgress.daysLeft <= 0
            ? "Último día para calificar la semana"
            : "Aún no compras esta semana",
        body: `Te faltan $${formatNumber(weekProgress.remainingToQualify)} para calificarla y asegurar tus Créditos.`,
        timestamp: "Esta semana",
        read: false,
        actionLabel: "Ver catálogo",
      });
    } else if (weekProgress.remainingToQualify > 0 && weekProgress.daysLeft <= 2) {
      derived.push({
        id: `cierre-semana-${key}`,
        type: "milestone",
        title: `Te faltan $${formatNumber(Math.round(weekProgress.remainingToQualify))} para cerrar la semana`,
        body:
          weekProgress.daysLeft <= 0
            ? "Hoy es el último día de la semana: completa el mínimo y califica."
            : `Quedan ${weekProgress.daysLeft} día${weekProgress.daysLeft === 1 ? "" : "s"} para llegar a $${formatNumber(weekProgress.qualifyingMin)}.`,
        timestamp: "Esta semana",
        read: false,
        actionLabel: "Completar pedido",
      });
    }
  }

  // 5. Movimientos recientes del monedero (más recientes primero).
  const sorted = [...movements].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  for (const tx of sorted) {
    const isCashback = tx.amount > 0;
    derived.push({
      id: `tx-${tx.id}`,
      type: isCashback ? "cashback_earned" : "service_ready",
      title: isCashback
        ? `Cashback acreditado: +$${formatNumber(tx.amount)}`
        : "Servicio canjeado",
      body: isCashback
        ? tx.concept
        : `${tx.concept} · -$${formatNumber(Math.abs(tx.amount))} créditos`,
      timestamp: formatRelativeTime(new Date(tx.created_at), now),
      read: false,
    });
  }

  return derived.slice(0, MAX_NOTIFICATIONS);
}
