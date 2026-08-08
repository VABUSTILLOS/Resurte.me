import { describe, expect, it, vi } from "vitest"
import type { PostgrestError } from "@supabase/supabase-js"
import {
  insertAddressResilient,
  type AddressInsertInput,
  type ServiceClient,
} from "@/lib/orders-address"

const BASE: AddressInsertInput = {
  user_id: null,
  guest_token: "gt-abc",
  label: "Casa",
  street: "Av. Reforma",
  number: "123",
  interior: null,
  neighborhood: "Juárez",
  city: "Ciudad de México",
  state: "CDMX",
  zip_code: "06600",
  references: null,
  city_id: null,
}

function postgrestError(code: string, message: string): PostgrestError {
  return {
    code,
    message,
    details: "",
    hint: "",
  }
}

interface MockOpts {
  /** Errores que el insert debe devolver, en orden. null => éxito. */
  insertErrors?: (PostgrestError | null)[]
}

function makeSupabase(opts: MockOpts = {}) {
  const { insertErrors = [null] } = opts
  const insertedPayloads: Record<string, unknown>[] = []
  let attempt = 0

  const insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    const err = insertErrors[Math.min(attempt, insertErrors.length - 1)] ?? null
    attempt += 1
    if (!err) insertedPayloads.push(payload)
    return {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(
          err ? { data: null, error: err } : { data: { id: 77 }, error: null }
        ),
      }),
    }
  })

  return {
    from: vi.fn().mockReturnValue({
      insert,
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    insertedPayloads,
    insert,
  }
}

describe("insertAddressResilient", () => {
  it("inserta con city_id cuando el esquema la soporta", async () => {
    const supabase = makeSupabase()
    const result = await insertAddressResilient(supabase as unknown as ServiceClient, {
      ...BASE,
      user_id: "u1",
      city_id: 42,
    })

    expect(result.error).toBeNull()
    expect(result.data).toEqual({ id: 77 })
    expect(supabase.insertedPayloads).toHaveLength(1)
    expect(supabase.insertedPayloads[0]).toMatchObject({
      user_id: "u1",
      city_id: 42,
    })
    expect(supabase.insert).toHaveBeenCalledTimes(1)
  })

  it("reintenta sin city_id cuando la columna no existe (42703)", async () => {
    const supabase = makeSupabase({
      insertErrors: [
        postgrestError("42703", 'column "city_id" of relation "addresses" does not exist'),
        null,
      ],
    })

    const result = await insertAddressResilient(supabase as unknown as ServiceClient, {
      ...BASE,
      user_id: "u1",
      city_id: 42,
    })

    expect(result.error).toBeNull()
    expect(result.data).toEqual({ id: 77 })
    expect(supabase.insert).toHaveBeenCalledTimes(2)
    // El reintento NO incluye city_id.
    expect(supabase.insertedPayloads).toHaveLength(1)
    expect(supabase.insertedPayloads[0].city_id).toBeUndefined()
    expect(supabase.insertedPayloads[0].street).toBe("Av. Reforma")
  })

  it("reintenta cuando PostgREST reporta schema cache (PGRST205)", async () => {
    const supabase = makeSupabase({
      insertErrors: [
        postgrestError(
          "PGRST205",
          "Could not find the 'city_id' column of 'addresses' in the schema cache"
        ),
        null,
      ],
    })

    const result = await insertAddressResilient(supabase as unknown as ServiceClient, {
      ...BASE,
      city_id: 7,
    })

    expect(result.error).toBeNull()
    expect(result.data).toEqual({ id: 77 })
    expect(supabase.insert).toHaveBeenCalledTimes(2)
    expect(supabase.insertedPayloads[0].city_id).toBeUndefined()
  })

  it("omite city_id desde el inicio para checkout anónimo (city_id null)", async () => {
    const supabase = makeSupabase()
    const result = await insertAddressResilient(supabase as unknown as ServiceClient, BASE)

    expect(result.error).toBeNull()
    expect(supabase.insert).toHaveBeenCalledTimes(1)
    expect(supabase.insertedPayloads[0].city_id).toBeUndefined()
    expect(supabase.insertedPayloads[0].user_id).toBeNull()
    expect(supabase.insertedPayloads[0].guest_token).toBe("gt-abc")
  })

  it("NO reintenta si el error es real (p. ej. NOT NULL) y lo devuelve", async () => {
    const notNull = postgrestError(
      "23502",
      'null value in column "street" of relation "addresses" violates not-null constraint'
    )
    const supabase = makeSupabase({ insertErrors: [notNull] })

    const result = await insertAddressResilient(supabase as unknown as ServiceClient, BASE)

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe("23502")
    expect(supabase.insert).toHaveBeenCalledTimes(1)
  })

  it("devuelve el error real del reintento si ambos intentos fallan", async () => {
    const schemaErr = postgrestError("42703", 'column "city_id" does not exist')
    const rlsErr = postgrestError("42501", "new row violates row-level security policy")
    const supabase = makeSupabase({ insertErrors: [schemaErr, rlsErr] })

    const result = await insertAddressResilient(supabase as unknown as ServiceClient, {
      ...BASE,
      city_id: 5,
    })

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe("42501")
    expect(supabase.insert).toHaveBeenCalledTimes(2)
  })

  it("usa 'Casa' como label cuando no se provee", async () => {
    const supabase = makeSupabase()
    const sinLabel: AddressInsertInput = { ...BASE }
    delete sinLabel.label
    await insertAddressResilient(supabase as unknown as ServiceClient, sinLabel)

    expect(supabase.insertedPayloads[0].label).toBe("Casa")
  })
})
