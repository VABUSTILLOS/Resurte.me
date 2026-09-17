import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  disconnectPosConnection,
  getPosConnection,
  getPosWebhookSecret,
  listPosSyncLog,
  loadPosConnections,
  loadPosContext,
  logPosSync,
  rotatePosWebhookSecret,
  setPosConnectionStatus,
  upsertPosConnection,
} from "./connections"
import { POS_PROVIDERS } from "./registry"

type Call = { table: string; method: string; args: unknown[] }
type TableConfig = {
  rows?: unknown
  error?: unknown
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
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: config.rows ?? [], error: config.error ?? null }).then(resolve)
      return builder
    },
  }
  return { supabase: client as unknown as SupabaseClient, calls }
}

function payloadFor(calls: Call[], method: string): Record<string, unknown> {
  const call = calls.find((entry) => entry.method === method)
  return (call?.args[0] ?? {}) as Record<string, unknown>
}

const connectedRow = {
  id: "c1",
  provider: "toast",
  status: "connected",
  credentials: { apiKey: "cid", apiSecret: "csecret", locationId: "guid" },
  external_location_id: "loc-9",
  webhook_secret: "s3cr3t-de-webhook",
  last_sync_at: "2026-02-01T10:00:00.000Z",
  last_error: null,
}

describe("loadPosConnections", () => {
  it("devuelve los seis proveedores aunque no haya conexiones", async () => {
    const { supabase } = fakeClient()
    const views = await loadPosConnections(supabase, "r1")
    expect(views.map((v) => v.descriptor.provider)).toEqual(POS_PROVIDERS)
    expect(views.every((v) => v.health === "pending")).toBe(true)
    expect(views.every((v) => v.status === "disconnected")).toBe(true)
  })

  it("mezcla las conexiones existentes con los proveedores que faltan", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: { rows: [connectedRow] },
    })
    const views = await loadPosConnections(supabase, "r1")
    expect(views).toHaveLength(6)
    const toast = views.find((v) => v.descriptor.provider === "toast")
    expect(toast?.status).toBe("connected")
    expect(toast?.externalLocationId).toBe("loc-9")
    expect(toast?.hasWebhookSecret).toBe(true)
    const clip = views.find((v) => v.descriptor.provider === "clip")
    expect(clip?.status).toBe("disconnected")
  })

  it("degrada a la lista vacía de conexiones si la lectura falla", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: { error: { message: "boom" } },
    })
    const views = await loadPosConnections(supabase, "r1")
    expect(views).toHaveLength(6)
    expect(views.every((v) => v.status === "disconnected")).toBe(true)
  })

  it("descarta filas con proveedor desconocido", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: { rows: [{ ...connectedRow, provider: "square" }] },
    })
    const views = await loadPosConnections(supabase, "r1")
    expect(views.every((v) => v.status === "disconnected")).toBe(true)
  })

  it("nunca expone las credenciales en claro", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: { rows: [connectedRow] },
    })
    const views = await loadPosConnections(supabase, "r1")
    const toast = views.find((v) => v.descriptor.provider === "toast")
    // 7 caracteres o menos se tapan completos: no se alcanza a revelar nada útil.
    expect(toast?.credentials.apiSecret).toBe("••••")
    // El id de sucursal no es secreto y se muestra para poder verificarlo.
    expect(toast?.credentials.locationId).toBe("guid")
    expect(JSON.stringify(views)).not.toContain("csecret")
  })

  it("deja ver los últimos cuatro caracteres de un secreto largo", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: {
        rows: [{ ...connectedRow, credentials: { apiSecret: "sk_live_abcdef1234" } }],
      },
    })
    const views = await loadPosConnections(supabase, "r1")
    const toast = views.find((v) => v.descriptor.provider === "toast")
    expect(toast?.credentials.apiSecret).toBe("••••1234")
    expect(JSON.stringify(views)).not.toContain("abcdef")
  })

  it("no ofrece webhook mientras el adaptador no exista", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: { rows: [connectedRow] },
    })
    const views = await loadPosConnections(supabase, "r1", { origin: "https://resurte.me" })
    expect(views.find((v) => v.descriptor.provider === "toast")?.webhookUrl).toBeNull()
  })
})

