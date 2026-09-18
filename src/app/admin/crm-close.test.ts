import { beforeEach, describe, expect, it, vi } from "vitest"

// Cierre del trato del CRM (Ronda 16, F3).
//
// Lo que se comprueba aquí, y por qué no basta con el contrato estático de
// `crm-core.contract.test.ts`:
//
//  1. **El parche de estado viaja en el mismo `UPDATE` que el estado.** Los dos
//     `CHECK` de coherencia de `00184` rechazan un `loss_reason` sobre un trato
//     abierto y un `closed_at` sobre uno no cerrado. Si `updateCrmProspectStatus`
//     escribiera solo `{ status }`, reabrir un trato perdido haría fallar el
//     `UPDATE` entero y el admin vería un error de constraint en la cara. La
//     prueba no mira el código: mira el payload que llega al cliente.
//  2. **Perder sin motivo no escribe nada.** El `CHECK` lo rechazaría igual,
//     pero la propiedad que importa es que la fila no se toca a medias.
//  3. **El cierre deja rastro en la bitácora** con el desenlace, que es lo único
//     que permite reconstruir después por qué se perdió un trato.

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
  logAdminAction: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { closeCrmProspect, updateCrmProspectStatus } from "./actions"

const ADMIN = { id: "admin-1", email: "admin@resurte.me" }

type Row = Record<string, unknown>

interface Write {
  table: string
  payload: Row
}

/**
 * Cliente falso que solo entiende el camino de escritura del prospecto
 * (`update(...).eq("id", …)`), que es lo único que estas acciones usan. Registra
 * el payload tal cual llega, sin normalizarlo: la prueba tiene que ver lo que
 * vería Postgres.
 */
function fakeClient() {
  const writes: Write[] = []

  function builder(table: string) {
    let pending: Row | null = null
    const api = {
      update: (payload: Row) => {
        pending = payload
        return api
      },
      eq: () => api,
      is: () => api,
      select: () => api,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
        if (pending) writes.push({ table, payload: pending })
        return Promise.resolve({ data: [], error: null }).then(resolve)
      },
    }
    return api
  }

  return { from: (table: string) => builder(table), __writes: writes }
}

function adminOk() {
  mocks.requireAdmin.mockResolvedValue({ user: ADMIN, response: null })
}

function adminDenied() {
  mocks.requireAdmin.mockResolvedValue({ user: null, response: { status: 403 } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("updateCrmProspectStatus", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(updateCrmProspectStatus(7, "nuevo")).rejects.toThrow(/administradores/i)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un estado fuera del vocabulario cerrado", async () => {
    adminOk()
    const client = fakeClient()
    mocks.createServiceClient.mockResolvedValue(client)
    await expect(updateCrmProspectStatus(7, "ganado")).rejects.toThrow(/Estado CRM inválido/i)
    expect(client.__writes).toEqual([])
  })

  it("reabrir un trato perdido limpia motivo y fecha en el MISMO update", async () => {
    adminOk()
    const client = fakeClient()
    mocks.createServiceClient.mockResolvedValue(client)

    await updateCrmProspectStatus(7, "en_seguimiento")

    // Un solo `UPDATE`: si el parche fuera una segunda sentencia, la primera ya
    // violaría `crm_prospects_loss_reason_requires_lost_check`.
    expect(client.__writes).toHaveLength(1)
    const write = client.__writes[0]!
    expect(write.table).toBe("crm_prospects")
    expect(write.payload.status).toBe("en_seguimiento")
    expect(write.payload.loss_reason).toBeNull()
    expect(write.payload.closed_at).toBeNull()
  })

  it("ganar limpia el motivo pero conserva la fecha de cierre", async () => {
    adminOk()
    const client = fakeClient()
    mocks.createServiceClient.mockResolvedValue(client)

    await updateCrmProspectStatus(7, "cliente_activo")

    const payload = client.__writes[0]!.payload
    expect(payload.status).toBe("cliente_activo")
    expect(payload.loss_reason).toBeNull()
    // `cliente_activo` está cerrado: `closed_at` sigue siendo cierto y por eso
    // no se toca (la clave no aparece en el payload).
    expect("closed_at" in payload).toBe(false)
  })

  it("el desplegable no escribe la causa de la pérdida", async () => {
    adminOk()
    const client = fakeClient()
    mocks.createServiceClient.mockResolvedValue(client)

    await updateCrmProspectStatus(7, "perdido")

    // `crmStatusPatch("perdido")` es `{}`: mover a perdido desde el desplegable
    // no inventa un motivo. Ese es trabajo de `closeCrmProspect`.
    const payload = client.__writes[0]!.payload
    expect(payload).toEqual({ status: "perdido", last_contact_at: expect.any(String), updated_at: expect.any(String) })
  })

  it("deja rastro en la bitácora", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient())

    await updateCrmProspectStatus(7, "contactado")

    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "crm_prospect_status", entity: "crm_prospects", entityId: 7 })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/leads")
  })
})

