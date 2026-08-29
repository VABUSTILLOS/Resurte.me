import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  applyRemoteEntry,
  getPanelSyncSnapshot,
  markSaved,
  markSaving,
  markSyncError,
  matchesLastPush,
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