describe("getPosConnection", () => {
  it("devuelve null si no hay fila", async () => {
    const { supabase } = fakeClient()
    expect(await getPosConnection(supabase, "r1", "toast")).toBeNull()
  })

  it("normaliza la fila", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: { maybeSingle: { data: connectedRow, error: null } },
    })
    const row = await getPosConnection(supabase, "r1", "toast")
    expect(row?.status).toBe("connected")
    expect(row?.credentials.locationId).toBe("guid")
  })

  it("ignora credenciales que no son texto", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: {
        maybeSingle: {
          data: { ...connectedRow, credentials: { apiKey: 42, apiSecret: "  ", locationId: "l" } },
          error: null,
        },
      },
    })
    const row = await getPosConnection(supabase, "r1", "toast")
    expect(row?.credentials).toEqual({ locationId: "l" })
  })

  it("devuelve null si la lectura falla", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: { error: { message: "boom" } },
    })
    expect(await getPosConnection(supabase, "r1", "toast")).toBeNull()
  })
})

describe("getPosWebhookSecret", () => {
  it("devuelve el secreto de una conexión conectada", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: {
        maybeSingle: { data: { webhook_secret: "abc", status: "connected" }, error: null },
      },
    })
    expect(await getPosWebhookSecret(supabase, "toast", "r1")).toBe("abc")
  })

  it("no acepta webhooks de una conexión desconectada", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: {
        maybeSingle: { data: { webhook_secret: "abc", status: "disconnected" }, error: null },
      },
    })
    expect(await getPosWebhookSecret(supabase, "toast", "r1")).toBeNull()
  })

  it("devuelve null si no hay secreto", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: {
        maybeSingle: { data: { webhook_secret: null, status: "connected" }, error: null },
      },
    })
    expect(await getPosWebhookSecret(supabase, "toast", "r1")).toBeNull()
  })

  it("falla cerrado si la lectura falla", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: { error: { message: "boom" } },
    })
    expect(await getPosWebhookSecret(supabase, "toast", "r1")).toBeNull()
  })
})

describe("listPosSyncLog", () => {
  it("devuelve la bitácora normalizada", async () => {
    const { supabase } = fakeClient({
      foodos_pos_sync_log: {
        rows: [
          {
            id: "e1",
            provider: "toast",
            kind: "menu",
            status: "ok",
            items_count: 12,
            detail: null,
            created_at: "2026-02-01T10:00:00.000Z",
          },
        ],
      },
    })
    const log = await listPosSyncLog(supabase, "r1")
    expect(log).toHaveLength(1)
    expect(log[0]!.itemsCount).toBe(12)
  })

  it("descarta entradas con kind o status inválidos", async () => {
    const { supabase } = fakeClient({
      foodos_pos_sync_log: {
        rows: [
          { id: "a", provider: "toast", kind: "otro", status: "ok", items_count: 0, created_at: "x" },
          { id: "b", provider: "toast", kind: "menu", status: "quizá", items_count: 0, created_at: "x" },
          { id: "c", provider: "square", kind: "menu", status: "ok", items_count: 0, created_at: "x" },
          { id: "d", provider: "toast", kind: "menu", status: "ok", items_count: 3, created_at: "x" },
        ],
      },
    })
    const log = await listPosSyncLog(supabase, "r1")
    expect(log.map((e) => e.id)).toEqual(["d"])
  })

  it("no propaga un items_count negativo", async () => {
    const { supabase } = fakeClient({
      foodos_pos_sync_log: {
        rows: [
          { id: "a", provider: "toast", kind: "menu", status: "ok", items_count: -5, created_at: "x" },
        ],
      },
    })
    expect((await listPosSyncLog(supabase, "r1"))[0]!.itemsCount).toBe(0)
  })

  it("degrada a vacío si la lectura falla", async () => {
    const { supabase } = fakeClient({ foodos_pos_sync_log: { error: { message: "boom" } } })
    expect(await listPosSyncLog(supabase, "r1")).toEqual([])
  })
})

describe("loadPosContext", () => {
  it("arma conexiones, bitácora y KPIs en una pasada", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: { rows: [connectedRow] },
      foodos_pos_sync_log: {
        rows: [
          {
            id: "e1",
            provider: "toast",
            kind: "menu",
            status: "failed",
            items_count: 0,
            detail: "401",
            created_at: new Date().toISOString(),
          },
        ],
      },
    })
    const context = await loadPosContext(supabase, "r1")
    expect(context.views).toHaveLength(6)
    expect(context.log).toHaveLength(1)
    expect(context.kpis.total).toBe(6)
    expect(context.kpis.failedSyncs7d).toBe(1)
  })
})

