import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { isAdminUser, requireAdmin } from "./admin-auth"
import { createClient } from "@/lib/supabase/server"

const ORIGINAL_ENV = process.env.ADMIN_EMAILS

type Row = { data?: unknown; error?: unknown }

/** Cliente con resultados por tabla (profiles / admin_users). */
function dbClient(tables: Record<string, Row>) {
  const used: string[] = []
  const from = vi.fn((table: string) => {
    used.push(table)
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn().mockReturnValue(builder)
    builder.eq = vi.fn().mockReturnValue(builder)
    builder.maybeSingle = vi.fn().mockResolvedValue(tables[table] ?? { data: null, error: null })
    return builder
  })
  vi.mocked(createClient).mockResolvedValue({ from } as never)
  return { from, used }
}

describe("isAdminUser", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = ORIGINAL_ENV
  })

  it("rechaza usuarios sin id", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    await expect(isAdminUser({ id: "", email: "admin@resurte.me" })).resolves.toBe(false)
    await expect(isAdminUser(null as never)).resolves.toBe(false)
  })

  it("acepta emails listados en ADMIN_EMAILS (case-insensitive, con espacios)", async () => {
    process.env.ADMIN_EMAILS = " Admin@Resurte.me , otro@resurte.me "
    await expect(isAdminUser({ id: "u1", email: "admin@resurte.me" })).resolves.toBe(true)
    await expect(isAdminUser({ id: "u2", email: "OTRO@resurte.me" })).resolves.toBe(true)
  })

  it("email listado en env → true sin consultar la BD", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    const { from } = dbClient({})
    await expect(isAdminUser({ id: "u1", email: "admin@resurte.me" })).resolves.toBe(true)
    expect(from).not.toHaveBeenCalled()
  })

  it("email NO listado en env → sigue evaluando profiles.role y admin_users", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    const { used } = dbClient({
      profiles: { data: { role: "admin" }, error: null },
    })
    await expect(isAdminUser({ id: "u1", email: "intruso@resurte.me" })).resolves.toBe(true)
    expect(used).toContain("profiles")
  })

  it("profiles.role = 'admin' → true (fuente gestionable desde la UI)", async () => {
    process.env.ADMIN_EMAILS = ""
    dbClient({ profiles: { data: { role: "admin" }, error: null } })
    await expect(isAdminUser({ id: "u1", email: "a@b.com" })).resolves.toBe(true)
  })

  it("profiles sin rol admin → consulta admin_users (legado)", async () => {
    process.env.ADMIN_EMAILS = ""
    const { used } = dbClient({
      profiles: { data: { role: "cliente" }, error: null },
      admin_users: { data: { id: "row-1" }, error: null },
    })
    await expect(isAdminUser({ id: "u1", email: "a@b.com" })).resolves.toBe(true)
    expect(used).toEqual(["profiles", "admin_users"])
  })

  it("sin env, sin rol admin y sin fila en admin_users → false", async () => {
    process.env.ADMIN_EMAILS = ""
    dbClient({
      profiles: { data: { role: "cliente" }, error: null },
      admin_users: { data: null, error: null },
    })
    await expect(isAdminUser({ id: "u1", email: "a@b.com" })).resolves.toBe(false)
  })

  it("fail-closed: error de BD → false", async () => {
    process.env.ADMIN_EMAILS = ""
    dbClient({
      profiles: { data: null, error: { message: "rls denied" } },
      admin_users: { data: null, error: { message: "rls denied" } },
    })
    await expect(isAdminUser({ id: "u1", email: "a@b.com" })).resolves.toBe(false)
  })

  it("fail-closed: createClient lanza → false", async () => {
    process.env.ADMIN_EMAILS = ""
    vi.mocked(createClient).mockRejectedValue(new Error("no env"))
    await expect(isAdminUser({ id: "u1", email: "a@b.com" })).resolves.toBe(false)
  })
})

describe("requireAdmin", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = ORIGINAL_ENV
  })

  function authClient(user: unknown, authError: unknown = null) {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: authError }) },
    } as never)
  }

  it("401 cuando no hay sesión", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    authClient(null)
    const { user, response } = await requireAdmin()
    expect(user).toBeNull()
    expect(response?.status).toBe(401)
    await expect(response?.json()).resolves.toEqual({ error: "No autenticado" })
  })

  it("401 cuando getUser devuelve error", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    authClient({ id: "u1", email: "admin@resurte.me" }, { message: "jwt expired" })
    const { user, response } = await requireAdmin()
    expect(user).toBeNull()
    expect(response?.status).toBe(401)
  })

  it("403 cuando el usuario no es admin por ninguna fuente", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    // authClient para la sesión; isAdminUser reutiliza createClient → mismo mock.
    // El mock no tiene from(), así que la consulta a perfiles lanza y fail-closed → false.
    authClient({ id: "u1", email: "cliente@resurte.me" })
    const { user, response } = await requireAdmin()
    expect(user).toBeNull()
    expect(response?.status).toBe(403)
  })

  it("devuelve el usuario y response null cuando es admin (env)", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    const admin = { id: "u1", email: "admin@resurte.me" }
    authClient(admin)
    const { user, response } = await requireAdmin()
    expect(user).toEqual(admin)
    expect(response).toBeNull()
  })
})
