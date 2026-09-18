"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardList,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingCart,
} from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { useCity, DEFAULT_CITY_SLUG } from "@/contexts/city-context"
import { useToast } from "@/components/toast"
import { searchProducts } from "@/app/[slug]/buscar/actions"
import { AnalyticsEvents } from "@/lib/analytics"
import { haptic } from "@/lib/haptics"
import { withResolvedSale } from "@/lib/sale-window"
import {
  MAX_SHARE_QUANTITY,
  mergeShareInput,
  parseShareText,
  pickBestMatch,
  shareSummary,
  type ShareEntry,
} from "@/lib/share-list"
import type { CartItem, Product } from "@/types"

/** Cuántas búsquedas se lanzan a la vez contra el server action. */
const RESOLVE_CHUNK = 5

interface ResolvedRow {
  key: string
  entry: ShareEntry
  product: Product
}

interface Resolution {
  /** Texto con el que se resolvió; sirve para detectar resultados obsoletos. */
  text: string
  rows: ResolvedRow[]
  missing: ShareEntry[]
}

function effectivePrice(product: Product): number {
  const resolved = withResolvedSale(product)
  return resolved.sale_price ?? resolved.price
}

function toCartItem(product: Product, quantity: number): CartItem {
  const resolved = withResolvedSale(product)
  return {
    product_id: resolved.id,
    name: resolved.name,
    slug: resolved.slug,
    image_url: resolved.image_url,
    brand: resolved.brand,
    price: resolved.price,
    sale_price: resolved.sale_price ?? null,
    quantity,
    stock_status: resolved.stock_status,
  }
}

/**
 * Receptor del share target de la PWA (`/compartir?texto=...`).
 *
 * Convierte una lista escrita a mano —típicamente reenviada por WhatsApp—
 * en productos del catálogo. El flujo es confirmar-antes-de-agregar: se
 * resuelve cada renglón, se muestra qué producto se eligió y con cuántas
 * piezas, y nada entra al carrito hasta que la persona lo aprueba.
 *
 * Toda la resolución es client-side a propósito: la ruta debe quedar
 * prerenderizada (invariante de prerender estático), así que no se leen
 * cookies ni headers en el servidor y la ciudad sale de `useCity()`.
 */
