export type Tab = "home" | "wallet" | "store" | "profile";

export type Tier = "basic" | "intermediate" | "advanced";

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
