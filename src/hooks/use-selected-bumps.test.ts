import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SelectedBump } from "@/components/checkout/BumpCards"

/**
 * Vitest corre en environment "node" (sin jsdom ni @testing-library/react), así
 * que el store se prueba con dos stubs:
 *  - un `window`/`document` mínimos (localStorage, sessionStorage, listeners),
 *  - `useSyncExternalStore` mockeado (síncrono: suscribe y devuelve el snapshot).
 * Cada test re-importa el módulo con `vi.resetModules()` porque el store guarda
 * estado y guardas de "una sola vez" a nivel de módulo.
 */

const BUMPS_STORAGE_KEY = "resurte_bumps"
const LEGACY_STORAGE_KEY = "resurte:selected-bumps"
const PUSH_DEBOUNCE_MS = 1500

const reactMock = vi.hoisted(() => ({ noop: () => {} }))

vi.mock("react", () => ({
  useSyncExternalStore: (
    subscribe: (cb: () => void) => () => void,
    getSnapshot: () => unknown
  ) => {
    subscribe(reactMock.noop)
    return getSnapshot()
  },
}))

const auth = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(async () => ({ data: { session: auth.session } })),
    },
  }),
}))

const net = vi.hoisted(() => ({
  calls: [] as { url: string; init: RequestInit }[],
  hydrate: null as null | { bumps?: unknown; updated_at?: string | null; source?: string },
  holdHydrate: false,
  releaseHydrate: null as null | (() => void),
  selectionOk: true,
  selectionThrows: false,
}))

function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size
    },
  }
}

type Dom = ReturnType<typeof installDom>

function installDom() {
  const handlers = new Map<string, Set<(event: unknown) => void>>()
  const localStorage = makeStorage()
  const sessionStorage = makeStorage()

  const addEventListener = (type: string, cb: (event: unknown) => void) => {
    if (!handlers.has(type)) handlers.set(type, new Set())
    handlers.get(type)?.add(cb)
  }

  const windowStub = {
    localStorage,
    sessionStorage,
    addEventListener: vi.fn(addEventListener),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }
  const documentStub = {
    visibilityState: "visible",
    addEventListener: vi.fn(addEventListener),
  }

  vi.stubGlobal("window", windowStub)
  vi.stubGlobal("document", documentStub)

  return {
    localStorage,
    sessionStorage,
    emit(type: string, event: unknown = {}) {
      for (const cb of handlers.get(type) ?? []) cb(event)
    },
  }
}

const BUMP: SelectedBump = {
  ruleId: 12,
  productId: 99,
  quantity: 1,
  unitPrice: 30,
  name: "Totopos",
}
const OTHER_BUMP: SelectedBump = {
  ruleId: 7,
  productId: 55,
  quantity: 2,
  unitPrice: 12,
  name: "Salsa",
}

const NEWER = new Date(Date.now() + 60_000).toISOString()

let dom: Dom

/** Importa un grafo de módulos nuevo del store (estado limpio por test). */
async function loadStore() {
  vi.resetModules()
  return import("./use-selected-bumps")
}

/** Deja correr microtasks (getSession/hydrate son promesas). */
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  await vi.advanceTimersByTimeAsync(0)
}

function pushes() {
  return net.calls.filter((c) => c.url.includes("/api/cart/bumps/selection"))
}

