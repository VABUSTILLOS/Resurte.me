import { describe, expect, it } from "vitest"

import {
  POS_DESCRIPTORS,
  POS_DESCRIPTOR_LIST,
  POS_PROVIDERS,
  checkPosCredentials,
  emptyPosConnectionView,
  isPosProvider,
  maskPosCredentials,
  normalizePosCredentials,
  posConnectionView,
  posDescriptor,
  posProvidersWithMenu,
  summarizePos,
  type PosConnectionView,
  type PosSyncEntry,
} from "./registry"

describe("registro de proveedores de POS", () => {
  it("declara los seis proveedores sin repetir", () => {
    expect(POS_PROVIDERS).toHaveLength(6)
    expect(new Set(POS_PROVIDERS).size).toBe(6)
    expect(POS_DESCRIPTOR_LIST).toHaveLength(6)
  })

  it("cada descriptor apunta a su propia clave", () => {
    for (const provider of POS_PROVIDERS) {
      expect(POS_DESCRIPTORS[provider].provider).toBe(provider)
      expect(POS_DESCRIPTORS[provider].label.length).toBeGreaterThan(0)
      expect(POS_DESCRIPTORS[provider].docsUrl.startsWith("https://")).toBe(true)
    }
  })

  it("ningún adaptador se declara implementado todavía", () => {
    for (const descriptor of POS_DESCRIPTOR_LIST) {
      expect(descriptor.implemented).toBe(false)
      expect(descriptor.pendingNote.length).toBeGreaterThan(10)
    }
  })

  it("todo descriptor pide al menos una credencial obligatoria", () => {
    for (const descriptor of POS_DESCRIPTOR_LIST) {
      const required = descriptor.credentials.filter((f) => f.required)
      expect(required.length).toBeGreaterThan(0)
    }
  })

  it("no repite claves de credencial dentro de un descriptor", () => {
    for (const descriptor of POS_DESCRIPTOR_LIST) {
      const keys = descriptor.credentials.map((f) => f.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it("solo los proveedores que exportan catálogo tienen capability menu", () => {
    expect(posProvidersWithMenu().map((d) => d.provider)).toEqual([
      "soft_restaurant",
      "parrot",
      "toast",
    ])
  })

  it("los procesadores de pago no declaran catálogo", () => {
    expect(POS_DESCRIPTORS.clip.capabilities.menu).toBe(false)
    expect(POS_DESCRIPTORS.mercado_pago.capabilities.menu).toBe(false)
  })

  it("reconoce solo proveedores declarados", () => {
    expect(isPosProvider("toast")).toBe(true)
    expect(isPosProvider("square")).toBe(false)
    expect(isPosProvider(null)).toBe(false)
    expect(isPosProvider(42)).toBe(false)
  })

  it("posDescriptor devuelve el descriptor pedido", () => {
    expect(posDescriptor("parrot").label).toBe("Parrot")
  })
})

describe("checkPosCredentials", () => {
  it("exige todos los campos obligatorios", () => {
    const check = checkPosCredentials("soft_restaurant", {})
    expect(check.ok).toBe(false)
    expect(check.missing).toEqual(["apiKey", "locationId"])
  })

  it("trata el espacio en blanco como vacío", () => {
    const check = checkPosCredentials("parrot", { token: "   ", locationId: "" })
    expect(check.ok).toBe(false)
    expect(check.missing).toEqual(["token", "locationId"])
  })

  it("acepta un juego completo", () => {
    const check = checkPosCredentials("toast", {
      apiKey: "cid",
      apiSecret: "csecret",
      locationId: "guid",
    })
    expect(check.ok).toBe(true)
    expect(check.missing).toEqual([])
  })

  it("reporta las claves que el descriptor no declara", () => {
    const check = checkPosCredentials("clip", {
      apiKey: "k",
      apiSecret: "s",
      extra: "x",
    })
    expect(check.ok).toBe(true)
    expect(check.unknown).toEqual(["extra"])
  })

  it("no lanza sin argumentos", () => {
    expect(() => checkPosCredentials("clip", null)).not.toThrow()
    expect(checkPosCredentials("clip", undefined).missing).toEqual(["apiKey", "apiSecret"])
  })
})

describe("normalizePosCredentials", () => {
  it("recorta y descarta lo vacío", () => {
    expect(normalizePosCredentials("clip", { apiKey: " k ", apiSecret: "   " })).toEqual({
      apiKey: "k",
    })
  })

  it("descarta claves ajenas al descriptor", () => {
    const out = normalizePosCredentials("mercado_pago", {
      token: "t",
      locationId: "l",
      inyectado: "x",
    })
    expect(out).toEqual({ token: "t", locationId: "l" })
    expect("inyectado" in out).toBe(false)
  })

  it("ignora valores que no son texto", () => {
    const out = normalizePosCredentials("clip", { apiKey: 42 } as never)
    expect(out).toEqual({})
  })
})

describe("maskPosCredentials", () => {
  it("deja ver los últimos cuatro caracteres de un secreto", () => {
    const out = maskPosCredentials("clip", { apiKey: "abcdefghijkl", apiSecret: "x" })
    expect(out.apiKey).toBe("••••ijkl")
    expect(out.apiSecret).toBe("••••")
  })

  it("no oculta los campos no secretos", () => {
    const out = maskPosCredentials("parrot", { token: "secreto-largo-1234", locationId: "SUC-9" })
    expect(out.locationId).toBe("SUC-9")
    expect(out.token).not.toContain("secreto")
  })

  it("no inventa campos ausentes", () => {
    expect(maskPosCredentials("clip", {})).toEqual({})
  })
})

describe("posConnectionView", () => {
  const base = {
    status: "connected" as const,
    credentials: { apiKey: "k", apiSecret: "s" },
    hasWebhookSecret: false,
    lastSyncAt: null,
    lastError: null,
  }

  it("un adaptador sin implementar nunca está listo", () => {
    const view = posConnectionView({ ...base, provider: "toast" })
    expect(view.health).toBe("pending")
    expect(view.status).toBe("connected")
  })

  it("no ofrece URL de webhook mientras el adaptador no exista", () => {
    const view = posConnectionView(
      { ...base, provider: "toast", hasWebhookSecret: true },
      { origin: "https://resurte.me" }
    )
    expect(view.webhookUrl).toBeNull()
  })

  it("no ofrece URL de webhook sin secreto para verificar la firma", () => {
    const view = posConnectionView(
      { ...base, provider: "toast", hasWebhookSecret: false },
      { origin: "https://resurte.me" }
    )
    expect(view.webhookUrl).toBeNull()
  })

  it("reporta si la conexión ya tiene secreto de webhook", () => {
    const view = posConnectionView({ ...base, provider: "clip", hasWebhookSecret: true })
    expect(view.hasWebhookSecret).toBe(true)
  })

  it("enumera los campos obligatorios que faltan", () => {
    const view = posConnectionView({
      ...base,
      provider: "ncr_aloha",
      credentials: { apiKey: "k" },
    })
    expect(view.missingFields).toEqual(["apiSecret", "locationId"])
  })

  it("enmascara las credenciales guardadas", () => {
    const view = posConnectionView({ ...base, provider: "clip" })
    expect(view.credentials.apiKey).toBe("••••")
  })

  it("propaga el último error y la última sincronización", () => {
    const view = posConnectionView({
      ...base,
      provider: "toast",
      lastError: "401 del proveedor",
      lastSyncAt: "2026-02-01T10:00:00.000Z",
      externalLocationId: "loc-1",
    })
    expect(view.lastError).toBe("401 del proveedor")
    expect(view.lastSyncAt).toBe("2026-02-01T10:00:00.000Z")
    expect(view.externalLocationId).toBe("loc-1")
  })

  it("expone el descriptor para que el panel no lo duplique", () => {
    const view = posConnectionView({ ...base, provider: "soft_restaurant" })
    expect(view.descriptor.label).toBe("Soft Restaurant")
  })

  it("sin origen no construye URL", () => {
    const view = posConnectionView({ ...base, provider: "toast" }, { origin: "" })
    expect(view.webhookUrl).toBeNull()
  })
})

describe("emptyPosConnectionView", () => {
  it("nace desconectada y en preparación", () => {
    const view = emptyPosConnectionView("parrot")
    expect(view.status).toBe("disconnected")
    expect(view.health).toBe("pending")
    expect(view.missingFields).toEqual(["token", "locationId"])
    expect(view.credentials).toEqual({})
  })
})

describe("summarizePos", () => {
  const now = new Date("2026-02-10T12:00:00.000Z")

  function view(provider: "toast" | "clip", over: Partial<PosConnectionView> = {}) {
    return { ...emptyPosConnectionView(provider), ...over } as PosConnectionView
  }

  function entry(over: Partial<PosSyncEntry> = {}): PosSyncEntry {
    return {
      id: "e1",
      provider: "toast",
      kind: "menu",
      status: "ok",
      itemsCount: 0,
      detail: null,
      createdAt: "2026-02-09T12:00:00.000Z",
      ...over,
    }
  }

  it("devuelve ceros sin conexiones", () => {
    expect(summarizePos([], [], now)).toEqual({
      total: 0,
      ready: 0,
      pending: 0,
      withError: 0,
      lastSyncAt: null,
      failedSyncs7d: 0,
    })
  })

  it("cuenta las conexiones por salud", () => {
    const kpis = summarizePos(
      [
        view("toast", { health: "pending" }),
        view("clip", { health: "error" }),
        view("toast", { health: "ready" }),
      ],
      [],
      now
    )
    expect(kpis.total).toBe(3)
    expect(kpis.pending).toBe(1)
    expect(kpis.withError).toBe(1)
    expect(kpis.ready).toBe(1)
  })

  it("toma la sincronización más reciente", () => {
    const kpis = summarizePos(
      [
        view("toast", { lastSyncAt: "2026-02-01T10:00:00.000Z" }),
        view("clip", { lastSyncAt: "2026-02-08T10:00:00.000Z" }),
      ],
      [],
      now
    )
    expect(kpis.lastSyncAt).toBe("2026-02-08T10:00:00.000Z")
  })

  it("ignora fechas inválidas al buscar la más reciente", () => {
    const kpis = summarizePos(
      [view("toast", { lastSyncAt: "no-es-fecha" }), view("clip", { lastSyncAt: null })],
      [],
      now
    )
    expect(kpis.lastSyncAt).toBeNull()
  })

  it("cuenta solo los fallos de los últimos 7 días", () => {
    const kpis = summarizePos(
      [],
      [
        entry({ id: "a", status: "failed", createdAt: "2026-02-09T12:00:00.000Z" }),
        entry({ id: "b", status: "failed", createdAt: "2026-01-01T12:00:00.000Z" }),
        entry({ id: "c", status: "ok", createdAt: "2026-02-09T12:00:00.000Z" }),
      ],
      now
    )
    expect(kpis.failedSyncs7d).toBe(1)
  })
})
