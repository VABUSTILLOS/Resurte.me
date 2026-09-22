import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * `getStripe()` guarda el cliente en un módulo-caché, así que cada caso
 * recarga el módulo para partir de cero.
 */
async function loadGetStripe() {
  vi.resetModules()
  const mod = await import("@/lib/stripe")
  return mod.getStripe
}

/**
 * Llaves de mentira para las pruebas. Se arman en tiempo de ejecución **a
 * propósito**: un literal con forma de `sk_live_…` en el fuente hace saltar la
 * Push Protection de GitHub —el escáner mira la forma, no si la llave existe— y
 * un push bloqueado por un falso positivo cuesta más que estas dos líneas. Lo
 * único que `getStripe()` inspecciona es el prefijo, así que armarlas aquí no
 * debilita ninguna aserción.
 */
const fakeKey = (kind: "live" | "test") => `sk_${kind}_51PruebaNoEsUnaLlaveReal`

const LIVE = fakeKey("live")
const TEST = fakeKey("test")

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("getStripe", () => {
  it("lanza si no hay llave", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "")
    const getStripe = await loadGetStripe()
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY is not defined/)
  })

  it("rechaza una llave live fuera de producción", async () => {
    // El escenario que esto evita: el sandbox de staging hereda la llave live
    // de producción y una prueba cobra dinero real.
    vi.stubEnv("STRIPE_SECRET_KEY", LIVE)
    vi.stubEnv("VERCEL_ENV", "preview")
    const getStripe = await loadGetStripe()
    expect(() => getStripe()).toThrow(/llave live/)
  })

  it("rechaza una llave live sin ninguna señal de entorno", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", LIVE)
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("ALLOW_LIVE_STRIPE", "")
    const getStripe = await loadGetStripe()
    expect(() => getStripe()).toThrow(/llave live/)
  })

  it("acepta una llave live en producción", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", LIVE)
    vi.stubEnv("VERCEL_ENV", "production")
    const getStripe = await loadGetStripe()
    expect(getStripe()).toBeDefined()
  })

  it("acepta una llave live con la válvula explícita", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", LIVE)
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("ALLOW_LIVE_STRIPE", "1")
    const getStripe = await loadGetStripe()
    expect(getStripe()).toBeDefined()
  })

  it("acepta una llave de prueba en cualquier entorno", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", TEST)
    vi.stubEnv("VERCEL_ENV", "development")
    const getStripe = await loadGetStripe()
    expect(getStripe()).toBeDefined()
  })
})
