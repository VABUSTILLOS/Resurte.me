"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { ChevronLeft, ChevronRight, Box, TrendingUp } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import { getCollectionCover } from "@/lib/collection-images"
import type { RestaurantCollection } from "@/types"

/**
 * CollectionSlider — Carrusel horizontal de colecciones por tipo de restaurante.
 *
 * Diseño B2B institucional (compras por volumen, bidones, cajas).
 * Evita cualquier tono de app de delivery al consumidor final.
 *
 * Usa scroll nativo con snap points + botones de navegación.
 * Sin dependencias externas de carrusel.
 */

const COLLECTION_ICONS: Record<string, string> = {
  "hamburguesas-hot-dogs": "🍔",
  "taquerias-antojitos": "🌮",
  "sushi-comida-asiatica": "🍣",
  "pizzas-comida-italiana": "🍕",
  "pollo-alitas": "🍗",
  "comida-mexicana-corrida": "🍲",
  "mariscos-pescados": "🦐",
  "cortes-carne-asaderos": "🥩",
  "cafeterias-crepas-desayunos": "☕",
  "saludable-ensaladas-pokes": "🥗",
  "postres-panaderia-helados": "🍰",
  "comida-arabe-griega": "🥙",
  "comida-venezolana-latina": "🇻🇪",
  "bebidas-bares-botanas": "🍺",
}

const COLLECTION_TAGLINES: Record<string, string> = {
  "hamburguesas-hot-dogs": "Carne molida, pan y queso por caja",
  "taquerias-antojitos": "Tortillas, pastor y salsas por bulto",
  "sushi-comida-asiatica": "Arroz, salmón y soya grado institucional",
  "pizzas-comida-italiana": "Harina, mozzarella y pepperoni al mayoreo",
  "pollo-alitas": "Alitas, boneless y salsas por garrafa",
  "comida-mexicana-corrida": "Guisos, aceite y abarrotes por bidón",
  "mariscos-pescados": "Mariscos frescos y congelados por kilo",
  "cortes-carne-asaderos": "Rib eye, picanha y carbón para parrilla",
  "cafeterias-crepas-desayunos": "Café en grano, leche y desechables",
  "saludable-ensaladas-pokes": "Lechugas, semillas y proteínas magras",
  "postres-panaderia-helados": "Harina, chocolate y bases para helado",
  "comida-arabe-griega": "Pan pita, tahini y especias concentradas",
  "comida-venezolana-latina": "Harina PAN, plátano macho y queso costeño",
  "bebidas-bares-botanas": "Cervezas, refrescos y botanas al mayoreo",
}

interface CollectionSliderProps {
  collections: RestaurantCollection[]
  citySlug: string
}

export function CollectionSlider({ collections, citySlug }: CollectionSliderProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollButtons()
    el.addEventListener("scroll", updateScrollButtons, { passive: true })
    return () => el.removeEventListener("scroll", updateScrollButtons)
  }, [updateScrollButtons])

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current
    if (!el) return
    const cardWidth = 300 + 16 // card width + gap
    el.scrollBy({ left: direction === "left" ? -cardWidth * 2 : cardWidth * 2, behavior: "smooth" })
  }

  if (!collections.length) return null

  return (
    <section className="bg-[#faf8f5] py-16 border-b border-[#ede8df]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section header — B2B institutional tone */}
        <ScrollReveal className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#0E7A0E] mb-3">
                Abastece por giro
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] tracking-tight">
                Colecciones especializadas
              </h2>
              <p className="text-base text-[#6b6b6b] mt-2 max-w-xl leading-relaxed">
                Insumos curados por tipo de restaurante. Precios de mayoreo, facturación incluida.
              </p>
            </div>

            {/* Navigation arrows — desktop */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => scroll("left")}
                disabled={!canScrollLeft}
                aria-label="Desplazar colecciones a la izquierda"
                className="w-10 h-10 rounded-full border border-[#d4cfc4] flex items-center justify-center text-[#6b6b6b] hover:bg-white hover:border-[#0E7A0E]/40 hover:text-[#0E7A0E] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => scroll("right")}
                disabled={!canScrollRight}
                aria-label="Desplazar colecciones a la derecha"
                className="w-10 h-10 rounded-full border border-[#d4cfc4] flex items-center justify-center text-[#6b6b6b] hover:bg-white hover:border-[#0E7A0E]/40 hover:text-[#0E7A0E] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </ScrollReveal>

        {/* Horizontal scroll with snap points */}
        <div className="relative">
          {/* Gradient fade indicators */}
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#faf8f5] to-transparent z-10 pointer-events-none" />
          )}
          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-r from-transparent to-[#faf8f5] z-10 pointer-events-none" />
          )}

          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 -mx-1 px-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {collections.map((collection, idx) => {
              const icon = COLLECTION_ICONS[collection.slug] || "📦"
              const tagline = COLLECTION_TAGLINES[collection.slug] || "Insumos al mayoreo para tu negocio"
              const cover = getCollectionCover(collection.slug) ?? collection.image_url

              return (
                <Link
                  key={collection.id}
                  href={`/${citySlug}/coleccion/${collection.slug}`}
                  className="group flex-shrink-0 w-[280px] sm:w-[320px] snap-start"
                >
                  <ScrollReveal direction="scale" delay={idx * 0.08}>
                    <div className="relative overflow-hidden rounded-2xl bg-white border border-[#e8e4dc] hover:border-[#0E7A0E]/30 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1">
                      {/* Image container — 4:3 aspect ratio */}
                      <div className="relative w-full aspect-[4/3] overflow-hidden bg-[#e8e4dc]">
                        {cover ? (
                          <Image
                            src={cover}
                            alt={collection.name}
                            fill
                            sizes="(max-width: 640px) 280px, 320px"
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-6xl">{icon}</span>
                          </div>
                        )}

                        {/* Overlay gradient — institutional B2B tone */}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/70 via-transparent to-transparent" />

                        {/* Bottom overlay content */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-2xl">{icon}</span>
                            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[#3CC73C] bg-white/90 rounded-full px-2.5 py-0.5">
                              Por volumen
                            </span>
                          </div>
                          <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">
                            {collection.name}
                          </h3>
                        </div>
                      </div>

                      {/* Card body — B2B value props */}
                      <div className="p-4 sm:p-5">
                        <p className="text-sm text-[#6b6b6b] leading-relaxed mb-3 line-clamp-2">
                          {collection.description || tagline}
                        </p>

                        {/* Institutional badges */}
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] bg-[#f7f5f0] rounded-lg px-2.5 py-1.5">
                            <Box className="w-3.5 h-3.5 text-[#0E7A0E]" />
                            Mayoreo
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] bg-[#f7f5f0] rounded-lg px-2.5 py-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-[#0E7A0E]" />
                            Precio institucional
                          </span>
                        </div>

                        {/* CTA — subtle, B2B */}
                        <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-[#0E7A0E] group-hover:text-[#0D720D] group-hover:gap-2.5 transition-all">
                          Ver colección
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </ScrollReveal>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

    </section>
  )
}
