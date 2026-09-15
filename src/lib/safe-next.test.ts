import { describe, expect, it } from "vitest"
import { safeNextPath } from "./safe-next"

describe("safeNextPath", () => {
  it("acepta rutas internas absolutas", () => {
    expect(safeNextPath("/admin")).toBe("/admin")
    expect(safeNextPath("/admin/usuarios")).toBe("/admin/usuarios")
    expect(safeNextPath("/cuenta/pedidos?tab=activos")).toBe(
      "/cuenta/pedidos?tab=activos"
    )
  })

  it("cae al fallback sin valor", () => {
    expect(safeNextPath(null)).toBe("/")
    expect(safeNextPath(undefined)).toBe("/")
    expect(safeNextPath("")).toBe("/")
    expect(safeNextPath("   ")).toBe("/")
  })

  it("rechaza URLs absolutas y protocol-relative", () => {
    expect(safeNextPath("https://evil.com")).toBe("/")
    expect(safeNextPath("http://evil.com/admin")).toBe("/")
    expect(safeNextPath("//evil.com")).toBe("/")
    expect(safeNextPath("javascript:alert(1)")).toBe("/")
  })

  it("rechaza backslashes y caracteres de control", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/")
    expect(safeNextPath("/admin\nSet-Cookie: x=1")).toBe("/")
  })

  it("evita el bucle login → login", () => {
    expect(safeNextPath("/auth/login")).toBe("/")
    expect(safeNextPath("/auth/login?next=/admin")).toBe("/")
  })

  it("respeta un fallback personalizado", () => {
    expect(safeNextPath("https://evil.com", "/cuenta")).toBe("/cuenta")
    expect(safeNextPath("/admin", "/cuenta")).toBe("/admin")
  })
})
