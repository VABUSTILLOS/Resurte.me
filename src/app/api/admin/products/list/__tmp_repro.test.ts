import { describe, expect, it, vi } from "vitest"
import { readFileSync, writeFileSync } from "node:fs"
import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

const env = readFileSync(".env.local", "utf-8")
const g = (k: string) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"))
  return m ? m[1].replace(/^"|"$/g, "") : ""
}
const url = g("SUPABASE_URL")
const anon = g("SUPABASE_ANON_KEY")

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: async () =>
    createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }),
}))
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: async () => ({ user: { id: "x" }, response: null }),
}))

import { GET } from "./route"

const DEFAULT_QS =
  "q=&category=all&stock=all&status=all&noImage=0&noCities=0&noPrice=0&noCategory=0&waMismatch=0&onSale=0&dupNames=0&trash=0&staleSale=0&underThreshold=0&tag=all&city=all&brand=all&sort=name&dir=asc&page=1&pageSize=50"

describe("repro list route vs real DB", () => {
  it("default load", async () => {
    const res = await GET(new NextRequest(`http://localhost/api/admin/products/list?${DEFAULT_QS}`))
    const body = await res.json()
    writeFileSync(
      "/tmp/repro-out.json",
      JSON.stringify(
        {
          status: res.status,
          keys: Object.keys(body),
          error: body.error,
          total: body.total,
          rows: body.rows?.length,
          drift: body.schemaDrift,
          counts: body.counts,
          brands: body.brands?.length,
          tags: body.tags?.length,
        },
        null,
        2,
      ),
    )
  }, 60_000)
})
