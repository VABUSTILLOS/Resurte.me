import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  createCateringRequest,
  deleteCateringPackage,
  getCateringPackage,
  listCateringPackages,
  listCateringRequests,
  loadCateringContext,
  overrideCateringTotal,
  saveCateringPackage,
  setCateringRequestStatus,
} from "./foodos-catering-data"

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
      for (const method of ["select", "insert", "update", "delete", "eq", "order", "limit"]) {
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

const packageRow = {
  id: "p1",
  name: "Paquete Fiesta",
  description: "Para celebraciones",
  price_per_person: 250,
  min_people: 20,
  max_people: 200,
  lead_time_hours: 48,
  includes: ["Mesa dulce", "Café"],
  is_active: true,
  sort_order: 1,
}

const requestRow = {
  id: "q1",
  package_id: "p1",
  customer_name: "Ana Ruiz",
  customer_phone: "5512345678",
  customer_email: "ana@ejemplo.mx",
  event_date: "2026-04-15T18:00:00.000Z",
  headcount: 40,
  notes: null,
  status: "quoted",
  quoted_total: 10000,
  quoted_at: "2026-03-01T12:00:00.000Z",
  deposit_amount: null,
  created_at: "2026-03-01T12:00:00.000Z",
}

const now = new Date("2026-03-01T12:00:00.000Z")

describe("listCateringPackages", () => {
  it("normaliza las filas", async () => {
    const { supabase } = fakeClient({ foodos_catering_packages: { rows: [packageRow] } })
    const packages = await listCateringPackages(supabase, "r1")
    expect(packages).toHaveLength(1)
    expect(packages[0]).toMatchObject({
      id: "p1",
      name: "Paquete Fiesta",
      pricePerPerson: 250,
      minPeople: 20,
      maxPeople: 200,
      leadTimeHours: 48,
      includes: ["Mesa dulce", "Café"],
      isActive: true,
    })
  })

  it("descarta filas sin id o sin nombre", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: {
        rows: [{ ...packageRow, id: null }, { ...packageRow, name: "  " }, packageRow],
      },
    })
    expect(await listCateringPackages(supabase, "r1")).toHaveLength(1)
  })

  it("trata un máximo vacío como sin tope", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { rows: [{ ...packageRow, max_people: null }] },
    })
    const [pkg] = await listCateringPackages(supabase, "r1")
    expect(pkg!.maxPeople).toBeNull()
  })

  it("normaliza un precio en texto", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { rows: [{ ...packageRow, price_per_person: "189.5" }] },
    })
    const [pkg] = await listCateringPackages(supabase, "r1")
    expect(pkg!.pricePerPerson).toBe(189.5)
  })

  it("ignora includes que no sea un arreglo de cadenas", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { rows: [{ ...packageRow, includes: "Mesa dulce" }] },
    })
    const [pkg] = await listCateringPackages(supabase, "r1")
    expect(pkg!.includes).toEqual([])
  })

  it("filtra por activos cuando se pide la cara pública", async () => {
    const { supabase, calls } = fakeClient({ foodos_catering_packages: { rows: [] } })
    await listCateringPackages(supabase, "r1", { onlyActive: true })
    const eqCalls = calls.filter((c) => c.method === "eq").map((c) => c.args[0])
    expect(eqCalls).toContain("is_active")
  })

  it("degrada a vacío si la lectura falla", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { error: { message: "boom" } },
    })
    expect(await listCateringPackages(supabase, "r1")).toEqual([])
  })

  it("degrada a vacío si la respuesta no es un arreglo", async () => {
    const { supabase } = fakeClient({ foodos_catering_packages: { rows: { nope: true } } })
    expect(await listCateringPackages(supabase, "r1")).toEqual([])
  })

  it("degrada a vacío si el cliente lanza", async () => {
    const supabase = {
      from() {
        throw new Error("sin red")
      },
    } as unknown as SupabaseClient
    expect(await listCateringPackages(supabase, "r1")).toEqual([])
  })
})

