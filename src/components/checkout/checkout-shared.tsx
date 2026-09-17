"use client"

import { CreditCard, Building2, Store, Smartphone, Banknote, QrCode } from "lucide-react"
import type { ReactNode } from "react"
import type { PaymentMethod } from "@/types"

export type Step = "address" | "schedule" | "review" | "payment"

export interface AddressForm {
  label: string
  street: string
  number: string
  interior: string
  neighborhood: string
  zip_code: string
  references: string
}

export interface ScheduleForm {
  date: string
  time: string
}

export const DEFAULT_ADDRESS_FORM: AddressForm = {
  label: "Casa",
  street: "",
  number: "",
  interior: "",
  neighborhood: "",
  zip_code: "",
  references: "",
}

export const DELIVERY_TIMES = [
  "8:00 AM — 10:00 AM",
  "10:00 AM — 12:00 PM",
  "12:00 PM — 2:00 PM",
  "2:00 PM — 4:00 PM",
  "4:00 PM — 6:00 PM",
  "6:00 PM — 8:00 PM",
]

// Los próximos 7 días de entrega viven en `@/lib/delivery-days`: se calculan
// sobre el día LOCAL del restaurante, no sobre el día UTC. Se reexporta
// `getNextDays` para no tocar a quienes ya lo importaban de este módulo; el tipo
// `DeliveryDay` se importa de `@/lib/delivery-days` directamente.
export { getNextDays } from "@/lib/delivery-days"

export const PAYMENT_ICONS: Record<PaymentMethod, ReactNode> = {
  card: <CreditCard className="w-5 h-5" />,
  spei: <Building2 className="w-5 h-5" />,
  oxxo: <Store className="w-5 h-5" />,
  mercado_pago: <Smartphone className="w-5 h-5" />,
  cash_on_delivery: <Banknote className="w-5 h-5" />,
  codi: <QrCode className="w-5 h-5" />,
  stripe: <CreditCard className="w-5 h-5" />,
}
