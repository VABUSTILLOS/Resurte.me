import { beforeEach, describe, expect, it, vi } from "vitest"

// Escritura del panel en el CRM (Ronda 16, F5).
//
// El panel no reimplementa el CRM: delega en `src/lib/comercializacion/actions/`,
// que es el mismo módulo que usa la ficha del vendedor. Lo que sí es exclusivo
// del panel es la bitácora, y lo que se comprueba aquí son las tres propiedades
// que una delegación puede romper en silencio:
//
//  1. **No hay entrada de bitácora sin escritura.** Si el módulo compartido
//     rechaza el cambio, el panel no registra nada: una bitácora que anota lo
//     que no ocurrió es peor que no tenerla.
//  2. **El borrado deja rastro de lo borrado.** El `DELETE` no se puede
//     reconstruir después, así que la actividad se lee **antes** de borrar y su
//     trato, tipo y resumen viajan en el detalle.
//  3. **El panel no escribe antes de comprobar quién es.** La comprobación de
//     admin precede a cualquier cliente de servicio.
//
// Y una cuarta que es propia de `updateCrmProspect`: el tipo admite cualquier
// campo, pero `status` y `seller_id` se descartan en ejecución, porque tienen
// sus propias puertas.

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
  logAdminAction: vi.fn(),
  createProspect: vi.fn(),
  updateProspect: vi.fn(),
  bulkCreateProspects: vi.fn(),
  updateActivity: vi.fn(),
  deleteActivity: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock("@/lib/comercializacion/actions/prospectos", () => ({
  createProspect: mocks.createProspect,
  updateProspect: mocks.updateProspect,
  bulkCreateProspects: mocks.bulkCreateProspects,
}))
vi.mock("@/lib/comercializacion/actions/actividades", () => ({
  updateActivity: mocks.updateActivity,
  deleteActivity: mocks.deleteActivity,
}))

import {
  createCrmProspect,
  deleteCrmActivity,
  getAdminCities,
  importCrmProspects,
  updateCrmActivity,
  updateCrmProspect,
} from "./actions"

const ADMIN = { id: "admin-1", email: "admin@resurte.me" }

type Row = Record<string, unknown>
/** Lo que el cliente falso vio, en orden: el orden es parte de la propiedad. */
type Trace = string[]

/**
 * Cliente falso del camino de lectura previa al borrado y del catálogo de
 * ciudades. Registra en `trace` cuándo se leyó, para poder afirmar que se leyó
 * **antes** de borrar.
 */
function fakeClient(trace: Trace, rows: Row[] = []) {
  const api = {
    select: () => api,
    eq: () => api,
    order: async () => {
      trace.push("read")
      return { data: rows, error: null }
    },
    maybeSingle: async () => {
      trace.push("read")
      return { data: rows[0] ?? null, error: null }
    },
  }
  return { from: () => api }
}

function adminOk() {
  mocks.requireAdmin.mockResolvedValue({ user: ADMIN, response: null })
}

function adminDenied() {
  mocks.requireAdmin.mockResolvedValue({ user: null, response: { status: 403 } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createProspect.mockResolvedValue({ id: 9, name: "Ana", seller_id: null })
  mocks.updateProspect.mockResolvedValue({ id: 9, name: "Ana", seller_id: null })
  mocks.bulkCreateProspects.mockResolvedValue({ created: 2, errors: [] })
  mocks.updateActivity.mockResolvedValue(undefined)
  mocks.deleteActivity.mockResolvedValue(undefined)
  mocks.createServiceClient.mockResolvedValue(fakeClient([]) as never)
})

describe("createCrmProspect", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(createCrmProspect({ name: "Ana" })).rejects.toThrow(
      "Acceso restringido a administradores"
    )
    expect(mocks.createProspect).not.toHaveBeenCalled()
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("delega, registra el nombre y el pozo, y revalida", async () => {
    adminOk()
    const created = await createCrmProspect({ name: "Ana" })

    expect(created).toEqual({ id: 9, name: "Ana", seller_id: null })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "crm_prospect_create",
        entity: "crm_prospects",
        entityId: 9,
        detail: { name: "Ana", seller_id: null },
      })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/leads")
  })

  it("no registra nada si el alta falla", async () => {
    adminOk()
    mocks.createProspect.mockRejectedValue(new Error("El nombre del contacto es obligatorio"))
    await expect(createCrmProspect({ name: "  " })).rejects.toThrow("obligatorio")
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })
})