describe("listCateringRequests", () => {
  it("normaliza las filas", async () => {
    const { supabase } = fakeClient({ foodos_catering_requests: { rows: [requestRow] } })
    const requests = await listCateringRequests(supabase, "r1")
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      id: "q1",
      packageId: "p1",
      headcount: 40,
      status: "quoted",
      total: 10000,
    })
  })

  it("cae a requested ante un estado desconocido", async () => {
    const { supabase } = fakeClient({
      foodos_catering_requests: { rows: [{ ...requestRow, status: "pagado" }] },
    })
    const [request] = await listCateringRequests(supabase, "r1")
    expect(request!.status).toBe("requested")
  })

  it("descarta filas sin datos mínimos", async () => {
    const { supabase } = fakeClient({
      foodos_catering_requests: {
        rows: [{ ...requestRow, customer_phone: null }, { ...requestRow, event_date: "" }, requestRow],
      },
    })
    expect(await listCateringRequests(supabase, "r1")).toHaveLength(1)
  })

  it("degrada a vacío si la lectura falla", async () => {
    const { supabase } = fakeClient({ foodos_catering_requests: { error: { message: "boom" } } })
    expect(await listCateringRequests(supabase, "r1")).toEqual([])
  })
})

describe("loadCateringContext", () => {
  it("junta paquetes, solicitudes y KPIs", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { rows: [packageRow] },
      foodos_catering_requests: {
        rows: [
          requestRow,
          { ...requestRow, id: "q2", status: "confirmed", quoted_total: 5000, headcount: 20 },
        ],
      },
    })
    const context = await loadCateringContext(supabase, "r1", now)
    expect(context.packages).toHaveLength(1)
    expect(context.requests).toHaveLength(2)
    expect(context.kpis.confirmed).toBe(1)
    expect(context.kpis.confirmedRevenue).toBe(5000)
  })

  it("devuelve un contexto vacío si todo falla", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { error: { message: "x" } },
      foodos_catering_requests: { error: { message: "x" } },
    })
    const context = await loadCateringContext(supabase, "r1", now)
    expect(context.packages).toEqual([])
    expect(context.requests).toEqual([])
    expect(context.kpis.total).toBe(0)
  })
})

describe("getCateringPackage", () => {
  it("devuelve el paquete cuando existe", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { maybeSingle: { data: packageRow, error: null } },
    })
    const pkg = await getCateringPackage(supabase, "r1", "p1")
    expect(pkg?.name).toBe("Paquete Fiesta")
  })

  it("devuelve null cuando no existe", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { maybeSingle: { data: null, error: null } },
    })
    expect(await getCateringPackage(supabase, "r1", "p1")).toBeNull()
  })

  it("devuelve null ante error", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { maybeSingle: { data: packageRow, error: { message: "boom" } } },
    })
    expect(await getCateringPackage(supabase, "r1", "p1")).toBeNull()
  })

  it("devuelve null si el cliente lanza", async () => {
    const supabase = {
      from() {
        throw new Error("sin red")
      },
    } as unknown as SupabaseClient
    expect(await getCateringPackage(supabase, "r1", "p1")).toBeNull()
  })
})

