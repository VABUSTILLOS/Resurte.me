import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  applyRemoteEntry,
  clearConflicts,
  getEntryVersion,
  getPanelSyncSnapshot,
  markConflict,
  markSaved,
  markSaving,
  markSyncError,
  matchesLastPush,
  noteEntryVersion,
  notePushed,
  registerSyncKey,
  retryPendingSyncs,
  subscribePanelSync,
  _resetPanelSyncForTests,
} from "./panel-sync"

// localStorage stub para entorno node
const store = new Map<string, string>()
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}

vi.stubGlobal("localStorage", localStorageStub)
vi.stubGlobal("window", {
  dispatchEvent: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})

vi.mock("@/lib/guest-address", () => ({
  ensureGuestToken: () => "guest-token-test",
}))

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

beforeEach(() => {
  store.clear()
  fetchMock.mockReset()
  _resetPanelSyncForTests()
})

describe("panel-sync status store", () => {
  it("aggregates error > saving > saved > idle", () => {
    markSaving("agg-a:default")
    expect(getPanelSyncSnapshot().status).toBe("saving")
    markSaved("agg-a:default")
    expect(getPanelSyncSnapshot().status).toBe("saved")
    markSyncError("agg-b:default")
    expect(getPanelSyncSnapshot().status).toBe("error")
  })

  it("notifies subscribers on state changes", () => {
    const listener = vi.fn()
    const unsub = subscribePanelSync(listener)
    markSaving("sub-a:default")
    markSaved("sub-a:default")
    expect(listener).toHaveBeenCalled()
    unsub()
  })

  it("records lastSavedAt on save", () => {
    markSaved("ts-a:default")
    expect(typeof getPanelSyncSnapshot().lastSavedAt).toBe("number")
  })
})

describe("matchesLastPush (prevención de loops)", () => {
  it("reconoce el eco de un push propio reciente", () => {
    notePushed("echo-tool:default", [{ id: 1 }])
    expect(matchesLastPush("echo-tool:default", [{ id: 1 }])).toBe(true)
  })

  it("no reconoce valores distintos ni claves ajenas", () => {
    notePushed("echo-tool:default", [{ id: 1 }])
    expect(matchesLastPush("echo-tool:default", [{ id: 2 }])).toBe(false)
    expect(matchesLastPush("otra-tool:default", [{ id: 1 }])).toBe(false)
  })
})

describe("retryPendingSyncs", () => {
  it("reintenta solo las claves en error con su valor local actual", async () => {
    registerSyncKey("test-entries:default", {
      key: "test-entries",
      collection: "default",
      collectionSlug: null,
    })
    store.set("resurte-test-entries", JSON.stringify([{ id: "v1" }]))
    markSyncError("test-entries:default")
    fetchMock.mockResolvedValue({ ok: true })

    retryPendingSyncs()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("/api/panel/entries")
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toMatchObject({
      tool: "test-entries",
      collection_slug: "default",
      value: [{ id: "v1" }],
    })
    await vi.waitFor(() => {
      expect(getPanelSyncSnapshot().status).not.toBe("error")
    })
  })

  it("marca error de nuevo si el reintento falla", async () => {
    registerSyncKey("test2-entries:default", {
      key: "test2-entries",
      collection: "default",
      collectionSlug: null,
    })
    store.set("resurte-test2-entries", JSON.stringify([]))
    markSyncError("test2-entries:default")
    fetchMock.mockRejectedValue(new Error("offline"))

    retryPendingSyncs()
    await vi.waitFor(() => {
      expect(getPanelSyncSnapshot().status).toBe("error")
    })
  })
})

