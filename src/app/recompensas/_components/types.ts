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
  verde: { name: CASHBACK_TIERS[TIER_INDEX.verde]!.name, rate: CASHBACK_TIERS[TIER_INDEX.verde]!.pct, color: "emerald", borderColor: "border-emerald-200", textColor: "text-emerald-700", bgColor: "bg-emerald-50" },
  plata: { name: CASHBACK_TIERS[TIER_INDEX.plata]!.name, rate: CASHBACK_TIERS[TIER_INDEX.plata]!.pct, color: "slate", borderColor: "border-slate-300", textColor: "text-slate-600", bgColor: "bg-slate-50" },
  oro: { name: CASHBACK_TIERS[TIER_INDEX.oro]!.name, rate: CASHBACK_TIERS[TIER_INDEX.oro]!.pct, color: "amber", borderColor: "border-amber-300", textColor: "text-amber-700", bgColor: "bg-amber-50" },
  diamante: { name: CASHBACK_TIERS[TIER_INDEX.diamante]!.name, rate: CASHBACK_TIERS[TIER_INDEX.diamante]!.pct, color: "violet", borderColor: "border-violet-300", textColor: "text-violet-700", bgColor: "bg-violet-50" },
};

/** Beneficios completos por nivel — fuente única usada por LoyaltyTierCard y la comparativa de niveles. */
export const TIER_BENEFITS: Record<Tier, string[]> = {
  verde: [
    "5% de cashback en todas tus compras",
    "Acceso a monedero digital",
    "Soporte por WhatsApp",
  ],
  plata: [
    "10% de cashback en todas tus compras",
    "Prioridad en entregas programadas",
    "Acceso a herramientas de costeo",
  ],
  oro: [
    "15% de cashback en todas tus compras",
    "Envío gratis en pedidos desde $1,500",
    "Asesor de cuenta dedicado",
    "Acceso anticipado a nuevos productos",
  ],
  diamante: [
    "20% de cashback en todas tus compras",
    "Envío gratis sin mínimo",
    "Asesor de cuenta VIP 24/7",
    "Productos exclusivos por mayoreo",
    "Invitación a eventos de la industria",
  ],
};

/** Semanas calificadas (compra semanal ≥ QUALIFYING_WEEK_MIN) necesarias para alcanzar cada nivel. */
export const TIER_REQUIREMENTS: Record<Tier, number> = {
  verde: 1,
  plata: 2,
  oro: 3,
  diamante: 4,
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

// ---------------------------------------------------------------------------
// Logros (badges) — se desbloquean con datos reales de compras y monedero
// ---------------------------------------------------------------------------

/** Datos reales agregados contra los que se evalúan los logros. */
export interface AchievementStats {
  totalOrders: number;
  totalRewards: number;
  totalRedemptions: number;
  tier: Tier;
  weekStreak: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  isUnlocked: (stats: AchievementStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "primera-compra",
    title: "Primera compra",
    description: "Realizaste tu primer pedido de insumos",
    icon: "🛒",
    isUnlocked: (s) => s.totalOrders >= 1,
  },
  {
    id: "cliente-frecuente",
    title: "Cliente frecuente",
    description: "Acumula 5 pedidos en el programa",
    icon: "📦",
    isUnlocked: (s) => s.totalOrders >= 5,
  },
  {
    id: "primer-canje",
    title: "Primer canje",
    description: "Canjeaste Créditos por un servicio de la Tienda",
    icon: "🎁",
    isUnlocked: (s) => s.totalRedemptions >= 1,
  },
  {
    id: "nivel-plata",
    title: "Nivel Plata",
    description: "Alcanzaste el nivel Plata o superior",
    icon: "🥈",
    isUnlocked: (s) => TIER_ORDER.indexOf(s.tier) >= TIER_ORDER.indexOf("plata"),
  },
  {
    id: "nivel-oro",
    title: "Nivel Oro",
    description: "Alcanzaste el nivel Oro o superior",
    icon: "🥇",
    isUnlocked: (s) => TIER_ORDER.indexOf(s.tier) >= TIER_ORDER.indexOf("oro"),
  },
  {
    id: "nivel-diamante",
    title: "Nivel Diamante",
    description: "El nivel máximo del programa",
    icon: "💎",
    isUnlocked: (s) => s.tier === "diamante",
  },
  {
    id: "racha-3",
    title: "Constancia",
    description: "3 semanas calificadas seguidas",
    icon: "🔥",
    isUnlocked: (s) => s.weekStreak >= 3,
  },
  {
    id: "mil-creditos",
    title: "Acumulador",
    description: "$1,000 en Créditos generados en total",
    icon: "💰",
    isUnlocked: (s) => s.totalRewards >= 1000,
  },
];
