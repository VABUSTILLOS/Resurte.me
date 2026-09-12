import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ isAdminUser: vi.fn() }))
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

import { getUserRole, requireSellerOrAdmin, requireSellerOrAdminAction } from "./roles"
import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import { isAdminUser } from "@/lib/admin-auth"
import { requireAuth } from "@/lib/auth"
import { redirect } from "next/navigation"

const USER = { id: "user-1", email: "a@b.com" }

function sessionClient(user: unknown, profile: { data?: unknown } = { data: null }) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn().mockReturnValue(builder)
  builder.eq = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn().mockResolvedValue(profile)
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn(() => builder),
  } as never)
}

describe("getUserRole", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isSupabaseConfigured).mockReturnValue(true)
  })

  it("null cuando Supabase no está configurado (sin tocar la red)", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false)
    await expect(getUserRole()).resolves.toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })

  it("null cuando no hay sesión", async () => {
    sessionClient(null)
    await expect(getUserRole()).resolves.toBeNull()
  })

  it("'admin' cuando isAdminUser lo reconoce", async () => {
    sessionClient(USER)
    vi.mocked(isAdminUser).mockResolvedValue(true)
    await expect(getUserRole()).resolves.toBe("admin")
  })

  it("'vendedor' cuando profiles.role = 'vendedor'", async () => {
    sessionClient(USER, { data: { role: "vendedor" } })
    vi.mocked(isAdminUser).mockResolvedValue(false)
    await expect(getUserRole()).resolves.toBe("vendedor")
  })

  it("'cliente' para cualquier otro rol o perfil ausente", async () => {
    sessionClient(USER, { data: { role: "cliente" } })
    vi.mocked(isAdminUser).mockResolvedValue(false)
    await expect(getUserRole()).resolves.toBe("cliente")

    sessionClient(USER, { data: null })
    await expect(getUserRole()).resolves.toBe("cliente")
  })
})

describe("requireSellerOrAdminAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isSupabaseConfigured).mockReturnValue(true)
    vi.mocked(requireAuth).mockResolvedValue({ user: USER } as never)
  })

  it("devuelve userId/role para vendedor", async () => {
    sessionClient(USER, { data: { role: "vendedor" } })
    vi.mocked(isAdminUser).mockResolvedValue(false)
    await expect(requireSellerOrAdminAction()).resolves.toEqual({
      userId: USER.id,
      user: USER,
      role: "vendedor",
    })
  })

  it("devuelve role 'admin' para administradores", async () => {
    sessionClient(USER)
    vi.mocked(isAdminUser).mockResolvedValue(true)
    await expect(requireSellerOrAdminAction()).resolves.toMatchObject({ role: "admin" })
  })

  it("lanza Error (no redirige) para clientes", async () => {
    sessionClient(USER, { data: { role: "cliente" } })
    vi.mocked(isAdminUser).mockResolvedValue(false)
    await expect(requireSellerOrAdminAction()).rejects.toThrow(
      "Acceso restringido: solo vendedores y administradores"
    )
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe("requireSellerOrAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isSupabaseConfigured).mockReturnValue(true)
    vi.mocked(requireAuth).mockResolvedValue({ user: USER } as never)
  })

  it("redirige a / cuando el rol no tiene acceso", async () => {
    sessionClient(USER, { data: { role: "cliente" } })
    vi.mocked(isAdminUser).mockResolvedValue(false)
    await expect(requireSellerOrAdmin()).rejects.toThrow("NEXT_REDIRECT:/")
    expect(redirect).toHaveBeenCalledWith("/")
  })

  it("pasa para vendedor", async () => {
    sessionClient(USER, { data: { role: "vendedor" } })
    vi.mocked(isAdminUser).mockResolvedValue(false)
    await expect(requireSellerOrAdmin()).resolves.toMatchObject({ userId: USER.id, role: "vendedor" })
  })
})
