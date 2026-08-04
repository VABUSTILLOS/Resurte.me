export type Tab = "home" | "wallet" | "store" | "profile";

export type Tier = "verde" | "plata" | "oro" | "negro";

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
  verde: { name: "Verde", rate: 5, color: "emerald", borderColor: "border-emerald-500/20", textColor: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  plata: { name: "Plata", rate: 10, color: "slate", borderColor: "border-slate-400/30", textColor: "text-slate-300", bgColor: "bg-slate-500/10" },
  oro: { name: "Oro", rate: 15, color: "amber", borderColor: "border-amber-500/30", textColor: "text-amber-400", bgColor: "bg-amber-500/10" },
  negro: { name: "Negro", rate: 20, color: "violet", borderColor: "border-violet-400/30", textColor: "text-violet-300", bgColor: "bg-violet-500/10" },
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

export interface WalletState {
  balance: number;
  monthlyCashback: number;
  monthlySpend: number;
  cashbackRate: number;
  pendingBalance: number;
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

export interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  illustration: string;
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
