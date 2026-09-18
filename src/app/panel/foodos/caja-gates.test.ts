import { beforeEach, describe, expect, it, vi } from "vitest"

// El gate de la caja vive en el servidor, igual que el del resto del panel:
// las ESCRITURAS lanzan, las LECTURAS degradan.
//
// El invariante de la fase que esta suite defiende es el del arqueo: **el
// esperado y la diferencia los calcula el servidor con las ventas y los
// movimientos guardados**. El navegador sólo manda el conteo físico del cajón.
// Si el esperado llegara del cliente, cualquiera podría cuadrar un faltante
// editando la petición.

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
  addShiftMovementAction,
  closeShiftAction,
  getCajaData,
  getShiftHistory,
  openShiftAction,
} from "./caja-actions"

const RESTAURANT_ID = "rest-1"
const SHIFT_ID = "shift-1"
const USER = { id: "user-1", email: "cajero@example.com" }

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

const RESTAURANT_ROW = { id: RESTAURANT_ID, user_id: USER.id }

const OPEN_SHIFT = {
  id: SHIFT_ID,
  restaurant_id: RESTAURANT_ID,
  branch_id: null,
  status: "open",
  opening_float: 500,
  opened_by: USER.id,
  opened_at: "2026-09-17T14:00:00.000Z",
  closed_by: null,
  closed_at: null,
  declared_cash: null,
  expected_cash: null,
  difference: null,
  notes: null,
  created_at: "2026-09-17T14:00:00.000Z",
}

type Call = { table: string; method: string; args: unknown[] }
type TableConfig = {
  rows?: unknown
  error?: unknown
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
        "is",
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
        "maybeSingle" in config
          ? config.maybeSingle
          : { data: config.rows ?? null, error: config.error ?? null }
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: config.rows ?? [], error: config.error ?? null }).then(resolve)
      return builder
    },
  }
  return { supabase: client as unknown as SupabaseClient, calls }
}

/** Caja cerrada: no hay turno abierto, ni movimientos, ni ventas, ni historial. */
function defaultClient() {
  return fakeClient({
    foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
    foodos_pos_shifts: { maybeSingle: { data: null, error: null }, rows: [] },
    foodos_pos_shift_movements: { rows: [] },
    foodos_orders: { rows: [] },
    profiles: { rows: [] },
  })
}

function writes(calls: Call[], table: string, method: string): unknown[] {
  return calls.filter((c) => c.table === table && c.method === method).map((c) => c.args[0])
}

function selects(calls: Call[], table: string): unknown[] {
  return calls.filter((c) => c.table === table && c.method === "select").map((c) => c.args[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  const { supabase } = defaultClient()
  mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))
})

describe("caja: bloqueada sin el nivel suficiente", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockRejectedValue(new Error("FOODOS_FEATURE_LOCKED"))
  })

  it("rechaza cada escritura antes de tocar la base", async () => {
    await expect(
      openShiftAction({ restaurant_id: RESTAURANT_ID, opening_float: 500 })
    ).rejects.toThrow()
    await expect(
      addShiftMovementAction({ shift_id: SHIFT_ID, type: "out", amount: 100 })
    ).rejects.toThrow()
    await expect(
      closeShiftAction({ shift_id: SHIFT_ID, counts: { "500": 1 } })
    ).rejects.toThrow()

    // Ni siquiera se resuelve la sesión: el gate corre primero.
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("pos_mostrador")
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("las lecturas degradan en vez de romper la pantalla", async () => {
    await expect(getCajaData(RESTAURANT_ID)).resolves.toBeNull()
    await expect(getShiftHistory(RESTAURANT_ID)).resolves.toBeNull()
  })
})

