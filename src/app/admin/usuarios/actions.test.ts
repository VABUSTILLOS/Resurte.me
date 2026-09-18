import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { listUsers, setAdminPermissions, setUserRole } from "./actions"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import type { AdminScope } from "@/lib/admin-permissions"

type Result = { data?: unknown; error?: unknown; count?: number | null }

function tableMock(results: Result[]) {
  const builder: Record<string, unknown> = {}
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "upsert",
    "eq",
    "neq",
    "in",
    "is",
    "order",
    "limit",
    "single",
    "maybeSingle",
  ]
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder)
  builder.then = function (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown
  ) {
    const first = results[0] ?? { data: null, error: null }
    const r = results.length > 1 ? (results.shift() ?? first) : first
    return Promise.resolve(r).then(resolve, reject)
  }
  return builder
}

function serviceWith(tables: Record<string, Result[]>) {
  const builders: Record<string, ReturnType<typeof tableMock>> = {}
  for (const [table, results] of Object.entries(tables)) {
    builders[table] = tableMock(results)
  }
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn(
      (t: string) => builders[t] ?? tableMock([{ data: null, error: null }])
    ),
  } as never)
  return builders
}

/** Sesión de admin. `scope` es el ámbito del **llamante**. */
function caller(scope: AdminScope = null) {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: "admin-1", email: "jefa@resurte.me" },
    response: null,
    permissions: scope,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listUsers · ámbito", () => {
  it("exige el dominio de clientes", async () => {
    caller()
    serviceWith({
      profiles: [{ data: [], error: null }],
    })
    vi.mocked(createServiceClient).mockResolvedValue({
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
        },
      },
      from: vi.fn(() => tableMock([{ data: [], error: null }])),
    } as never)

    await listUsers()

    expect(requireAdmin).toHaveBeenCalledWith({ permission: "clientes" })
  })

  it("expone el ámbito guardado como adminScope", async () => {
    caller()
    vi.mocked(createServiceClient).mockResolvedValue({
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: {
              users: [
                {
                  id: "u1",
                  email: "ops@resurte.me",
                  created_at: "2026-01-01T00:00:00Z",
                  last_sign_in_at: null,
                },
              ],
            },
            error: null,
          }),
        },
      },
      from: vi.fn(() =>
        tableMock([
          {
            data: [
              { id: "u1", full_name: "Ops", role: "admin", admin_permissions: ["pedidos"] },
            ],
            error: null,
          },
        ])
      ),
    } as never)

    const { users } = await listUsers()

    expect(users[0]?.adminScope).toEqual(["pedidos"])
  })

  it("una columna nula llega como sin restringir", async () => {
    caller()
    vi.mocked(createServiceClient).mockResolvedValue({
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: {
              users: [
                {
                  id: "u1",
                  email: "ops@resurte.me",
                  created_at: "2026-01-01T00:00:00Z",
                  last_sign_in_at: null,
                },
              ],
            },
            error: null,
          }),
        },
      },
      from: vi.fn(() =>
        tableMock([
          { data: [{ id: "u1", full_name: null, role: "admin", admin_permissions: null }], error: null },
        ])
      ),
    } as never)

    const { users } = await listUsers()

    expect(users[0]?.adminScope).toBeNull()
  })
})

