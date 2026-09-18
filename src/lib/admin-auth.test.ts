import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
// `redirect` lanza en Next para cortar el render; el doble lo imita para poder
// comprobar a dónde iba la redirección.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
// El proxy deja el pathname pedido en `x-pathname`. Por defecto no hay
// cabecera —como en una llamada directa—, y cada test la fija si le importa.
const { pageHeaders } = vi.hoisted(() => ({ pageHeaders: { value: new Headers() } }))
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => pageHeaders.value),
}))

import {
  findUnconvergedAdminEmails,
  getAdminAccessReport,
  getAdminEmailAllowlist,
  isAdminEmail,
  isAdminUser,
  adminLoginPath,
  requireAdmin,
  requireAdminPage,
  resolveAdminAccess,
} from "./admin-auth"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

const ORIGINAL_ENV = process.env.ADMIN_EMAILS

type Result = { data?: unknown; error?: unknown }

/**
 * Cliente falso que soporta las dos cadenas que usa admin-auth.ts:
 *   from(t).select(...).eq(...).maybeSingle()      -> config.select
 *   from(t).update(p).eq(...).select(...)          -> config.update (Promise)
 * y `rpc(name)` para admin_access_report().
 */
function fakeClient(
  tables: Record<string, { select?: Result; update?: Result }> = {},
  rpcResult: Result = { data: [], error: null }
) {
  const updates: Array<{ table: string; patch: unknown }> = []

  const from = vi.fn((table: string) => {
    const cfg = tables[table] ?? {}
    let mode: "select" | "update" = "select"

    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => {
      if (mode === "update") {
        return Promise.resolve(cfg.update ?? { data: null, error: null })
      }
      return builder
    })
    builder.update = vi.fn((patch: unknown) => {
      mode = "update"
      updates.push({ table, patch })
      return builder
    })
    builder.eq = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(() =>
      Promise.resolve(cfg.select ?? { data: null, error: null })
    )
    return builder
  })

  const rpc = vi.fn(() => Promise.resolve(rpcResult))
  return { client: { from, rpc } as never, from, rpc, updates }
}

/** Enruta `createClient` (lecturas del usuario) y `createServiceClient` (espejo). */
function wire(
  tables: Record<string, { select?: Result; update?: Result }> = {},
  rpcResult: Result = { data: [], error: null }
) {
  const user = fakeClient(tables, rpcResult)
  const service = fakeClient(tables, rpcResult)
  vi.mocked(createClient).mockResolvedValue(user.client)
  vi.mocked(createServiceClient).mockResolvedValue(service.client)
  return { user, service }
}

describe("bootstrap de ADMIN_EMAILS", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = ORIGINAL_ENV
  })

  it("normaliza espacios y mayúsculas", () => {
    process.env.ADMIN_EMAILS = " Admin@Resurte.me , otro@resurte.me ,, "
    expect(getAdminEmailAllowlist()).toEqual(["admin@resurte.me", "otro@resurte.me"])
    expect(isAdminEmail("ADMIN@resurte.me")).toBe(true)
    expect(isAdminEmail("nadie@resurte.me")).toBe(false)
    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
  })

  it("sin la variable devuelve lista vacía", () => {
    delete process.env.ADMIN_EMAILS
    expect(getAdminEmailAllowlist()).toEqual([])
    expect(isAdminEmail("admin@resurte.me")).toBe(false)
  })
})