describe("upsertPosConnection", () => {
  const empty = { foodos_pos_connections: { maybeSingle: { data: null, error: null } } }

  it("guarda credenciales completas y marca la conexión como conectada", async () => {
    const { supabase, calls } = fakeClient(empty)
    const result = await upsertPosConnection(supabase, "r1", "toast", {
      apiKey: "cid",
      apiSecret: "csecret",
      locationId: "guid",
    })
    expect(result.ok).toBe(true)
    const payload = payloadFor(calls, "upsert")
    expect(payload.status).toBe("connected")
    expect(payload.credentials).toEqual({ apiKey: "cid", apiSecret: "csecret", locationId: "guid" })
    expect(payload.restaurant_id).toBe("r1")
    expect(payload.provider).toBe("toast")
  })

  it("deja la conexión desconectada si faltan credenciales obligatorias", async () => {
    const { supabase, calls } = fakeClient(empty)
    const result = await upsertPosConnection(supabase, "r1", "toast", { apiKey: "cid" })
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(["apiSecret", "locationId"])
    expect(payloadFor(calls, "upsert").status).toBe("disconnected")
  })

  it("descarta claves que el descriptor no declara", async () => {
    const { supabase, calls } = fakeClient(empty)
    await upsertPosConnection(supabase, "r1", "clip", {
      apiKey: "k",
      apiSecret: "s",
      inyectado: "malo",
    })
    expect(payloadFor(calls, "upsert").credentials).toEqual({ apiKey: "k", apiSecret: "s" })
  })

  it("conserva el secreto guardado si el formulario no lo reescribe", async () => {
    const { supabase, calls } = fakeClient({
      foodos_pos_connections: {
        maybeSingle: {
          data: {
            ...connectedRow,
            credentials: { apiKey: "cid", apiSecret: "csecret", locationId: "guid" },
          },
          error: null,
        },
      },
    })
    await upsertPosConnection(supabase, "r1", "toast", { apiKey: "cid-nuevo" })
    const credentials = payloadFor(calls, "upsert").credentials as Record<string, string>
    expect(credentials.apiSecret).toBe("csecret")
    expect(credentials.apiKey).toBe("cid-nuevo")
    expect(credentials.locationId).toBe("guid")
  })

  it("no guarda una máscara como si fuera una credencial", async () => {
    const { supabase, calls } = fakeClient({
      foodos_pos_connections: {
        maybeSingle: {
          data: {
            ...connectedRow,
            credentials: { apiKey: "cid", apiSecret: "csecret", locationId: "guid" },
          },
          error: null,
        },
      },
    })
    await upsertPosConnection(supabase, "r1", "toast", {
      apiKey: "••••1234",
      apiSecret: "••••cret",
      locationId: "guid",
    })
    const credentials = payloadFor(calls, "upsert").credentials as Record<string, string>
    expect(credentials.apiKey).toBe("cid")
    expect(credentials.apiSecret).toBe("csecret")
  })

  it("conserva el id de sucursal previo si no se manda otro", async () => {
    const { supabase, calls } = fakeClient({
      foodos_pos_connections: { maybeSingle: { data: connectedRow, error: null } },
    })
    await upsertPosConnection(supabase, "r1", "toast", {})
    expect(payloadFor(calls, "upsert").external_location_id).toBe("loc-9")
  })

  it("guarda el id de sucursal nuevo cuando se manda", async () => {
    const { supabase, calls } = fakeClient(empty)
    await upsertPosConnection(
      supabase,
      "r1",
      "clip",
      { apiKey: "k", apiSecret: "s" },
      { externalLocationId: "sucursal-centro" }
    )
    expect(payloadFor(calls, "upsert").external_location_id).toBe("sucursal-centro")
  })

  it("limpia el error anterior al guardar", async () => {
    const { supabase, calls } = fakeClient(empty)
    await upsertPosConnection(supabase, "r1", "clip", { apiKey: "k", apiSecret: "s" })
    expect(payloadFor(calls, "upsert").last_error).toBeNull()
  })

  it("devuelve error legible si la escritura falla", async () => {
    const { supabase } = fakeClient({
      foodos_pos_connections: {
        maybeSingle: { data: null, error: null },
        error: { message: "boom" },
      },
    })
    const result = await upsertPosConnection(supabase, "r1", "toast", {
      apiKey: "a",
      apiSecret: "b",
      locationId: "c",
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("no debería pasar")
    expect(result.error).toContain("credenciales")
  })

  it("no lanza sin credenciales", async () => {
    const { supabase } = fakeClient(empty)
    const result = await upsertPosConnection(supabase, "r1", "toast", null)
    expect(result.ok).toBe(false)
  })
})

describe("setPosConnectionStatus", () => {
  it("guarda el estado y la marca de tiempo", async () => {
    const { supabase, calls } = fakeClient()
    const result = await setPosConnectionStatus(supabase, "r1", "toast", "error", "401 del proveedor")
    expect(result.ok).toBe(true)
    const payload = payloadFor(calls, "update")
    expect(payload.status).toBe("error")
    expect(payload.last_error).toBe("401 del proveedor")
    expect(typeof payload.last_sync_at).toBe("string")
  })

  it("limpia el error al volver a conectado", async () => {
    const { supabase, calls } = fakeClient()
    await setPosConnectionStatus(supabase, "r1", "toast", "connected")
    expect(payloadFor(calls, "update").last_error).toBeNull()
  })

  it("recorta un detalle larguísimo", async () => {
    const { supabase, calls } = fakeClient()
    await setPosConnectionStatus(supabase, "r1", "toast", "error", "x".repeat(900))
    expect((payloadFor(calls, "update").last_error as string).length).toBe(500)
  })

  it("devuelve error legible si falla", async () => {
    const { supabase } = fakeClient({ foodos_pos_connections: { error: { message: "boom" } } })
    const result = await setPosConnectionStatus(supabase, "r1", "toast", "connected")
    expect(result.ok).toBe(false)
  })
})

describe("disconnectPosConnection", () => {
  it("desconecta sin borrar la fila", async () => {
    const { supabase, calls } = fakeClient()
    const result = await disconnectPosConnection(supabase, "r1", "toast")
    expect(result.ok).toBe(true)
    expect(payloadFor(calls, "update")).toEqual({ status: "disconnected", last_error: null })
    expect(calls.some((c) => c.method === "delete")).toBe(false)
  })

  it("devuelve error legible si falla", async () => {
    const { supabase } = fakeClient({ foodos_pos_connections: { error: { message: "boom" } } })
    expect((await disconnectPosConnection(supabase, "r1", "toast")).ok).toBe(false)
  })
})

describe("rotatePosWebhookSecret", () => {
  it("genera un secreto para un proveedor con webhooks", async () => {
    const { supabase, calls } = fakeClient()
    const result = await rotatePosWebhookSecret(supabase, "r1", "toast")
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.secret).toHaveLength(48)
    expect(payloadFor(calls, "update").webhook_secret).toBe(result.secret)
  })

  it("genera un secreto distinto cada vez", async () => {
    const { supabase } = fakeClient()
    const first = await rotatePosWebhookSecret(supabase, "r1", "clip")
    const second = await rotatePosWebhookSecret(supabase, "r1", "clip")
    if (!first.ok || !second.ok) throw new Error("no debería pasar")
    expect(first.secret).not.toBe(second.secret)
  })

  it("rechaza proveedores que no emiten webhooks", async () => {
    const { supabase, calls } = fakeClient()
    const result = await rotatePosWebhookSecret(supabase, "r1", "soft_restaurant")
    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.method === "update")).toBe(false)
  })

  it("devuelve error legible si la escritura falla", async () => {
    const { supabase } = fakeClient({ foodos_pos_connections: { error: { message: "boom" } } })
    expect((await rotatePosWebhookSecret(supabase, "r1", "toast")).ok).toBe(false)
  })
})

