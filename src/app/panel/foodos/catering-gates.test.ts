import { beforeEach, describe, expect, it, vi } from "vitest"

// El gate del catering vive en el servidor. Igual que el resto del panel: las
// ESCRITURAS lanzan, las LECTURAS degradan.
//
// Y los dos invariantes de la fase se comprueban aquí:
// - **El total lo decide el servidor**: `quoted_total` solo se escribe desde
//   `quoteCatering` o desde un ajuste autorizado.
// - **Una cotización no es una venta**: nada de esta superficie escribe en
//   `foodos_orders`.

const mocks = vi.hoisted(() => ({
  requireFoodosFeature: vi.fn(),
  requireAuth: vi.fn(),
  requireFoodosAuth: vi.fn(),
  getOperatingContext: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth, getCurrentUser: vi.fn() }))
vi.mock("@/lib/foodos-operating", () => ({
  requireFoodosAuth: mocks.requireFoodosAuth,
  getOperatingContext: mocks.getOperatingContext,
}))
vi.mock("@/lib/foodos-tier", () => ({ requireFoodosFeature: mocks.requireFoodosFeature }))
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  deleteCateringPackageAction,
  getCateringData,
  overrideCateringTotalAction,
  saveCateringPackageAction,
  setCateringRequestStatusAction,
} from "./actions"

const RESTAURANT_ID = "rest-1"
const PACKAGE_ID = "pkg-1"
const REQUEST_ID = "req-1"
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
}

const PACKAGE_ROW = {
  id: PACKAGE_ID,
  name: "Paquete fiesta",
  description: "Tres tiempos y postre",
  price_per_person: 250,
  min_people: 20,
  max_people: 80,
  lead_time_hours: 48,
  includes: ["Tres tiempos", "Postre"],
  is_active: true,
  sort_order: 0,
}

const REQUEST_ROW = {
  id: REQUEST_ID,
  package_id: PACKAGE_ID,
  customer_name: "Ana López",
  customer_phone: "2221234567",
  customer_email: "ana@example.com",
  event_date: "2026-06-20",
  headcount: 40,
  notes: "Cumpleaños",
  status: "quoted",
  quoted_total: 10000,
  quoted_at: "2026-05-01T00:00:00.000Z",
  deposit_amount: null,
  created_at: "2026-05-01T00:00:00.000Z",
}

type Call = { table: string; method: string; args: unknown[] }
type TableConfig = {
  rows?: unknown
  error?: unknown
  single?: unknown
  maybeSingle?: unknown
}

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
        "single" in config
          ? config.single
          : { data: config.rows ?? null, error: config.error ?? null }
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
    foodos_catering_packages: {
      rows: [PACKAGE_ROW],
      maybeSingle: { data: PACKAGE_ROW, error: null },
    },
    foodos_catering_requests: {
      rows: [REQUEST_ROW],
      maybeSingle: { data: REQUEST_ROW, error: null },
    },
  })
}

function writes(calls: Call[], table: string, method: string): unknown[] {
  return calls.filter((c) => c.table === table && c.method === method).map((c) => c.args[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  const { supabase } = defaultClient()
  mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
})

describe("catering: bloqueado sin nivel Diamante", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockRejectedValue(new Error("FOODOS_FEATURE_LOCKED"))
  })

  it("rechaza cada escritura antes de tocar la base", async () => {
    await expect(
      saveCateringPackageAction({
        restaurant_id: RESTAURANT_ID,
        name: "Paquete fiesta",
        price_per_person: 250,
        min_people: 20,
      })
    ).rejects.toThrow()
    await expect(
      deleteCateringPackageAction({ restaurant_id: RESTAURANT_ID, package_id: PACKAGE_ID })
    ).rejects.toThrow()
    await expect(
      setCateringRequestStatusAction({
        restaurant_id: RESTAURANT_ID,
        request_id: REQUEST_ID,
        status: "confirmed",
      })
    ).rejects.toThrow()
    await expect(
      overrideCateringTotalAction({
        restaurant_id: RESTAURANT_ID,
        request_id: REQUEST_ID,
        total: 12000,
      })
    ).rejects.toThrow()

    // Ni siquiera se resuelve la sesión: el gate corre primero.
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("catering")
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("las lecturas degradan en vez de romper la pantalla", async () => {
    await expect(getCateringData(RESTAURANT_ID)).resolves.toBeNull()
  })
})

