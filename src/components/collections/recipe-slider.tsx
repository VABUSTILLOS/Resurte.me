'use client'

import { useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Clock, Users } from "lucide-react"
import Image from "next/image"
import type { CollectionRecipe } from "@/types"

interface RecipeSliderProps {
  recipes: CollectionRecipe[]
}

export default function RecipeSlider({ recipes }: RecipeSliderProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 10)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10)
  }

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return
    const amount = scrollRef.current.clientWidth * 0.7
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    })
  }

  if (!recipes.length) return null

  return (
    <section className="relative group">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-stone-500">Recetario</p>
          <h2 className="text-2xl font-bold text-stone-800 mt-1">Inspiración para tu cocina</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className={`p-2.5 rounded-full border transition-all duration-200 ${
              canScrollLeft
                ? "border-stone-300 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-400 shadow-sm"
                : "border-stone-200 bg-stone-50 text-stone-300 cursor-not-allowed"
            }`}
            aria-label="Recetas anteriores"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className={`p-2.5 rounded-full border transition-all duration-200 ${
              canScrollRight
                ? "border-stone-300 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-400 shadow-sm"
                : "border-stone-200 bg-stone-50 text-stone-300 cursor-not-allowed"
            }`}
            aria-label="Recetas siguientes"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Slider */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-5 overflow-x-auto scroll-smooth pb-4 -mx-px px-px scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {recipes.map((recipe, i) => (
          <article
            key={i}
            className="flex-shrink-0 w-[300px] sm:w-[340px] snap-start group/card"
          >
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md hover:border-stone-300 transition-all duration-300 h-full flex flex-col">
              {/* Image */}
              <div className="relative h-48 bg-stone-100 overflow-hidden">
                {recipe.image_url ? (
                  <Image
                    src={recipe.image_url}
                    alt={recipe.name}
                    fill
                    sizes="340px"
                    className="object-cover group-hover/card:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none"
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100">
                    <span className="text-4xl">🍳</span>
                  </div>
                )}
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              </div>

              {/* Content */}
              <div className="p-5 flex flex-col flex-1">
                <h3 className="font-bold text-stone-800 text-lg mb-2 leading-tight">
                  {recipe.name}
                </h3>
                <p className="text-sm text-stone-500 leading-relaxed mb-4 line-clamp-2 flex-1">
                  {recipe.description}
                </p>

                {/* Meta badges */}
                <div className="flex gap-4 text-xs text-stone-400 mb-4">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {recipe.prep_time}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {recipe.servings}
                  </span>
                </div>

                {/* Ingredient tags */}
                <div className="border-t border-stone-100 pt-3">
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-2">
                    Ingredientes
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {recipe.ingredients.slice(0, 5).map((ing, j) => (
                      <span
                        key={j}
                        className="inline-block px-2.5 py-1 bg-amber-50 text-amber-800 text-xs rounded-full font-medium border border-amber-100"
                      >
                        {ing}
                      </span>
                    ))}
                    {recipe.ingredients.length > 5 && (
                      <span className="inline-block px-2.5 py-1 bg-stone-50 text-stone-400 text-xs rounded-full">
                        +{recipe.ingredients.length - 5} más
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Fade edges */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-stone-50 to-transparent pointer-events-none rounded-l-xl -ml-px" />
      )}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-stone-50 to-transparent pointer-events-none rounded-r-xl -mr-px" />
      )}
    </section>
  )
}