describe("closeCrmProspect", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(closeCrmProspect(7, "ganado")).rejects.toThrow(/administradores/i)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un desenlace que no es ganado ni perdido", async () => {
    adminOk()
    const client = fakeClient()
    mocks.createServiceClient.mockResolvedValue(client)
    await expect(
      // El tipo lo impide en TS; el guard existe para la frontera de la acción.
      closeCrmProspect(7, "quizá" as unknown as "ganado")
    ).rejects.toThrow(/Desenlace de cierre inválido/i)
    expect(client.__writes).toEqual([])
  })

  it("perder sin motivo no escribe nada", async () => {
    adminOk()
    const client = fakeClient()
    mocks.createServiceClient.mockResolvedValue(client)

    await expect(closeCrmProspect(7, "perdido")).rejects.toThrow(/motivo de pérdida/i)
    // La propiedad que importa: la fila no se toca a medias.
    expect(client.__writes).toEqual([])
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it("rechaza un motivo fuera del vocabulario cerrado", async () => {
    adminOk()
    const client = fakeClient()
    mocks.createServiceClient.mockResolvedValue(client)

    await expect(
      closeCrmProspect(7, "perdido", "porque_si" as unknown as "otro")
    ).rejects.toThrow(/motivo de pérdida/i)
    expect(client.__writes).toEqual([])
  })

  it("ganar escribe estado, fecha y motivo nulo en un solo update", async () => {
    adminOk()
    const client = fakeClient()
    mocks.createServiceClient.mockResolvedValue(client)

    await closeCrmProspect(7, "ganado")

    expect(client.__writes).toHaveLength(1)
    const payload = client.__writes[0]!.payload
    expect(payload.status).toBe("cliente_activo")
    expect(typeof payload.closed_at).toBe("string")
    expect(payload.loss_reason).toBeNull()
  })

  it("perder con motivo escribe los tres campos de cierre", async () => {
    adminOk()
    const client = fakeClient()
    mocks.createServiceClient.mockResolvedValue(client)

    await closeCrmProspect(7, "perdido", "precio")

    const payload = client.__writes[0]!.payload
    expect(payload.status).toBe("perdido")
    expect(payload.loss_reason).toBe("precio")
    expect(typeof payload.closed_at).toBe("string")
  })

  it("ganar ignora un motivo heredado del intento anterior", async () => {
    adminOk()
    const client = fakeClient()
    mocks.createServiceClient.mockResolvedValue(client)

    // El usuario probó "perdido" con motivo y luego cambió a "ganado".
    await closeCrmProspect(7, "ganado", "precio")

    expect(client.__writes[0]!.payload.loss_reason).toBeNull()
  })

  it("deja el desenlace en la bitácora", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient())

    await closeCrmProspect(7, "perdido", "competencia")

    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "crm_prospect_close",
        entity: "crm_prospects",
        entityId: 7,
        detail: { outcome: "perdido", lossReason: "competencia" },
      })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/leads")
  })
})
