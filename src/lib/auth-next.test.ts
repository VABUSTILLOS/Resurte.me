import { describe, expect, it } from "vitest"
import { clearNextCookie, NEXT_COOKIE, readNextPath } from "./auth-next"

describe("readNextPath", () => {
  it("lee el destino de la cabecera Cookie", () => {
    expect(readNextPath(`${NEXT_COOKIE}=%2Fadmin`)).toBe("/admin")
    expect(readNextPath(`otra=1; ${NEXT_COOKIE}=%2Fadmin%2Fusuarios`)).toBe(
      "/admin/usuarios"
    )
    expect(readNextPath(`${NEXT_COOKIE}=%2Fcuenta%3Ftab%3Dactivos`)).toBe(
      "/cuenta?tab=activos"
    )
  })

  it("devuelve null cuando no hay cookie o cabecera", () => {
    expect(readNextPath(null)).toBeNull()
    expect(readNextPath(undefined)).toBeNull()
    expect(readNextPath("")).toBeNull()
    expect(readNextPath("otra=1; sesion=abc")).toBeNull()
  })

  it("ignora entradas malformadas sin lanzar", () => {
    expect(readNextPath("sinigual")).toBeNull()
    expect(readNextPath(`${NEXT_COOKIE}=`)).toBe("")
    expect(readNextPath(`${NEXT_COOKIE}=%E0%A4%A`)).toBeNull()
  })

  it("no confunde cookies con prefijo parecido", () => {
    expect(readNextPath(`${NEXT_COOKIE}_otra=%2Fadmin`)).toBeNull()
  })
})

describe("clearNextCookie", () => {
  it("expira la cookie en la raíz", () => {
    expect(clearNextCookie()).toBe(`${NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`)
  })
})
