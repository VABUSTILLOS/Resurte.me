import { beforeEach, describe, expect, it, vi } from "vitest"

// Superficie de admin de restaurantes FoodOS.
//
// Lo que se comprueba aquí:
// - El gate de admin corre antes que cualquier lectura (no se filtra el
//   listado ni se escribe un override sin ser admin).
// - El nivel se calcula con las órdenes del DUEÑO del restaurante, no con las
//   del restaurante: un restaurante sin compras propias del dueño queda Verde.
// - Un override de admin gana mientras no expire; al expirar, manda el nivel
//   ganado. Conceder "Verde" revoca (borra), no baja el nivel a Verde.
// - El listado agrega uso real por restaurante (sesiones IA, entregas).

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { earnedTierFromOrders, featuresForTier } from "@/lib/foodos-entitlements"
import {
  getAdminFoodosAdoption,
  getAdminFoodosRestaurants,
  setFoodosTierOverride,
} from "./actions"

const ADMIN = { id: "admin-1", email: "admin@resurte.me" }
const OWNER_A = "owner-a"
const OWNER_B = "owner-b"

const RESTAURANT_A = {
  id: "rest-a",
  name: "Taquería Centro",
  slug: "taqueria-centro",
  status: "active",
  user_id: OWNER_A,
  created_at: "2026-01-10T10:00:00.000Z",
}

const RESTAURANT_B = {
  id: "rest-b",
  name: "Fonda Sur",
  slug: "fonda-sur",
  status: "draft",
  user_id: OWNER_B,
  created_at: "2026-01-09T10:00:00.000Z",
}

type Row = Record<string, unknown>

interface FakeOptions {
  restaurants?: Row[]
  orders?: Row[]
  overrides?: Row[]
  users?: { id: string; email: string | null }[]
  sessions?: Row[]
  messages?: Row[]
  deliveries?: Row[]
  campaigns?: Row[]
  walletPasses?: Row[]
  seoPages?: Row[]
  posLog?: Row[]
  cateringRequests?: Row[]
}

/** Compara con la semántica mínima que usan las consultas de la acción. */
function matches(row: Row, filters: { kind: string; column: string; value: unknown }[]): boolean {
  return filters.every((f) => {
    const cell = row[f.column]
    switch (f.kind) {
      case "eq":
        return cell === f.value
      case "neq":
        return cell !== f.value
      case "in":
        return Array.isArray(f.value) && f.value.includes(cell)
      case "gte":
        return typeof cell === "string" && cell >= String(f.value)
      case "notnull":
        return cell !== null && cell !== undefined
      default:
        return true
    }
  })
}

/**
 * Cliente falso: un builder encadenable por tabla que honra `select`, los
 * filtros y `order`/`limit`, y que además es "thenable" para el `await`
 * directo que hace la acción.
 */