describe("caja: desbloqueada", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue(undefined)
  })

  it("sin turno abierto la pantalla dice que no hay turno, no que no hay ventas", async () => {
    const data = await getCajaData(RESTAURANT_ID)

    expect(data?.shift).toBeNull()
    expect(data?.expectedCash).toBe(0)
    expect(data?.movements).toEqual([])
    expect(data?.sales).toEqual({ count: 0, total: 0, cash: 0, byMethod: {} })
  })

  it("el esperado es fondo + ventas en efectivo + entradas − salidas", async () => {
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: { maybeSingle: { data: OPEN_SHIFT, error: null }, rows: [] },
      foodos_pos_shift_movements: {
        rows: [
          { id: "m-2", type: "in", amount: 200, reason: "Cambio", created_at: "2026-09-17T18:00:00.000Z" },
          { id: "m-1", type: "out", amount: 150, reason: "Proveedor", created_at: "2026-09-17T16:00:00.000Z" },
        ],
      },
      foodos_orders: {
        rows: [
          { id: "o-1", total: 300, payment_method: "cash", payment_status: "paid", payment_breakdown: null },
          { id: "o-2", total: 999, payment_method: "card", payment_status: "paid", payment_breakdown: null },
          { id: "o-3", total: 400, payment_method: "cash", payment_status: "pending", payment_breakdown: null },
        ],
      },
      profiles: { rows: [{ id: USER.id, full_name: "Ana Cajera" }] },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const data = await getCajaData(RESTAURANT_ID)

    // 500 + 300 + 200 − 150. El pendiente y el de tarjeta no entran al cajón.
    expect(data?.expectedCash).toBe(850)
    expect(data?.sales.cash).toBe(300)
    expect(data?.sales.count).toBe(3)
    // El total sólo suma lo cobrado: 300 + 999.
    expect(data?.sales.total).toBe(1299)
    expect(data?.sales.byMethod).toEqual({ cash: 300, card: 999 })
    expect(data?.shift?.openedByName).toBe("Ana Cajera")

    // El turno abierto se busca con `is null`, no con `eq null`: en SQL un
    // `= NULL` nunca encuentra nada y la caja creería estar siempre cerrada.
    const shiftCalls = calls.filter((c) => c.table === "foodos_pos_shifts")
    expect(shiftCalls.some((c) => c.method === "is" && c.args[0] === "branch_id")).toBe(true)
    expect(shiftCalls.some((c) => c.method === "eq" && c.args[0] === "branch_id")).toBe(false)
  })

  it("un pago combinado sólo suma al cajón su parte en efectivo", async () => {
    const { supabase } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: { maybeSingle: { data: OPEN_SHIFT, error: null }, rows: [] },
      foodos_pos_shift_movements: { rows: [] },
      foodos_orders: {
        rows: [
          {
            id: "o-1",
            total: 500,
            payment_method: "mixed",
            payment_status: "paid",
            payment_breakdown: {
              parts: [
                { method: "cash", amount: 200 },
                { method: "card", amount: 300 },
              ],
            },
          },
        ],
      },
      profiles: { rows: [] },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const data = await getCajaData(RESTAURANT_ID)

    expect(data?.sales.cash).toBe(200)
    expect(data?.expectedCash).toBe(700)
  })

  it("no abre un turno con fondo negativo", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      openShiftAction({ restaurant_id: RESTAURANT_ID, opening_float: -1 })
    ).resolves.toEqual({ ok: false, error: "El fondo inicial no puede ser negativo." })
    expect(writes(calls, "foodos_pos_shifts", "insert")).toHaveLength(0)
  })

  it("no abre un segundo turno en el mismo alcance", async () => {
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: { maybeSingle: { data: OPEN_SHIFT, error: null }, rows: [] },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      openShiftAction({ restaurant_id: RESTAURANT_ID, opening_float: 500 })
    ).resolves.toEqual({ ok: false, error: "Ya hay un turno abierto." })
    expect(writes(calls, "foodos_pos_shifts", "insert")).toHaveLength(0)
  })

  it("una carrera perdida contra el índice único se cuenta como turno ya abierto", async () => {
    // Dos dispositivos abren la caja a la vez: uno gana, el otro recibe 23505.
    // El cajero debe leer lo mismo en ambos, no un código de Postgres.
    const { supabase } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: {
        maybeSingle: { data: null, error: null },
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      openShiftAction({ restaurant_id: RESTAURANT_ID, opening_float: 500 })
    ).resolves.toEqual({ ok: false, error: "Ya hay un turno abierto." })
  })

  it("abre el turno a nombre del usuario y revalida la caja", async () => {
    const { supabase, calls } = defaultClient()
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      openShiftAction({ restaurant_id: RESTAURANT_ID, opening_float: 500.5 })
    ).resolves.toEqual({ ok: true })

    const payload = writes(calls, "foodos_pos_shifts", "insert")[0] as Record<string, unknown>
    expect(payload.opened_by).toBe(USER.id)
    expect(payload.restaurant_id).toBe(RESTAURANT_ID)
    expect(payload.opening_float).toBe(500.5)
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/panel/foodos/caja")
  })

  it("no deja mover efectivo de un turno ya cerrado", async () => {
    // Un movimiento sobre un corte firmado cambiaría un arqueo que el cajero
    // ya dio por bueno.
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: {
        maybeSingle: { data: { ...OPEN_SHIFT, status: "closed" }, error: null },
        rows: [],
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      addShiftMovementAction({ shift_id: SHIFT_ID, type: "out", amount: 100 })
    ).resolves.toEqual({ ok: false, error: "El turno ya está cerrado." })
    expect(writes(calls, "foodos_pos_shift_movements", "insert")).toHaveLength(0)
  })

  it("rechaza montos y tipos de movimiento inválidos", async () => {
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: { maybeSingle: { data: OPEN_SHIFT, error: null }, rows: [] },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      addShiftMovementAction({ shift_id: SHIFT_ID, type: "out", amount: 0 })
    ).resolves.toEqual({ ok: false, error: "El monto debe ser mayor a cero." })
    await expect(
      addShiftMovementAction({ shift_id: SHIFT_ID, type: "out", amount: -50 })
    ).resolves.toEqual({ ok: false, error: "El monto debe ser mayor a cero." })
    await expect(
      addShiftMovementAction({
        shift_id: SHIFT_ID,
        type: "transfer" as unknown as "in",
        amount: 50,
      })
    ).resolves.toEqual({ ok: false, error: "Tipo de movimiento no reconocido." })

    expect(writes(calls, "foodos_pos_shift_movements", "insert")).toHaveLength(0)
  })

  it("registra el movimiento con su motivo y a nombre del usuario", async () => {
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: { maybeSingle: { data: OPEN_SHIFT, error: null }, rows: [] },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      addShiftMovementAction({
        shift_id: SHIFT_ID,
        type: "out",
        amount: 150,
        reason: "  Proveedor de tortillas  ",
      })
    ).resolves.toEqual({ ok: true })

    const payload = writes(calls, "foodos_pos_shift_movements", "insert")[0] as Record<
      string,
      unknown
    >
    expect(payload.shift_id).toBe(SHIFT_ID)
    expect(payload.type).toBe("out")
    expect(payload.amount).toBe(150)
    expect(payload.reason).toBe("Proveedor de tortillas")
    expect(payload.user_id).toBe(USER.id)
  })

  it("el cierre recalcula esperado y diferencia; ignora lo que mande el navegador", async () => {
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: { maybeSingle: { data: OPEN_SHIFT, error: null }, rows: [] },
      foodos_pos_shift_movements: {
        rows: [
          { id: "m-1", type: "out", amount: 100, reason: "Proveedor", created_at: "2026-09-17T16:00:00.000Z" },
        ],
      },
      foodos_orders: {
        rows: [
          { id: "o-1", total: 1000, payment_method: "cash", payment_status: "paid", payment_breakdown: null },
        ],
      },
      profiles: { rows: [] },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    // Esperado real: 500 + 1000 − 100 = 1400. El conteo declara 1350.
    const result = await closeShiftAction({
      shift_id: SHIFT_ID,
      counts: { "1000": 1, "200": 1, "100": 1, "50": 1 },
      notes: "Faltaron $50 del cambio",
    })

    expect(result.ok).toBe(true)
    expect(result.difference).toBe(-50)

    const payload = writes(calls, "foodos_pos_shifts", "update")[0] as Record<string, unknown>
    expect(payload.expected_cash).toBe(1400)
    expect(payload.declared_cash).toBe(1350)
    expect(payload.difference).toBe(-50)
    expect(payload.status).toBe("closed")
    expect(payload.closed_by).toBe(USER.id)
    expect(payload.notes).toBe("Faltaron $50 del cambio")
    expect(typeof payload.closed_at).toBe("string")
  })

  it("un sobrante se registra como sobrante, no como cero", async () => {
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: { maybeSingle: { data: OPEN_SHIFT, error: null }, rows: [] },
      foodos_pos_shift_movements: { rows: [] },
      foodos_orders: { rows: [] },
      profiles: { rows: [] },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    // Fondo 500, sin ventas: un billete de 1000 declarado deja 500 de sobrante.
    const result = await closeShiftAction({ shift_id: SHIFT_ID, counts: { "1000": 1 } })

    expect(result.ok).toBe(true)
    expect(result.difference).toBe(500)

    const payload = writes(calls, "foodos_pos_shifts", "update")[0] as Record<string, unknown>
    expect(payload.expected_cash).toBe(500)
    expect(payload.declared_cash).toBe(1000)
    expect(payload.difference).toBe(500)
  })

  it("no cierra un turno ya cerrado", async () => {
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: {
        maybeSingle: { data: { ...OPEN_SHIFT, status: "closed" }, error: null },
        rows: [],
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      closeShiftAction({ shift_id: SHIFT_ID, counts: { "500": 1 } })
    ).resolves.toEqual({ ok: false, error: "El turno ya está cerrado." })
    expect(writes(calls, "foodos_pos_shifts", "update")).toHaveLength(0)
  })

  it("no toca la caja de un restaurante que no es del usuario", async () => {
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: null, error: null } },
      foodos_pos_shifts: { maybeSingle: { data: null, error: null }, rows: [] },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await expect(
      openShiftAction({ restaurant_id: RESTAURANT_ID, opening_float: 500 })
    ).rejects.toThrow("Restaurante no encontrado")
    expect(writes(calls, "foodos_pos_shifts", "insert")).toHaveLength(0)
  })

  it("el historial trae los cortes del alcance, con su arqueo", async () => {
    const closed = {
      ...OPEN_SHIFT,
      id: "shift-0",
      status: "closed",
      closed_by: "user-2",
      closed_at: "2026-09-16T23:00:00.000Z",
      declared_cash: 1450,
      expected_cash: 1500,
      difference: -50,
      notes: "Faltaron $50",
    }
    const { supabase } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: { maybeSingle: { data: null, error: null }, rows: [closed, OPEN_SHIFT] },
      foodos_pos_shift_movements: { rows: [] },
      foodos_orders: { rows: [] },
      profiles: {
        rows: [
          { id: USER.id, full_name: "Ana Cajera" },
          { id: "user-2", full_name: "Beto Turno Noche" },
        ],
      },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const history = await getShiftHistory(RESTAURANT_ID)

    expect(history).toHaveLength(2)
    expect(history?.[0]?.arqueo).toBe("short")
    expect(history?.[0]?.difference).toBe(-50)
    expect(history?.[0]?.status).toBe("closed")
    // Un turno abierto todavía no tiene arqueo que juzgar.
    expect(history?.[1]?.arqueo).toBeNull()
    // El orden lo pide la consulta, no la memoria del cliente.
    const data = await getCajaData(RESTAURANT_ID)
    expect(data?.history[0]?.closedByName).toBe("Beto Turno Noche")
  })

  it("los nombres del personal se piden en una sola consulta", async () => {
    const { supabase, calls } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: {
        maybeSingle: { data: OPEN_SHIFT, error: null },
        rows: [OPEN_SHIFT, { ...OPEN_SHIFT, id: "shift-2", closed_by: USER.id }],
      },
      foodos_pos_shift_movements: { rows: [] },
      foodos_orders: { rows: [] },
      profiles: { rows: [{ id: USER.id, full_name: "Ana Cajera" }] },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    await getCajaData(RESTAURANT_ID)

    const profileCalls = calls.filter((c) => c.table === "profiles" && c.method === "select")
    expect(profileCalls).toHaveLength(1)
    expect(selects(calls, "profiles")[0]).toContain("full_name")
  })

  it("un nombre ilegible no impide cerrar la caja", async () => {
    // RLS de `profiles` es dueño-only: el cajero puede no ver el nombre de un
    // compañero. Eso degrada el rótulo, no el corte.
    const { supabase } = fakeClient({
      foodos_restaurants: { maybeSingle: { data: RESTAURANT_ROW, error: null } },
      foodos_pos_shifts: { maybeSingle: { data: OPEN_SHIFT, error: null }, rows: [] },
      foodos_pos_shift_movements: { rows: [] },
      foodos_orders: { rows: [] },
      profiles: { error: { message: "permission denied for table profiles" } },
    })
    mocks.requireFoodosAuth.mockResolvedValue(operating(supabase))

    const data = await getCajaData(RESTAURANT_ID)

    expect(data?.shift?.openedByName).toBeNull()
    expect(data?.expectedCash).toBe(500)
  })
})
