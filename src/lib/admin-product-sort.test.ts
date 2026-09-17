import { describe, expect, it } from "vitest"
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORT_KEYS,
  PRODUCT_SORT_LABEL,
  PRODUCT_TABLE_SORT_KEYS,
  ariaSortFor,
  clampProductSortToColumns,
  isProductSortKey,
  nextProductSort,
  parseProductSort,
  productSortDirLabel,
  productSortOrderClauses,
  productSortSearchParams,
} from "@/lib/admin-product-sort"

describe("admin-product-sort", () => {
  it("expone etiqueta y columna de tabla para cada clave", () => {
    for (const key of PRODUCT_SORT_KEYS) {
      expect(PRODUCT_SORT_LABEL[key]).toBeTruthy()
    }
    for (const key of PRODUCT_TABLE_SORT_KEYS) {
      expect(PRODUCT_SORT_KEYS).toContain(key)
    }
  })

  it("isProductSortKey rechaza desconocidos y vacíos", () => {
    expect(isProductSortKey("created_at")).toBe(true)
    expect(isProductSortKey("ventas")).toBe(false)
    expect(isProductSortKey("")).toBe(false)
    expect(isProductSortKey(null)).toBe(false)
    expect(isProductSortKey(undefined)).toBe(false)
  })

  it("parseProductSort cae al default ante valores inválidos", () => {
    expect(parseProductSort(null, null)).toEqual(DEFAULT_PRODUCT_SORT)
    expect(parseProductSort("", "")).toEqual(DEFAULT_PRODUCT_SORT)
    expect(parseProductSort("ventas", "desc")).toEqual({ key: "name", dir: "desc" })
    expect(parseProductSort("cost", "sideways")).toEqual({ key: "cost", dir: "asc" })
    expect(parseProductSort("created_at", "desc")).toEqual({ key: "created_at", dir: "desc" })
  })

  it("nextProductSort alterna solo la misma columna", () => {
    expect(nextProductSort({ key: "name", dir: "asc" }, "name")).toEqual({
      key: "name",
      dir: "desc",
    })
    expect(nextProductSort({ key: "name", dir: "desc" }, "name")).toEqual({
      key: "name",
      dir: "asc",
    })
    // Columna nueva: siempre empieza ascendente, aunque la anterior fuera desc.
    expect(nextProductSort({ key: "name", dir: "desc" }, "cost")).toEqual({
      key: "cost",
      dir: "asc",
    })
  })

  it("ariaSortFor marca solo la columna activa", () => {
    const sort = { key: "price", dir: "desc" } as const
    expect(ariaSortFor("price", sort)).toBe("descending")
    expect(ariaSortFor("name", sort)).toBe("none")
    expect(ariaSortFor("price", { key: "price", dir: "asc" })).toBe("ascending")
  })

  it("mapea cada clave a su columna real de PostgREST", () => {
    expect(productSortOrderClauses({ key: "name", dir: "asc" })).toEqual([
      { column: "name", ascending: true, nullsFirst: false },
    ])
    expect(productSortOrderClauses({ key: "price", dir: "desc" })).toEqual([
      { column: "price", ascending: false, nullsFirst: false },
    ])
    expect(productSortOrderClauses({ key: "quantity", dir: "asc" })).toEqual([
      { column: "stock_quantity", ascending: true, nullsFirst: false },
    ])
    expect(productSortOrderClauses({ key: "cost", dir: "asc" })).toEqual([
      { column: "cost", ascending: true, nullsFirst: false },
    ])
    expect(productSortOrderClauses({ key: "created_at", dir: "desc" })).toEqual([
      { column: "created_at", ascending: false, nullsFirst: false },
    ])
  })

  it("stock ordena por severidad y desempata por nombre", () => {
    expect(productSortOrderClauses({ key: "stock", dir: "desc" })).toEqual([
      { column: "stock_status", ascending: false },
      { column: "name", ascending: true },
    ])
  })

  it("omite el default en la URL", () => {
    expect(productSortSearchParams(DEFAULT_PRODUCT_SORT)).toEqual({})
    expect(productSortSearchParams({ key: "name", dir: "desc" })).toEqual({ dir: "desc" })
    expect(productSortSearchParams({ key: "cost", dir: "asc" })).toEqual({ sort: "cost" })
    expect(productSortSearchParams({ key: "created_at", dir: "desc" })).toEqual({
      sort: "created_at",
      dir: "desc",
    })
  })

  it("productSortDirLabel describe la dirección", () => {
    expect(productSortDirLabel("asc")).toBe("Ascendente")
    expect(productSortDirLabel("desc")).toBe("Descendente")
  })

  it("clampProductSortToColumns degrada si faltan columnas", () => {
    const legacy = "id,name,slug,price,stock_status,is_visible"
    // `name`, `price` y `stock` sobreviven; `cost` y `created_at` no existen.
    expect(clampProductSortToColumns({ key: "name", dir: "desc" }, legacy)).toEqual({
      key: "name",
      dir: "desc",
    })
    expect(clampProductSortToColumns({ key: "price", dir: "desc" }, legacy)).toEqual({
      key: "price",
      dir: "desc",
    })
    expect(clampProductSortToColumns({ key: "stock", dir: "asc" }, legacy)).toEqual({
      key: "stock",
      dir: "asc",
    })
    expect(clampProductSortToColumns({ key: "cost", dir: "desc" }, legacy)).toEqual(
      DEFAULT_PRODUCT_SORT
    )
    expect(clampProductSortToColumns({ key: "created_at", dir: "asc" }, legacy)).toEqual(
      DEFAULT_PRODUCT_SORT
    )
    expect(clampProductSortToColumns({ key: "quantity", dir: "asc" }, legacy)).toEqual(
      DEFAULT_PRODUCT_SORT
    )
    // Con el set completo nada se degrada.
    expect(
      clampProductSortToColumns(
        { key: "created_at", dir: "desc" },
        "id,name,price,cost,stock_quantity,stock_status,created_at"
      )
    ).toEqual({ key: "created_at", dir: "desc" })
  })
})