describe("catering: desbloqueado", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("arma el panel con paquetes, solicitudes y KPIs", async () => {
    const data = await getCateringData(RESTAURANT_ID)

    expect(data?.packages).toHaveLength(1)
    expect(data?.packages[0]).toMatchObject({
      id: PACKAGE_ID,
      pricePerPerson: 250,
      minPeople: 20,
      maxPeople: 80,
    })
    expect(data?.requests).toHaveLength(1)
    expect(data?.requests[0]).toMatchObject({ id: REQUEST_ID, headcount: 40, status: "quoted" })
    expect(data?.kpis.total).toBe(1)
  })

  it("no deja guardar un paquete inválido y propaga el motivo legible", async () => {
    await expect(
      saveCateringPackageAction({
        restaurant_id: RESTAURANT_ID,
        name: "   ",
        price_per_person: 250,
        min_people: 20,
      })
    ).resolves.toEqual({ ok: false, error: "El paquete necesita un nombre" })

    await expect(
      saveCateringPackageAction({
        restaurant_id: RESTAURANT_ID,
        name: "Paquete fiesta",
        price_per_person: 250,
        min_people: 20,
        max_people: 10,
      })
    ).resolves.toEqual({ ok: false, error: "El máximo no puede ser menor que el mínimo" })
  })

  it("crear un paquete revalida el panel y la página pública", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await saveCateringPackageAction({
      restaurant_id: RESTAURANT_ID,
      name: "Paquete fiesta",
      price_per_person: 250,
      min_people: 20,
      max_people: 80,
      includes: ["Tres tiempos", "Postre"],
    })

    expect(result.ok).toBe(true)
    expect(result.id).toBe(PACKAGE_ID)

    const payload = writes(calls, "foodos_catering_packages", "insert")[0] as Record<string, unknown>
    expect(payload.restaurant_id).toBe(RESTAURANT_ID)
    expect(payload.price_per_person).toBe(250)
    expect(payload.includes).toEqual(["Tres tiempos", "Postre"])

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/panel/foodos/catering")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/r/[slug]/catering")
  })

  it("editar un paquete actualiza en vez de crear", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await saveCateringPackageAction({
      restaurant_id: RESTAURANT_ID,
      package_id: PACKAGE_ID,
      name: "Paquete fiesta",
      price_per_person: 280,
      min_people: 20,
      is_active: false,
    })

    expect(result).toEqual({ ok: true, id: PACKAGE_ID })
    expect(writes(calls, "foodos_catering_packages", "insert")).toHaveLength(0)

    const payload = writes(calls, "foodos_catering_packages", "update")[0] as Record<string, unknown>
    expect(payload.price_per_person).toBe(280)
    expect(payload.is_active).toBe(false)
  })

  it("borrar un paquete revalida", async () => {
    await expect(
      deleteCateringPackageAction({ restaurant_id: RESTAURANT_ID, package_id: PACKAGE_ID })
    ).resolves.toEqual({ ok: true })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/r/[slug]/catering")
  })

  it("confirmar una solicitud cotizada la mueve de estado", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      setCateringRequestStatusAction({
        restaurant_id: RESTAURANT_ID,
        request_id: REQUEST_ID,
        status: "confirmed",
      })
    ).resolves.toEqual({ ok: true })

    const payload = writes(calls, "foodos_catering_requests", "update")[0] as Record<string, unknown>
    expect(payload.status).toBe("confirmed")
    // Confirmar no recalcula: el total ya se congeló al cotizar.
    expect(payload.quoted_total).toBeUndefined()
  })

  it("rechaza estados y transiciones que no existen", async () => {
    await expect(
      setCateringRequestStatusAction({
        restaurant_id: RESTAURANT_ID,
        request_id: REQUEST_ID,
        status: "inventado",
      })
    ).resolves.toEqual({ ok: false, error: "Estado no reconocido" })

    // La solicitud pudo borrarse entre que el panel pintó la lista y el clic.
    const { supabase } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_catering_requests: { maybeSingle: { data: null, error: null } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
    await expect(
      setCateringRequestStatusAction({
        restaurant_id: RESTAURANT_ID,
        request_id: "otra",
        status: "confirmed",
      })
    ).resolves.toEqual({ ok: false, error: "Solicitud no encontrada" })
  })

  it("un evento confirmado no se declina: para eso está cancelar", async () => {
    const { supabase } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_catering_requests: {
        maybeSingle: { data: { ...REQUEST_ROW, status: "confirmed" }, error: null },
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const declined = await setCateringRequestStatusAction({
      restaurant_id: RESTAURANT_ID,
      request_id: REQUEST_ID,
      status: "declined",
    })
    expect(declined.ok).toBe(false)
    expect(declined.error).toBeTruthy()
  })

  it("el ajuste manual valida el total y el anticipo", async () => {
    await expect(
      overrideCateringTotalAction({
        restaurant_id: RESTAURANT_ID,
        request_id: REQUEST_ID,
        total: -1,
      })
    ).resolves.toEqual({ ok: false, error: "El total debe ser un número mayor o igual a cero" })

    await expect(
      overrideCateringTotalAction({
        restaurant_id: RESTAURANT_ID,
        request_id: REQUEST_ID,
        total: 1000,
        deposit: 2000,
      })
    ).resolves.toEqual({ ok: false, error: "El anticipo no puede superar el total" })
  })

  it("el ajuste manual redondea a centavos y revalida", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      overrideCateringTotalAction({
        restaurant_id: RESTAURANT_ID,
        request_id: REQUEST_ID,
        total: 12345.678,
        deposit: 3000,
      })
    ).resolves.toEqual({ ok: true })

    const payload = writes(calls, "foodos_catering_requests", "update")[0] as Record<string, unknown>
    expect(payload.quoted_total).toBe(12345.68)
    expect(payload.deposit_amount).toBe(3000)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/panel/foodos/catering")
  })

  it("una solicitud de catering nunca escribe un pedido", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await setCateringRequestStatusAction({
      restaurant_id: RESTAURANT_ID,
      request_id: REQUEST_ID,
      status: "confirmed",
    })
    await overrideCateringTotalAction({
      restaurant_id: RESTAURANT_ID,
      request_id: REQUEST_ID,
      total: 12000,
    })

    expect(writes(calls, "foodos_orders", "insert")).toHaveLength(0)
    expect(writes(calls, "foodos_orders", "update")).toHaveLength(0)
  })

  it("no deja tocar un restaurante que no es del usuario", async () => {
    const { supabase } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: null, error: null } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      saveCateringPackageAction({
        restaurant_id: RESTAURANT_ID,
        name: "Paquete fiesta",
        price_per_person: 250,
        min_people: 20,
      })
    ).rejects.toThrow("Restaurante no encontrado")
  })
})
