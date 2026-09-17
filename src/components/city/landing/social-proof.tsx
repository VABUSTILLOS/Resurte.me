import { BadgeCheck, MapPin, Truck, Wallet } from "lucide-react"
import { DELIVERY_CITIES, MIN_ORDER_MXN, formatMxn } from "@/lib/commercial-facts"

export function SocialProof() {
  return (
      <section className="bg-white border-b border-[#E8E9EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: formatMxn(MIN_ORDER_MXN), label: "Pedido mínimo", icon: Wallet },
              { value: "0", label: "Costo de membresía", icon: BadgeCheck },
              { value: String(DELIVERY_CITIES), label: "Ciudades en México", icon: MapPin },
              { value: "Hoy", label: "Tiempo de entrega", icon: Truck },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center gap-1.5">
                <stat.icon className="w-5 h-5 text-[#0E7A0E] mb-1" />
                <span className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-tight">{stat.value}</span>
                <span className="text-[13px] text-[var(--text-secondary)]">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
  )
}