describe("saveCateringPackage", () => {
  const input = { name: "Paquete Fiesta", pricePerPerson: 250, minPeople: 20 }

  it("rechaza un paquete sin nombre y no escribe", async () => {
    const { supabase, calls } = fakeClient()
    const result = await saveCateringPackage(supabase, "r1", null, { ...input, name: "" })
    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.method === "insert")).toBe(false)
  })

  it("inserta un paquete nuevo con los campos mapeados", async () => {
    const { supabase, calls } = fakeClient({
      foodos_catering_packages: { maybeSingle: { data: { id: "p9" }, error: null } },
    })
    const result = await saveCateringPackage(supabase, "r1", null, {
      ...input,
      includes: ["Mesa dulce"],
    })
    expect(result).toMatchObject({ ok: true, id: "p9" })
    const payload = payloadFor(calls, "insert")
    expect(payload.restaurant_id).toBe("r1")
    expect(payload.price_per_person).toBe(250)
    expect(payload.min_people).toBe(20)
    expect(payload.includes).toEqual(["Mesa dulce"])
    expect(payload.is_active).toBe(true)
  })

  it("actualiza un paquete existente", async () => {
    const { supabase, calls } = fakeClient()
    const result = await saveCateringPackage(supabase, "r1", "p1", input)
    expect(result).toMatchObject({ ok: true, id: "p1" })
    expect(calls.some((c) => c.method === "update")).toBe(true)
    expect(calls.some((c) => c.method === "insert")).toBe(false)
  })

  it("informa el error de escritura", async () => {
    const { supabase } = fakeClient({ foodos_catering_packages: { error: { message: "boom" } } })
    const result = await saveCateringPackage(supabase, "r1", "p1", input)
    expect(result).toEqual({ ok: false, error: "No se pudo guardar el paquete" })
  })

  it("informa el error de creación", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { maybeSingle: { data: null, error: { message: "boom" } } },
    })
    const result = await saveCateringPackage(supabase, "r1", null, input)
    expect(result).toEqual({ ok: false, error: "No se pudo crear el paquete" })
  })

  it("tolera una entrada nula sin lanzar", async () => {
    const { supabase } = fakeClient()
    const result = await saveCateringPackage(supabase, "r1", null, null)
    expect(result.ok).toBe(false)
  })
})

describe("deleteCateringPackage", () => {
  it("borra acotando al restaurante", async () => {
    const { supabase, calls } = fakeClient()
    expect(await deleteCateringPackage(supabase, "r1", "p1")).toEqual({ ok: true })
    const eqArgs = calls.filter((c) => c.method === "eq").map((c) => c.args[0])
    expect(eqArgs).toContain("restaurant_id")
    expect(eqArgs).toContain("id")
  })

  it("informa el error", async () => {
    const { supabase } = fakeClient({ foodos_catering_packages: { error: { message: "boom" } } })
    expect(await deleteCateringPackage(supabase, "r1", "p1")).toEqual({
      ok: false,
      error: "No se pudo borrar el paquete",
    })
  })
})

describe("createCateringRequest", () => {
  const valid = {
    customerName: "Ana Ruiz",
    customerPhone: "5512345678",
    customerEmail: "ana@ejemplo.mx",
    eventDate: "2026-04-15T18:00:00.000Z",
    headcount: 40,
    notes: "Sin gluten",
  }

  function withPackage(overrides: Partial<typeof packageRow> = {}) {
    return fakeClient({
      foodos_catering_packages: {
        maybeSingle: { data: { ...packageRow, ...overrides }, error: null },
      },
      foodos_catering_requests: { maybeSingle: { data: { id: "q9" }, error: null } },
    })
  }

  it("cotiza en el servidor y guarda el total", async () => {
    const { supabase, calls } = withPackage()
    const result = await createCateringRequest(supabase, "r1", "p1", valid, now)
    expect(result).toMatchObject({ ok: true, id: "q9", total: 10000 })
    const payload = payloadFor(calls, "insert")
    expect(payload.quoted_total).toBe(10000)
    expect(payload.status).toBe("quoted")
    expect(payload.restaurant_id).toBe("r1")
    expect(payload.headcount).toBe(40)
  })

  it("cobra el mínimo cuando piden menos personas que el mínimo", async () => {
    const { supabase, calls } = withPackage({ min_people: 20 })
    const result = await createCateringRequest(supabase, "r1", "p1", { ...valid, headcount: 25 }, now)
    expect(result).toMatchObject({ ok: true, total: 6250 })
    expect(payloadFor(calls, "insert").headcount).toBe(25)
  })

  it("ignora cualquier total que venga del navegador", async () => {
    const { supabase, calls } = withPackage()
    await createCateringRequest(
      supabase,
      "r1",
      "p1",
      { ...valid, quoted_total: 1 } as never,
      now
    )
    expect(payloadFor(calls, "insert").quoted_total).toBe(10000)
  })

  it("rechaza un paquete inexistente", async () => {
    const { supabase, calls } = fakeClient({
      foodos_catering_packages: { maybeSingle: { data: null, error: null } },
    })
    const result = await createCateringRequest(supabase, "r1", "p1", valid, now)
    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.method === "insert")).toBe(false)
  })

  it("rechaza un paquete pausado", async () => {
    const { supabase } = withPackage({ is_active: false })
    const result = await createCateringRequest(supabase, "r1", "p1", valid, now)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("no debería pasar")
    expect(result.error).toContain("ya no está disponible")
  })

  it("devuelve todos los motivos cuando la validación falla", async () => {
    const { supabase, calls } = withPackage()
    const result = await createCateringRequest(
      supabase,
      "r1",
      "p1",
      { ...valid, customerName: "", customerPhone: "1", headcount: 2 },
      now
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("no debería pasar")
    expect(result.errors?.length).toBeGreaterThanOrEqual(3)
    expect(calls.some((c) => c.method === "insert")).toBe(false)
  })

  it("rechaza un headcount por encima del máximo del paquete", async () => {
    const { supabase } = withPackage({ max_people: 50 })
    const result = await createCateringRequest(supabase, "r1", "p1", { ...valid, headcount: 80 }, now)
    expect(result.ok).toBe(false)
  })

  it("informa el error de escritura", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { maybeSingle: { data: packageRow, error: null } },
      foodos_catering_requests: { maybeSingle: { data: null, error: { message: "boom" } } },
    })
    expect(await createCateringRequest(supabase, "r1", "p1", valid, now)).toEqual({
      ok: false,
      error: "No se pudo enviar la solicitud",
    })
  })

  it("funciona sin id de retorno", async () => {
    const { supabase } = fakeClient({
      foodos_catering_packages: { maybeSingle: { data: packageRow, error: null } },
      foodos_catering_requests: { maybeSingle: { data: {}, error: null } },
    })
    const result = await createCateringRequest(supabase, "r1", "p1", valid, now)
    expect(result.ok).toBe(true)
    expect(result.total).toBe(10000)
  })
})

