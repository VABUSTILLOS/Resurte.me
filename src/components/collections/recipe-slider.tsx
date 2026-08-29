'use client'

import { useRef, useState, useCallback } from "react"
import { ChevronLeft, ChevronRight, Clock, Users, Plus, Search, ShoppingCart } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useCart } from "@/contexts/cart-context"
import { useEscapeKey } from "@/hooks/use-escape-key"
import type { CollectionRecipe } from "@/types"
import type { Product } from "@/types"

// ── Fuzzy ingredient → product matcher ──────────────────────
interface MatchedProduct {
  id: number
  name: string
  slug: string
  image_url: string
  price: number
  sale_price: number | null
  unit?: string
  brand: string
  stock_status: string
}

/** Normaliza texto para matching: minúsculas, sin acentos, sin unidades/cantidades. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // quita símbolos
    .replace(/\b(kg|kilo|kilos|g|gr|gramo|gramos|l|lt|litro|litros|ml|pz|pieza|piezas|paq|paquete|sobre|botella|frasco|lata|caja|charola|tarrina|cuña|bolsa|manojo|taza|en)\b/gi, " ")
    .replace(/\b\d+(\.\d+)?\s*(kg|g|l|ml|pz)?\b/gi, " ") // quita cantidades
    .replace(/\s+/g, " ")
    .trim()
}

/** Extrae las palabras significativas (≥3 letras) de un ingrediente. */
function significantWords(s: string): string[] {
  return normalize(s).split(" ").filter((w) => w.length >= 3)
}

/**
 * Aliases para ingredientes que no coinciden por texto con el nombre del
 * producto (sinónimos o nombres comunes del catálogo).
 */
const INGREDIENT_ALIASES: Record<string, string> = {
  "masa de maiz para tamal": "masa para tamal",
  "harina de maiz precocida": "harina pan",
  "papas blancas": "papa blanca",
  "mostaza amarilla": "mostaza 400g",
}

function matchIngredient(
  ingredient: string,
  products: (Product & { price: number; sale_price: number | null; stock_status: string })[]
): MatchedProduct | null {
  const normalized = normalize(ingredient)
  const alias = INGREDIENT_ALIASES[normalized]
  const ing = alias ?? normalized
  const words = significantWords(alias ?? ingredient)
  if (!ing || words.length === 0) return null

  const normProducts = products.map((p) => ({ p, norm: normalize(p.name) }))

  // 1. Exact match del nombre completo normalizado
  let hit = normProducts.find(({ norm }) => norm === ing)
  if (!hit) {
    // 2. El nombre del producto contiene el ingrediente completo (o viceversa)
    hit = normProducts.find(({ norm }) => norm.includes(ing) || ing.includes(norm))
  }
  if (!hit && words.length > 0) {
    // 3. Coincidencia por palabras: el producto debe contener TODAS las palabras clave
    hit = normProducts.find(({ norm }) => words.every((w) => norm.includes(w)))
  }
  if (!hit) return null

  const { p: match } = hit
  return {
    id: match.id,
    name: match.name,
    slug: match.slug,
    image_url: match.image_url,
    price: match.price,
    sale_price: match.sale_price,
    unit: match.unit,
    brand: match.brand,
    stock_status: match.stock_status,
  }
}

