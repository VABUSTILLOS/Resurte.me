import { afterEach, describe, expect, it, vi } from "vitest"
import { isSupabaseConfigured, supabaseServiceKey, supabaseUrl } from "./env"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("supabaseServiceKey", () => {
  it("devuelve la llave cuando hay una de verdad", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiJ9.servicio.firma")
    expect(supabaseServiceKey()).toBe("eyJhbGciOiJIUzI1NiJ9.servicio.firma")
  })

  it("trata [SENSITIVE] como ausente", () => {
    // El caso que motivó el guarda: `vercel env pull` escribe este literal en
    // vez del valor real. Como es una cadena con contenido, un guarda de
    // "¿existe?" la daba por buena y el cliente se construía con una llave
    // falsa, fallando después con un 401 en lugar de decir que faltaba.
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "[SENSITIVE]")
    expect(supabaseServiceKey()).toBeNull()
  })

  it("trata vacío y solo-espacios como ausente", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    expect(supabaseServiceKey()).toBeNull()
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "   ")
    expect(supabaseServiceKey()).toBeNull()
  })

  it("recorta los espacios alrededor de una llave válida", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "  eyJ.servicio.firma  ")
    expect(supabaseServiceKey()).toBe("eyJ.servicio.firma")
  })
})

describe("supabaseUrl", () => {
  it("trata [SENSITIVE] como ausente", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "[SENSITIVE]")
    expect(supabaseUrl()).toBeNull()
  })

  it("rechaza una cadena que no es una URL http(s)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "isogthougrpctnfzcdes")
    expect(supabaseUrl()).toBeNull()
  })
})

describe("isSupabaseConfigured", () => {
  it("es falso cuando ambos valores son placeholders", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "[SENSITIVE]")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "[SENSITIVE]")
    expect(isSupabaseConfigured()).toBe(false)
  })

  it("es verdadero con URL y anon key reales", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiJ9.anon.firma")
    expect(isSupabaseConfigured()).toBe(true)
  })
})
