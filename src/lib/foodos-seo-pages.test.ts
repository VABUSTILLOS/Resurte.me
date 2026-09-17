import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  deleteSeoPage,
  listPublishedSeoPages,
  listSeoPages,
  loadPublishedSeoPage,
  loadSeoProfile,
  MAX_ABOUT_PROFILE_LENGTH,
  MAX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  MAX_PAGE_BODY_LENGTH,
  MAX_TAGLINE_LENGTH,
  normalizeKeywords,
  saveSeoProfile,
  setSeoPageStatus,
  upsertSeoPage,
} from "./foodos-seo-pages"

type Call = { table: string; method: string; args: unknown[] }
type TableConfig = {
  rows?: unknown
  error?: unknown
  single?: unknown
  maybeSingle?: unknown
}

function fakeClient(tables: Record<string, TableConfig> = {}) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const config = tables[table] ?? {}
      const builder: Record<string, unknown> = {}
      for (const method of [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "neq",
        "in",
        "order",
        "limit",
        "upsert",
      ]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          return builder
        }
      }
      builder.maybeSingle = async () => {
        calls.push({ table, method: "maybeSingle", args: [] })
        return "maybeSingle" in config ? config.maybeSingle : { data: null, error: null }
      }
      builder.single = async () =>
        "single" in config ? config.single : { data: config.rows ?? [], error: config.error ?? null }
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: config.rows ?? [], error: config.error ?? null }).then(resolve)
      return builder
    },
  }
  return { supabase: client as unknown as SupabaseClient, calls }
}

function upsertPayload(calls: Call[]): Record<string, unknown> {
  const call = calls.find((entry) => entry.method === "upsert")
  return (call?.args[0] ?? {}) as Record<string, unknown>
}

function updatePayload(calls: Call[]): Record<string, unknown> {
  const call = calls.find((entry) => entry.method === "update")
  return (call?.args[0] ?? {}) as Record<string, unknown>
}

const pageRow = {
  id: "page-1",
  kind: "about",
  slug: "sobre-taqueria-centro",
  title: "Sobre Taquería Centro",
  summary: "Quiénes somos",
  body: "Somos una taquería de barrio.",
  faq: [{ q: "¿Hay envío?", a: "Sí." }],
  status: "draft",
  source: "template",
  generated_at: "2026-01-01T00:00:00.000Z",
  approved_at: null,
  updated_at: "2026-01-01T00:00:00.000Z",
}

describe("normalizeKeywords", () => {
  it("devuelve vacío si no es una lista", () => {
    expect(normalizeKeywords(null)).toEqual([])
    expect(normalizeKeywords("tacos")).toEqual([])
  })

  it("normaliza a minúsculas, recorta y quita vacíos y repetidos", () => {
    expect(normalizeKeywords(["  Tacos ", "TACOS", "", "  ", "Pastor"])).toEqual([
      "tacos",
      "pastor",
    ])
  })

  it("descarta lo que no sea texto", () => {
    expect(normalizeKeywords(["tacos", 5, null, { a: 1 }])).toEqual(["tacos"])
  })

  it("acota cada palabra y el total", () => {
    const long = normalizeKeywords(["x".repeat(80)])
    expect(long[0]?.length).toBe(MAX_KEYWORD_LENGTH)

    const many = normalizeKeywords(Array.from({ length: 40 }, (_, i) => `k${i}`))
    expect(many).toHaveLength(MAX_KEYWORDS)
  })
})