describe("resolveAdminAccess", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = ORIGINAL_ENV
  })

  it("sin id no es admin y no toca la BD", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    const { user } = wire()
    await expect(resolveAdminAccess({ id: "" })).resolves.toEqual({
      isAdmin: false,
      source: null,
      mirrored: false,
      warning: null,
      permissions: null,
    })
    expect(user.from).not.toHaveBeenCalled()
  })

  it("profiles.role = 'admin' → fuente 'profile', sin espejo", async () => {
    process.env.ADMIN_EMAILS = ""
    const { service } = wire({ profiles: { select: { data: { role: "admin" } } } })
    await expect(resolveAdminAccess({ id: "u1", email: "a@b.com" })).resolves.toEqual({
      isAdmin: true,
      source: "profile",
      mirrored: true,
      warning: null,
      permissions: null,
    })
    expect(service.from).not.toHaveBeenCalled()
  })

  it("email del bootstrap con profiles.role ya en admin → fuente 'env', sin escritura", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    const { service } = wire({ profiles: { select: { data: { role: "admin" } } } })
    const access = await resolveAdminAccess({ id: "u1", email: "admin@resurte.me" })
    expect(access).toEqual({
      isAdmin: true,
      source: "env",
      mirrored: true,
      warning: null,
      permissions: null,
    })
    expect(service.from).not.toHaveBeenCalled()
  })

  it("email del bootstrap sin el rol en profiles → promueve profiles.role (converge)", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    const { service } = wire({
      profiles: {
        select: { data: { role: "cliente" } },
        update: { data: [{ id: "u1" }], error: null },
      },
    })
    const access = await resolveAdminAccess({ id: "u1", email: "admin@resurte.me" })
    expect(access).toEqual({
      isAdmin: true,
      source: "env",
      mirrored: true,
      warning: null,
      permissions: null,
    })
    expect(service.updates).toEqual([{ table: "profiles", patch: { role: "admin" } }])
  })

  it("avisa cuando no existe la fila en profiles (RLS no lo reconocería)", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    wire({
      profiles: {
        select: { data: null },
        update: { data: [], error: null },
      },
    })
    const access = await resolveAdminAccess({ id: "u1", email: "admin@resurte.me" })
    expect(access.isAdmin).toBe(true)
    expect(access.source).toBe("env")
    expect(access.mirrored).toBe(false)
    expect(access.warning).toMatch(/No existe la fila en profiles/)
  })

  it("avisa cuando el espejo falla en la BD", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    wire({
      profiles: {
        select: { data: { role: "cliente" } },
        update: { data: null, error: { message: "permission denied" } },
      },
    })
    const access = await resolveAdminAccess({ id: "u1", email: "admin@resurte.me" })
    expect(access.isAdmin).toBe(true)
    expect(access.mirrored).toBe(false)
    expect(access.warning).toMatch(/permission denied/)
  })

  it("avisa cuando falta la service key (createServiceClient lanza)", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    wire({ profiles: { select: { data: { role: "cliente" } } } })
    vi.mocked(createServiceClient).mockRejectedValue(new Error("faltan credenciales"))
    const access = await resolveAdminAccess({ id: "u1", email: "admin@resurte.me" })
    expect(access.isAdmin).toBe(true)
    expect(access.mirrored).toBe(false)
    expect(access.warning).toMatch(/faltan credenciales/)
  })

  it("el bootstrap concede aunque la lectura de profiles falle (emergencia)", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    const { service } = wire({
      profiles: { select: { data: null, error: { message: "connection refused" } } },
    })
    const access = await resolveAdminAccess({ id: "u1", email: "admin@resurte.me" })
    expect(access.isAdmin).toBe(true)
    expect(access.source).toBe("env")
    expect(access.mirrored).toBe(false)
    expect(access.warning).toMatch(/connection refused/)
    // Sin lectura fiable no se intenta el espejo
    expect(service.from).not.toHaveBeenCalled()
  })

  it("fila legada en admin_users → fuente 'legacy' y espejo a profiles.role", async () => {
    process.env.ADMIN_EMAILS = ""
    const { service } = wire({
      profiles: {
        select: { data: { role: "cliente" } },
        update: { data: [{ id: "u1" }], error: null },
      },
      admin_users: { select: { data: { id: "row-1" } } },
    })
    const access = await resolveAdminAccess({ id: "u1", email: "a@b.com" })
    expect(access).toEqual({
      isAdmin: true,
      source: "legacy",
      mirrored: true,
      warning: null,
      permissions: null,
    })
    expect(service.updates).toEqual([{ table: "profiles", patch: { role: "admin" } }])
  })

  it("fail-closed: sin bootstrap y con error de lectura → no admin", async () => {
    process.env.ADMIN_EMAILS = ""
    wire({
      profiles: { select: { data: null, error: { message: "rls denied" } } },
      admin_users: { select: { data: { id: "row-1" } } },
    })
    const access = await resolveAdminAccess({ id: "u1", email: "a@b.com" })
    expect(access.isAdmin).toBe(false)
    expect(access.source).toBeNull()
  })

  it("fail-closed: sin bootstrap, sin rol y sin fila legada → no admin", async () => {
    process.env.ADMIN_EMAILS = ""
    wire({
      profiles: { select: { data: { role: "cliente" } } },
      admin_users: { select: { data: null } },
    })
    await expect(resolveAdminAccess({ id: "u1", email: "a@b.com" })).resolves.toEqual({
      isAdmin: false,
      source: null,
      mirrored: false,
      warning: null,
      permissions: null,
    })
  })

  it("fail-closed: error al consultar admin_users → no admin", async () => {
    process.env.ADMIN_EMAILS = ""
    wire({
      profiles: { select: { data: { role: "cliente" } } },
      admin_users: { select: { data: null, error: { message: "rls denied" } } },
    })
    const access = await resolveAdminAccess({ id: "u1", email: "a@b.com" })
    expect(access.isAdmin).toBe(false)
  })
})

