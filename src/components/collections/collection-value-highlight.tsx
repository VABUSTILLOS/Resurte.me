"use client"

import { ScrollReveal } from "@/components/ui/scroll-reveal"
import type { CollectionValue } from "@/lib/collection-content"

interface CollectionValueHighlightProps {
  value: CollectionValue
  index: number
}

/**
 * CollectionValueHighlight — Banner intercalado que enaltece un valor
 * de la colección.
 *
 * Se alterna el layout según el índice (izquierda/derecha) para
 * crear ritmo visual mientras el usuario baja por el catálogo.
 */
export function CollectionValueHighlight({ value, index }: CollectionValueHighlightProps) {
  const isEven = index % 2 === 0

  return (
    <section className="relative overflow-hidden bg-[#faf8f5] border-y border-[#ede8df]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <ScrollReveal direction={isEven ? "left" : "right"}>
          <div
            className={`flex flex-col ${isEven ? "lg:flex-row" : "lg:flex-row-reverse"} gap-8 lg:gap-16 items-center`}
          >
            {/* Icon + visual block */}
            <div className="shrink-0">
              <div
                className={`
                  w-28 h-28 sm:w-36 sm:h-36 rounded-3xl flex items-center justify-center
                  ${isEven ? "bg-[#108910]/5" : "bg-[#f7f4ef]"}
                  border border-[#108910]/10 shadow-sm
                `}
              >
                <span className="text-5xl sm:text-6xl">{value.icon}</span>
              </div>
            </div>

            {/* Text block */}
            <div className="flex-1 text-center lg:text-left">
              {/* Index badge */}
              <span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-[#999893] mb-3">
                {String(index + 1).padStart(2, "0")} — Valor
              </span>

              <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#1a1a1a] tracking-tight mb-4">
                {value.title}
              </h3>

              {/* Ornamental divider */}
              <div
                className={`w-12 h-px bg-[#108910]/30 mb-5 ${isEven ? "lg:ml-0 mx-auto" : "lg:mr-0 mx-auto"}`}
              />

              <p className="text-base text-[#6b6b6b] leading-relaxed max-w-xl lg:max-w-none">
                {value.description}
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>

      {/* Subtle decorative background element */}
      <div
        className="absolute top-1/2 -translate-y-1/2 text-[12rem] sm:text-[16rem] opacity-[0.015] select-none pointer-events-none"
        style={{ [isEven ? "right" : "left"]: "-4rem" }}
      >
        {value.icon}
      </div>
    </section>
  )
}