describe("setCateringRequestStatus", () => {
  // `Partial<typeof requestRow>` no acepta `null` explícito en las columnas
  // anulables, y la mitad de los casos prueban precisamente eso.
  function withRequest(
    overrides: Partial<Record<keyof typeof requestRow, unknown>> = {},
    pkg = packageRow
  ) {
    return fakeClient({
      foodos_catering_requests: {
        maybeSingle: { data: { ...requestRow, ...overrides }, error: null },
      },
      foodos_catering_packages: { maybeSingle: { data: pkg, error: null } },
    })
  }

  it("rechaza un estado no reconocido", async () => {
    const { supabase } = withRequest()
    expect(await setCateringRequestStatus(supabase, "r1", "q1", "pagado")).toEqual({
      ok: false,
      error: "Estado no reconocido",
    })
  })

  it("rechaza una solicitud inexistente", async () => {
    const { supabase } = fakeClient({
      foodos_catering_requests: { maybeSingle: { data: null, error: null } },
    })
    expect(await setCateringRequestStatus(supabase, "r1", "q1", "confirmed")).toEqual({
      ok: false,
      error: "Solicitud no encontrada",
    })
  })

  it("confirma una solicitud cotizada", async () => {
    const { supabase, calls } = withRequest()
    expect(await setCateringRequestStatus(supabase, "r1", "q1", "confirmed")).toEqual({ ok: true })
    expect(payloadFor(calls, "update").status).toBe("confirmed")
  })

  it("no declina un evento ya confirmado", async () => {
    const { supabase, calls } = withRequest({ status: "confirmed" })
    const result = await setCateringRequestStatus(supabase, "r1", "q1", "declined")
    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.method === "update")).toBe(false)
  })

  it("no reabre un evento terminado", async () => {
    const { supabase, calls } = withRequest({ status: "completed" })
    expect((await setCateringRequestStatus(supabase, "r1", "q1", "confirmed")).ok).toBe(false)
    expect(calls.some((c) => c.method === "update")).toBe(false)
  })

  it("no retrocede de confirmado a cotizado", async () => {
    const { supabase, calls } = withRequest({ status: "confirmed" })
    expect((await setCateringRequestStatus(supabase, "r1", "q1", "quoted")).ok).toBe(false)
    expect(calls.some((c) => c.method === "update")).toBe(false)
  })

  it("recalcula el total al volver a cotizar", async () => {
    const { supabase, calls } = withRequest(
      { status: "requested", quoted_total: null, quoted_at: null },
      { ...packageRow, price_per_person: 300 }
    )
    const result = await setCateringRequestStatus(supabase, "r1", "q1", "quoted")
    expect(result.ok).toBe(true)
    const payload = payloadFor(calls, "update")
    expect(payload.quoted_total).toBe(12000)
    expect(typeof payload.quoted_at).toBe("string")
  })

  it("no cotiza una solicitud sin paquete", async () => {
    const { supabase } = withRequest({ status: "requested", package_id: null })
    const result = await setCateringRequestStatus(supabase, "r1", "q1", "quoted")
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("no debería pasar")
    expect(result.error).toContain("no tiene paquete")
  })

  it("no cotiza si el paquete desapareció", async () => {
    const { supabase } = fakeClient({
      foodos_catering_requests: {
        maybeSingle: { data: { ...requestRow, status: "requested" }, error: null },
      },
      foodos_catering_packages: { maybeSingle: { data: null, error: null } },
    })
    const result = await setCateringRequestStatus(supabase, "r1", "q1", "quoted")
    expect(result.ok).toBe(false)
  })

  it("informa el error de escritura", async () => {
    const { supabase } = fakeClient({
      foodos_catering_requests: { error: { message: "boom" } },
    })
    // El select inicial degrada a null → "Solicitud no encontrada" es correcto.
    expect((await setCateringRequestStatus(supabase, "r1", "q1", "confirmed")).ok).toBe(false)
  })

  it("cancela un evento confirmado", async () => {
    const { supabase, calls } = withRequest({ status: "confirmed" })
    expect(await setCateringRequestStatus(supabase, "r1", "q1", "cancelled")).toEqual({ ok: true })
    expect(payloadFor(calls, "update").status).toBe("cancelled")
  })
})