describe("resolveAdminAccess · ámbito de permisos", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = ORIGINAL_ENV
  })

  /** Admin por `profiles.role` con la columna `admin_permissions` dada. */
  function adminWithScope(scope: unknown) {
    process.env.ADMIN_EMAILS = ""
    return wire({
      profiles: { select: { data: { role: "admin", admin_permissions: scope } } },
    })
  }

  it("columna NULL → sin restringir (el estado de todo admin existente)", async () => {
    adminWithScope(null)
    const access = await resolveAdminAccess({ id: "u1", email: "a@b.com" })
    expect(access.permissions).toBeNull()
  })

  it("columna ausente (fila sin la clave) → sin restringir", async () => {
    process.env.ADMIN_EMAILS = ""
    wire({ profiles: { select: { data: { role: "admin" } } } })
    const access = await resolveAdminAccess({ id: "u1", email: "a@b.com" })
    expect(access.permissions).toBeNull()
  })

  it("ámbito restringido → se propaga tal cual", async () => {
    adminWithScope(["pedidos"])
    const access = await resolveAdminAccess({ id: "u1", email: "a@b.com" })
    expect(access.permissions).toEqual(["pedidos"])
  })

  it("valor ilegible → ámbito vacío, no sin restringir", async () => {
    // La decisión que importa: un valor que no sabemos leer **degrada**, nunca
    // asciende. Si esto devolviera null, una columna corrupta daría admin total.
    adminWithScope("pedidos")
    const access = await resolveAdminAccess({ id: "u1", email: "a@b.com" })
    expect(access.isAdmin).toBe(true)
    expect(access.permissions).toEqual([])
  })

  it("descarta dominios desconocidos y ordena los válidos", async () => {
    adminWithScope(["sistema", "inventado", "pedidos", "pedidos"])
    const access = await resolveAdminAccess({ id: "u1", email: "a@b.com" })
    expect(access.permissions).toEqual(["pedidos", "sistema"])
  })

  it("el bootstrap de emergencia concede sin restringir", async () => {
    // Sin lectura fiable no hay ámbito que respetar. Se documenta a propósito:
    // es la rama que ya concede a ciegas para no quedarse fuera de /admin.
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    wire({ profiles: { select: { data: null, error: { message: "connection refused" } } } })
    const access = await resolveAdminAccess({ id: "u1", email: "admin@resurte.me" })
    expect(access.isAdmin).toBe(true)
    expect(access.permissions).toBeNull()
  })

  it("el bootstrap con lectura buena respeta el ámbito recortado", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    wire({
      profiles: {
        select: { data: { role: "cliente", admin_permissions: ["sistema"] } },
        update: { data: [{ id: "u1" }], error: null },
      },
    })
    const access = await resolveAdminAccess({ id: "u1", email: "admin@resurte.me" })
    expect(access.isAdmin).toBe(true)
    expect(access.permissions).toEqual(["sistema"])
  })

  it("un rol que no es admin no tiene ámbito aunque la columna traiga valores", async () => {
    process.env.ADMIN_EMAILS = ""
    wire({
      profiles: { select: { data: { role: "cliente", admin_permissions: ["sistema"] } } },
      admin_users: { select: { data: null } },
    })
    const access = await resolveAdminAccess({ id: "u1", email: "a@b.com" })
    expect(access.isAdmin).toBe(false)
    expect(access.permissions).toBeNull()
  })
})

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
    wire({ profiles: { select: { data: { role: "admin" } } } })
    await expect(isAdminUser({ id: "u1", email: "admin@resurte.me" })).resolves.toBe(true)
    await expect(isAdminUser({ id: "u2", email: "OTRO@resurte.me" })).resolves.toBe(true)
  })

  it("profiles.role = 'admin' → true (fuente gestionable desde la UI)", async () => {
    process.env.ADMIN_EMAILS = ""
    wire({ profiles: { select: { data: { role: "admin" } } } })
    await expect(isAdminUser({ id: "u1", email: "a@b.com" })).resolves.toBe(true)
  })

  it("profiles sin rol admin pero con fila en admin_users → true (legado)", async () => {
    process.env.ADMIN_EMAILS = ""
    wire({
      profiles: {
        select: { data: { role: "cliente" } },
        update: { data: [{ id: "u1" }], error: null },
      },
      admin_users: { select: { data: { id: "row-1" } } },
    })
    await expect(isAdminUser({ id: "u1", email: "a@b.com" })).resolves.toBe(true)
  })

  it("sin env, sin rol admin y sin fila en admin_users → false", async () => {
    process.env.ADMIN_EMAILS = ""
    wire({
      profiles: { select: { data: { role: "cliente" } } },
      admin_users: { select: { data: null } },
    })
    await expect(isAdminUser({ id: "u1", email: "a@b.com" })).resolves.toBe(false)
  })

  it("fail-closed: error de BD sin bootstrap → false", async () => {
    process.env.ADMIN_EMAILS = ""
    wire({
      profiles: { select: { data: null, error: { message: "rls denied" } } },
      admin_users: { select: { data: null, error: { message: "rls denied" } } },
    })
    await expect(isAdminUser({ id: "u1", email: "a@b.com" })).resolves.toBe(false)
  })

  it("fail-closed: createClient lanza sin bootstrap → false", async () => {
    process.env.ADMIN_EMAILS = ""
    vi.mocked(createClient).mockRejectedValue(new Error("no env"))
    await expect(isAdminUser({ id: "u1", email: "a@b.com" })).resolves.toBe(false)
  })

  it("el bootstrap sigue concediendo cuando createClient lanza", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    vi.mocked(createClient).mockRejectedValue(new Error("no env"))
    await expect(isAdminUser({ id: "u1", email: "admin@resurte.me" })).resolves.toBe(true)
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
    // El mock de createClient no tiene from() → la lectura lanza y, sin
    // bootstrap, fail-closed → false.
    authClient({ id: "u1", email: "cliente@resurte.me" })
    const { user, response } = await requireAdmin()
    expect(user).toBeNull()
    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual({
      error: "Acceso restringido a administradores",
    })
  })

  it("devuelve el usuario y response null cuando es admin (env)", async () => {
    process.env.ADMIN_EMAILS = "admin@resurte.me"
    const admin = { id: "u1", email: "admin@resurte.me" }
    authClient(admin)
    const { user, response } = await requireAdmin()
    expect(user).toEqual(admin)
    expect(response).toBeNull()
  })

  /** Cliente que responde tanto a `auth.getUser()` como a `from("profiles")`. */
  function adminClient(scope: unknown, user: unknown = { id: "u1", email: "a@b.com" }) {
    process.env.ADMIN_EMAILS = ""
    const profile = fakeClient({
      profiles: { select: { data: { role: "admin", admin_permissions: scope } } },
    })
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
      from: profile.from,
    } as never)
  }

  it("sin argumentos no comprueba dominio (compatible con las 78 llamadas previas)", async () => {
    adminClient([])
    // Ámbito vacío: restringido a nada. Sin `permission` no hay nada que
    // comprobar, así que sigue pasando la puerta — que es el comportamiento
    // anterior y el que asumen las ~20 suites que mockean esta función.
    const { user, response } = await requireAdmin()
    expect(user).not.toBeNull()
    expect(response).toBeNull()
  })

  it("concede cuando el ámbito incluye el dominio pedido", async () => {
    adminClient(["pedidos"])
    const { user, response } = await requireAdmin({ permission: "pedidos" })
    expect(user).not.toBeNull()
    expect(response).toBeNull()
  })

  it("403 nombrando el dominio cuando el ámbito no lo incluye", async () => {
    adminClient(["pedidos"])
    const { response } = await requireAdmin({ permission: "comisiones" })
    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual({
      error: "Tu cuenta no tiene acceso a Dinero de la red",
    })
  })

  it("sin restringir pasa cualquier dominio", async () => {
    adminClient(null)
    const { response } = await requireAdmin({ permission: "sistema" })
    expect(response).toBeNull()
  })

  it("ámbito vacío no pasa ningún dominio", async () => {
    adminClient([])
    const { response } = await requireAdmin({ permission: "productos" })
    expect(response?.status).toBe(403)
  })

  it("la puerta se evalúa antes que el dominio", async () => {
    // Un cliente no admin con la columna llena sigue recibiendo el 403 de
    // puerta: el ámbito recorta dentro de /admin, no abre la entrada.
    process.env.ADMIN_EMAILS = ""
    const profile = fakeClient({
      profiles: { select: { data: { role: "cliente", admin_permissions: ["sistema"] } } },
      admin_users: { select: { data: null } },
    })
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", email: "cliente@resurte.me" } },
          error: null,
        }),
      },
      from: profile.from,
    } as never)

    const { response } = await requireAdmin({ permission: "sistema" })
    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual({
      error: "Acceso restringido a administradores",
    })
  })
})

