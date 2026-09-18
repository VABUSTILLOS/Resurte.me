import { beforeEach, describe, expect, it, vi } from "vitest"

// Tareas del CRM en el panel (Ronda 18, F4 — migración `00185_crm_tasks.sql`).
//
// El panel no reimplementa nada: delega en `src/lib/comercializacion/actions/tareas.ts`,
// que es el módulo compartido con la ficha del vendedor. Lo que sí es exclusivo
// del panel es la bitácora, y por eso lo que se comprueba aquí es que la
// auditoría dice la verdad sobre lo que pasó:
//
//  1. **No hay entrada de bitácora sin escritura.** Si el módulo compartido
//     rechaza el cambio (fuera de alcance, título vacío), el panel no registra
//     nada: una bitácora que anota lo que no ocurrió es peor que no tenerla.
//  2. **El borrado deja el título.** Es la única acción destructiva del CRM: el
//     `DELETE` no se puede reconstruir después, así que el título se lee antes
//     de borrar y viaja en el detalle.
//  3. **El panel no escribe antes de comprobar quién es.** La comprobación de
//     admin precede a cualquier cliente de servicio.

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
  logAdminAction: vi.fn(),
  createTask: vi.fn(),
  completeTask: vi.fn(),
  reopenTask: vi.fn(),
  removeTask: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock("@/lib/comercializacion/actions/tareas", () => ({
  createTask: mocks.createTask,
  completeCrmTask: mocks.completeTask,
  reopenCrmTask: mocks.reopenTask,
  deleteCrmTask: mocks.removeTask,
  listProspectTasks: vi.fn(),
  getTaskAgenda: vi.fn(),
}))

import { completeCrmTask, createCrmTask, deleteCrmTask, reopenCrmTask } from "./actions"

const ADMIN = { id: "admin-1", email: "admin@resurte.me" }

type Row = Record<string, unknown>

/** Lo que el cliente falso vio, en orden: el orden es parte de la propiedad. */
type Trace = string[]

/**
 * Cliente falso del camino de lectura previa al borrado
 * (`from("crm_tasks").select(...).eq("id", …).maybeSingle()`). Registra en
 * `trace` cuándo se leyó, para poder afirmar que se leyó **antes** de borrar.
 */
function fakeClient(trace: Trace, row: Row | null = null) {
  const api = {
    select: () => api,
    eq: () => api,
    maybeSingle: async () => {
      trace.push("read")
      return { data: row, error: null }
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
  mocks.createTask.mockResolvedValue(undefined)
  mocks.completeTask.mockResolvedValue(undefined)
  mocks.reopenTask.mockResolvedValue(undefined)
  mocks.removeTask.mockResolvedValue(undefined)
})

describe("createCrmTask", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(createCrmTask(7, { title: "Llamar" })).rejects.toThrow(/administradores/i)
    expect(mocks.createTask).not.toHaveBeenCalled()
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it("delega el alta con el borrador tal cual y sin inventar campos", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient([]))

    await createCrmTask(7, { title: "Llamar a Juan", due_at: "2026-09-20T09:00:00.000Z", priority: "alta" })

    expect(mocks.createTask).toHaveBeenCalledWith(7, {
      title: "Llamar a Juan",
      due_at: "2026-09-20T09:00:00.000Z",
      priority: "alta",
    })
  })

  it("una tarea sin fecha se registra con la fecha en nulo, no omitida", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient([]))

    await createCrmTask(7, { title: "Recordar" })

    expect(mocks.createTask).toHaveBeenCalledWith(7, { title: "Recordar" })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "crm_task_create",
        entity: "crm_tasks",
        entityId: 7,
        detail: { title: "Recordar", due_at: null, priority: null },
      })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/leads")
  })

  it("si el módulo compartido rechaza el alta, no queda rastro en la bitácora", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient([]))
    mocks.createTask.mockRejectedValue(new Error("El título de la tarea es obligatorio"))

    await expect(createCrmTask(7, { title: "   " })).rejects.toThrow(/obligatorio/i)

    // La propiedad que importa: la bitácora no anota una tarea que no existe.
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe("completeCrmTask", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(completeCrmTask(3)).rejects.toThrow(/administradores/i)
    expect(mocks.completeTask).not.toHaveBeenCalled()
  })

  it("delega y deja la tarea completada en la bitácora", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient([]))

    await completeCrmTask(3)

    expect(mocks.completeTask).toHaveBeenCalledWith(3)
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "crm_task_complete", entity: "crm_tasks", entityId: 3 })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/leads")
  })

  it("no registra nada si completar falla (tarea de otro alcance)", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient([]))
    mocks.completeTask.mockRejectedValue(new Error("Tarea fuera de tu alcance"))

    await expect(completeCrmTask(3)).rejects.toThrow(/alcance/i)
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })
})

describe("reopenCrmTask", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(reopenCrmTask(3)).rejects.toThrow(/administradores/i)
    expect(mocks.reopenTask).not.toHaveBeenCalled()
  })

  it("delega y deja la reapertura en la bitácora", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient([]))

    await reopenCrmTask(3)

    expect(mocks.reopenTask).toHaveBeenCalledWith(3)
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "crm_task_reopen", entity: "crm_tasks", entityId: 3 })
    )
  })
})

describe("deleteCrmTask", () => {
  it("exige admin antes de escribir", async () => {
    adminDenied()
    await expect(deleteCrmTask(3)).rejects.toThrow(/administradores/i)
    expect(mocks.removeTask).not.toHaveBeenCalled()
  })

  it("lee el título ANTES de borrar y lo deja en la bitácora", async () => {
    adminOk()
    const trace: Trace = []
    mocks.createServiceClient.mockResolvedValue(
      fakeClient(trace, { title: "Llamar a Juan", prospect_id: 7 })
    )
    mocks.removeTask.mockImplementation(async () => {
      trace.push("delete")
    })

    await deleteCrmTask(3)

    // El orden es la propiedad: después del `DELETE` el título ya no existe.
    expect(trace).toEqual(["read", "delete"])
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "crm_task_delete",
        entity: "crm_tasks",
        entityId: 3,
        detail: { title: "Llamar a Juan", prospect_id: 7 },
      })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/leads")
  })

  it("una tarea ya borrada no rompe la bitácora: el detalle queda en nulo", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient([], null))

    await deleteCrmTask(3)

    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: { title: null, prospect_id: null } })
    )
  })

  it("no registra nada si el borrado falla", async () => {
    adminOk()
    mocks.createServiceClient.mockResolvedValue(fakeClient([], { title: "X", prospect_id: 7 }))
    mocks.removeTask.mockRejectedValue(new Error("Tarea fuera de tu alcance"))

    await expect(deleteCrmTask(3)).rejects.toThrow(/alcance/i)
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })
})