describe("updateCrmProspect", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(updateCrmProspect(9, { notes: "hola" })).rejects.toThrow(
      "Acceso restringido a administradores"
    )
    expect(mocks.updateProspect).not.toHaveBeenCalled()
  })

  it("descarta status y seller_id aunque el tipo los admita", async () => {
    adminOk()
    await updateCrmProspect(9, {
      notes: "hola",
      status: "perdido",
      seller_id: "otro-vendedor",
    } as never)

    expect(mocks.updateProspect).toHaveBeenCalledWith(9, { notes: "hola" })
  })

  it("la bitácora guarda los nombres de campo, no los valores", async () => {
    adminOk()
    await updateCrmProspect(9, { phone: "5512345678", email: "ana@tacos.mx" })

    const detail = (
      mocks.logAdminAction.mock.calls[0]?.[1] as { detail: { fields: string } }
    ).detail
    expect(detail.fields).toBe("email,phone")
    // El teléfono y el correo no viajan a una segunda tabla.
    expect(JSON.stringify(detail)).not.toContain("5512345678")
    expect(JSON.stringify(detail)).not.toContain("ana@tacos.mx")
  })
})

describe("importCrmProspects", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(importCrmProspects([{ name: "Ana" }])).rejects.toThrow(
      "Acceso restringido a administradores"
    )
    expect(mocks.bulkCreateProspects).not.toHaveBeenCalled()
  })

  it("no deja bitácora si no entró ninguna fila", async () => {
    adminOk()
    mocks.bulkCreateProspects.mockResolvedValue({
      created: 0,
      errors: [{ row: 1, message: "El correo no tiene un formato válido" }],
    })

    const result = await importCrmProspects([{ name: "Ana", email: "malo" }])

    expect(result.created).toBe(0)
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it("registra cuántas entraron y cuántas se rechazaron", async () => {
    adminOk()
    mocks.bulkCreateProspects.mockResolvedValue({
      created: 2,
      errors: [{ row: 3, message: "Ciudad inexistente" }],
    })

    await importCrmProspects([{ name: "Ana" }, { name: "Luis" }, { name: "Sara" }])

    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "crm_prospect_import",
        detail: { created: 2, rejected: 1 },
      })
    )
  })
})

describe("updateCrmActivity", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(updateCrmActivity(3, { summary: "hola" })).rejects.toThrow(
      "Acceso restringido a administradores"
    )
    expect(mocks.updateActivity).not.toHaveBeenCalled()
  })

  it("delega y registra los campos tocados", async () => {
    adminOk()
    await updateCrmActivity(3, { summary: "  Reagendó  ", outcome: "reagendar" })

    expect(mocks.updateActivity).toHaveBeenCalledWith(3, {
      summary: "  Reagendó  ",
      outcome: "reagendar",
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "crm_activity_update",
        entity: "crm_activities",
        entityId: 3,
        detail: { fields: "outcome,summary" },
      })
    )
  })
})

describe("deleteCrmActivity", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(deleteCrmActivity(3)).rejects.toThrow("Acceso restringido a administradores")
    expect(mocks.deleteActivity).not.toHaveBeenCalled()
  })

  it("lee la actividad antes de borrarla", async () => {
    adminOk()
    const trace: Trace = []
    mocks.createServiceClient.mockResolvedValue(
      fakeClient(trace, [{ prospect_id: 9, type: "llamada", summary: "Pidió precio" }]) as never
    )
    mocks.deleteActivity.mockImplementation(async () => {
      trace.push("delete")
    })

    await deleteCrmActivity(3)

    // Invertir estas dos rompe la prueba: después del `DELETE` ya no hay de
    // dónde sacar a qué trato pertenecía la actividad.
    expect(trace).toEqual(["read", "delete"])
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "crm_activity_delete",
        entity: "crm_activities",
        entityId: 3,
        detail: { prospect_id: 9, type: "llamada", summary: "Pidió precio" },
      })
    )
  })
})

describe("getAdminCities", () => {
  it("exige admin y devuelve el catálogo activo", async () => {
    adminDenied()
    await expect(getAdminCities()).rejects.toThrow("Acceso restringido a administradores")

    adminOk()
    mocks.createServiceClient.mockResolvedValue(
      fakeClient([], [{ id: 1, name: "Guadalajara", state: "Jalisco" }]) as never
    )
    const cities = await getAdminCities()
    expect(cities).toEqual([{ id: 1, name: "Guadalajara", state: "Jalisco" }])
  })
})
