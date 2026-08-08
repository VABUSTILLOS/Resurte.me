"use client"

import Image from "next/image"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import type { CollectionStory } from "@/lib/collection-content"

interface CollectionStorySectionProps {
  story: CollectionStory
  collectionName: string
}

/**
 * CollectionStorySection — Sección editorial con imagen propia.
 *
 * Tratamiento de revista: generoso espacio en blanco, tipografía
 * refinada con leading amplio, y una imagen decorativa propia
 * (nunca se repite la del hero). En mobile el texto manda.
 * El label cambia por colección — ya no es genérico.
 */
export function CollectionStorySection({
  story,
  collectionName,
}: CollectionStorySectionProps) {
  return (
    <section className="relative overflow-hidden bg-[#faf8f5]">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14 sm:py-24 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 sm:gap-12 lg:gap-20 items-center">
          {/* ── Text column — takes more space ── */}
          <ScrollReveal className="lg:col-span-3 order-2 lg:order-1">
            {/* Label — collection-specific */}
            <span className="inline-block text-[10px] sm:text-[11px] font-semibold tracking-[0.25em] uppercase text-[#0E7A0E]/70 mb-4 sm:mb-6">
              {story.storyLabel || "Nuestra Historia"}
            </span>

            <h2 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-[#1a1a1a] tracking-tight leading-[1.12] mb-5 sm:mb-8">
              {story.title}
            </h2>

            {/* Ornamental line */}
            <div className="w-12 sm:w-16 h-[2px] bg-[#0E7A0E]/25 mb-5 sm:mb-8" />

            {/* Body text — editorial leading */}
            <div className="space-y-4 sm:space-y-5">
              {story.body.split("\n\n").map((paragraph, i) => (
                <p
                  key={i}
                  className="text-sm sm:text-base lg:text-lg text-[#5a5a5a] leading-[1.75] sm:leading-[1.85] max-w-xl"
                >
                  {paragraph}
                </p>
              ))}
            </div>

            {/* Footer accent */}
            <div className="mt-8 sm:mt-10 flex items-center gap-3">
              <div className="w-6 sm:w-8 h-[1px] bg-[#0E7A0E]/20" />
              <span className="text-[10px] sm:text-[11px] font-medium tracking-[0.15em] uppercase text-[var(--text-secondary)]">
                {collectionName}
              </span>
            </div>
          </ScrollReveal>

          {/* ── Image column — first on mobile ── */}
          <ScrollReveal direction="right" className="lg:col-span-2 order-1 lg:order-2">
            {story.imageUrl ? (
              <div className="relative aspect-[16/10] sm:aspect-[3/4] lg:aspect-[4/5] rounded-xl sm:rounded-2xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.08)] sm:shadow-[0_24px_64px_rgba(0,0,0,0.10)] border border-[#ede8df]/50">
                <Image
                  src={story.imageUrl}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover"
                  quality={85}
                />
              </div>
            ) : (
              /* Elegant decorative placeholder — abstract, editorial */
              <div className="relative aspect-[16/10] sm:aspect-[3/4] lg:aspect-[4/5] rounded-xl sm:rounded-2xl overflow-hidden border border-[#ede8df]/50">
                <div className="absolute inset-0 bg-gradient-to-br from-[#f7f4ef] via-[#ede8df] to-[#f0ede5]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 sm:w-32 h-24 sm:h-32 rounded-full bg-[#0E7A0E]/[0.04] border border-[#0E7A0E]/10" />
                <div className="absolute top-1/3 right-1/3 w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-[#0E7A0E]/[0.03]" />
              </div>
            )}
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