describe("overrideCateringTotal", () => {
  it("ajusta el total y el anticipo", async () => {
    const { supabase, calls } = fakeClient()
    const result = await overrideCateringTotal(supabase, "r1", "q1", 12500.555, 3000)
    expect(result.ok).toBe(true)
    const payload = payloadFor(calls, "update")
    expect(payload.quoted_total).toBe(12500.56)
    expect(payload.deposit_amount).toBe(3000)
    expect(typeof payload.quoted_at).toBe("string")
  })

  it("rechaza un total inválido o negativo", async () => {
    const { supabase, calls } = fakeClient()
    expect((await overrideCateringTotal(supabase, "r1", "q1", -1)).ok).toBe(false)
    expect((await overrideCateringTotal(supabase, "r1", "q1", "abc")).ok).toBe(false)
    expect(calls.some((c) => c.method === "update")).toBe(false)
  })

  it("rechaza un anticipo mayor que el total", async () => {
    const { supabase, calls } = fakeClient()
    const result = await overrideCateringTotal(supabase, "r1", "q1", 1000, 2000)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("no debería pasar")
    expect(result.error).toContain("anticipo")
    expect(calls.some((c) => c.method === "update")).toBe(false)
  })

  it("acepta total cero", async () => {
    const { supabase } = fakeClient()
    expect((await overrideCateringTotal(supabase, "r1", "q1", 0)).ok).toBe(true)
  })

  it("deja el anticipo en null si no se manda", async () => {
    const { supabase, calls } = fakeClient()
    await overrideCateringTotal(supabase, "r1", "q1", 5000)
    expect(payloadFor(calls, "update").deposit_amount).toBeNull()
  })

  it("trata el anticipo vacío como ausente", async () => {
    const { supabase, calls } = fakeClient()
    await overrideCateringTotal(supabase, "r1", "q1", 5000, "")
    expect(payloadFor(calls, "update").deposit_amount).toBeNull()
  })

  it("informa el error de escritura", async () => {
    const { supabase } = fakeClient({ foodos_catering_requests: { error: { message: "boom" } } })
    expect((await overrideCateringTotal(supabase, "r1", "q1", 5000)).ok).toBe(false)
  })
})