function stored() {
  const raw = dom.localStorage.getItem(BUMPS_STORAGE_KEY)
  return raw ? (JSON.parse(raw) as { bumps: SelectedBump[]; updatedAt: number }) : null
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  dom = installDom()
  auth.session = { user: { id: "user-1" } }
  net.calls = []
  net.hydrate = null
  net.holdHydrate = false
  net.releaseHydrate = null
  net.selectionOk = true
  net.selectionThrows = false
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      net.calls.push({ url: String(url), init })
      if (String(url).includes("/selection")) {
        if (net.selectionThrows) throw new TypeError("Failed to fetch")
        return { ok: net.selectionOk, json: async () => ({ ok: net.selectionOk }) } as unknown as Response
      }
      if (!String(url).includes("/hydrate")) {
        return { ok: true, json: async () => ({ ok: true }) } as unknown as Response
      }
      const payload = net.hydrate ?? { bumps: [], updated_at: null, source: "none" }
      const response = { ok: true, json: async () => payload } as unknown as Response
      if (net.holdHydrate) {
        return new Promise<Response>((resolve) => {
          net.releaseHydrate = () => resolve(response)
        })
      }
      return response
    })
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("useSelectedBumps — persistencia local", () => {
  it("arranca vacío y en SSR devuelve [] sin tocar el almacenamiento", async () => {
    const { useSelectedBumps, readStoredBumps } = await loadStore()

    expect(useSelectedBumps().selectedBumps).toEqual([])
    expect(readStoredBumps()).toEqual([])
    expect(dom.localStorage.getItem(BUMPS_STORAGE_KEY)).toBeNull()
  })

  it("migra la selección legacy de sessionStorage a localStorage (una sola vez)", async () => {
    dom.sessionStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify([BUMP]))
    const { useSelectedBumps } = await loadStore()

    expect(useSelectedBumps().selectedBumps).toEqual([BUMP])
    // Ya vive en el almacenamiento del dispositivo, con timestamp propio
    expect(stored()?.bumps).toEqual([BUMP])
    expect(stored()?.updatedAt).toEqual(expect.any(Number))
    // La clave legacy se descarta para no re-migrar
    expect(dom.sessionStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
  })

  it("no migra una clave legacy vacía ni corrupta", async () => {
    dom.sessionStorage.setItem(LEGACY_STORAGE_KEY, "no-json")
    const { useSelectedBumps } = await loadStore()

    expect(useSelectedBumps().selectedBumps).toEqual([])
    expect(dom.localStorage.getItem(BUMPS_STORAGE_KEY)).toBeNull()
  })

  it("setSelectedBumps persiste en localStorage y se recupera con readStoredBumps", async () => {
    const { useSelectedBumps, setSelectedBumps, readStoredBumps } = await loadStore()

    setSelectedBumps([BUMP])

    expect(useSelectedBumps().selectedBumps).toEqual([BUMP])
    expect(stored()?.bumps).toEqual([BUMP])
    expect(readStoredBumps()).toEqual([BUMP])
  })

  it("acepta un updater sobre la selección actual", async () => {
    const { useSelectedBumps, setSelectedBumps } = await loadStore()

    setSelectedBumps([BUMP])
    setSelectedBumps((prev) => [...prev, OTHER_BUMP])

    expect(useSelectedBumps().selectedBumps).toEqual([BUMP, OTHER_BUMP])
    expect(stored()?.bumps).toEqual([BUMP, OTHER_BUMP])
  })

  it("sobrevive a una recarga: el estado se rehidrata desde localStorage", async () => {
    const first = await loadStore()
    first.setSelectedBumps([BUMP])

    const second = await loadStore()

    expect(second.useSelectedBumps().selectedBumps).toEqual([BUMP])
    expect(second.readStoredBumps()).toEqual([BUMP])
  })

  it("otra pestaña cambió la selección: se adopta sin re-empujarla", async () => {
    const { useSelectedBumps } = await loadStore()
    useSelectedBumps()
    await flush()
    const before = pushes().length

    dom.localStorage.setItem(
      BUMPS_STORAGE_KEY,
      JSON.stringify({ bumps: [OTHER_BUMP], updatedAt: Date.now() })
    )
    dom.emit("storage", { key: BUMPS_STORAGE_KEY })
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)

    expect(useSelectedBumps().selectedBumps).toEqual([OTHER_BUMP])
    expect(pushes()).toHaveLength(before)
  })
})