describe("upsertSeoPage", () => {
  it("exige título, tipo válido y un slug derivable", async () => {
    const { supabase } = fakeClient()
    await expect(upsertSeoPage(supabase, { restaurantId: "r1", kind: "about", title: "  " })).resolves.toEqual(
      { ok: false, error: "La página necesita un título" }
    )
    await expect(
      upsertSeoPage(supabase, { restaurantId: "r1", kind: "about", title: "x".repeat(161) })
    ).resolves.toEqual({ ok: false, error: "El título es demasiado largo" })
    await expect(
      upsertSeoPage(supabase, {
        restaurantId: "r1",
        kind: "otro" as never,
        title: "Sobre nosotros",
      })
    ).resolves.toEqual({ ok: false, error: "Tipo de página no válido" })
    await expect(
      upsertSeoPage(supabase, { restaurantId: "r1", kind: "about", title: "!!!" })
    ).resolves.toEqual({ ok: false, error: "El título necesita letras o números" })
  })

  it("rechaza un cuerpo más largo que el límite", async () => {
    const { supabase } = fakeClient()
    const result = await upsertSeoPage(supabase, {
      restaurantId: "r1",
      kind: "about",
      title: "Sobre nosotros",
      body: "x".repeat(MAX_PAGE_BODY_LENGTH + 1),
    })
    expect(result).toEqual({ ok: false, error: "El contenido es demasiado largo" })
  })

  it("siempre escribe en borrador y limpia la aprobación anterior", async () => {
    const { supabase, calls } = fakeClient({ foodos_seo_pages: { single: { data: pageRow, error: null } } })
    const result = await upsertSeoPage(supabase, {
      restaurantId: "r1",
      kind: "about",
      title: "Sobre Taquería Centro",
      body: "Somos una taquería de barrio.",
      source: "llm",
      faq: [{ q: "¿Hay envío?", a: "Sí." }],
    })

    expect(result.ok).toBe(true)
    const payload = upsertPayload(calls)
    expect(payload.status).toBe("draft")
    expect(payload.approved_at).toBeNull()
    expect(payload.slug).toBe("sobre-taqueria-centro")
    expect(payload.source).toBe("llm")
    expect(payload.faq).toEqual([{ q: "¿Hay envío?", a: "Sí." }])
    expect(typeof payload.generated_at).toBe("string")
  })

  it("choca contra la llave natural para no acumular duplicados", async () => {
    const { supabase, calls } = fakeClient({ foodos_seo_pages: { single: { data: pageRow, error: null } } })
    await upsertSeoPage(supabase, { restaurantId: "r1", kind: "about", title: "Sobre nosotros" })
    const call = calls.find((entry) => entry.method === "upsert")
    expect(call?.args[1]).toEqual({ onConflict: "restaurant_id,kind,slug" })
  })

  it("cae a la plantilla cuando el origen no es el modelo", async () => {
    const { supabase, calls } = fakeClient({ foodos_seo_pages: { single: { data: pageRow, error: null } } })
    await upsertSeoPage(supabase, { restaurantId: "r1", kind: "faq", title: "Preguntas frecuentes" })
    expect(upsertPayload(calls).source).toBe("template")
  })

  it("devuelve un error legible si la base falla o no devuelve fila", async () => {
    const failing = fakeClient({
      foodos_seo_pages: { single: { data: null, error: { message: "boom" } } },
    })
    await expect(
      upsertSeoPage(failing.supabase, { restaurantId: "r1", kind: "about", title: "Sobre" })
    ).resolves.toEqual({ ok: false, error: "No se pudo guardar la página" })

    const empty = fakeClient({ foodos_seo_pages: { single: { data: null, error: null } } })
    await expect(
      upsertSeoPage(empty.supabase, { restaurantId: "r1", kind: "about", title: "Sobre" })
    ).resolves.toEqual({ ok: false, error: "No se pudo guardar la página" })
  })
})

describe("setSeoPageStatus", () => {
  it("filtra por id y por restaurante (segunda llave contra ids ajenos)", async () => {
    const { supabase, calls } = fakeClient()
    await expect(setSeoPageStatus(supabase, "r1", "page-1", "published")).resolves.toBe(true)
    const filters = calls.filter((entry) => entry.method === "eq")
    expect(filters.map((entry) => entry.args)).toEqual([
      ["id", "page-1"],
      ["restaurant_id", "r1"],
    ])
  })

  it("sella la fecha de aprobación al publicar y la limpia al volver a borrador", async () => {
    const publish = fakeClient()
    await setSeoPageStatus(publish.supabase, "r1", "page-1", "published")
    expect(typeof updatePayload(publish.calls).approved_at).toBe("string")

    const draft = fakeClient()
    await setSeoPageStatus(draft.supabase, "r1", "page-1", "draft")
    expect(updatePayload(draft.calls).approved_at).toBeNull()
  })

  it("rechaza un estado que no existe", async () => {
    const { supabase } = fakeClient()
    await expect(setSeoPageStatus(supabase, "r1", "page-1", "listo" as never)).resolves.toBe(false)
  })

  it("devuelve false si la base falla", async () => {
    const { supabase } = fakeClient({ foodos_seo_pages: { error: { message: "boom" } } })
    await expect(setSeoPageStatus(supabase, "r1", "page-1", "published")).resolves.toBe(false)
  })
})

describe("deleteSeoPage", () => {
  it("borra solo dentro del restaurante", async () => {
    const { supabase, calls } = fakeClient()
    await expect(deleteSeoPage(supabase, "r1", "page-1")).resolves.toBe(true)
    const filters = calls.filter((entry) => entry.method === "eq")
    expect(filters.map((entry) => entry.args)).toEqual([
      ["id", "page-1"],
      ["restaurant_id", "r1"],
    ])
  })

  it("devuelve false si la base falla", async () => {
    const { supabase } = fakeClient({ foodos_seo_pages: { error: { message: "boom" } } })
    await expect(deleteSeoPage(supabase, "r1", "page-1")).resolves.toBe(false)
  })
})

