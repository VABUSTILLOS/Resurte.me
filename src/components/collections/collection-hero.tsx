"use client"

import Link from "next/link"
import Image from "next/image"

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
 * Imagen de fondo masiva (80vh desktop / 70vh mobile) con overlay
 * editorial. Tipografía limpia y espaciosa. Sin distracciones.
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
    <section className="relative min-h-[60vh] sm:min-h-[80vh] flex items-end overflow-hidden">
      {/* Background image */}
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          priority
          quality={90}
        />
      ) : (
        /* Elegant gradient fallback — no image, pure atmosphere */
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#2d2a24] to-[#1a1a1a]" />
      )}

      {/* Cinematic overlay — deep at bottom, revealing at top */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c0d]/90 via-[#0b0c0d]/35 via-40% to-[#0b0c0d]/10" />

      {/* Subtle vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.3)_100%)]" />

      {/* Content — anchored to bottom with generous padding */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 pb-14 sm:pb-20 lg:pb-24">
        {/* Breadcrumb — lighter, elegant */}
        <nav className="mb-8 sm:mb-10 animate-fade-up">
          <div className="flex items-center gap-2 text-xs sm:text-sm tracking-[0.05em]">
            <Link
              href={`/${citySlug}`}
              className="text-white/70 hover:text-white/90 transition-colors duration-300"
            >
              {cityName}
            </Link>
            <span className="text-white/50">·</span>
            <span className="text-white/80 font-medium">{collectionName}</span>
          </div>
        </nav>

        {/* Collection name — large, commanding */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[0.95] mb-4 sm:mb-6 max-w-4xl animate-fade-up">
          {collectionName}
        </h1>

        {/* Icon + tagline — editorial pull-quote feel */}
        <div className="flex items-start gap-3 sm:gap-5 animate-fade-up">
          <span className="text-2xl sm:text-4xl shrink-0 mt-0.5 sm:mt-1 opacity-80">
            {icon}
          </span>
          <p className="text-sm sm:text-xl md:text-2xl text-white/60 font-light leading-relaxed max-w-xl italic tracking-[0.01em]">
            {tagline}
          </p>
        </div>
      </div>

      {/* Bottom fade-to-cream transition */}
      <div className="absolute bottom-0 left-0 right-0 h-24 sm:h-32 bg-gradient-to-t from-[#faf8f5] to-transparent z-10" />
    </section>
  )
}
