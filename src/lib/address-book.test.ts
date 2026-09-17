import { describe, expect, it } from "vitest"
import type { Address } from "@/types"
import {
  addressesMatch,
  addressLabel,
  addressSummary,
  pickPreferredAddress,
  sanitizeGuestToken,
  toAddressForm,
  GUEST_ADDRESS_LIMIT,
} from "@/lib/address-book"

function address(overrides: Partial<Address> = {}): Address {
  return {
    id: 1,
    user_id: null,
    guest_token: "11111111-1111-4111-8111-111111111111",
    label: "Casa",
    street: "Av. Siempre Viva",
    number: "123",
    interior: null,
    neighborhood: "Centro",
    city: "CDMX",
    state: "CDMX",
    zip_code: "06000",
    references: "",
    is_default: false,
    city_id: 3,
    lat: 0,
    lng: 0,
    last_used_at: null,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

const FORM = {
  label: "Casa",
  street: "Av. Siempre Viva",
  number: "123",
  interior: "",
  neighborhood: "Centro",
  zip_code: "06000",
  references: "",
}

describe("sanitizeGuestToken", () => {
  it("acepta un UUID del navegador y normaliza espacios", () => {
    expect(sanitizeGuestToken("  11111111-1111-4111-8111-111111111111 ")).toBe(
      "11111111-1111-4111-8111-111111111111"
    )
  })

  it("rechaza cualquier cosa que no sea un UUID", () => {
    expect(sanitizeGuestToken(undefined)).toBeNull()
    expect(sanitizeGuestToken(null)).toBeNull()
    expect(sanitizeGuestToken("")).toBeNull()
    expect(sanitizeGuestToken(["a", "b"])).toBeNull()
    expect(sanitizeGuestToken("' OR 1=1 --")).toBeNull()
    expect(sanitizeGuestToken("11111111-1111-4111-8111-11111111111")).toBeNull()
  })
})

describe("pickPreferredAddress", () => {
  it("sin direcciones devuelve null", () => {
    expect(pickPreferredAddress([])).toBeNull()
  })

  it("prioriza la predeterminada sobre la más reciente", () => {
    const older = address({ id: 1, is_default: true, last_used_at: "2026-01-01T00:00:00Z" })
    const newer = address({ id: 2, is_default: false, last_used_at: "2026-06-01T00:00:00Z" })
    expect(pickPreferredAddress([newer, older])?.id).toBe(1)
  })

  it("sin predeterminada usa la de último uso (last_used_at)", () => {
    const old = address({ id: 1, last_used_at: "2026-01-01T00:00:00Z" })
    const recent = address({ id: 2, last_used_at: "2026-06-01T00:00:00Z" })
    expect(pickPreferredAddress([old, recent])?.id).toBe(2)
  })

  it("sin last_used_at (esquema previo a 00117) cae a created_at", () => {
    const old = address({ id: 1, created_at: "2026-01-01T00:00:00Z" })
    const recent = address({ id: 2, created_at: "2026-06-01T00:00:00Z" })
    expect(pickPreferredAddress([recent, old])?.id).toBe(2)
  })

  it("una sola dirección se devuelve siempre", () => {
    expect(pickPreferredAddress([address({ id: 9 })])?.id).toBe(9)
  })
})

describe("addressesMatch", () => {
  it("coincide cuando el formulario no se editó (interior y referencias vacíos)", () => {
    expect(addressesMatch(address(), FORM)).toBe(true)
  })

  it("ignora el label: renombrar no crea una dirección nueva", () => {
    expect(addressesMatch(address({ label: "Oficina" }), FORM)).toBe(true)
  })

  it("detecta cambios en la calle, el número o el CP", () => {
    expect(addressesMatch(address(), { ...FORM, street: "Otra" })).toBe(false)
    expect(addressesMatch(address(), { ...FORM, number: "456" })).toBe(false)
    expect(addressesMatch(address(), { ...FORM, zip_code: "06100" })).toBe(false)
  })

  it("trata null y cadena vacía como equivalentes (columnas nullables)", () => {
    expect(addressesMatch(address({ interior: null }), FORM)).toBe(true)
    expect(addressesMatch(address({ interior: "2", references: "portón azul" }), FORM)).toBe(false)
    expect(
      addressesMatch(address({ interior: "2", references: "portón azul" }), {
        ...FORM,
        interior: "2",
        references: "portón azul",
      })
    ).toBe(true)
  })
})

describe("toAddressForm", () => {
  it("convierte nullables a cadena vacía", () => {
    expect(toAddressForm(address({ interior: null }))).toEqual(FORM)
    // `references` es nullable en la base (00001) aunque el tipo compartido lo
    // declare string: el mapeo debe tolerar NULL igual que `interior`.
    expect(toAddressForm({ interior: null, references: null })).toMatchObject({
      interior: "",
      references: "",
    })
  })

  it("conserva los valores presentes", () => {
    expect(toAddressForm(address({ interior: "2", references: "portón azul" }))).toMatchObject({
      interior: "2",
      references: "portón azul",
    })
  })
})

describe("etiquetas del selector", () => {
  it("addressLabel nunca queda vacía", () => {
    expect(addressLabel(address({ label: "Oficina" }))).toBe("Oficina")
    expect(addressLabel(address({ label: "   " }))).toBe("Dirección")
  })

  it("addressSummary incluye interior solo si existe", () => {
    expect(addressSummary(address())).toBe("Av. Siempre Viva 123, Centro")
    expect(addressSummary(address({ interior: "2" }))).toBe("Av. Siempre Viva 123 int. 2, Centro")
  })
})

describe("GUEST_ADDRESS_LIMIT", () => {
  it("acota la lista anónima del checkout", () => {
    expect(GUEST_ADDRESS_LIMIT).toBeGreaterThan(0)
  })
})
