import Link from "next/link"
import { MapPin } from "lucide-react"
import { MEXICO_CITIES } from "@/lib/cities"
import { DELIVERY_COVERAGE_PROSE } from "@/lib/commercial-facts"
import { cn } from "@/lib/utils"

export function DeliveryZones({ currentCitySlug }: { currentCitySlug: string }) {
  return (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center mb-8">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#0E7A0E] mb-2.5">
            Cobertura
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] tracking-tight text-balance">
            Zonas de entrega
          </h2>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-3">
            Hoy entregamos solo en {DELIVERY_COVERAGE_PROSE}. Muy pronto en tu
            ciudad: escríbenos y te avisamos.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto">
          {MEXICO_CITIES.map((c) =>
            c.is_active ? (
              <Link
                key={c.slug}
                href={`/${c.slug}`}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-sm transition-all",
                  c.slug === currentCitySlug
                    ? "bg-[#0E7A0E] text-white border-[#0E7A0E]"
                    : "border-[#E8E9EB] text-[var(--text-secondary)] hover:border-[#0E7A0E]/40 hover:text-[#0E7A0E] hover:bg-[#E9FBE9]"
                )}
              >
                <MapPin className="w-3 h-3" />
                {c.name}
              </Link>
            ) : (
              <span
                key={c.slug}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-[#E8E9EB] text-sm text-[var(--text-secondary)] opacity-70"
              >
                <MapPin className="w-3 h-3" />
                {c.name}
                <span className="rounded-full bg-[#F1F0EC] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#5C6068]">
                  Próximamente
                </span>
              </span>
            )
          )}
        </div>
      </section>
  )
}
