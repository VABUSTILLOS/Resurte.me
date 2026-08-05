"use client"

import { ScrollReveal } from "@/components/ui/scroll-reveal"
import type { CollectionValue } from "@/lib/collection-content"

interface CollectionValueHighlightProps {
  value: CollectionValue
  index: number
}

/**
 * CollectionValueHighlight — Sección intercalada de valor culinario.
 *
 * Alterna fondos crema/blanco para ritmo visual. Layout alternado
 * con ícono grande que respira. Sin imagen para no competir con
 * el hero ni la historia.
 */
export function CollectionValueHighlight({ value, index }: CollectionValueHighlightProps) {
  const isEven = index % 2 === 0

  return (
    <section
      className={`relative overflow-hidden ${
        isEven ? "bg-white" : "bg-[#faf8f5]"
      } border-y border-[#ede8df]`}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <ScrollReveal direction={isEven ? "left" : "right"}>
          <div
            className={`flex flex-col ${
              isEven ? "lg:flex-row" : "lg:flex-row-reverse"
            } gap-10 lg:gap-20 items-center`}
          >
            {/* Icon block — breathing room */}
            <div className="shrink-0">
              <div
                className={`
                  w-24 h-24 sm:w-32 sm:h-32 rounded-[2rem] flex items-center justify-center
                  ${isEven ? "bg-[#108910]/[0.05]" : "bg-[#f7f4ef]"}
                  border border-[#108910]/[0.08] shadow-sm
                `}
              >
                <span className="text-4xl sm:text-5xl">{value.icon}</span>
              </div>
            </div>

            {/* Text block */}
            <div className="flex-1 text-center lg:text-left">
              {/* Index label */}
              <span className="inline-block text-[10px] font-semibold tracking-[0.3em] uppercase text-[#999893] mb-4">
                {String(index + 1).padStart(2, "0")}
              </span>

              <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#1a1a1a] tracking-tight leading-[1.2] mb-5">
                {value.title}
              </h3>

              {/* Thin ornamental line */}
              <div
                className={`w-12 h-[2px] bg-[#108910]/20 mb-5 ${
                  isEven ? "lg:ml-0 mx-auto" : "lg:mr-0 mx-auto"
                }`}
              />

              <p className="text-base sm:text-lg text-[#5a5a5a] leading-[1.8] max-w-xl lg:max-w-none">
                {value.description}
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>

      {/* Giant background watermark — very subtle */}
      <div
        className="absolute top-1/2 -translate-y-1/2 text-[10rem] sm:text-[14rem] opacity-[0.012] select-none pointer-events-none leading-none"
        style={{ [isEven ? "right" : "left"]: "-3rem" }}
      >
        {value.icon}
      </div>
    </section>
  )
}