describe("setAdminPermissions · reglas de delegación", () => {
  it("rechaza a un admin restringido antes de tocar la base", async () => {
    caller(["clientes"])

    await expect(setAdminPermissions("u2", ["pedidos"])).rejects.toThrow(
      /acceso completo/
    )
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza que un admin cambie su propio ámbito", async () => {
    caller()

    await expect(setAdminPermissions("admin-1", ["pedidos"])).rejects.toThrow(
      /tus propios permisos/
    )
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("trata un ámbito no declarado como restringido", async () => {
    // Mock antiguo de `requireAdmin` que no devuelve `permissions`. El default
    // tiene que negar, no conceder.
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: "admin-1", email: "jefa@resurte.me" },
      response: null,
    } as never)

    await expect(setAdminPermissions("u2", ["pedidos"])).rejects.toThrow(
      /acceso completo/
    )
  })

  it("rechaza restringir a una cuenta que no es admin", async () => {
    caller()
    serviceWith({
      profiles: [{ data: { role: "cliente", admin_permissions: null }, error: null }],
    })

    await expect(setAdminPermissions("u2", ["pedidos"])).rejects.toThrow(
      /rol de administrador/
    )
  })

  it("rechaza a un usuario inexistente", async () => {
    caller()
    serviceWith({ profiles: [{ data: null, error: null }] })

    await expect(setAdminPermissions("fantasma", ["pedidos"])).rejects.toThrow(
      /no existe/
    )
  })

  it("normaliza, deduplica y ordena los dominios", async () => {
    caller()
    const builders = serviceWith({
      profiles: [
        { data: { role: "admin", admin_permissions: null }, error: null },
        { data: null, error: null },
      ],
      admin_audit_log: [{ data: null, error: null }],
    })

    await setAdminPermissions("u2", [
      "sistema",
      "pedidos",
      "pedidos",
    ] as never)

    expect(builders.profiles?.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({
      admin_permissions: ["pedidos", "sistema"],
    })
  })

  it("descarta dominios desconocidos en lugar de guardarlos", async () => {
    caller()
    const builders = serviceWith({
      profiles: [
        { data: { role: "admin", admin_permissions: null }, error: null },
        { data: null, error: null },
      ],
      admin_audit_log: [{ data: null, error: null }],
    })

    await setAdminPermissions("u2", ["pedidos", "inventado"] as never)

    expect(builders.profiles?.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({
      admin_permissions: ["pedidos"],
    })
  })

  it("guarda sin restricción como null, no como arreglo vacío", async () => {
    caller()
    const builders = serviceWith({
      profiles: [
        { data: { role: "admin", admin_permissions: ["pedidos"] }, error: null },
        { data: null, error: null },
      ],
      admin_audit_log: [{ data: null, error: null }],
    })

    await setAdminPermissions("u2", null)

    expect(builders.profiles?.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({
      admin_permissions: null,
    })
  })

  it("registra el cambio en la bitácora con el valor anterior", async () => {
    caller()
    const builders = serviceWith({
      profiles: [
        { data: { role: "admin", admin_permissions: ["pedidos"] }, error: null },
        { data: null, error: null },
      ],
      admin_audit_log: [{ data: null, error: null }],
    })

    await setAdminPermissions("u2", ["comisiones"])

    expect(builders.admin_audit_log?.insert as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_permissions",
        entity: "profiles",
        entity_id: "u2",
        detail: { previous: ["pedidos"], scope: ["comisiones"] },
      })
    )
  })
})

describe("setUserRole · la llave de la puerta no se delega", () => {
  it("un admin restringido puede cambiar entre roles no-admin", async () => {
    caller(["clientes"])
    serviceWith({
      profiles: [
        { count: 1, data: null, error: null },
        { data: null, error: null },
      ],
      admin_users: [{ data: null, error: null }],
      admin_audit_log: [{ data: null, error: null }],
    })

    await expect(setUserRole("u2", "vendedor")).resolves.toEqual({ ok: true })
  })

  it("un admin restringido no puede conceder el rol de admin", async () => {
    caller(["clientes"])

    await expect(setUserRole("u2", "admin")).rejects.toThrow(/acceso completo/)
  })

  it("un admin sin restringir sí puede concederlo", async () => {
    caller()
    serviceWith({
      profiles: [{ data: null, error: null }],
      admin_users: [{ data: null, error: null }],
      admin_audit_log: [{ data: null, error: null }],
    })

    await expect(setUserRole("u2", "admin")).resolves.toEqual({ ok: true })
  })

  it("un ámbito no declarado tampoco concede admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: "admin-1", email: "jefa@resurte.me" },
      response: null,
    } as never)

    await expect(setUserRole("u2", "admin")).rejects.toThrow(/acceso completo/)
  })
})