describe("saveSeoProfile", () => {
  it("valida la frase corta, la descripción y el enlace", async () => {
    const { supabase } = fakeClient()
    await expect(
      saveSeoProfile(supabase, { restaurantId: "r1", tagline: "x".repeat(MAX_TAGLINE_LENGTH + 1) })
    ).resolves.toEqual({ ok: false, error: "La frase corta es demasiado larga" })
    await expect(
      saveSeoProfile(supabase, { restaurantId: "r1", about: "x".repeat(MAX_ABOUT_PROFILE_LENGTH + 1) })
    ).resolves.toEqual({ ok: false, error: "La descripción es demasiado larga" })
    await expect(
      saveSeoProfile(supabase, { restaurantId: "r1", googleBusinessUrl: "maps.app.goo.gl/abc" })
    ).resolves.toEqual({ ok: false, error: "El enlace de Google Business no es válido" })
  })

  it("guarda los textos recortados, las palabras clave normalizadas y vacío como null", async () => {
    const { supabase, calls } = fakeClient()
    const result = await saveSeoProfile(supabase, {
      restaurantId: "r1",
      tagline: "  Tacos al pastor desde 1998  ",
      about: "   ",
      seoKeywords: ["Tacos", "tacos", "Pastor"],
      googleBusinessUrl: "  https://maps.app.goo.gl/abc  ",
    })

    expect(result).toEqual({ ok: true })
    expect(updatePayload(calls)).toEqual({
      tagline: "Tacos al pastor desde 1998",
      about: null,
      seo_keywords: ["tacos", "pastor"],
      google_business_url: "https://maps.app.goo.gl/abc",
    })
  })

  it("devuelve un error legible si la base falla", async () => {
    const { supabase } = fakeClient({ foodos_restaurants: { error: { message: "boom" } } })
    await expect(saveSeoProfile(supabase, { restaurantId: "r1" })).resolves.toEqual({
      ok: false,
      error: "No se pudo guardar el perfil",
    })
  })
})

describe("listSeoPages", () => {
  it("ordena por actualización y acota el límite", async () => {
    const { supabase, calls } = fakeClient({ foodos_seo_pages: { rows: [] } })
    await listSeoPages(supabase, "r1", 999)
    expect(calls.find((entry) => entry.method === "limit")?.args[0]).toBe(300)
    expect(calls.find((entry) => entry.method === "order")?.args).toEqual([
      "updated_at",
      { ascending: false },
    ])

    const zero = fakeClient({ foodos_seo_pages: { rows: [] } })
    await listSeoPages(zero.supabase, "r1", 0)
    expect(zero.calls.find((entry) => entry.method === "limit")?.args[0]).toBe(1)
  })

  it("degrada a vacío en vez de tumbar la pantalla", async () => {
    const { supabase } = fakeClient({ foodos_seo_pages: { error: { message: "boom" } } })
    await expect(listSeoPages(supabase, "r1")).resolves.toEqual([])
  })

  it("descarta filas corruptas y normaliza el resto", async () => {
    const { supabase } = fakeClient({
      foodos_seo_pages: {
        rows: [
          pageRow,
          { id: "page-2", title: "Sin slug" },
          null,
          {
            id: "page-3",
            kind: "inventado",
            slug: "rara",
            title: "Rara",
            body: null,
            faq: "no-es-lista",
            status: "publicada",
            source: "otro",
          },
        ],
      },
    })
    const pages = await listSeoPages(supabase, "r1")
    expect(pages).toHaveLength(2)
    expect(pages[1]?.kind).toBe("about")
    expect(pages[1]?.status).toBe("draft")
    expect(pages[1]?.source).toBe("template")
    expect(pages[1]?.body).toBe("")
    expect(pages[1]?.faq).toEqual([])
  })
})

describe("listPublishedSeoPages", () => {
  it("filtra por publicado y degrada en silencio", async () => {
    const { supabase, calls } = fakeClient({ foodos_seo_pages: { rows: [pageRow] } })
    await expect(listPublishedSeoPages(supabase, "r1")).resolves.toHaveLength(1)
    expect(calls.some((entry) => entry.method === "eq" && entry.args[0] === "status")).toBe(true)

    const failing = fakeClient({ foodos_seo_pages: { error: { message: "boom" } } })
    await expect(listPublishedSeoPages(failing.supabase, "r1")).resolves.toEqual([])
  })
})

