import { describe, expect, it } from "vitest"
import {
  MAX_RATING,
  MIN_RATING,
  REVIEW_BADGE_HELP,
  REVIEW_SCOPE_NOTE,
  buildProductReviewIndex,
  formatRatingAverage,
  formatReviewDay,
  normalizeFeedRow,
  ratingStars,
  reviewCountLabel,
  reviewDayLabel,
  reviewItemLabel,
  reviewStatsFor,
  reviewSummaryLabel,
} from "@/lib/product-reviews"

/** Fila del RPC, con overrides. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    product_id: 10,
    review_count: 1,
    average_rating: 5,
    rating: 5,
    comment: "Muy bien",
    reviewed_at: "2026-03-12T18:00:00.000Z",
    ...overrides,
  }
}

describe("normalizeFeedRow", () => {
  it("acepta una fila válida y conserva los tipos", () => {
    const out = normalizeFeedRow(row())
    expect(out).toEqual({
      product_id: 10,
      review_count: 1,
      average_rating: 5,
      rating: 5,
      comment: "Muy bien",
      reviewed_at: "2026-03-12T18:00:00.000Z",
    })
  })

  it("acepta comentario null (calificación sin texto)", () => {
    expect(normalizeFeedRow(row({ comment: null }))?.comment).toBeNull()
  })

  it("trata un comentario no-string como null en vez de romper el render", () => {
    expect(normalizeFeedRow(row({ comment: 42 }))?.comment).toBeNull()
  })

  it("recorta review_count y rating a enteros", () => {
    const out = normalizeFeedRow(row({ review_count: 3.7, rating: 4 }))
    expect(out?.review_count).toBe(3)
    expect(out?.rating).toBe(4)
  })

  it("rechaza rating fuera de 1..5", () => {
    expect(normalizeFeedRow(row({ rating: 0 }))).toBeNull()
    expect(normalizeFeedRow(row({ rating: 6 }))).toBeNull()
    expect(normalizeFeedRow(row({ rating: -1 }))).toBeNull()
  })

  it("acepta los límites exactos del rango", () => {
    expect(normalizeFeedRow(row({ rating: MIN_RATING }))?.rating).toBe(1)
    expect(normalizeFeedRow(row({ rating: MAX_RATING }))?.rating).toBe(5)
  })

  it("descarta la fila cuando el promedio está fuera de rango (no lo recorta)", () => {
    // Recortar fabricaría una calificación que nadie dio.
    expect(normalizeFeedRow(row({ average_rating: 0 }))).toBeNull()
    expect(normalizeFeedRow(row({ average_rating: 9 }))).toBeNull()
  })

  it("rechaza review_count ausente, cero o negativo", () => {
    expect(normalizeFeedRow(row({ review_count: 0 }))).toBeNull()
    expect(normalizeFeedRow(row({ review_count: -3 }))).toBeNull()
    expect(normalizeFeedRow(row({ review_count: undefined }))).toBeNull()
  })

  it("rechaza reviewed_at ausente o vacío", () => {
    expect(normalizeFeedRow(row({ reviewed_at: "" }))).toBeNull()
    expect(normalizeFeedRow(row({ reviewed_at: null }))).toBeNull()
  })

  it("acepta int8/numeric entregados como cadena por PostgREST", () => {
    const out = normalizeFeedRow(
      row({
        product_id: "42",
        review_count: "3",
        average_rating: "4.33",
        rating: "5",
      })
    )
    expect(out).toMatchObject({
      product_id: 42,
      review_count: 3,
      average_rating: 4.33,
      rating: 5,
    })
  })

  it("rechaza cadenas no numéricas o vacías", () => {
    expect(normalizeFeedRow(row({ product_id: "abc" }))).toBeNull()
    expect(normalizeFeedRow(row({ review_count: "" }))).toBeNull()
    expect(normalizeFeedRow(row({ rating: "  " }))).toBeNull()
  })

  it("rechaza valores no finitos y no-objetos", () => {
    expect(normalizeFeedRow(row({ average_rating: NaN }))).toBeNull()
    expect(normalizeFeedRow(row({ product_id: Infinity }))).toBeNull()
    expect(normalizeFeedRow(null)).toBeNull()
    expect(normalizeFeedRow(undefined)).toBeNull()
    expect(normalizeFeedRow("nope")).toBeNull()
    expect(normalizeFeedRow([])).toBeNull()
  })
})

describe("buildProductReviewIndex", () => {
  it("agrupa las filas de un mismo producto sin reordenarlas", () => {
    const index = buildProductReviewIndex([
      row({ product_id: 1, review_count: 2, average_rating: 4, rating: 5, comment: "nueva" }),
      row({ product_id: 1, review_count: 2, average_rating: 4, rating: 3, comment: "vieja" }),
    ])
    const stats = reviewStatsFor(index, 1)
    expect(stats?.count).toBe(2)
    expect(stats?.average).toBe(4)
    // El orden de llegada (más reciente primero) se respeta tal cual.
    expect(stats?.recent.map((r) => r.comment)).toEqual(["nueva", "vieja"])
  })

  it("indexa productos distintos por separado", () => {
    const index = buildProductReviewIndex([
      row({ product_id: 7 }),
      row({ product_id: 9 }),
    ])
    expect([...index.keys()].sort((a, b) => a - b)).toEqual([7, 9])
  })

  it("ignora filas corruptas sin afectar a las buenas", () => {
    const index = buildProductReviewIndex([
      row({ product_id: 5 }),
      row({ product_id: 5, rating: 99 }),
      "basura",
      row({ product_id: 6, review_count: 0 }),
    ])
    expect([...index.keys()]).toEqual([5])
    expect(index.get(5)?.recent).toHaveLength(1)
  })

  it("un arreglo vacío produce un índice vacío (estado honesto: no hay reseñas)", () => {
    expect(buildProductReviewIndex([]).size).toBe(0)
  })

  it("gana el primer agregado cuando llegan valores inconsistentes", () => {
    const index = buildProductReviewIndex([
      row({ product_id: 3, review_count: 2, average_rating: 4 }),
      row({ product_id: 3, review_count: 99, average_rating: 1 }),
    ])
    expect(index.get(3)?.count).toBe(2)
    expect(index.get(3)?.average).toBe(4)
    expect(index.get(3)?.recent).toHaveLength(2)
  })

  it("reviewStatsFor devuelve undefined para un producto sin reseñas", () => {
    const index = buildProductReviewIndex([row({ product_id: 1 })])
    expect(reviewStatsFor(index, 2)).toBeUndefined()
  })
})

describe("formatRatingAverage", () => {
  it("siempre muestra un decimal", () => {
    expect(formatRatingAverage(5)).toBe("5.0")
    expect(formatRatingAverage(4.25)).toBe("4.3")
    expect(formatRatingAverage(1)).toBe("1.0")
  })

  it("no afirma una calificación cuando el dato es inservible", () => {
    expect(formatRatingAverage(NaN)).toBe("0.0")
    expect(formatRatingAverage(Infinity)).toBe("0.0")
    expect(formatRatingAverage(-1)).toBe("0.0")
  })

  it("recorta solo por arriba (el rango real lo garantiza el CHECK)", () => {
    expect(formatRatingAverage(9)).toBe("5.0")
  })
})

describe("ratingStars", () => {
  it("redondea al entero más cercano", () => {
    expect(ratingStars(5)).toBe("★★★★★")
    expect(ratingStars(4.4)).toBe("★★★★☆")
    expect(ratingStars(4.5)).toBe("★★★★★")
    expect(ratingStars(3)).toBe("★★★☆☆")
    expect(ratingStars(1)).toBe("★☆☆☆☆")
  })

  it("siempre devuelve 5 símbolos", () => {
    for (const value of [0, 0.4, 2.2, 3.7, 5, NaN, -3, 99]) {
      expect(ratingStars(value)).toHaveLength(5)
    }
  })

  it("un dato inservible no pinta estrellas llenas", () => {
    expect(ratingStars(NaN)).toBe("☆☆☆☆☆")
    expect(ratingStars(-5)).toBe("☆☆☆☆☆")
    expect(ratingStars(99)).toBe("★★★★★")
  })
})

describe("reviewCountLabel", () => {
  it("singular y plural en español", () => {
    expect(reviewCountLabel(1)).toBe("1 reseña")
    expect(reviewCountLabel(2)).toBe("2 reseñas")
    expect(reviewCountLabel(10)).toBe("10 reseñas")
  })

  it("el estado vacío se declara, no se disfraza", () => {
    expect(reviewCountLabel(0)).toBe("Sin reseñas")
    expect(reviewCountLabel(-1)).toBe("Sin reseñas")
    expect(reviewCountLabel(NaN)).toBe("Sin reseñas")
  })
})

describe("reviewSummaryLabel", () => {
  it("combina promedio y conteo", () => {
    expect(reviewSummaryLabel(3, 4.5)).toBe("4.5 · 3 reseñas")
    expect(reviewSummaryLabel(1, 5)).toBe("5.0 · 1 reseña")
  })

  it("nunca muestra un promedio sin reseñas detrás", () => {
    expect(reviewSummaryLabel(0, 4.5)).toBe("Sin reseñas")
    expect(reviewSummaryLabel(0, 0)).toBe("Sin reseñas")
  })
})

describe("reviewItemLabel", () => {
  it("singular y plural de estrella", () => {
    expect(reviewItemLabel(1, "12 mar 2026")).toBe("1 estrella · 12 mar 2026")
    expect(reviewItemLabel(5, "12 mar 2026")).toBe("5 estrellas · 12 mar 2026")
  })

  it("sin fecha no deja un separador colgando", () => {
    expect(reviewItemLabel(4, "")).toBe("4 estrellas")
  })

  it("acota una calificación corrupta al rango válido", () => {
    expect(reviewItemLabel(99, "")).toBe("5 estrellas")
    expect(reviewItemLabel(NaN, "")).toBe("1 estrella")
  })
})

describe("formatReviewDay / reviewDayLabel", () => {
  it("compone día, mes abreviado y año", () => {
    expect(formatReviewDay({ year: 2026, month: 3, day: 12, hour: 18 })).toBe("12 mar 2026")
    expect(formatReviewDay({ year: 2026, month: 12, day: 1, hour: 0 })).toBe("1 dic 2026")
  })

  it("devuelve vacío ante partes inservibles", () => {
    expect(formatReviewDay({ year: 2026, month: 13, day: 1, hour: 0 })).toBe("")
    expect(formatReviewDay({ year: 2026, month: 0, day: 1, hour: 0 })).toBe("")
    expect(formatReviewDay({ year: 0, month: 3, day: 1, hour: 0 })).toBe("")
    expect(formatReviewDay({ year: 2026, month: 3, day: 0, hour: 0 })).toBe("")
  })

  it("usa el día LOCAL del negocio, no el día UTC", () => {
    // 2026-03-13T02:00Z es todavía 12 de marzo en México (UTC-6).
    expect(reviewDayLabel("2026-03-13T02:00:00.000Z")).toBe("12 mar 2026")
  })

  it("devuelve vacío ante una fecha inválida en vez de 'Invalid Date'", () => {
    expect(reviewDayLabel("no-es-fecha")).toBe("")
    expect(reviewDayLabel("")).toBe("")
  })
})

describe("textos de alcance", () => {
  it("la aclaración dice explícitamente que mide el pedido completo", () => {
    // Es la diferencia entre informar y exagerar: los datos no sostienen una
    // "calificación del producto".
    expect(REVIEW_SCOPE_NOTE).toMatch(/pedido completo/i)
    expect(REVIEW_SCOPE_NOTE).toMatch(/entrega/i)
  })

  it("la ayuda de la insignia explica qué promedia", () => {
    expect(REVIEW_BADGE_HELP).toMatch(/pedidos que incluyeron este producto/i)
  })
})