function fakeClient(options: FakeOptions) {
  const tables: Record<string, Row[]> = {
    foodos_restaurants: options.restaurants ?? [],
    orders: options.orders ?? [],
    foodos_entitlement_overrides: options.overrides ?? [],
    foodos_ai_sessions: options.sessions ?? [],
    foodos_ai_messages: options.messages ?? [],
    foodos_deliveries: options.deliveries ?? [],
    foodos_campaigns: options.campaigns ?? [],
    foodos_wallet_passes: options.walletPasses ?? [],
    foodos_seo_pages: options.seoPages ?? [],
    foodos_pos_sync_log: options.posLog ?? [],
    foodos_catering_requests: options.cateringRequests ?? [],
  }

  const writes: { table: string; op: "upsert" | "delete"; payload?: unknown }[] = []

  function builder(table: string) {
    const filters: { kind: string; column: string; value: unknown }[] = []
    let limit: number | null = null
    let pendingWrite: { op: "upsert" | "delete"; payload?: unknown } | null = null

    const result = () => {
      const rows = (tables[table] ?? []).filter((r) => matches(r, filters))
      const limited = limit === null ? rows : rows.slice(0, limit)
      return { data: limited, error: null }
    }

    const api = {
      select: () => api,
      order: () => api,
      limit: (n: number) => {
        limit = n
        return api
      },
      eq: (column: string, value: unknown) => {
        filters.push({ kind: "eq", column, value })
        return api
      },
      neq: (column: string, value: unknown) => {
        filters.push({ kind: "neq", column, value })
        return api
      },
      gte: (column: string, value: unknown) => {
        filters.push({ kind: "gte", column, value })
        return api
      },
      in: (column: string, value: unknown) => {
        filters.push({ kind: "in", column, value })
        return api
      },
      not: (column: string, operator: string, value: unknown) => {
        filters.push({
          kind: operator === "is" && value === null ? "notnull" : "noop",
          column,
          value,
        })
        return api
      },
      upsert: (payload: unknown) => {
        pendingWrite = { op: "upsert", payload }
        writes.push({ table, op: "upsert", payload })
        return api
      },
      delete: () => {
        pendingWrite = { op: "delete" }
        writes.push({ table, op: "delete" })
        return api
      },
      maybeSingle: async () => {
        const rows = result().data
        return { data: rows[0] ?? null, error: null }
      },
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
        if (pendingWrite?.op === "delete") {
          tables[table] = (tables[table] ?? []).filter((r) => !matches(r, filters))
        }
        return Promise.resolve(result()).then(resolve)
      },
    }
    return api
  }

  return {
    from: (table: string) => builder(table),
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: options.users ?? [] }, error: null }),
      },
    },
    __writes: writes,
  }
}

function adminOk() {
  mocks.requireAdmin.mockResolvedValue({ user: ADMIN, response: null })
}

function adminDenied() {
  mocks.requireAdmin.mockResolvedValue({ user: null, response: { status: 403 } })
}

