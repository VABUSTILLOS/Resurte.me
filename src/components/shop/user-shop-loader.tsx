"use client"

import { useEffect, useState } from "react"
import { loadCatalogForCity } from "@/app/[slug]/catalog-actions"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { UserShopView } from "./user-shop-view"
import type { Category, Product } from "@/types"

interface Props {
  categories: Category[]
  citySlug: string
}

/**
 * Carga el catálogo completo en el cliente para la tienda del usuario
 * logueado. La landing pública solo recibe un preview (ver
 * buildLandingPreview) para no inflar el HTML/flight con cientos de
 * productos que el visitante anónimo nunca ve.
 */
export function UserShopLoader({ categories, citySlug }: Props) {
  const [products, setProducts] = useState<Product[] | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCatalogForCity(citySlug)
      .then((data) => {
        if (!cancelled) setProducts(data)
      })
      .catch(() => {
        if (!cancelled) setProducts([])
      })
    return () => {
      cancelled = true
    }
  }, [citySlug])

  if (products === null) return <PageSkeleton />

  return <UserShopView categories={categories} products={products} citySlug={citySlug} />
}
