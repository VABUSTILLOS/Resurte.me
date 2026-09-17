import { beforeEach, describe, expect, it, vi } from "vitest"

// El gate del Sitio IA vive en el servidor. Igual que el resto del panel: las
// ESCRITURAS lanzan, las LECTURAS degradan. Y el invariante de la fase —
// **la IA nunca publica sola** — se comprueba aquí, en la capa de acciones.

const mocks = vi.hoisted(() => ({
  requireFoodosFeature: vi.fn(),
  requireAuth: vi.fn(),
  requireFoodosAuth: vi.fn(),
  getOperatingContext: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  generateAboutText: vi.fn(),
  generateDishCopy: vi.fn(),
  generateFaq: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth, getCurrentUser: vi.fn() }))
vi.mock("@/lib/foodos-operating", () => ({
  requireFoodosAuth: mocks.requireFoodosAuth,
  getOperatingContext: mocks.getOperatingContext,
}))
vi.mock("@/lib/foodos-tier", () => ({ requireFoodosFeature: mocks.requireFoodosFeature }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock("@/lib/foodos-ai/seo", () => ({
  generateAboutText: mocks.generateAboutText,
  generateDishCopy: mocks.generateDishCopy,
  generateFaq: mocks.generateFaq,
}))

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  deleteSeoPageRow,
  generateSeoPage,
  getSeoKpis,
  getSitioData,
  publishSeoPage,
  saveSeoProfileAction,
  unpublishSeoPage,
} from "./actions"

const RESTAURANT_ID = "rest-1"
const PAGE_ID = "page-1"
const DISH_ID = "dish-1"
const USER = { id: "user-1", email: "dueno@example.com" }

/**
 * Respuesta del seam de operación para el caso normal (sin impersonación):
 * `supabase` es el cliente de sesión que cada test fabrica, así que el
 * camino que ejecuta la acción es exactamente el de siempre.
 */
function operating(supabase: unknown) {
  const ctx = {
    restaurantId: RESTAURANT_ID,
    ownerUserId: USER.id,
    client: supabase,
    impersonating: false,
    actorUserId: USER.id,
    actorEmail: USER.email ?? null,
  }
  mocks.getOperatingContext.mockResolvedValue(ctx as never)
  return { supabase, user: USER, ownerUserId: USER.id, ctx } as never
}

const RESTAURANT_ROW = {
  id: RESTAURANT_ID,
  user_id: USER.id,
  name: "Taquería Centro",
  slug: "taqueria-centro",
  logo_url: null,
  description: "Taquería de barrio",
  theme_color: "#0E7A0E",
  currency: "MXN",
  tagline: "Tacos al pastor desde 1998",
  about: "Receta familiar.",
  seo_keywords: ["tacos"],
  google_business_url: null,
}

const PAGE_ROW = {
  id: PAGE_ID,
  kind: "about",
  slug: "sobre-taqueria-centro",
  title: "Sobre Taquería Centro",
  summary: null,
  body: "Somos una taquería de barrio.",
  faq: [],
  status: "draft",
  source: "template",
  generated_at: "2026-01-01T00:00:00.000Z",
  approved_at: null,
  updated_at: "2026-01-01T00:00:00.000Z",
}

type Call = { table: string; method: string; args: unknown[] }
type TableConfig = { rows?: unknown; error?: unknown; single?: unknown; maybeSingle?: unknown }

/** Builder encadenable y "awaitable", como el de supabase-js. */
function fakeClient(tables: Record<string, TableConfig>) {
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
        "single" in config ? config.single : { data: config.rows ?? null, error: config.error ?? null }
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: config.rows ?? [], error: config.error ?? null }).then(resolve)
      return builder
    },
  }
  return { supabase: client as unknown as SupabaseClient, calls }
}