export function ShareListClient() {
  const searchParams = useSearchParams()
  const { city } = useCity()
  const { addOrderItems } = useCart()
  const { toast } = useToast()

  const citySlug = city?.slug ?? DEFAULT_CITY_SLUG

  // El texto inicial viene del share sheet (`texto`) o del título (`titulo`).
  // La forma manual —abrir /compartir y pegar— también funciona: el textarea
  // es la única fuente de verdad a partir de aquí.
  const [text, setText] = useState(() =>
    mergeShareInput(searchParams.get("texto"), searchParams.get("titulo"))
  )
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [excluded, setExcluded] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)

  const parsed = useMemo(() => parseShareText(text), [text])
  const entries = parsed.entries

  useEffect(() => {
    if (entries.length === 0) return
    let cancelled = false
    const slug = city?.slug

    const resolveAll = async () => {
      const rows: ResolvedRow[] = []
      const missing: ShareEntry[] = []
      for (let i = 0; i < entries.length; i += RESOLVE_CHUNK) {
        const chunk = entries.slice(i, i + RESOLVE_CHUNK)
        const results = await Promise.all(
          chunk.map(async (entry) => ({
            entry,
            product: pickBestMatch(entry.name, await searchProducts(entry.name, slug)),
          }))
        )
        if (cancelled) return
        for (const { entry, product } of results) {
          if (product) rows.push({ key: entry.name, entry, product })
          else missing.push(entry)
        }
      }
      if (!cancelled) setResolution({ text, rows, missing })
    }

    void resolveAll()
    return () => {
      cancelled = true
    }
  }, [entries, text, city?.slug])

  // Nada de `setState` dentro del efecto: lo resuelto se compara contra el
  // texto actual, así que "resolviendo" se deriva en vez de guardarse.
  const resolving = entries.length > 0 && resolution?.text !== text
  const current = resolving ? null : resolution
  const rows = current?.rows ?? []
  const missing = current?.missing ?? []

  const quantityOf = useCallback(
    (key: string, fallback: number) => quantities[key] ?? fallback,
    [quantities]
  )
  const isIncluded = useCallback((key: string) => !excluded[key], [excluded])

  const includedRows = rows.filter((row) => isIncluded(row.key))
  const includedPieces = includedRows.reduce(
    (sum, row) => sum + quantityOf(row.key, row.entry.quantity),
    0
  )

  const stepQuantity = (key: string, fallback: number, delta: 1 | -1) => {
    const next = Math.min(Math.max(quantityOf(key, fallback) + delta, 1), MAX_SHARE_QUANTITY)
    haptic(8)
    setQuantities((prev) => ({ ...prev, [key]: next }))
  }

  const handleAdd = () => {
    if (includedRows.length === 0) return
    setAdding(true)
    const items = includedRows.map((row) =>
      toCartItem(row.product, quantityOf(row.key, row.entry.quantity))
    )
    addOrderItems(items)
    for (const item of items) {
      AnalyticsEvents.addToCart({
        id: item.product_id,
        name: item.name,
        price: item.sale_price ?? item.price,
        quantity: item.quantity,
      })
    }
    haptic(10)
    toast(
      `${items.length} producto${items.length !== 1 ? "s" : ""} agregado${
        items.length !== 1 ? "s" : ""
      } al carrito`
    )
    setText("")
    setQuantities({})
    setExcluded({})
    setAdding(false)
  }

  const justAdded = entries.length === 0 && !!resolution && resolution.rows.length > 0

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-[#242529] flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-[#0E7A0E]" aria-hidden="true" />
          Lista compartida
        </h1>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
          Convierte una lista de WhatsApp en un pedido. Revisa las coincidencias y confirma antes de
          agregar.
        </p>
      </header>

      <section className="mb-5">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <label
            htmlFor="lista-compartida"
            className="text-sm font-semibold text-[#343538]"
          >
            Tu lista
          </label>
          {entries.length > 0 && (
            <span className="text-xs text-[var(--text-secondary)]">{shareSummary(entries)}</span>
          )}
        </div>
        <textarea
          id="lista-compartida"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={entries.length > 8 ? 12 : 6}
          placeholder={"Un producto por renglón. Por ejemplo:\n2 kg de tomate\n1 lechuga\n3 limones"}
          className="w-full rounded-xl border border-[#e0dbd2] bg-white p-3 text-sm text-[#343538] placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7A0E] focus-visible:ring-offset-1"
        />
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
          Acepta cantidades al inicio (“2 kg de tomate”), con x (“tomate x3”) o entre paréntesis
          (“tomate (2)”).
        </p>
        {parsed.truncated > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            Se muestran los primeros 20 renglones; {parsed.truncated} quedaron fuera.
          </p>
        )}
      </section>

      <p aria-live="polite" className="sr-only">
        {resolving
          ? "Buscando productos"
          : `${rows.length} productos encontrados, ${missing.length} sin coincidencia`}
      </p>

      {resolving && (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Buscando en el catálogo…
        </div>
      )}

      {!resolving && rows.length > 0 && (
        <section aria-labelledby="coincidencias-heading" className="mb-5">
          <h2 id="coincidencias-heading" className="text-sm font-semibold text-[#343538] mb-2">
            Encontrados ({rows.length})
          </h2>
          <ul className="space-y-2">
            {rows.map((row) => {
              const included = isIncluded(row.key)
              const quantity = quantityOf(row.key, row.entry.quantity)
              const price = effectivePrice(row.product)
              const outOfStock = row.product.stock_status === "out_of_stock"
              return (
                <li
                  key={row.key}
                  className="flex items-center gap-3 rounded-xl border border-[#E8E9EB] bg-white p-2.5"
                >
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={(event) =>
                      setExcluded((prev) => ({ ...prev, [row.key]: !event.target.checked }))
                    }
                    aria-label={`Incluir ${row.product.name}`}
                    className="w-4 h-4 shrink-0 accent-[#0E7A0E]"
                  />
                  <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-[#F7F5F0]">
                    {row.product.image_url ? (
                      <Image
                        src={row.product.image_url}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-[#B0B3B8]">
                        s/i
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#343538] leading-tight line-clamp-2">
                      {row.product.name}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Pediste “{row.entry.name}” · ${price.toFixed(2)}
                      {outOfStock && " · Agotado"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => stepQuantity(row.key, row.entry.quantity, -1)}
                      disabled={quantity <= 1}
                      aria-label={`Quitar una pieza de ${row.product.name}`}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#e0dbd2] text-[#343538] hover:bg-[#F7F5F0] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <span
                      className="w-8 text-center text-sm font-semibold text-[#343538] tabular-nums"
                      aria-label={`Cantidad de ${row.product.name}`}
                    >
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => stepQuantity(row.key, row.entry.quantity, 1)}
                      disabled={quantity >= MAX_SHARE_QUANTITY}
                      aria-label={`Agregar una pieza de ${row.product.name}`}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#e0dbd2] text-[#343538] hover:bg-[#F7F5F0] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {!resolving && missing.length > 0 && (
        <section aria-labelledby="sin-coincidencia-heading" className="mb-5">
          <h2
            id="sin-coincidencia-heading"
            className="text-sm font-semibold text-[#343538] mb-2"
          >
            Sin coincidencia ({missing.length})
          </h2>
          <ul className="space-y-2">
            {missing.map((entry) => (
              <li
                key={entry.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#e0dbd2] bg-[#F7F5F0] px-3 py-2.5"
              >
                <span className="text-sm text-[#343538] truncate">
                  {entry.name}
                  {entry.quantity > 1 && (
                    <span className="text-[var(--text-secondary)]"> · {entry.quantity}</span>
                  )}
                </span>
                <Link
                  href={`/${citySlug}/buscar?q=${encodeURIComponent(entry.name)}`}
                  className="flex items-center gap-1 text-xs font-semibold text-[#0E7A0E] hover:underline shrink-0"
                >
                  <Search className="w-3.5 h-3.5" aria-hidden="true" />
                  Buscar
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Estos renglones no entran al carrito; ábrelos en el buscador para elegir la
            presentación.
          </p>
        </section>
      )}

      {!resolving && entries.length > 0 && (
        <button
          type="button"
          onClick={handleAdd}
          disabled={includedRows.length === 0 || adding}
          className="w-full flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-full text-sm font-semibold bg-[#0E7A0E] text-white shadow-md shadow-[#0E7A0E]/20 hover:bg-[#0c6b0c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ShoppingCart className="w-4 h-4" aria-hidden="true" />
          {includedRows.length === 0
            ? "Selecciona al menos un producto"
            : `Agregar ${includedRows.length} producto${
                includedRows.length !== 1 ? "s" : ""
              } al carrito`}
        </button>
      )}

      {!resolving && entries.length > 0 && includedPieces > 0 && (
        <p className="mt-2 text-center text-xs text-[var(--text-secondary)]">
          {includedPieces} pieza{includedPieces !== 1 ? "s" : ""} en total
        </p>
      )}

      {justAdded && (
        <section className="rounded-xl border border-[#0E7A0E]/20 bg-[#0E7A0E]/5 p-4 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-[#0E7A0E]">
            <Check className="w-4 h-4" aria-hidden="true" />
            Lista agregada al carrito
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/cart"
              className="inline-flex items-center gap-1.5 min-h-[44px] px-5 py-2 rounded-full text-sm font-semibold bg-[#0E7A0E] text-white hover:bg-[#0c6b0c]"
            >
              Ver carrito
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/${citySlug}`}
              className="inline-flex items-center min-h-[44px] px-5 py-2 rounded-full text-sm font-semibold border border-[#e0dbd2] text-[#343538] hover:bg-white"
            >
              Seguir comprando
            </Link>
          </div>
        </section>
      )}

      {entries.length === 0 && !justAdded && (
        <section className="rounded-xl border border-[#e0dbd2] bg-white p-6 text-center">
          <ClipboardList className="w-8 h-8 mx-auto text-[#B0B3B8]" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-[#242529]">Aún no hay lista</h2>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Comparte una lista desde WhatsApp eligiendo Resurte.me, o pégala arriba para convertirla
            en pedido.
          </p>
          <Link
            href={`/${citySlug}`}
            className="mt-4 inline-flex items-center gap-1.5 min-h-[44px] px-5 py-2 rounded-full text-sm font-semibold bg-[#0E7A0E] text-white hover:bg-[#0c6b0c]"
          >
            Ir al catálogo
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  )
}
