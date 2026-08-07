"use server"

import { getCachedProductsPaginated } from "@/lib/catalog-cache"
import type { Product } from "@/types"

const PAGE_SIZE = 24

export async function loadMoreProducts(page: number): Promise<{
  products: Product[]
  hasMore: boolean
}> {
  const { products, hasMore } = await getCachedProductsPaginated(
    page,
    PAGE_SIZE
  )
  return { products, hasMore }
}
