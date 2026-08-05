"use client"

import { ScrollReveal } from "@/components/ui/scroll-reveal"
import type { CollectionValue } from "@/lib/collection-content"

interface CollectionValueHighlightProps {
  value: CollectionValue
  index: number
}

/**
 * CollectionValueHighlight — Sección de valor tipo Erewhon.
 *
 * Alterna layouts, fondos texturizados, tipografía editorial y
 * espaciado generoso. Cada tarjeta funciona como un "billboard"
 * de marca que respira el tono premium de la colección.
 */
export function CollectionValueHighlight({ value, index }: CollectionValueHighlightProps) {
  const isEven = index % 2 === 0
  const bg = isEven ? "bg-white" : "bg-[#fbf9f6]"
  const accent = index === 0 ? "bg-[#108910]/8" : index === 1 ? "bg-[#c8a45a]/8" : "bg-[#2b2b2b]/8"
  const accentBorder = index === 0 ? "border-[#108910]/12" : index === 1 ? "border-[#c8a45a]/12" : "border-[#2b2b2b]/10"
  const dotColor = index === 0 ? "bg-[#108910]" : index === 1 ? "bg-[#c8a45a]" : "bg-[#2b2b2b]"
  const lineColor = index === 0 ? "bg-[#108910]/25" : index === 1 ? "bg-[#c8a45a]/25" : "bg-[#2b2b2b]/15"

  return (
    <section className={`relative overflow-hidden ${bg} border-y border-[#ece6db]`}>
      {/* Subtle grain texture overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.015]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
      }} />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-24 lg:py-28">
        <ScrollReveal direction={isEven ? "left" : "right"}>
          <div
            className={`flex flex-col ${
              isEven ? "lg:flex-row" : "lg:flex-row-reverse"
            } gap-8 sm:gap-12 lg:gap-24 items-center`}
          >
            {/* Icon pillar — grand, breathing, premium */}
            <div className="shrink-0 relative">
              {/* Outer glow ring */}
              <div className={`absolute inset-0 rounded-[2.5rem] ${accent} blur-2xl opacity-60 scale-125`} />
              <div
                className={`relative w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 rounded-[2rem] sm:rounded-[2.5rem] lg:rounded-[3rem] flex items-center justify-center ${accent} border ${accentBorder} shadow-sm`}
              >
                <span className="text-4xl sm:text-5xl lg:text-6xl">{value.icon}</span>
              </div>
              {/* Dot accent */}
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full ${dotColor} border-2 border-white shadow-sm`} />
            </div>

            {/* Text pillar — editorial typography */}
            <div className="flex-1 text-center lg:text-left max-w-lg">
              {/* Index badge */}
              <div className="inline-flex items-center gap-3 mb-4 sm:mb-6">
                <span className="text-[11px] sm:text-xs font-medium tracking-[0.35em] uppercase text-[#a09a90]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={`block w-6 h-px ${lineColor}`} />
                <span className="text-[10px] sm:text-[11px] font-medium tracking-[0.3em] uppercase text-[#a09a90]">
                  {index === 0 ? "Valor" : index === 1 ? "Confianza" : "Servicio"}
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-[#1a1a1a] tracking-[-0.02em] leading-[1.15] mb-4 sm:mb-6">
                {value.title}
              </h3>

              {/* Ornamental divider */}
              <div className={`flex items-center gap-2 mb-5 sm:mb-7 ${isEven ? "lg:justify-start justify-center" : "lg:justify-start justify-center"}`}>
                <span className={`block w-10 sm:w-14 h-px ${lineColor}`} />
                <span className={`block w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full ${dotColor}`} />
                <span className={`block w-3 sm:w-4 h-px ${lineColor}`} />
              </div>

              <p className="text-sm sm:text-base lg:text-lg text-[#5a5a5a] leading-[1.75] sm:leading-[1.85]">
                {value.description}
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>

      {/* Background watermark — ghost icon */}
      <div
        className="absolute top-1/2 -translate-y-1/2 text-[10rem] sm:text-[14rem] lg:text-[18rem] opacity-[0.01] select-none pointer-events-none leading-none"
        style={{ [isEven ? "right" : "left"]: "-3rem" }}
      >
        {value.icon}
      </div>
    </section>
  )
}
