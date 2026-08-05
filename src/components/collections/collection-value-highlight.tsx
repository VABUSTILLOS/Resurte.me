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
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-12 sm:py-20 lg:py-24">
        <ScrollReveal direction={isEven ? "left" : "right"}>
          <div
            className={`flex flex-col ${
              isEven ? "lg:flex-row" : "lg:flex-row-reverse"
            } gap-6 sm:gap-10 lg:gap-20 items-center`}
          >
            {/* Icon block — breathing room */}
            <div className="shrink-0">
              <div
                className={`
                  w-20 h-20 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center
                  ${isEven ? "bg-[#108910]/[0.05]" : "bg-[#f7f4ef]"}
                  border border-[#108910]/[0.08] shadow-sm
                `}
              >
                <span className="text-3xl sm:text-4xl lg:text-5xl">{value.icon}</span>
              </div>
            </div>

            {/* Text block */}
            <div className="flex-1 text-center lg:text-left">
              {/* Index label */}
              <span className="inline-block text-[10px] font-semibold tracking-[0.3em] uppercase text-[#999893] mb-3 sm:mb-4">
                {String(index + 1).padStart(2, "0")}
              </span>

              <h3 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold text-[#1a1a1a] tracking-tight leading-[1.2] mb-3 sm:mb-5">
                {value.title}
              </h3>

              {/* Thin ornamental line */}
              <div
                className={`w-10 sm:w-12 h-[2px] bg-[#108910]/20 mb-4 sm:mb-5 ${
                  isEven ? "lg:ml-0 mx-auto" : "lg:mr-0 mx-auto"
                }`}
              />

              <p className="text-sm sm:text-base lg:text-lg text-[#5a5a5a] leading-[1.7] sm:leading-[1.8] max-w-xl lg:max-w-none">
                {value.description}
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>

      {/* Giant background watermark — very subtle */}
      <div
        className="absolute top-1/2 -translate-y-1/2 text-[8rem] sm:text-[10rem] lg:text-[14rem] opacity-[0.012] select-none pointer-events-none leading-none"
        style={{ [isEven ? "right" : "left"]: "-2rem" }}
      >
        {value.icon}
      </div>
    </section>
  )
}
