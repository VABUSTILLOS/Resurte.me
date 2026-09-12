import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

import { getCurrentUser, requireAuth } from "./auth"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

const USER = { id: "user-1", email: "a@b.com" }

function clientWith(user: unknown) {
  const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return client
}

describe("requireAuth", () => {
  beforeEach(() => vi.clearAllMocks())

  it("devuelve el cliente y el usuario cuando hay sesión", async () => {
    const client = clientWith(USER)
    const result = await requireAuth()
    expect(result.user).toEqual(USER)
    expect(result.supabase).toBe(client)
    expect(redirect).not.toHaveBeenCalled()
  })

  it("redirige a /auth/login cuando no hay sesión", async () => {
    clientWith(null)
    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT:/auth/login")
    expect(redirect).toHaveBeenCalledWith("/auth/login")
  })
})

describe("getCurrentUser", () => {
  beforeEach(() => vi.clearAllMocks())

  it("devuelve el usuario autenticado sin redirigir", async () => {
    clientWith(USER)
    await expect(getCurrentUser()).resolves.toEqual(USER)
    expect(redirect).not.toHaveBeenCalled()
  })

  it("devuelve null cuando no hay sesión", async () => {
    clientWith(null)
    await expect(getCurrentUser()).resolves.toBeNull()
    expect(redirect).not.toHaveBeenCalled()
  })
})