describe("adminLoginPath", () => {
  it("conserva la ruta pedida, codificada como query", () => {
    expect(adminLoginPath("/admin/comisiones")).toBe(
      "/auth/login?next=%2Fadmin%2Fcomisiones"
    )
  })

  it("conserva también la query de la ruta pedida", () => {
    expect(adminLoginPath("/admin/leads?tab=agenda")).toBe(
      "/auth/login?next=%2Fadmin%2Fleads%3Ftab%3Dagenda"
    )
  })

  it("sin ruta cae al dashboard", () => {
    expect(adminLoginPath(null)).toBe("/auth/login?next=%2Fadmin")
    expect(adminLoginPath(undefined)).toBe("/auth/login?next=%2Fadmin")
    expect(adminLoginPath("")).toBe("/auth/login?next=%2Fadmin")
  })

  // El valor lo escribe nuestro proxy, pero la cabecera viaja por la request:
  // una redirección abierta aquí sacaría al usuario de la casa justo después
  // de autenticarse, que es el peor momento para hacerlo.
  it.each([
    ["URL absoluta", "https://evil.com/robar"],
    ["protocol-relative", "//evil.com"],
    ["barra invertida", "/\\evil.com"],
    ["carácter de control", "/admin\u0000x"],
    ["bucle al login", "/auth/login"],
  ])("rechaza %s", (_caso, valor) => {
    expect(adminLoginPath(valor)).toBe("/auth/login?next=%2Fadmin")
  })
})

