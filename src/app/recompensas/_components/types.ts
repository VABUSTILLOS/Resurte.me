import { CASHBACK_TIERS } from "@/types";

export type Tab = "home" | "wallet" | "store" | "profile" | "referidos";

export type Tier = "verde" | "plata" | "oro" | "diamante";

/** Orden ascendente de niveles de recompensas. */
export const TIER_ORDER: Tier[] = ["verde", "plata", "oro", "diamante"];

/** Tasa de cashback base usada en cálculos de simulación. */
export const CASHBACK_RATE = 0.05;

/**
 * Índice numérico de cada tier — espejo de la clave de `CASHBACK_TIERS`
 * (types/index.ts), que es la fuente única del nombre y % de cashback.
 */
const TIER_INDEX: Record<Tier, number> = {
  verde: 1,
  plata: 2,
  oro: 3,
  diamante: 4,
};

export interface TierConfig {
  tier: Tier;
  name: string;
  rate: number;
  color: string;
  borderColor: string;
  textColor: string;
  bgColor: string;
}

export const TIER_CONFIGS: Record<Tier, Omit<TierConfig, 'tier'>> = {
  verde: { name: CASHBACK_TIERS[TIER_INDEX.verde]!.name, rate: CASHBACK_TIERS[TIER_INDEX.verde]!.pct, color: "emerald", borderColor: "border-emerald-500/20", textColor: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  plata: { name: CASHBACK_TIERS[TIER_INDEX.plata]!.name, rate: CASHBACK_TIERS[TIER_INDEX.plata]!.pct, color: "slate", borderColor: "border-slate-400/30", textColor: "text-slate-300", bgColor: "bg-slate-500/10" },
  oro: { name: CASHBACK_TIERS[TIER_INDEX.oro]!.name, rate: CASHBACK_TIERS[TIER_INDEX.oro]!.pct, color: "amber", borderColor: "border-amber-500/30", textColor: "text-amber-400", bgColor: "bg-amber-500/10" },
  diamante: { name: CASHBACK_TIERS[TIER_INDEX.diamante]!.name, rate: CASHBACK_TIERS[TIER_INDEX.diamante]!.pct, color: "violet", borderColor: "border-violet-400/30", textColor: "text-violet-300", bgColor: "bg-violet-500/10" },
};

export interface ServiceItem {
  id: string;
  name: string;
  tier: Tier;
  cost: number;
  category: "presencia" | "trafico" | "infraestructura";
  description: string;
  deliverables: string[];
  estimatedImpact: string;
  testimonials?: string;
  icon: string;
}

export interface ActivityItem {
  id: string;
  type: "invoice" | "redemption" | "milestone";
  title: string;
  amount: number;
  date: string;
  status: "completed" | "pending";
}

export interface Notification {
  id: string;
  type: "cashback_earned" | "milestone" | "service_ready" | "service_update" | "new_feature";
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  actionLabel?: string;
}

export interface ImpactStory {
  id: string;
  restaurantName: string;
  ownerName: string;
  serviceUsed: string;
  beforeMetric: string;
  afterMetric: string;
  metricLabel: string;
  quote: string;
  photoUrl: string;
  months: number;
}

export interface InvoiceScanState {
  status: "idle" | "scanning" | "extracting" | "success" | "error";
  progress: number;
  extracted?: {
    supplier: string;
    amount: number;
    date: string;
    folio: string;
  };
}
