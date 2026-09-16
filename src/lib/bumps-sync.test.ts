import { describe, expect, it } from "vitest"
import { mergeBumps, sanitizeStoredBumps } from "./bumps-sync"
import { MAX_STORED_BUMPS } from "@/lib/checkout-config"
import type { SelectedBump } from "@/components/checkout/BumpCards"

function bump(ruleId: number, overrides: Partial<SelectedBump> = {}): SelectedBump {
  return {
    ruleId,
    productId: ruleId * 10,
    quantity: 1,
    unitPrice: 30,
    name: `Oferta ${ruleId}`,
    ...overrides,
  }
}

const LOCAL_TS = Date.parse("2026-09-12T20:00:00Z")
const OLDER = new Date(LOCAL_TS - 60_000).toISOString()
const NEWER = new Date(LOCAL_TS + 60_000).toISOString()

describe("mergeBumps", () => {
  it("sin datos en ninguno de los dos lados → none", () => {
    expect(mergeBumps({ bumps: [], updatedAt: null }, null)).toEqual({ action: "none" })
    expect(
      mergeBumps({ bumps: [], updatedAt: null }, { bumps: [], updated_at: null })
    ).toEqual({ action: "none" })
  })

  it("sin fila en el servidor y selección local → sube el local", () => {
    expect(mergeBumps({ bumps: [bump(1)], updatedAt: LOCAL_TS }, null)).toEqual({
      action: "upload-local",
    })
  })

  it("el local es más reciente → sube el local", () => {
    const decision = mergeBumps(
      { bumps: [bump(1)], updatedAt: LOCAL_TS },
      { bumps: [bump(2)], updated_at: OLDER }
    )

    expect(decision).toEqual({ action: "upload-local" })
  })

  it("el servidor es más reciente → gana el servidor", () => {
    const serverBumps = [bump(2), bump(3)]

    const decision = mergeBumps(
      { bumps: [bump(1)], updatedAt: LOCAL_TS },
      { bumps: serverBumps, updated_at: NEWER }
    )

    expect(decision).toEqual({ action: "use-server", bumps: serverBumps })
  })

  it("empate de timestamps → gana el local (el servidor debe ser ESTRICTAMENTE más nuevo)", () => {
    const decision = mergeBumps(
      { bumps: [bump(1)], updatedAt: LOCAL_TS },
      { bumps: [bump(2)], updated_at: new Date(LOCAL_TS).toISOString() }
    )

    expect(decision).toEqual({ action: "upload-local" })
  })

  it("selección local VACÍA con timestamp más reciente es un estado intencional y se sube", () => {
    // El usuario quitó todas las ofertas: si esto se tratara como "sin datos",
    // entrar desde otro dispositivo las resucitaría.
    const decision = mergeBumps(
      { bumps: [], updatedAt: LOCAL_TS },
      { bumps: [bump(2)], updated_at: OLDER }
    )

    expect(decision).toEqual({ action: "upload-local" })
  })

  it("timestamp del servidor ilegible o ausente → sube el local", () => {
    expect(
      mergeBumps({ bumps: [bump(1)], updatedAt: LOCAL_TS }, { bumps: [], updated_at: "ayer" })
    ).toEqual({ action: "upload-local" })
    expect(
      mergeBumps({ bumps: [bump(1)], updatedAt: LOCAL_TS }, { bumps: [], updated_at: null })
    ).toEqual({ action: "upload-local" })
  })

  it("snapshot legacy sin timestamp (sessionStorage) gana si tiene contenido", () => {
    const decision = mergeBumps(
      { bumps: [bump(1)], updatedAt: null },
      { bumps: [bump(2)], updated_at: NEWER }
    )

    expect(decision).toEqual({ action: "upload-local" })
  })

  it("snapshot legacy vacío sin timestamp → adopta el servidor", () => {
    const serverBumps = [bump(2)]

    const decision = mergeBumps(
      { bumps: [], updatedAt: null },
      { bumps: serverBumps, updated_at: NEWER }
    )

    expect(decision).toEqual({ action: "use-server", bumps: serverBumps })
  })

  it("tolera bumps del servidor con forma inválida (no los propaga)", () => {
    const decision = mergeBumps(
      { bumps: [], updatedAt: null },
      { bumps: "no-array" as unknown as SelectedBump[], updated_at: NEWER }
    )

    expect(decision).toEqual({ action: "none" })
  })
})

