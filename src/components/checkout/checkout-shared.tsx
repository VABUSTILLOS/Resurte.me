"use client"

import { CreditCard, Building2, Store, Smartphone, Banknote, QrCode } from "lucide-react"
import type { ReactNode } from "react"
import type { PaymentMethod } from "@/types"
import { DELIVERY_SLOTS } from "@/lib/delivery-slots"

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

// Las franjas viven en `@/lib/delivery-slots` (fuente única desde
// la Ola 7: las leen la web, WhatsApp, el panel y el servidor).
// Aquí solo se proyectan las etiquetas, con el mismo orden y
// texto de siempre.
export const DELIVERY_TIMES = DELIVERY_SLOTS.map((slot) => slot.label)

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
