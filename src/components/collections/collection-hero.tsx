"use client"

import Link from "next/link"
import Image from "next/image"
import { ChevronDown } from "lucide-react"

interface CollectionHeroProps {
  collectionName: string
  tagline: string
  imageUrl: string | null
  icon: string
  citySlug: string
  cityName: string
}

/**
 * CollectionHero — Full-width hero banner estilo Erewhon.
 *
 * Imagen de fondo con overlay, nombre de la colección grande
 * y tagline poético. Transmite premium desde el primer scroll.
 */
export function CollectionHero({
  collectionName,
  tagline,
  imageUrl,
  icon,
  citySlug,
  cityName,
}: CollectionHeroProps) {
  return (
    <section className="relative min-h-[55vh] sm:min-h-[65vh] flex items-end overflow-hidden">
      {/* Background image or gradient fallback */}
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={collectionName}
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#f7f4ef] via-[#ede8df] to-[#faf8f5]" />
      )}

      {/* Rich overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/85 via-[#1a1a1a]/30 to-transparent" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16 lg:pb-20">
        {/* Breadcrumb */}
        <nav className="mb-6 sm:mb-8 animate-fade-up">
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/${citySlug}`}
              className="text-white/60 hover:text-white/90 transition-colors"
            >
              {cityName}
            </Link>
            <span className="text-white/30">/</span>
            <span className="text-white/80 font-medium">{collectionName}</span>
          </div>
        </nav>

        {/* Collection name */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-4 max-w-3xl animate-fade-up">
          {collectionName}
        </h1>

        {/* Icon + tagline */}
        <div className="flex items-start gap-3 sm:gap-4 animate-fade-up">
          <span className="text-3xl sm:text-4xl shrink-0 mt-0.5">{icon}</span>
          <p className="text-lg sm:text-xl md:text-2xl text-white/70 font-light leading-relaxed max-w-xl italic">
            {tagline}
          </p>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 animate-bounce hidden sm:block">
        <ChevronDown className="w-5 h-5 text-white/40" />
      </div>
    </section>
  )
}