// ── Ingredient badge + popover ──────────────────────────────────
function RecipeIngredient({
  name,
  products,
  citySlug,
}: {
  name: string
  products: (Product & { price: number; sale_price: number | null; stock_status: string })[]
  citySlug: string
}) {
  const [open, setOpen] = useState(false)
  const { addItem } = useCart()
  const matched = matchIngredient(name, products)

  const closePopover = useCallback(() => setOpen(false), [])
  useEscapeKey(closePopover, open)

  // Close on outside click
  const handleAddToCart = useCallback(() => {
    if (!matched) return
    addItem({
      product_id: matched.id,
      name: matched.name,
      slug: matched.slug,
      image_url: matched.image_url,
      brand: matched.brand,
      price: matched.sale_price ?? matched.price,
      sale_price: matched.sale_price,
      quantity: 1,
      stock_status: matched.stock_status as "in_stock" | "low_stock" | "out_of_stock",
    })
    setOpen(false)
  }, [matched, addItem])

  return (
    <div className="relative">
      <button
        onClick={() => matched && setOpen(!open)}
        className={`inline-block px-2.5 py-1 text-xs rounded-full font-medium border transition-all duration-150 ${
          matched
            ? "bg-[#0E7A0E]/5 text-[#0E7A0E] border-[#0E7A0E]/20 hover:bg-[#0E7A0E]/10 hover:border-[#0E7A0E]/30 cursor-pointer active:scale-95"
            : "bg-amber-50 text-amber-800 border-amber-100 cursor-default"
        }`}
      >
        {name}
        {matched && <Plus className="inline-block w-3 h-3 ml-1 -mt-px" />}
      </button>

      {/* Popover */}
      {open && matched && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 z-50 w-64 bg-white rounded-xl border border-[#ede8df] shadow-[0_16px_48px_rgba(0,0,0,0.12)] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Product image + info */}
            <div className="flex gap-3 p-3">
              <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-[#f7f4ef] shrink-0">
                <Image
                  src={matched.image_url}
                  alt={matched.name}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1a1a1a] leading-tight truncate">
                  {matched.name}
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{matched.unit || matched.brand}</p>
                <p className="text-sm font-bold text-[#0E7A0E] mt-1">
                  ${(matched.sale_price ?? matched.price).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex border-t border-[#ede8df]">
              <button
                onClick={handleAddToCart}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-[#0E7A0E] hover:bg-[#0D720D] transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Agregar al carrito
              </button>
              <Link
                href={`/${citySlug}/producto/${matched.slug}`}
                className="flex items-center justify-center px-3 py-2.5 bg-[#f7f4ef] hover:bg-[#ede8df] transition-colors"
              >
                <Search className="w-3.5 h-3.5 text-[#6b6b6b]" />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Ingredient list (expandable) ─────────────────────────────
const VISIBLE_INGREDIENTS = 6

function RecipeIngredients({
  ingredients,
  products,
  citySlug,
}: {
  ingredients: string[]
  products: (Product & { price: number; sale_price: number | null; stock_status: string })[]
  citySlug: string
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? ingredients : ingredients.slice(0, VISIBLE_INGREDIENTS)
  const hidden = ingredients.length - VISIBLE_INGREDIENTS

  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((ing, j) => (
        <RecipeIngredient
          key={j}
          name={ing}
          products={products}
          citySlug={citySlug}
        />
      ))}
      {hidden > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-block px-2.5 py-1 bg-[#f7f4ef] text-[var(--text-secondary)] text-xs rounded-full font-medium border border-transparent hover:border-[#0E7A0E]/20 hover:text-[#0E7A0E] cursor-pointer transition-all duration-150 active:scale-95"
        >
          {expanded ? `− mostrar menos` : `+${hidden} más`}
        </button>
      )}
    </div>
  )
}

// ── Recipe Slider ─────────────────────────────────────────────
interface RecipeSliderProps {
  recipes: CollectionRecipe[]
  products: (Product & { price: number; sale_price: number | null; stock_status: string })[]
  citySlug: string
}

export default function RecipeSlider({ recipes, products, citySlug }: RecipeSliderProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 10)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10)

    // Track active slide
    const idx = Math.round(scrollLeft / clientWidth)
    setActiveIndex(idx)
  }

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return
    const cardWidth = scrollRef.current.querySelector("article")?.offsetWidth ?? 300
    const gap = 20
    const amount = (cardWidth + gap) * 1.5
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    })
  }

  if (!recipes.length) return null

  return (
    <section className="relative">
      {/* Header — premium editorial */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <span className="inline-block text-[11px] font-semibold tracking-[0.25em] uppercase text-[#0E7A0E]/70 mb-2">
            Recetario
          </span>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-[#1a1a1a] tracking-tight leading-[1.12]">
            Inspiración para tu cocina
          </h2>
        </div>

        {/* Desktop nav arrows */}
        <div className="hidden sm:flex gap-1.5">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className={`p-2.5 rounded-full border transition-all duration-200 ${
              canScrollLeft
                ? "border-[#ede8df] bg-white text-[#1a1a1a] hover:bg-[#f7f4ef] hover:border-[#0E7A0E]/20 shadow-sm"
                : "border-[#ede8df] bg-[#faf8f5] text-[#ccc] cursor-not-allowed"
            }`}
            aria-label="Recetas anteriores"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className={`p-2.5 rounded-full border transition-all duration-200 ${
              canScrollRight
                ? "border-[#ede8df] bg-white text-[#1a1a1a] hover:bg-[#f7f4ef] hover:border-[#0E7A0E]/20 shadow-sm"
                : "border-[#ede8df] bg-[#faf8f5] text-[#ccc] cursor-not-allowed"
            }`}
            aria-label="Recetas siguientes"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slider — touch-friendly, snap scrolling */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 sm:gap-5 overflow-x-auto scroll-smooth pb-6 -mx-1 px-1 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {recipes.map((recipe, i) => (
          <article
            key={i}
            className="flex-shrink-0 w-[280px] sm:w-[340px] snap-start"
          >
            <div className="bg-white rounded-2xl border border-[#ede8df] overflow-hidden shadow-sm hover:shadow-md hover:border-[#ede8df]/80 transition-all duration-300 h-full flex flex-col">
              {/* Image */}
              <div className="relative h-44 sm:h-52 bg-[#f7f4ef] overflow-hidden">
                {recipe.image_url ? (
                  <Image
                    src={recipe.image_url}
                    alt={recipe.name}
                    fill
                    sizes="(max-width: 640px) 280px, 340px"
                    className="object-cover transition-transform duration-700 hover:scale-105"
                    quality={85}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#f7f4ef] via-[#ede8df] to-[#f0ede5]">
                    <span className="text-4xl">🍳</span>
                  </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

                {/* Meta badges on image */}
                <div className="absolute bottom-3 left-3 flex gap-3 text-[11px] font-medium text-white/90">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {recipe.prep_time}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {recipe.servings}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 sm:p-5 flex flex-col flex-1">
                <h3 className="font-bold text-[#1a1a1a] text-base sm:text-lg mb-1.5 leading-tight">
                  {recipe.name}
                </h3>
                <p className="text-sm text-[#6b6b6b] leading-relaxed mb-4 line-clamp-2 flex-1">
                  {recipe.description}
                </p>

                {/* Tappable ingredients */}
                <div className="border-t border-[#f7f4ef] pt-3">
                  <p className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-widest mb-2.5">
                    Ingredientes
                  </p>
                  <RecipeIngredients
                    ingredients={recipe.ingredients}
                    products={products}
                    citySlug={citySlug}
                  />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Fade edges */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#faf8f5] to-transparent pointer-events-none" />
      )}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#faf8f5] to-transparent pointer-events-none" />
      )}

      {/* Mobile dots */}
      <div className="flex sm:hidden justify-center gap-1.5 mt-3">
        {recipes.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              if (!scrollRef.current) return
              scrollRef.current.scrollTo({
                left: i * (scrollRef.current.querySelector("article")?.offsetWidth ?? 280 + 16),
                behavior: "smooth",
              })
            }}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              i === activeIndex ? "bg-[#0E7A0E] w-4" : "bg-[#ccc]"
            }`}
            aria-label={`Receta ${i + 1}`}
          />
        ))}
      </div>
    </section>
  )
}