describe("logPosSync", () => {
  it("inserta la entrada con los campos mínimos", async () => {
    const { supabase, calls } = fakeClient()
    await logPosSync(supabase, "r1", { provider: "toast", kind: "menu", status: "ok", itemsCount: 7 })
    const payload = payloadFor(calls, "insert")
    expect(payload.restaurant_id).toBe("r1")
    expect(payload.items_count).toBe(7)
    expect(payload.detail).toBeNull()
  })

  it("nunca guarda un items_count negativo", async () => {
    const { supabase, calls } = fakeClient()
    await logPosSync(supabase, "r1", { provider: "toast", kind: "menu", status: "ok", itemsCount: -3 })
    expect(payloadFor(calls, "insert").items_count).toBe(0)
  })

  it("recorta el detalle", async () => {
    const { supabase, calls } = fakeClient()
    await logPosSync(supabase, "r1", {
      provider: "toast",
      kind: "health",
      status: "failed",
      detail: "y".repeat(900),
    })
    expect((payloadFor(calls, "insert").detail as string).length).toBe(500)
  })

  it("no lanza si la bitácora falla", async () => {
    const { supabase } = fakeClient({ foodos_pos_sync_log: { error: { message: "boom" } } })
    await expect(
      logPosSync(supabase, "r1", { provider: "toast", kind: "menu", status: "ok" })
    ).resolves.toBeUndefined()
  })
})