describe("loadPublishedSeoPage", () => {
  it("normaliza el slug de la URL antes de buscar", async () => {
    const { supabase, calls } = fakeClient({ foodos_seo_pages: { maybeSingle: { data: pageRow, error: null } } })
    await expect(loadPublishedSeoPage(supabase, "r1", "Sobre Taquería Centro")).resolves.toMatchObject({
      slug: "sobre-taqueria-centro",
    })
    expect(calls.find((entry) => entry.method === "eq" && entry.args[0] === "slug")?.args[1]).toBe(
      "sobre-taqueria-centro"
    )
  })

  it("devuelve null sin slug utilizable, sin fila o con error", async () => {
    const { supabase } = fakeClient()
    await expect(loadPublishedSeoPage(supabase, "r1", "!!!")).resolves.toBeNull()

    const empty = fakeClient({ foodos_seo_pages: { maybeSingle: { data: null, error: null } } })
    await expect(loadPublishedSeoPage(empty.supabase, "r1", "sobre")).resolves.toBeNull()

    const failing = fakeClient({ foodos_seo_pages: { error: { message: "boom" } } })
    await expect(loadPublishedSeoPage(failing.supabase, "r1", "sobre")).resolves.toBeNull()
  })
})

describe("loadSeoProfile", () => {
  const restaurant = {
    id: "r1",
    name: "Taquería Centro",
    slug: "taqueria-centro",
    logo_url: "https://cdn/x/logo.png",
    description: "Taquería de barrio",
    theme_color: "#0E7A0E",
    currency: "MXN",
    tagline: "Tacos al pastor desde 1998",
    about: "Receta familiar.",
    seo_keywords: ["tacos", "pastor"],
    google_business_url: null,
  }

  function profileClient(overrides: Record<string, TableConfig> = {}) {
    return fakeClient({
      foodos_restaurants: { maybeSingle: { data: restaurant, error: null } },
      foodos_branches: {
        rows: [
          {
            id: "b1",
            name: "Centro",
            city: "Puebla",
            address: "Av. Juárez 123",
            lat: "19.043",
            lng: "-98.198",
            phone: "2221234567",
            pickup_active: true,
            delivery_active: true,
            dine_in_active: true,
          },
        ],
      },
      foodos_branch_hours: {
        rows: [{ day_of_week: 1, open_time: "09:00:00", close_time: "18:00:00", is_closed: false }],
      },
      foodos_reviews: { rows: [{ rating: 4 }, { rating: 5 }, { rating: 0 }, { rating: null }] },
      ...overrides,
    })
  }

  it("arma el contexto con sucursales, horarios y valoración media", async () => {
    const { supabase } = profileClient()
    const context = await loadSeoProfile(supabase, "r1")

    expect(context?.restaurant.name).toBe("Taquería Centro")
    expect(context?.restaurant.seo_keywords).toEqual(["tacos", "pastor"])
    expect(context?.branches[0]).toMatchObject({
      name: "Centro",
      city: "Puebla",
      lat: 19.043,
      lng: -98.198,
      delivery_active: true,
    })
    expect(context?.hours).toEqual([
      { day_of_week: 1, open_time: "09:00:00", close_time: "18:00:00", is_closed: false },
    ])
    expect(context?.rating).toEqual({ value: 4.5, count: 2 })
  })

  it("devuelve null cuando el restaurante no existe o no tiene slug/nombre", async () => {
    const missing = profileClient({ foodos_restaurants: { maybeSingle: { data: null, error: null } } })
    await expect(loadSeoProfile(missing.supabase, "r1")).resolves.toBeNull()

    const nameless = profileClient({
      foodos_restaurants: { maybeSingle: { data: { id: "r1", slug: "x", name: "  " }, error: null } },
    })
    await expect(loadSeoProfile(nameless.supabase, "r1")).resolves.toBeNull()
  })

  it("no consulta horarios si el restaurante no tiene sucursales", async () => {
    const { supabase, calls } = profileClient({ foodos_branches: { rows: [] } })
    const context = await loadSeoProfile(supabase, "r1")
    expect(context?.hours).toEqual([])
    expect(calls.some((entry) => entry.table === "foodos_branch_hours")).toBe(false)
  })

  it("sin reseñas visibles la valoración va null (nunca 0 estrellas)", async () => {
    const { supabase } = profileClient({ foodos_reviews: { rows: [] } })
    await expect(loadSeoProfile(supabase, "r1")).resolves.toMatchObject({ rating: null })
  })

  it("degrada a null si la lectura falla", async () => {
    const { supabase } = profileClient({
      foodos_restaurants: { maybeSingle: { data: null, error: { message: "boom" } } },
    })
    await expect(loadSeoProfile(supabase, "r1")).resolves.toBeNull()
  })
})
