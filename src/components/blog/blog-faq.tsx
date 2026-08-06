"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

interface FAQItem {
  question: string
  answer: string
}

/** Acordeón de preguntas frecuentes para el final de cada post. */
export function BlogFAQ({ items }: { items: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  if (!items || items.length === 0) return null

  return (
    <section className="mt-10 rounded-2xl border border-warm-200 bg-white p-6 sm:p-8">
      <h2 className="text-xl font-bold text-warm-900 sm:text-2xl">
        Preguntas frecuentes
      </h2>
      <div className="mt-4 divide-y divide-warm-100">
        {items.map((item, i) => {
          const isOpen = openIndex === i
          return (
            <div key={i} className="py-3">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-semibold text-warm-900 sm:text-base">
                  {item.question}
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-warm-400 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
              {isOpen && (
                <p className="mt-2 pr-8 text-sm leading-relaxed text-warm-600">
                  {item.answer}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
