import { beforeEach, describe, expect, it, vi } from "vitest"

// El gate del Punto de venta vive en el servidor. Igual que el resto del panel:
// las ESCRITURAS lanzan, las LECTURAS degradan.
//
// Y el invariante de la fase se comprueba aquí: **ningún adaptador está
// implementado, y el servidor lo dice**. Si algún día alguien implementa uno y
// olvida actualizar el panel, esta suite no lo detecta; lo que sí detecta es que
// hoy no se finja una sincronización.

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
  disconnectPosConnectionAction,
  getPosData,
  rotatePosWebhookSecretAction,
  runPosMenuSyncAction,
  savePosConnectionAction,
  testPosConnectionAction,
} from "./actions"

const RESTAURANT_ID = "rest-1"
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

const TOAST_CREDENTIALS = {
  apiKey: "ck_live_1234567890",
  apiSecret: "cs_live_0987654321",
  locationId: "guid-restaurante",
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

/** El restaurante es del usuario; no hay conexiones ni bitácora todavía. */
function defaultClient() {
  return fakeClient({
    foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
    foodos_pos_connections: { maybeSingle: { data: null, error: null } },
    foodos_pos_sync_log: { rows: [] },
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

describe("punto de venta: bloqueado sin nivel Diamante", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockRejectedValue(new Error("FOODOS_FEATURE_LOCKED"))
  })

  it("rechaza cada escritura antes de tocar la base", async () => {
    await expect(
      savePosConnectionAction({
        restaurant_id: RESTAURANT_ID,
        provider: "toast",
        credentials: TOAST_CREDENTIALS,
      })
    ).rejects.toThrow()
    await expect(
      testPosConnectionAction({ restaurant_id: RESTAURANT_ID, provider: "toast" })
    ).rejects.toThrow()
    await expect(
      runPosMenuSyncAction({ restaurant_id: RESTAURANT_ID, provider: "toast" })
    ).rejects.toThrow()
    await expect(
      disconnectPosConnectionAction({ restaurant_id: RESTAURANT_ID, provider: "toast" })
    ).rejects.toThrow()
    await expect(
      rotatePosWebhookSecretAction({ restaurant_id: RESTAURANT_ID, provider: "toast" })
    ).rejects.toThrow()

    // Ni siquiera se resuelve la sesión: el gate corre primero.
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("pos_integraciones")
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("las lecturas degradan en vez de romper la pantalla", async () => {
    await expect(getPosData(RESTAURANT_ID)).resolves.toBeNull()
  })
})

describe("punto de venta: desbloqueado", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("la lista de proveedores se arma siempre completa, aunque no haya ninguna conexión", async () => {
    const data = await getPosData(RESTAURANT_ID)

    expect(data?.connections).toHaveLength(6)
    expect(data?.connections.map((c) => c.descriptor.provider)).toEqual([
      "soft_restaurant",
      "parrot",
      "ncr_aloha",
      "toast",
      "clip",
      "mercado_pago",
    ])
    // Ninguno conectado y ninguno "listo": el adaptador no existe.
    expect(data?.connections.every((c) => c.status === "disconnected")).toBe(true)
    expect(data?.connections.every((c) => c.health === "pending")).toBe(true)
    expect(data?.kpis.total).toBe(6)
    expect(data?.kpis.ready).toBe(0)
    expect(data?.kpis.pending).toBe(6)
  })

  it("la URL del webhook no se ofrece sin adaptador ni secreto", async () => {
    const data = await getPosData(RESTAURANT_ID)
    const byProvider = new Map(data?.connections.map((c) => [c.descriptor.provider, c]))

    // Toast tiene capacidad de webhook, pero sin adaptador y sin secreto no se
    // le ofrece una URL que no podría verificar.
    expect(byProvider.get("toast")?.webhookUrl).toBeNull()
    // Soft Restaurant no tiene capacidad de webhook: nunca aparece la URL.
    expect(byProvider.get("soft_restaurant")?.webhookUrl).toBeNull()
  })

  it("no acepta proveedores que no están en el registro", async () => {
    await expect(
      savePosConnectionAction({
        restaurant_id: RESTAURANT_ID,
        provider: "square",
        credentials: {},
      })
    ).resolves.toEqual({ ok: false, error: "Proveedor no reconocido" })

    await expect(
      testPosConnectionAction({ restaurant_id: RESTAURANT_ID, provider: "square" })
    ).resolves.toEqual({ ok: false, status: "pending", message: "Proveedor no reconocido" })

    const sync = await runPosMenuSyncAction({ restaurant_id: RESTAURANT_ID, provider: "square" })
    expect(sync.ok).toBe(false)
    expect(sync.error).toBe("Proveedor no reconocido")
    expect(sync.created + sync.updated).toBe(0)
  })

  it("una conexión incompleta nunca queda 'connected'", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await savePosConnectionAction({
      restaurant_id: RESTAURANT_ID,
      provider: "toast",
      credentials: { apiKey: "ck_live_1234567890" },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe("Faltan credenciales obligatorias")
    expect(result.missing).toEqual(["apiSecret", "locationId"])

    const payload = writes(calls, "foodos_pos_connections", "upsert")[0] as Record<string, unknown>
    expect(payload.status).toBe("disconnected")
    expect(payload.provider).toBe("toast")
    expect(payload.restaurant_id).toBe(RESTAURANT_ID)
  })

  it("con todas las credenciales guarda la conexión y revalida el panel", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      savePosConnectionAction({
        restaurant_id: RESTAURANT_ID,
        provider: "toast",
        credentials: TOAST_CREDENTIALS,
      })
    ).resolves.toEqual({ ok: true })

    const payload = writes(calls, "foodos_pos_connections", "upsert")[0] as Record<string, unknown>
    expect(payload.status).toBe("connected")
    expect(payload.credentials).toEqual(TOAST_CREDENTIALS)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/panel/foodos/pos")
  })

  it("con credenciales completas sigue diciendo 'pendiente', no 'conectado'", async () => {
    // El caso que importa: el dueño ya capturó todo y le da a "Probar". El
    // adaptador no existe, así que el servidor no puede decir "listo".
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_connections: {
        maybeSingle: {
          data: {
            provider: "toast",
            status: "connected",
            credentials: TOAST_CREDENTIALS,
            external_location_id: null,
            webhook_secret: null,
            last_sync_at: null,
            last_error: null,
          },
          error: null,
        },
      },
      foodos_pos_sync_log: { rows: [] },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await testPosConnectionAction({
      restaurant_id: RESTAURANT_ID,
      provider: "toast",
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe("pending")
    expect(result.message).toContain("Falta el adaptador")

    const entry = writes(calls, "foodos_pos_sync_log", "insert")[0] as Record<string, unknown>
    expect(entry.kind).toBe("health")
    // `skipped`, no `failed`: es una carencia conocida, no un error del dueño.
    expect(entry.status).toBe("skipped")
    expect(entry.provider).toBe("toast")
  })

  it("sin credenciales dice que faltan, no que el adaptador no existe", async () => {
    const result = await testPosConnectionAction({
      restaurant_id: RESTAURANT_ID,
      provider: "soft_restaurant",
    })

    // Lo accionable para el dueño es lo primero: aún no ha capturado nada.
    expect(result.ok).toBe(false)
    expect(result.status).toBe("needs_credentials")
    expect(result.message).toContain("Falta el adaptador")
  })

  it("sincronizar el menú no finge: reporta lo que falta y no toca los platillos", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const result = await runPosMenuSyncAction({
      restaurant_id: RESTAURANT_ID,
      provider: "toast",
    })

    expect(result.ok).toBe(false)
    expect(result.skipped).toBe(true)
    expect(result.error).toContain("Falta el adaptador")
    expect(result.created).toBe(0)
    expect(result.updated).toBe(0)
    expect(result.onlyLocally).toBe(0)

    // Ni una escritura al menú del restaurante.
    expect(writes(calls, "foodos_menu_items", "insert")).toHaveLength(0)
    expect(writes(calls, "foodos_menu_items", "update")).toHaveLength(0)

    const entry = writes(calls, "foodos_pos_sync_log", "insert")[0] as Record<string, unknown>
    expect(entry.kind).toBe("menu")
    expect(entry.status).toBe("skipped")
  })

  it("rota el secreto del webhook solo en proveedores que lo emiten", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const rotated = await rotatePosWebhookSecretAction({
      restaurant_id: RESTAURANT_ID,
      provider: "toast",
    })
    expect(rotated.ok).toBe(true)
    expect(rotated.secret).toMatch(/^[0-9a-f]{48}$/)

    const payload = writes(calls, "foodos_pos_connections", "update")[0] as Record<string, unknown>
    expect(payload.webhook_secret).toBe(rotated.secret)

    // Soft Restaurant no tiene capacidad de webhook: guardar un secreto que
    // nadie va a usar solo confundiría al dueño.
    await expect(
      rotatePosWebhookSecretAction({ restaurant_id: RESTAURANT_ID, provider: "soft_restaurant" })
    ).resolves.toEqual({ ok: false, error: "Este proveedor no envía webhooks" })
  })

  it("desconectar conserva la fila y revalida", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      disconnectPosConnectionAction({ restaurant_id: RESTAURANT_ID, provider: "toast" })
    ).resolves.toEqual({ ok: true })

    const payload = writes(calls, "foodos_pos_connections", "update")[0] as Record<string, unknown>
    expect(payload.status).toBe("disconnected")
    // No se borra: reconectar no debe obligar a volver a pedir las claves.
    expect(writes(calls, "foodos_pos_connections", "delete")).toHaveLength(0)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/panel/foodos/pos")
  })

  it("no deja tocar un restaurante que no es del usuario", async () => {
    const { supabase } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: null, error: null } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      savePosConnectionAction({
        restaurant_id: RESTAURANT_ID,
        provider: "toast",
        credentials: TOAST_CREDENTIALS,
      })
    ).rejects.toThrow("Restaurante no encontrado")
  })
})