function defaultClient() {
  return fakeClient({
    foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
    foodos_branches: {
      rows: [
        {
          id: "b1",
          name: "Centro",
          city: "Puebla",
          address: "Av. Juárez 123",
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
    foodos_reviews: { rows: [{ rating: 5 }] },
    foodos_seo_pages: {
      rows: [PAGE_ROW, { ...PAGE_ROW, id: "page-2", slug: "faq", status: "published" }],
      single: { data: PAGE_ROW, error: null },
      maybeSingle: { data: null, error: null },
    },
    foodos_menu_items: {
      rows: [{ id: DISH_ID, name: "Taco al pastor", description: "Con piña", tags: ["pastor"] }],
      maybeSingle: {
        data: { id: DISH_ID, name: "Taco al pastor", description: "Con piña", price: 18, tags: ["pastor"] },
        error: null,
      },
    },
  })
}

function upsertPayload(calls: Call[]): Record<string, unknown> {
  const call = calls.find((entry) => entry.method === "upsert")
  return (call?.args[0] ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  const { supabase } = defaultClient()
  mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
  mocks.createServiceClient.mockResolvedValue(supabase)
  mocks.generateAboutText.mockResolvedValue({
    text: "En Taquería Centro atendemos con la receta de la familia desde el primer día.",
    source: "llm",
    model: "test-model",
    tokensUsed: 10,
  })
  mocks.generateDishCopy.mockResolvedValue({
    text: "Taco al pastor con piña, cebolla y cilantro.",
    source: "llm",
    model: "test-model",
    tokensUsed: 10,
  })
  mocks.generateFaq.mockReturnValue({
    items: [{ q: "¿Hay envío?", a: "Sí." }],
    source: "template",
  })
})

describe("sitio IA: bloqueado sin nivel Diamante", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockRejectedValue(new Error("FOODOS_FEATURE_LOCKED"))
  })

  it("rechaza cada escritura antes de tocar la base", async () => {
    await expect(saveSeoProfileAction({ restaurant_id: RESTAURANT_ID })).rejects.toThrow()
    await expect(
      generateSeoPage({ restaurant_id: RESTAURANT_ID, kind: "about" })
    ).rejects.toThrow()
    await expect(
      publishSeoPage({ restaurant_id: RESTAURANT_ID, page_id: PAGE_ID })
    ).rejects.toThrow()
    await expect(
      unpublishSeoPage({ restaurant_id: RESTAURANT_ID, page_id: PAGE_ID })
    ).rejects.toThrow()
    await expect(
      deleteSeoPageRow({ restaurant_id: RESTAURANT_ID, page_id: PAGE_ID })
    ).rejects.toThrow()

    // Ni siquiera se resuelve la sesión: el gate corre primero.
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("sitio_ia")
    // Y nada se genera ni se revalida.
    expect(mocks.generateAboutText).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("las lecturas degradan en vez de romper la pantalla", async () => {
    await expect(getSitioData(RESTAURANT_ID)).resolves.toBeNull()
    await expect(getSeoKpis(RESTAURANT_ID)).resolves.toEqual({
      total: 0,
      published: 0,
      drafts: 0,
      progressRatio: 0,
      pendingSteps: 0,
    })
  })
})

describe("sitio IA: desbloqueado", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("arma los datos del panel con enlaces absolutos y el checklist completo", async () => {
    const data = await getSitioData(RESTAURANT_ID)
    expect(data?.profile.slug).toBe("taqueria-centro")
    expect(data?.dishes[0]).toEqual({
      id: DISH_ID,
      name: "Taco al pastor",
      description: "Con piña",
      tags: ["pastor"],
    })
    expect(data?.urls.site).toMatch(/\/r\/taqueria-centro$/)
    expect(data?.urls.menu).toMatch(/\/r\/taqueria-centro\/carta$/)
    expect(data?.urls.manifest).toMatch(/\/r\/taqueria-centro\/manifest\.webmanifest$/)
    expect(data?.checklist).toHaveLength(9)
    expect(data?.progress.total).toBe(9)
  })

  it("cuenta publicadas y borradores", async () => {
    const kpis = await getSeoKpis(RESTAURANT_ID)
    expect(kpis).toMatchObject({ total: 2, published: 1, drafts: 1 })
    expect(kpis.progressRatio).toBeGreaterThan(0)
  })

  it("la página generada nace en borrador y sin aprobar", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await generateSeoPage({ restaurant_id: RESTAURANT_ID, kind: "about" })
    expect(result.ok).toBe(true)
    expect(result.source).toBe("llm")

    const payload = upsertPayload(calls)
    expect(payload.status).toBe("draft")
    expect(payload.approved_at).toBeNull()
    expect(payload.kind).toBe("about")
    expect(payload.title).toBe("Sobre Taquería Centro")
  })

  it("la FAQ se arma sin modelo y se guarda como borrador", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await generateSeoPage({ restaurant_id: RESTAURANT_ID, kind: "faq" })
    expect(result.ok).toBe(true)
    expect(result.source).toBe("template")

    const payload = upsertPayload(calls)
    expect(payload.faq).toEqual([{ q: "¿Hay envío?", a: "Sí." }])
    expect(payload.status).toBe("draft")
    expect(payload.body).toBe("")
  })

  it("la página del platillo añade el precio real que el modelo no puede escribir", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await generateSeoPage({
      restaurant_id: RESTAURANT_ID,
      kind: "dish",
      menu_item_id: DISH_ID,
    })
    expect(result.ok).toBe(true)

    const payload = upsertPayload(calls)
    const body = String(payload.body)
    expect(body).toContain("Taco al pastor con piña, cebolla y cilantro.")
    expect(body).toContain("Precio:")
    expect(body).toContain("18")
    expect(payload.slug).toBe("taco-al-pastor")
    expect(payload.status).toBe("draft")
  })

  it("exige platillo y restaurante válidos al generar una ficha", async () => {
    await expect(
      generateSeoPage({ restaurant_id: RESTAURANT_ID, kind: "dish" })
    ).resolves.toEqual({ ok: false, error: "Elige un platillo del menú" })

    // El platillo pudo borrarse entre que el panel pintó la lista y el clic.
    const { supabase } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_menu_items: { maybeSingle: { data: null, error: null } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
    await expect(
      generateSeoPage({ restaurant_id: RESTAURANT_ID, kind: "dish", menu_item_id: "otro" })
    ).resolves.toEqual({ ok: false, error: "Ese platillo ya no está en el menú" })
  })

  it("no genera tipos de página que no sabe armar", async () => {
    await expect(
      generateSeoPage({ restaurant_id: RESTAURANT_ID, kind: "city" })
    ).resolves.toEqual({ ok: false, error: "Tipo de página no soportado" })
  })

  it("publicar revalida el panel, el caché del sitio, la ruta pública y el sitemap", async () => {
    await expect(
      publishSeoPage({ restaurant_id: RESTAURANT_ID, page_id: PAGE_ID })
    ).resolves.toEqual({ ok: true })

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/panel/foodos/sitio-ia")
    expect(mocks.revalidateTag).toHaveBeenCalledWith("foodos-seo", "max")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/r/[slug]/p/[pageSlug]", "page")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/sitemap.xml")
  })

  it("ocultar una página vuelve al mismo juego de revalidaciones", async () => {
    await expect(
      unpublishSeoPage({ restaurant_id: RESTAURANT_ID, page_id: PAGE_ID })
    ).resolves.toEqual({ ok: true })
    expect(mocks.revalidateTag).toHaveBeenCalledWith("foodos-seo", "max")
  })

  it("borrar una página funciona y revalida", async () => {
    await expect(
      deleteSeoPageRow({ restaurant_id: RESTAURANT_ID, page_id: PAGE_ID })
    ).resolves.toEqual({ ok: true })
    expect(mocks.revalidateTag).toHaveBeenCalledWith("foodos-seo", "max")
  })

  it("guardar el perfil revalida y propaga el error legible de validación", async () => {
    await expect(
      saveSeoProfileAction({
        restaurant_id: RESTAURANT_ID,
        tagline: "Tacos al pastor desde 1998",
        seo_keywords: ["Tacos", "tacos"],
      })
    ).resolves.toEqual({ ok: true })
    expect(mocks.revalidateTag).toHaveBeenCalledWith("foodos-seo", "max")

    await expect(
      saveSeoProfileAction({ restaurant_id: RESTAURANT_ID, tagline: "x".repeat(200) })
    ).resolves.toEqual({ ok: false, error: "La frase corta es demasiado larga" })
  })

  it("no deja escribir en un restaurante que no es del usuario", async () => {
    const { supabase } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: null, error: null } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      saveSeoProfileAction({ restaurant_id: RESTAURANT_ID, tagline: "Hola" })
    ).rejects.toThrow("Restaurante no encontrado")
  })
})
