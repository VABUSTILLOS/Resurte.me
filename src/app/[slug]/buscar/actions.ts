"use server"

import { getProductsByStorePaginated } from "@/lib/data"
import type { Product } from "@/types"

const STORE_ID = 1
const PAGE_SIZE = 24

type FlattenedProduct = Product & { price: number; sale_price: number | null; stock_status: string }

export async function loadMoreProducts(page: number): Promise<{
  products: FlattenedProduct[]
  hasMore: boolean
}> {
  const { products, hasMore } = await getProductsByStorePaginated(
    STORE_ID,
    page,
    PAGE_SIZE
  )
  return { products: products as FlattenedProduct[], hasMore }
}
