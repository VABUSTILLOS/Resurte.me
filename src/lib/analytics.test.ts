import { describe, it, expect } from "vitest"

// Espejo de la función interna de ./analytics (no exportada: solo la usa el
// módulo). Si cambia la implementación, este test debe actualizarse.
function sanitizeEnvId(value: string | undefined): string | undefined {
  if (!value) return undefined
  const clean = value.includes("=") ? value.split("=").pop() : value
  return clean?.trim().replace(/^["']+|["']+$/g, "") || undefined
}

describe("sanitizeEnvId", () => {
  it("devuelve undefined para valores vacíos", () => {
    expect(sanitizeEnvId(undefined)).toBeUndefined()
    expect(sanitizeEnvId("")).toBeUndefined()
    expect(sanitizeEnvId("   ")).toBeUndefined()
  })

  it("conserva un ID limpio", () => {
    expect(sanitizeEnvId("G-YKJ9ECF267")).toBe("G-YKJ9ECF267")
  })

  it("recorta el prefijo NOMBRE_VAR= pegado por error en Vercel", () => {
    expect(sanitizeEnvId("NEXT_PUBLIC_GA_MEASUREMENT_ID=G-YKJ9ECF267")).toBe("G-YKJ9ECF267")
  })

  it("elimina comillas y espacios del pegado", () => {
    expect(sanitizeEnvId(' "G-YKJ9ECF267"')).toBe("G-YKJ9ECF267")
    expect(sanitizeEnvId("'G-YKJ9ECF267'")).toBe("G-YKJ9ECF267")
    expect(sanitizeEnvId('  NEXT_PUBLIC_GA_MEASUREMENT_ID="G-YKJ9ECF267" ')).toBe("G-YKJ9ECF267")
  })
})