describe("useSelectedBumps — sincronización con el servidor", () => {
  it("con sesión empuja la selección al servidor (PUT, debounced)", async () => {
    const { useSelectedBumps, setSelectedBumps } = await loadStore()
    useSelectedBumps()
    await flush()
    net.calls = []

    setSelectedBumps([BUMP])
    expect(pushes()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)

    expect(pushes()).toHaveLength(1)
    expect(pushes()[0]!.url).toBe("/api/cart/bumps/selection")
    expect(pushes()[0]!.init.method).toBe("PUT")
    expect(JSON.parse(String(pushes()[0]!.init.body))).toEqual({ bumps: [BUMP] })
  })

  // Cubre el estado de producción mientras la migración 00113 no esté aplicada:
  // el endpoint responde 500 y la selección debe seguir viva en el dispositivo.
  it("un push rechazado por el servidor (500) no rompe la selección local y reintenta al siguiente cambio", async () => {
    net.selectionOk = false
    const { useSelectedBumps, setSelectedBumps } = await loadStore()
    useSelectedBumps()
    await flush()
    net.calls = []

    setSelectedBumps([BUMP])
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)

    expect(pushes()).toHaveLength(1)
    expect(stored()?.bumps).toEqual([BUMP])

    setSelectedBumps([BUMP, OTHER_BUMP])
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)

    expect(pushes()).toHaveLength(2)
    expect(stored()?.bumps).toEqual([BUMP, OTHER_BUMP])
  })

  it("un error de red en el push no rompe la selección local", async () => {
    net.selectionThrows = true
    const { useSelectedBumps, setSelectedBumps } = await loadStore()
    useSelectedBumps()
    await flush()
    net.calls = []

    setSelectedBumps([BUMP])
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)

    expect(pushes()).toHaveLength(1)
    expect(stored()?.bumps).toEqual([BUMP])
  })

  it("sin sesión no empuja ni hidrata (la selección queda local)", async () => {
    auth.session = null
    const { useSelectedBumps, setSelectedBumps } = await loadStore()

    useSelectedBumps()
    await flush()
    setSelectedBumps([BUMP])
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)

    expect(pushes()).toHaveLength(0)
    expect(net.calls.filter((c) => c.url.includes("/hydrate"))).toHaveLength(0)
    expect(stored()?.bumps).toEqual([BUMP])
  })

  it("varios cambios seguidos producen un solo push (debounce)", async () => {
    const { useSelectedBumps, setSelectedBumps } = await loadStore()
    useSelectedBumps()
    await flush()
    net.calls = []

    setSelectedBumps([BUMP])
    setSelectedBumps([BUMP, OTHER_BUMP])
    setSelectedBumps([OTHER_BUMP])
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)

    expect(pushes()).toHaveLength(1)
    expect(JSON.parse(String(pushes()[0]!.init.body))).toEqual({ bumps: [OTHER_BUMP] })
  })

  it("no re-empuja si la selección no cambió respecto al último push", async () => {
    const { useSelectedBumps, setSelectedBumps } = await loadStore()
    useSelectedBumps()
    await flush()
    setSelectedBumps([BUMP])
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
    const before = pushes().length

    // Misma selección en un arreglo nuevo: no hay nada que sincronizar
    setSelectedBumps([{ ...BUMP }])
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)

    expect(pushes()).toHaveLength(before)
  })

  it("flushBumps vuelca el cambio pendiente con keepalive sin esperar el debounce", async () => {
    const { useSelectedBumps, setSelectedBumps, flushBumps } = await loadStore()
    useSelectedBumps()
    await flush()
    net.calls = []

    setSelectedBumps([BUMP])
    flushBumps()

    expect(pushes()).toHaveLength(1)
    expect(pushes()[0]!.init.keepalive).toBe(true)
    // El timer del debounce quedó cancelado: no hay un segundo push
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
    expect(pushes()).toHaveLength(1)
  })

  it("pagehide vuelca la selección pendiente (no se pierde al cerrar la pestaña)", async () => {
    const { useSelectedBumps, setSelectedBumps } = await loadStore()
    useSelectedBumps()
    await flush()
    net.calls = []

    setSelectedBumps([BUMP])
    dom.emit("pagehide")
    await flush()

    expect(pushes()).toHaveLength(1)
    expect(pushes()[0]!.init.keepalive).toBe(true)
  })

  it("visibilitychange oculto también vuelca la selección pendiente", async () => {
    const { useSelectedBumps, setSelectedBumps } = await loadStore()
    useSelectedBumps()
    await flush()
    net.calls = []
    ;(globalThis.document as unknown as { visibilityState: string }).visibilityState = "hidden"

    setSelectedBumps([BUMP])
    dom.emit("visibilitychange")
    await flush()

    expect(pushes()).toHaveLength(1)
  })

  it("adopta la selección del servidor cuando es más reciente", async () => {
    net.hydrate = { bumps: [OTHER_BUMP], updated_at: NEWER, source: "server" }
    const { useSelectedBumps } = await loadStore()

    expect(useSelectedBumps().selectedBumps).toEqual([])
    await flush()

    expect(useSelectedBumps().selectedBumps).toEqual([OTHER_BUMP])
    expect(stored()?.bumps).toEqual([OTHER_BUMP])
  })

  it("un cambio local durante la hidratación no es pisado por la respuesta", async () => {
    net.hydrate = { bumps: [OTHER_BUMP], updated_at: NEWER, source: "server" }
    net.holdHydrate = true
    const { useSelectedBumps, setSelectedBumps } = await loadStore()

    useSelectedBumps()
    await flush()
    expect(net.releaseHydrate).not.toBeNull()

    setSelectedBumps([BUMP])
    net.releaseHydrate?.()
    await flush()

    expect(useSelectedBumps().selectedBumps).toEqual([BUMP])
  })

  it("no adopta un servidor vacío (no borra la selección del dispositivo)", async () => {
    net.hydrate = { bumps: [], updated_at: NEWER, source: "server" }
    const { useSelectedBumps } = await loadStore()

    useSelectedBumps()
    await flush()

    expect(useSelectedBumps().selectedBumps).toEqual([])
  })

  it("resetBumpsStore limpia el estado en memoria sin tocar el dispositivo", async () => {
    const { useSelectedBumps, setSelectedBumps, resetBumpsStore } = await loadStore()

    setSelectedBumps([BUMP])
    resetBumpsStore()

    // El almacenamiento del dispositivo sigue intacto: al re-suscribirse se rehidrata
    expect(useSelectedBumps().selectedBumps).toEqual([BUMP])

    dom.localStorage.clear()
    resetBumpsStore()

    expect(useSelectedBumps().selectedBumps).toEqual([])
  })
})