/** Orden pagada reciente (dentro de la semana ISO en curso). */
function recentPaidOrder(userId: string, total: number) {
  return {
    user_id: userId,
    total,
    payment_status: "paid",
    status: "delivered",
    created_at: new Date().toISOString(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getAdminFoodosRestaurants", () => {
  it("exige admin antes de leer nada", async () => {
    adminDenied()
    await expect(getAdminFoodosRestaurants()).rejects.toThrow(/administradores/i)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve lista vacía sin consultar el resto de tablas", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient({ restaurants: [] }))
    await expect(getAdminFoodosRestaurants()).resolves.toEqual([])
  })

  it("calcula el nivel con las órdenes del dueño, no con las del restaurante", async () => {
    adminOk()
    const orders = [recentPaidOrder(OWNER_A, 5000), recentPaidOrder(OWNER_A, 3000)]
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({ restaurants: [RESTAURANT_A, RESTAURANT_B], orders })
    )

    const rows = await getAdminFoodosRestaurants()
    const a = rows.find((r) => r.id === "rest-a")!
    const b = rows.find((r) => r.id === "rest-b")!

    // El gasto de la semana en curso refleja solo las órdenes del dueño A.
    expect(a.weekSpend).toBe(8000)
    expect(a.earnedTier).toBe(earnedTierFromOrders(orders.map((o) => ({ created_at: o.created_at, total: o.total }))).tier)

    // Sin compras del dueño B, el restaurante B no hereda el nivel de A.
    expect(b.weekSpend).toBe(0)
    expect(b.earnedTier).toBe("Verde")
    expect(b.features).toEqual([])
  })

  it("un override vigente gana sobre el nivel ganado y abre sus capacidades", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({
        restaurants: [RESTAURANT_B],
        overrides: [
          {
            restaurant_id: "rest-b",
            tier: "Diamante",
            reason: "Alianza piloto",
            expires_at: null,
          },
        ],
      })
    )

    const [row] = await getAdminFoodosRestaurants()
    expect(row!.tier).toBe("Diamante")
    expect(row!.earnedTier).toBe("Verde")
    expect(row!.overridden).toBe(true)
    expect(row!.overrideReason).toBe("Alianza piloto")
    expect(row!.features).toContain("mesero_ia")
    expect(row!.features).toContain("catering")
  })

  it("un override expirado no aplica", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({
        restaurants: [RESTAURANT_B],
        overrides: [
          {
            restaurant_id: "rest-b",
            tier: "Diamante",
            reason: "Cortesía vencida",
            expires_at: "2020-01-01T00:00:00.000Z",
          },
        ],
      })
    )

    const [row] = await getAdminFoodosRestaurants()
    expect(row!.tier).toBe("Verde")
    expect(row!.overridden).toBe(false)
    expect(row!.overrideReason).toBeNull()
    expect(row!.overrideExpiresAt).toBeNull()
  })

  it("agrega uso real por restaurante (sesiones IA, mensajes y entregas)", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({
        restaurants: [RESTAURANT_A, RESTAURANT_B],
        sessions: [{ restaurant_id: "rest-a" }, { restaurant_id: "rest-a" }],
        messages: [
          { restaurant_id: "rest-a" },
          { restaurant_id: "rest-a" },
          { restaurant_id: "rest-a" },
          { restaurant_id: "rest-b" },
        ],
        deliveries: [{ restaurant_id: "rest-a" }],
      })
    )

    const rows = await getAdminFoodosRestaurants()
    const a = rows.find((r) => r.id === "rest-a")!
    const b = rows.find((r) => r.id === "rest-b")!

    expect(a.aiSessions).toBe(2)
    expect(a.aiMessages).toBe(3)
    expect(a.deliveries).toBe(1)

    expect(b.aiSessions).toBe(0)
    expect(b.aiMessages).toBe(1)
    expect(b.deliveries).toBe(0)
  })

  it("resuelve el correo del dueño desde auth.users, no desde profiles", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({
        restaurants: [RESTAURANT_A, RESTAURANT_B],
        users: [
          { id: OWNER_A, email: "duena@taqueria.mx" },
          { id: OWNER_B, email: "dueno@fonda.mx" },
        ],
      })
    )

    const rows = await getAdminFoodosRestaurants()
    expect(rows.find((r) => r.id === "rest-a")!.ownerEmail).toBe("duena@taqueria.mx")
    expect(rows.find((r) => r.id === "rest-b")!.ownerEmail).toBe("dueno@fonda.mx")
  })

  it("no deja pasar un correo de un usuario ajeno a la lista", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({
        restaurants: [RESTAURANT_A],
        users: [{ id: "otro-usuario", email: "ajeno@example.com" }],
      })
    )

    const [row] = await getAdminFoodosRestaurants()
    expect(row!.ownerEmail).toBeNull()
  })
})

describe("setFoodosTierOverride", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(setFoodosTierOverride("rest-a", "Oro")).rejects.toThrow(/administradores/i)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un nivel desconocido", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient({}))
    await expect(setFoodosTierOverride("rest-a", "Platino")).rejects.toThrow(/Nivel inválido/i)
  })

  it("conceder un nivel hace upsert con autor, motivo y caducidad", async () => {
    adminOk()
    const client = fakeClient({})
    mocks.createServiceClient.mockResolvedValue(client)

    await setFoodosTierOverride("rest-a", "Oro", "  Alianza piloto  ", "2026-12-31T00:00:00.000Z")

    expect(client.__writes).toEqual([
      {
        table: "foodos_entitlement_overrides",
        op: "upsert",
        payload: {
          restaurant_id: "rest-a",
          tier: "Oro",
          reason: "Alianza piloto",
          granted_by: ADMIN.id,
          expires_at: "2026-12-31T00:00:00.000Z",
        },
      },
    ])
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/restaurantes")
  })

  it("conceder Verde revoca: borra el override en vez de bajarlo a Verde", async () => {
    adminOk()
    const client = fakeClient({
      overrides: [{ restaurant_id: "rest-a", tier: "Diamante", reason: null, expires_at: null }],
    })
    mocks.createServiceClient.mockResolvedValue(client)

    await setFoodosTierOverride("rest-a", "Verde")

    expect(client.__writes).toEqual([{ table: "foodos_entitlement_overrides", op: "delete" }])
  })

  it("normaliza motivo vacío y caducidad ausente a null", async () => {
    adminOk()
    const client = fakeClient({})
    mocks.createServiceClient.mockResolvedValue(client)

    await setFoodosTierOverride("rest-a", "Plata", "   ", "")

    const payload = client.__writes[0]!.payload as Record<string, unknown>
    expect(payload.reason).toBeNull()
    expect(payload.expires_at).toBeNull()
  })

  it("recorta un motivo desmedido a 500 caracteres", async () => {
    adminOk()
    const client = fakeClient({})
    mocks.createServiceClient.mockResolvedValue(client)

    await setFoodosTierOverride("rest-a", "Plata", "x".repeat(900))

    const payload = client.__writes[0]!.payload as Record<string, unknown>
    expect((payload.reason as string).length).toBe(500)
  })
})