describe("applyRemoteEntry", () => {
  it("escribe en localStorage y notifica a los hooks", () => {
    registerSyncKey("remote-tool:taquerias", {
      key: "remote-tool",
      collection: "taquerias",
      collectionSlug: "taquerias",
    })
    const applied = applyRemoteEntry("remote-tool", "taquerias", { mesas: [] })
    expect(applied).toBe(true)
    expect(store.get("resurte-remote-tool-taquerias")).toBe(JSON.stringify({ mesas: [] }))
    expect(window.dispatchEvent).toHaveBeenCalled()
  })

  it("ignora el eco de un push propio", () => {
    notePushed("remote-tool:default", [{ id: 9 }])
    expect(applyRemoteEntry("remote-tool", "default", [{ id: 9 }])).toBe(false)
  })
})

describe("conflictos (E.2)", () => {
  it("markConflict deja el estado en conflicto y guarda el tipo", () => {
    markConflict("cf-a:default", "merged")
    expect(getPanelSyncSnapshot().status).toBe("conflict")
    expect(getPanelSyncSnapshot().conflict).toBe("merged")
  })

  it("el conflicto gana a saved pero pierde ante saving y error", () => {
    // Claves distintas a propósito: la prioridad es del agregado, no de una
    // clave que cambia de estado.
    markSaved("cf-saved:default")
    markConflict("cf-conf:default", "merged")
    expect(getPanelSyncSnapshot().status).toBe("conflict")

    markSaving("cf-saving:default")
    expect(getPanelSyncSnapshot().status).toBe("saving")

    markSyncError("cf-error:default")
    expect(getPanelSyncSnapshot().status).toBe("error")
  })

  it("kept-local gana a merged en el agregado: es el aviso que más importa", () => {
    markConflict("cf-e:default", "merged")
    markConflict("cf-f:default", "kept-local")
    expect(getPanelSyncSnapshot().status).toBe("conflict")
    expect(getPanelSyncSnapshot().conflict).toBe("kept-local")

    markSaved("cf-f:default")
    expect(getPanelSyncSnapshot().conflict).toBe("merged")

    // Y en el orden inverso también: no depende de qué clave se visitó antes.
    _resetPanelSyncForTests()
    markConflict("cf-m:default", "kept-local")
    markConflict("cf-n:default", "merged")
    expect(getPanelSyncSnapshot().conflict).toBe("kept-local")
  })

  it("después de guardar o de fallar, el agregado ya no anuncia conflicto", () => {
    markConflict("cf-g:default", "kept-local")
    markSaved("cf-g:default")
    expect(getPanelSyncSnapshot().status).toBe("saved")
    expect(getPanelSyncSnapshot().conflict).toBeNull()

    markConflict("cf-h:default", "kept-local")
    markSyncError("cf-h:default")
    expect(getPanelSyncSnapshot().status).toBe("error")
    expect(getPanelSyncSnapshot().conflict).toBeNull()
  })

  it("el tipo de conflicto nunca sobrevive fuera del estado conflicto", () => {
    // Dos claves a propósito: una en conflicto y otra guardando. El agregado
    // es `saving`, así que no hay nada que anunciar al usuario.
    markConflict("cf-i:default", "kept-local")
    markSaving("cf-i-saving:default")
    expect(getPanelSyncSnapshot().status).toBe("saving")
    expect(getPanelSyncSnapshot().conflict).toBeNull()

    // Y con la clave que guarda registrada primero.
    _resetPanelSyncForTests()
    markSaving("cf-j-saving:default")
    markConflict("cf-j:default", "merged")
    expect(getPanelSyncSnapshot().status).toBe("saving")
    expect(getPanelSyncSnapshot().conflict).toBeNull()
  })

  it("clearConflicts saca la clave del agregado sin afirmar que se guardó", () => {
    markConflict("cf-j:default", "kept-local")
    expect(getPanelSyncSnapshot().status).toBe("conflict")
    clearConflicts()
    expect(getPanelSyncSnapshot().status).toBe("idle")
    expect(getPanelSyncSnapshot().conflict).toBeNull()
  })

  it("clearConflicts no toca las claves en error", () => {
    markSyncError("cf-k:default")
    markConflict("cf-l:default", "merged")
    clearConflicts()
    expect(getPanelSyncSnapshot().status).toBe("error")
  })
})