describe("requireAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pageHeaders.value = new Headers()
  })
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = ORIGINAL_ENV
  })

  function pageClient(
    user: unknown,
    scope: unknown = null,
    role = "admin",
    authError: unknown = null
  ) {
    const profile = fakeClient({
      profiles: { select: { data: user ? { role, admin_permissions: scope } : null } },
    })
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: authError }) },
      from: profile.from,
    } as never)
  }

  it("sin sesión manda al login recordando a dónde iba", async () => {
    process.env.ADMIN_EMAILS = ""
    pageClient(null)
    pageHeaders.value = new Headers({ "x-pathname": "/admin/comisiones" })
    await expect(requireAdminPage({ permission: "pedidos" })).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login?next=%2Fadmin%2Fcomisiones"
    )
  })

  it("sin la cabecera del proxy cae al dashboard, que es lo único que puede ofrecer", async () => {
    process.env.ADMIN_EMAILS = ""
    pageClient(null)
    pageHeaders.value = new Headers()
    await expect(requireAdminPage()).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login?next=%2Fadmin"
    )
  })

  it("un usuario que no es admin sale a la portada", async () => {
    process.env.ADMIN_EMAILS = ""
    pageClient({ id: "u1", email: "cliente@resurte.me" }, null, "cliente")
    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT:/")
  })

  it("sin el dominio vuelve al panel de inicio nombrando el dominio", async () => {
    process.env.ADMIN_EMAILS = ""
    pageClient({ id: "u1", email: "a@b.com" }, ["pedidos"])
    await expect(requireAdminPage({ permission: "marketing" })).rejects.toThrow(
      "NEXT_REDIRECT:/admin?sin-acceso=marketing"
    )
  })

  it("con el dominio devuelve la identidad y el ámbito", async () => {
    process.env.ADMIN_EMAILS = ""
    pageClient({ id: "u1", email: "a@b.com" }, ["pedidos", "sistema"])
    await expect(requireAdminPage({ permission: "pedidos" })).resolves.toEqual({
      userId: "u1",
      email: "a@b.com",
      permissions: ["pedidos", "sistema"],
    })
  })

  it("sin argumentos solo exige la puerta", async () => {
    process.env.ADMIN_EMAILS = ""
    pageClient({ id: "u1", email: "a@b.com" }, [])
    await expect(requireAdminPage()).resolves.toEqual({
      userId: "u1",
      email: "a@b.com",
      permissions: [],
    })
  })
})

