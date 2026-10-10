import { afterEach, describe, expect, it, vi } from "vitest"
import { formatClabe, getSpeiAccount } from "./spei-account"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getSpeiAccount", () => {
  it("devuelve la cuenta real aunque no haya variables de entorno", () => {
    // El default vive en el repo a propósito: sin él, el checkout no puede
    // cobrar por transferencia (era el estado anterior: cero pedidos SPEI).
    const account = getSpeiAccount()
    expect(account.clabe).toBe("014150606044477078")
    expect(account.banco).toBe("SANTANDER SUPERCUENTA CHEQUES")
    expect(account.beneficiario).toBe("Victor Alberto Bustillos Tena")
    expect(account.cuenta).toBe("60-60444770-7")
  })

  it("la CLABE por defecto tiene 18 dígitos", () => {
    expect(getSpeiAccount().clabe).toMatch(/^\d{18}$/)
  })

  it("las variables de entorno sobreescriben los datos", () => {
    vi.stubEnv("NEXT_PUBLIC_SPEI_CLABE", "000000000000000000")
    vi.stubEnv("NEXT_PUBLIC_SPEI_BENEFICIARIO", "Otra Empresa SA")
    vi.stubEnv("NEXT_PUBLIC_SPEI_BANCO", "BBVA")

    const account = getSpeiAccount()
    expect(account.clabe).toBe("000000000000000000")
    expect(account.beneficiario).toBe("Otra Empresa SA")
    expect(account.banco).toBe("BBVA")
  })

  it("una variable vacía o en blanco no pisa el default", () => {
    vi.stubEnv("NEXT_PUBLIC_SPEI_CLABE", "   ")
    expect(getSpeiAccount().clabe).toBe("014150606044477078")
  })
})

describe("formatClabe", () => {
  it("agrupa la CLABE de 18 dígitos en bloques de 4", () => {
    expect(formatClabe("014150606044477078")).toBe("0141 5060 6044 4770 78")
  })

  it("devuelve la cadena tal cual si no tiene 18 dígitos", () => {
    // No se inventan agrupaciones sobre un dato que no cuadra: es mejor que se
    // vea raro a que se lea mal.
    expect(formatClabe("123")).toBe("123")
    expect(formatClabe("")).toBe("")
  })

  it("ignora espacios ya presentes antes de agrupar", () => {
    expect(formatClabe("0141 5060 6044 4770 78")).toBe("0141 5060 6044 4770 78")
  })
})