describe("sanitizeStoredBumps", () => {
  it("rechaza payloads que no son arreglos", () => {
    expect(sanitizeStoredBumps(undefined)).toBeNull()
    expect(sanitizeStoredBumps(null)).toBeNull()
    expect(sanitizeStoredBumps("[]")).toBeNull()
    expect(sanitizeStoredBumps({ bumps: [] })).toBeNull()
  })

  it("acepta el arreglo vacío (selección limpia)", () => {
    expect(sanitizeStoredBumps([])).toEqual([])
  })

  it("acepta una entrada válida y conserva los campos extra de presentación", () => {
    const entry = bump(1, { imageUrl: "/img/totopos.png", name: "Totopos" })

    expect(sanitizeStoredBumps([entry])).toEqual([entry])
  })

  it("quantity 0 es válido a propósito (el '−' del checkout deja líneas en 0)", () => {
    const entry = bump(1, { quantity: 0 })

    expect(sanitizeStoredBumps([entry])).toEqual([entry])
  })

  it.each([
    ["quantity negativa", { quantity: -1 }],
    ["quantity no entera", { quantity: 1.5 }],
    ["quantity sobre el tope", { quantity: 1000 }],
    ["ruleId 0", { ruleId: 0 }],
    ["ruleId negativo", { ruleId: -3 }],
    ["ruleId no entero", { ruleId: 1.5 }],
    ["productId 0", { productId: 0 }],
    ["unitPrice negativo", { unitPrice: -1 }],
    ["unitPrice no numérico", { unitPrice: "30" as unknown as number }],
    ["name no string", { name: 42 as unknown as string }],
    ["imageUrl no string", { imageUrl: null as unknown as string }],
  ])("rechaza una entrada con %s", (_label, overrides) => {
    expect(sanitizeStoredBumps([bump(1, overrides as Partial<SelectedBump>)])).toBeNull()
  })

  it("rechaza entradas que no son objetos", () => {
    expect(sanitizeStoredBumps([null])).toBeNull()
    expect(sanitizeStoredBumps([[]])).toBeNull()
    expect(sanitizeStoredBumps([7])).toBeNull()
  })

  it("rechaza Infinity y NaN en unitPrice", () => {
    expect(sanitizeStoredBumps([bump(1, { unitPrice: Infinity })])).toBeNull()
    expect(sanitizeStoredBumps([bump(1, { unitPrice: NaN })])).toBeNull()
  })

  it("deduplica por ruleId conservando la primera aparición (evita cobrar dos veces)", () => {
    const first = bump(7, { quantity: 1 })
    const second = bump(7, { quantity: 5, unitPrice: 99 })

    expect(sanitizeStoredBumps([first, second, bump(8)])).toEqual([first, bump(8)])
  })

  it(`rechaza más de ${MAX_STORED_BUMPS} ofertas`, () => {
    const many = Array.from({ length: MAX_STORED_BUMPS + 1 }, (_, i) => bump(i + 1))

    expect(sanitizeStoredBumps(many)).toBeNull()
  })

  it(`acepta exactamente ${MAX_STORED_BUMPS} ofertas`, () => {
    const many = Array.from({ length: MAX_STORED_BUMPS }, (_, i) => bump(i + 1))

    expect(sanitizeStoredBumps(many)).toHaveLength(MAX_STORED_BUMPS)
  })

  it("rechaza un payload serializado por encima del tope anti-abuso", () => {
    expect(sanitizeStoredBumps([bump(1, { name: "x".repeat(300_000) })])).toBeNull()
  })
})
