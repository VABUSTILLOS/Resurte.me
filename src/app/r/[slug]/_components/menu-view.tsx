"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import { ArrowRight, Heart, Plus, Star } from "lucide-react"
import { formatMoney } from "@/lib/foodos"
import type { FoodosMenuCategory, FoodosMenuItem, FoodosCombo, FoodosReview } from "@/types/foodos"

export function MenuView({
  categories,
  items,
  combos,
  selectedCategory,
  onSelectCategory,
  onAddItem,
  onAddCombo,
  cartCount,
  onGoToCart,
  itemHasOptions,
  priceFor,
  reviews,
  favorites,
  onToggleFavorite,
}: {
  categories: FoodosMenuCategory[]
  items: FoodosMenuItem[]
  combos: FoodosCombo[]
  selectedCategory: string | null
  onSelectCategory: (id: string | null) => void
  onAddItem: (item: FoodosMenuItem) => void
  onAddCombo: (combo: FoodosCombo) => void
  cartCount: number
  onGoToCart: () => void
  itemHasOptions: (itemId: string) => boolean
  priceFor: (item: FoodosMenuItem) => number
  reviews: FoodosReview[]
  favorites: Set<string>
  onToggleFavorite: (itemId: string) => void
}) {
  const featured = items.filter((i) => i.is_featured)
  const visibleCategories = selectedCategory
    ? categories.filter((c) => c.id === selectedCategory)
    : categories
  const uncategorized = selectedCategory === null ? items.filter((i) => !i.category_id) : []

  // Publica la altura de la barra "Ver pedido" al CSS cuando el carrito local
  // tiene items, para que WhatsApp/CookieConsent/Toast suban por encima (mismo
  // mecanismo que el MobileCartBar del carrito global vía body.cart-bar-active).
  const cartBarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof document === "undefined") return
    const bar = cartBarRef.current
    if (cartCount > 0 && bar) {
      const publish = () => {
        document.documentElement.style.setProperty("--cart-bar-h", `${bar.offsetHeight}px`)
      }
      publish()
      const ro = new ResizeObserver(publish)
      ro.observe(bar)
      document.body.classList.add("cart-bar-active")
      return () => {
        ro.disconnect()
        document.body.classList.remove("cart-bar-active")
      }
    }
    document.body.classList.remove("cart-bar-active")
  }, [cartCount])

  return (
    <div>
      {featured.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-black text-stone-900 mb-3">🔥 Favoritos</h2>
          <div className="grid gap-3">
            {featured.map((item) => (
              <ItemCard key={item.id} item={item} hasOptions={itemHasOptions(item.id)} price={priceFor(item)} isFavorite={favorites.has(item.id)} onToggleFavorite={() => onToggleFavorite(item.id)} onAdd={() => onAddItem(item)} />
            ))}
          </div>
        </section>
      )}

      {combos.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-black text-stone-900 mb-3">🎁 Combos</h2>
          <div className="grid gap-3">
            {combos.map((combo) => (
              <div key={combo.id} className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-stone-900">{combo.name}</p>
                    {combo.highlight && (
                      <span className="text-[10px] bg-amber-500 text-amber-950 font-bold px-2 py-0.5 rounded-full">+valor</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-emerald-600 mt-1">
                    {formatMoney(combo.price)}
                    {combo.discount_pct > 0 && (
                      <span className="ml-2 text-xs text-stone-400 line-through">
                        {formatMoney(combo.price + (combo.price * combo.discount_pct) / 100)}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => onAddCombo(combo)}
                  className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
                >
                  Agregar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Categorías */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
        <button
          onClick={() => onSelectCategory(null)}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            selectedCategory === null ? "bg-stone-900 text-white" : "bg-white text-stone-600 border border-stone-200"
          }`}
        >
          Todo
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelectCategory(c.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              selectedCategory === c.id ? "bg-stone-900 text-white" : "bg-white text-stone-600 border border-stone-200"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {visibleCategories.map((cat) => (
        <section key={cat.id} className="mb-8">
          <h2 className="text-lg font-black text-stone-900 mb-3">{cat.name}</h2>
          <div className="grid gap-3">
            {items
              .filter((i) => i.category_id === cat.id)
              .map((item) => (
                <ItemCard key={item.id} item={item} hasOptions={itemHasOptions(item.id)} price={priceFor(item)} isFavorite={favorites.has(item.id)} onToggleFavorite={() => onToggleFavorite(item.id)} onAdd={() => onAddItem(item)} />
              ))}
          </div>
        </section>
      ))}

      {uncategorized.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-black text-stone-900 mb-3">Platillos</h2>
          <div className="grid gap-3">
            {uncategorized.map((item) => (
              <ItemCard key={item.id} item={item} hasOptions={itemHasOptions(item.id)} price={priceFor(item)} isFavorite={favorites.has(item.id)} onToggleFavorite={() => onToggleFavorite(item.id)} onAdd={() => onAddItem(item)} />
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-black text-stone-900 mb-3 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            Reseñas · {(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)}
          </h2>
          <div className="grid gap-3">
            {reviews.slice(0, 5).map((r) => (
              <div key={r.id} className="bg-white border border-stone-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`w-3.5 h-3.5 ${n <= r.rating ? "text-amber-400 fill-amber-400" : "text-stone-200"}`} />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-stone-600">{r.customer_name ?? "Cliente"}</span>
                </div>
                {r.comment && <p className="text-sm text-stone-600">{r.comment}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {cartCount > 0 && (
        <div ref={cartBarRef} className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-stone-200 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-4xl mx-auto px-4 py-3 flex justify-end">
            <button
              onClick={onGoToCart}
              className="flex items-center gap-2 px-6 py-3 rounded-full foodos-accent bg-emerald-600 text-white font-bold hover:bg-emerald-700"
            >
              Ver pedido ({cartCount})
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemCard({ item, hasOptions, price, isFavorite, onToggleFavorite, onAdd }: { item: FoodosMenuItem; hasOptions: boolean; price: number; isFavorite: boolean; onToggleFavorite: () => void; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white border border-stone-200 rounded-2xl p-4">
      <div className="min-w-0 flex-1">
        {item.tags.length > 0 && (
          <div className="flex gap-1 mb-1">
            {item.tags.slice(0, 2).map((t) => (
              <span key={t} className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full capitalize">
                {t}
              </span>
            ))}
          </div>
        )}
        <p className="font-semibold text-stone-900 truncate">{item.name}</p>
        {item.description && (
          <p className="text-sm text-stone-500 line-clamp-2">{item.description}</p>
        )}
        <p className="text-sm font-bold text-stone-900 mt-1 flex items-center gap-2">
          {formatMoney(price)}
          <button
            onClick={onToggleFavorite}
            className="p-1"
            aria-label={isFavorite ? `Quitar ${item.name} de favoritos` : `Guardar ${item.name} en favoritos`}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? "text-red-500 fill-red-500" : "text-stone-300"}`} />
          </button>
          {hasOptions && <span className="ml-2 text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Personalizable</span>}
        </p>
      </div>
      {item.image_url ? (
        <div className="relative shrink-0">
          <Image src={item.image_url} alt={item.name} width={80} height={80} className="w-20 h-20 rounded-xl object-cover" />
          <button
            onClick={onAdd}
            className="absolute -bottom-2 -right-2 w-11 h-11 rounded-full foodos-accent bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 shadow touch-target"
            aria-label={`Agregar ${item.name}`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={onAdd}
          className="shrink-0 w-11 h-11 rounded-full foodos-accent bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 touch-target"
          aria-label={`Agregar ${item.name}`}
        >
          <Plus className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