describe("findUnconvergedAdminEmails", () => {
  const row = (email: string | null, profileRole = "admin") => ({
    userId: "u",
    email,
    profileRole,
    inAdminUsers: false,
  })

  it("todo convergido → lista vacía", () => {
    expect(
      findUnconvergedAdminEmails(
        ["a@resurte.me", "b@resurte.me"],
        [row("a@resurte.me"), row("B@Resurte.me")]
      )
    ).toEqual([])
  })

  it("señala los emails del bootstrap sin profiles.role = 'admin'", () => {
    expect(
      findUnconvergedAdminEmails(["a@resurte.me", "b@resurte.me"], [row("a@resurte.me")])
    ).toEqual(["b@resurte.me"])
  })

  it("no cuenta como convergido una fila con otro rol", () => {
    expect(
      findUnconvergedAdminEmails(["a@resurte.me"], [row("a@resurte.me", "vendedor")])
    ).toEqual(["a@resurte.me"])
  })

  it("ignora filas sin email", () => {
    expect(findUnconvergedAdminEmails(["a@resurte.me"], [row(null)])).toEqual(["a@resurte.me"])
  })

  it("sin allowlist no hay nada que revisar", () => {
    expect(findUnconvergedAdminEmails([], [row("a@resurte.me")])).toEqual([])
  })
})

describe("getAdminAccessReport", () => {
  beforeEach(() => vi.clearAllMocks())

  it("mapea las filas del reporte SQL", async () => {
    const { service } = wire({}, {
      data: [
        { user_id: "u1", email: "admin@resurte.me", profile_role: "admin", in_admin_users: false },
        { user_id: "u2", email: null, profile_role: "admin", in_admin_users: true },
      ],
      error: null,
    })
    await expect(getAdminAccessReport()).resolves.toEqual({
      rows: [
        { userId: "u1", email: "admin@resurte.me", profileRole: "admin", inAdminUsers: false },
        { userId: "u2", email: null, profileRole: "admin", inAdminUsers: true },
      ],
      error: null,
    })
    expect(service.rpc).toHaveBeenCalledWith("admin_access_report")
  })

  it("devuelve el error del RPC en vez de una lista vacía silenciosa", async () => {
    wire({}, { data: null, error: { message: "function public.admin_access_report() does not exist" } })
    const report = await getAdminAccessReport()
    expect(report.rows).toEqual([])
    expect(report.error).toMatch(/does not exist/)
  })

  it("devuelve el error cuando falta la service key", async () => {
    vi.mocked(createServiceClient).mockRejectedValue(new Error("faltan NEXT_PUBLIC_SUPABASE_URL"))
    const report = await getAdminAccessReport()
    expect(report.rows).toEqual([])
    expect(report.error).toMatch(/faltan NEXT_PUBLIC_SUPABASE_URL/)
  })
})
