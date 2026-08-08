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

// Generate next 7 days for Mexico
export function getNextDays(): { value: string; label: string }[] {
  const days: { value: string; label: string }[] = []
  const today = new Date()
  const formatter = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() + i)
    const iso = date.toISOString().split("T")[0] ?? ""
    const label =
      i === 0
        ? `Hoy — ${formatter.format(date)}`
        : i === 1
          ? `Mañana — ${formatter.format(date)}`
          : formatter.format(date).replace(/^\w/, (c) => c.toUpperCase())
    days.push({ value: iso, label })
  }

  return days
}

export const PAYMENT_ICONS: Record<PaymentMethod, ReactNode> = {
  card: <CreditCard className="w-5 h-5" />,
  spei: <Building2 className="w-5 h-5" />,
  oxxo: <Store className="w-5 h-5" />,
  mercado_pago: <Smartphone className="w-5 h-5" />,
  cash_on_delivery: <Banknote className="w-5 h-5" />,
  codi: <QrCode className="w-5 h-5" />,
  stripe: <CreditCard className="w-5 h-5" />,
}