// ------------------------------------------------------------
// KPIs de adopción por capacidad
// ------------------------------------------------------------

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

/** Override sin expiración: nivel determinista, sin depender de la semana ISO. */
function diamondOverride(restaurantId: string) {
  return { restaurant_id: restaurantId, tier: "Diamante", expires_at: null }
}

describe("getAdminFoodosAdoption", () => {
  it("exige admin antes de leer nada", async () => {
    adminDenied()
    await expect(getAdminFoodosAdoption()).rejects.toThrow(/administradores/i)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("sin restaurantes devuelve el resumen en cero y marca lo no medible", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient({ restaurants: [] }))

    const result = await getAdminFoodosAdoption()
    expect(result.features).toEqual([])
    expect(result.summary).toEqual({
      restaurants: 0,
      activeRestaurants: 0,
      dormantRestaurants: 0,
      averageUnlocked: 0,
    })
    expect(result.untracked).toEqual(["app_marca"])
  })

  it("nunca reporta app_marca como capacidad medida", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({ restaurants: [RESTAURANT_A], overrides: [diamondOverride("rest-a")] })
    )

    const result = await getAdminFoodosAdoption()
    expect(result.features.map((f) => f.feature)).not.toContain("app_marca")
    // Pero sí cuenta para las capacidades abiertas del resumen: el promedio es
    // de capacidades, no un porcentaje, y Diamante las abre todas. Se deriva
    // del catálogo en vez de fijar un número para que agregar una capacidad no
    // rompa la prueba por una razón que no tiene que ver con `app_marca`.
    expect(result.summary.averageUnlocked).toBe(featuresForTier("Diamante").length)
  })

  it("mide activación, actividad reciente y retención sobre quien tiene la capacidad abierta", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({
        restaurants: [RESTAURANT_A, RESTAURANT_B],
        // Solo A tiene Diamante; B queda Verde y no debe entrar en el denominador.
        overrides: [diamondOverride("rest-a")],
        sessions: [
          { restaurant_id: "rest-a", created_at: daysAgo(2) },
          { restaurant_id: "rest-a", created_at: daysAgo(10) },
          { restaurant_id: "rest-b", created_at: daysAgo(1) },
        ],
      })
    )

    const result = await getAdminFoodosAdoption()
    const mesero = result.features.find((f) => f.feature === "mesero_ia")!

    expect(mesero.unlocked).toBe(1)
    expect(mesero.activated).toBe(1)
    expect(mesero.activeRecent).toBe(1)
    expect(mesero.retained).toBe(1)
    expect(mesero.activationRate).toBe(100)
    expect(mesero.weeklyActiveRate).toBe(100)
    expect(mesero.retentionRate).toBe(100)
    // Un uso en cada ventana: ni sube ni baja.
    expect(mesero.usage).toEqual({ current: 1, previous: 1, deltaPct: 0, direction: "flat" })
  })

  it("separa el uso reciente del previo para detectar una caída real", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({
        restaurants: [RESTAURANT_A],
        overrides: [diamondOverride("rest-a")],
        deliveries: [
          { restaurant_id: "rest-a", created_at: daysAgo(10) },
          { restaurant_id: "rest-a", created_at: daysAgo(11) },
          { restaurant_id: "rest-a", created_at: daysAgo(12) },
        ],
      })
    )

    const result = await getAdminFoodosAdoption()
    const flotilla = result.features.find((f) => f.feature === "flotilla")!

    // Usó, pero no esta semana: activada sin actividad reciente, y en caída.
    expect(flotilla.activated).toBe(1)
    expect(flotilla.activeRecent).toBe(0)
    expect(flotilla.retentionRate).toBe(0)
    expect(flotilla.usage.current).toBe(0)
    expect(flotilla.usage.previous).toBe(3)
    expect(flotilla.usage.direction).toBe("down")
  })

  it("cuenta una capacidad no usada como activación cero, sin romper el resto", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({
        restaurants: [RESTAURANT_A],
        overrides: [diamondOverride("rest-a")],
        sessions: [{ restaurant_id: "rest-a", created_at: daysAgo(1) }],
      })
    )

    const result = await getAdminFoodosAdoption()
    const catering = result.features.find((f) => f.feature === "catering")!
    expect(catering.unlocked).toBe(1)
    expect(catering.activated).toBe(0)
    expect(catering.activationRate).toBe(0)

    // Y el resumen ve un restaurante activo (por el Mesero IA) y ninguno dormido.
    expect(result.summary.activeRestaurants).toBe(1)
    expect(result.summary.dormantRestaurants).toBe(0)
  })

  it("no cuenta un sitio en borrador: solo las páginas aprobadas son adopción", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({
        restaurants: [RESTAURANT_A],
        overrides: [diamondOverride("rest-a")],
        seoPages: [
          { restaurant_id: "rest-a", approved_at: null, created_at: daysAgo(1) },
          { restaurant_id: "rest-a", approved_at: daysAgo(1), created_at: daysAgo(2) },
        ],
      })
    )

    const result = await getAdminFoodosAdoption()
    const sitio = result.features.find((f) => f.feature === "sitio_ia")!
    expect(sitio.activated).toBe(1)
    expect(sitio.activeRecent).toBe(1)
    expect(sitio.usage.current).toBe(1)
  })

  it("en el punto de venta solo cuenta una sincronización exitosa", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient({
        restaurants: [RESTAURANT_A],
        overrides: [diamondOverride("rest-a")],
        posLog: [
          { restaurant_id: "rest-a", status: "failed", created_at: daysAgo(1) },
          { restaurant_id: "rest-a", status: "ok", created_at: daysAgo(1) },
          { restaurant_id: "rest-a", status: "ok", created_at: daysAgo(2) },
        ],
      })
    )

    const result = await getAdminFoodosAdoption()
    const pos = result.features.find((f) => f.feature === "pos_integraciones")!
    expect(pos.usage.current).toBe(2)
    expect(pos.activationRate).toBe(100)
  })

  it("una capacidad que falla al consultarse queda en cero sin tumbar el panel", async () => {
    adminOk()
    const client = fakeClient({
      restaurants: [RESTAURANT_A],
      overrides: [diamondOverride("rest-a")],
      campaigns: [{ restaurant_id: "rest-a", sent_at: daysAgo(1), status: "sent" }],
    })
    // La tabla de catering no existe todavía en este entorno: el builder falso
    // encadena igual pero resuelve un error.
    const original = client.from
    const failed = { data: null, error: { message: "caída" } }
    const brokenBuilder = {
      select: () => brokenBuilder,
      in: () => brokenBuilder,
      order: () => brokenBuilder,
      limit: () => brokenBuilder,
      eq: () => brokenBuilder,
      not: () => brokenBuilder,
      then: (resolve: (value: typeof failed) => unknown) => Promise.resolve(failed).then(resolve),
    }
    const broken = {
      ...client,
      from: (table: string) =>
        table === "foodos_catering_requests" ? brokenBuilder : original(table),
    }
    mocks.createServiceClient.mockResolvedValue(broken)

    const result = await getAdminFoodosAdoption()
    const catering = result.features.find((f) => f.feature === "catering")!
    const marketing = result.features.find((f) => f.feature === "marketing_ia")!

    expect(catering.activated).toBe(0)
    expect(marketing.usage.current).toBe(1)
  })
})