describe("versión de entrada (base_updated_at)", () => {
  it("es null hasta que se conoce y luego devuelve lo guardado", () => {
    expect(getEntryVersion("ver-a:default")).toBeNull()
    noteEntryVersion("ver-a:default", "2026-01-01T00:00:00+00:00")
    expect(getEntryVersion("ver-a:default")).toBe("2026-01-01T00:00:00+00:00")
  })

  it("_resetPanelSyncForTests la olvida", () => {
    noteEntryVersion("ver-b:default", "2026-01-01T00:00:00+00:00")
    _resetPanelSyncForTests()
    expect(getEntryVersion("ver-b:default")).toBeNull()
  })

  it("retryPendingSyncs la manda como base y no la inventa si no la tiene", () => {
    registerSyncKey("ver-c:default", {
      key: "ver-c",
      collection: "default",
      collectionSlug: null,
    })
    store.set("resurte-ver-c", JSON.stringify([]))
    noteEntryVersion("ver-c:default", "2026-03-04T05:06:07.123456+00:00")
    markSyncError("ver-c:default")
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    retryPendingSyncs()
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string).base_updated_at).toBe(
      "2026-03-04T05:06:07.123456+00:00",
    )

    registerSyncKey("ver-d:default", {
      key: "ver-d",
      collection: "default",
      collectionSlug: null,
    })
    store.set("resurte-ver-d", JSON.stringify([]))
    markSyncError("ver-d:default")
    retryPendingSyncs()
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body as string).base_updated_at).toBeNull()
  })

  it("guarda la versión que devuelve un push exitoso", async () => {
    registerSyncKey("ver-e:default", {
      key: "ver-e",
      collection: "default",
      collectionSlug: null,
    })
    store.set("resurte-ver-e", JSON.stringify([]))
    markSyncError("ver-e:default")
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ saved: true, updated_at: "2026-05-05T05:05:05+00:00" }),
    })

    retryPendingSyncs()
    await vi.waitFor(() => {
      expect(getEntryVersion("ver-e:default")).toBe("2026-05-05T05:05:05+00:00")
    })
    expect(getPanelSyncSnapshot().status).not.toBe("error")
  })
})

describe("retryPendingSyncs sobre conflictos", () => {
  function registrar(id: string, tool: string) {
    registerSyncKey(id, { key: tool, collection: "default", collectionSlug: null })
    store.set(`resurte-${tool}`, JSON.stringify([{ id: "local" }]))
  }

  it("reintenta también las claves en conflicto", async () => {
    registrar("rt-a:default", "rt-a")
    markConflict("rt-a:default", "kept-local")
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ saved: true, updated_at: "2026-06-06T06:06:06+00:00" }),
    })

    retryPendingSyncs()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(getPanelSyncSnapshot().status).toBe("saved")
    })
  })

  it("un 409 en el reintento vuelve a marcar el conflicto, no un error", async () => {
    registrar("rt-b:default", "rt-b")
    markConflict("rt-b:default", "kept-local")
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        conflict: true,
        value: [{ id: "servidor" }],
        updated_at: "2026-07-07T07:07:07+00:00",
      }),
    })

    retryPendingSyncs()
    await vi.waitFor(() => {
      expect(getPanelSyncSnapshot().status).toBe("conflict")
    })
    // El 409 trae la versión vigente: es la base correcta para el próximo intento.
    expect(getEntryVersion("rt-b:default")).toBe("2026-07-07T07:07:07+00:00")
  })

  it("no reintenta las claves que están en saving o saved", () => {
    registrar("rt-c:default", "rt-c")
    markSaving("rt-c:default")
    registrar("rt-d:default", "rt-d")
    markSaved("rt-d:default")
    retryPendingSyncs()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
