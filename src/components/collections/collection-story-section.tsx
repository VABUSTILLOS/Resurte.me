"use client"

import Image from "next/image"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import type { CollectionStory } from "@/lib/collection-content"

interface CollectionStorySectionProps {
  story: CollectionStory
  fallbackImage?: string
  collectionName: string
}

/**
 * CollectionStorySection — Erewhon-inspired narrative section.
 *
 * Full-width split layout: image on one side, story text on the other.
 * Premium typography with the brand cream palette.
 */
export function CollectionStorySection({
  story,
  fallbackImage,
  collectionName,
}: CollectionStorySectionProps) {
  const imageSrc = story.imageUrl || fallbackImage

  return (
    <section className="relative overflow-hidden bg-[#f7f4ef] border-y border-[#ede8df]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Image side */}
          <ScrollReveal direction="left" className="relative">
            <div className="relative aspect-[4/5] lg:aspect-[3/4] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
              {imageSrc ? (
                <Image
                  src={imageSrc}
                  alt={`${story.title} — ${collectionName}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#108910]/10 via-[#f7f4ef] to-[#ede8df]" />
              )}
              {/* Subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/10 to-transparent" />
            </div>

            {/* Decorative accent dot */}
            <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-[#108910]/5 border border-[#108910]/10 hidden lg:block" />
          </ScrollReveal>

          {/* Text side */}
          <ScrollReveal direction="right" className="relative">
            {/* Decorative label */}
            <span className="inline-block text-xs font-medium tracking-[0.2em] uppercase text-[#108910] mb-5">
              Nuestra Historia
            </span>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1a1a1a] tracking-tight leading-[1.15] mb-6">
              {story.title}
            </h2>

            {/* Ornamental divider */}
            <div className="w-12 h-px bg-[#108910]/30 mb-6" />

            <p className="text-base sm:text-lg text-[#6b6b6b] leading-relaxed max-w-lg">
              {story.body}
            </p>

            {/* Subtle bottom accent */}
            <div className="mt-8 flex items-center gap-3">
              <div className="w-8 h-px bg-[#108910]/20" />
              <span className="text-xs font-medium tracking-[0.15em] uppercase text-[#999893]">
                {collectionName}
              </span>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
