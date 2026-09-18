import { describe, expect, it } from "vitest"
import {
  MANIFEST_SHORT_NAME_MAX,
  appBrandChecklist,
  appBrandProgress,
  normalizeAppBackgroundColor,
  normalizeAppShortName,
} from "./foodos-app-brand"

describe("normalizeAppShortName", () => {
  it("acepta un nombre corto normal", () => {
    expect(normalizeAppShortName("La Parrilla")).toEqual({
      value: "La Parrilla",
      error: null,
    })
  })

  it("colapsa espacios internos y recorta las orillas", () => {
    expect(normalizeAppShortName("  Tacos   Beto  ")).toEqual({
      value: "Tacos Beto",
      error: null,
    })
  })

  it("vacío significa 'derívalo del nombre', no un error", () => {
    expect(normalizeAppShortName("")).toEqual({ value: null, error: null })
    expect(normalizeAppShortName("   ")).toEqual({ value: null, error: null })
    expect(normalizeAppShortName(null)).toEqual({ value: null, error: null })
    expect(normalizeAppShortName(undefined)).toEqual({ value: null, error: null })
  })

  it(`acepta exactamente ${MANIFEST_SHORT_NAME_MAX} caracteres`, () => {
    const exact = "a".repeat(MANIFEST_SHORT_NAME_MAX)
    expect(normalizeAppShortName(exact)).toEqual({ value: exact, error: null })
  })

  it("rechaza uno más en vez de recortarlo en silencio", () => {
    const result = normalizeAppShortName("a".repeat(MANIFEST_SHORT_NAME_MAX + 1))
    expect(result.value).toBeNull()
    expect(result.error).toContain(String(MANIFEST_SHORT_NAME_MAX))
  })

  it("mide el largo después de colapsar espacios, no antes", () => {
    // 14 caracteres escritos, 12 una vez colapsados: entra justo.
    const raw = "Pizza   Napoli"
    expect(raw.length).toBeGreaterThan(MANIFEST_SHORT_NAME_MAX)
    expect(normalizeAppShortName(raw)).toEqual({ value: "Pizza Napoli", error: null })
  })

  it("12 caracteres es el límite real del lanzador, no una preferencia", () => {
    // Un nombre de restaurante mexicano común no cabe: por eso el campo existe
    // y por eso el aviso del panel recomienda abreviar en vez de recortar solo.
    expect(normalizeAppShortName("Tacos Don Beto").error).toBeTruthy()
    expect(normalizeAppShortName("Don Beto")).toEqual({ value: "Don Beto", error: null })
  })
})

describe("normalizeAppBackgroundColor", () => {
  it("acepta la forma larga en minúsculas y en mayúsculas", () => {
    expect(normalizeAppBackgroundColor("#1a2b3c")).toEqual({ value: "#1a2b3c", error: null })
    expect(normalizeAppBackgroundColor("#1A2B3C")).toEqual({ value: "#1a2b3c", error: null })
  })

  it("expande la forma corta sin pérdida", () => {
    expect(normalizeAppBackgroundColor("#abc")).toEqual({ value: "#aabbcc", error: null })
    expect(normalizeAppBackgroundColor("#F0A")).toEqual({ value: "#ff00aa", error: null })
  })

  it("vacío significa 'usa el fondo por defecto'", () => {
    expect(normalizeAppBackgroundColor("")).toEqual({ value: null, error: null })
    expect(normalizeAppBackgroundColor("  ")).toEqual({ value: null, error: null })
    expect(normalizeAppBackgroundColor(null)).toEqual({ value: null, error: null })
  })

  it("rechaza lo que no es un hex válido", () => {
    for (const bad of ["rojo", "123456", "#12345", "#1234567", "#gggggg", "rgb(0,0,0)"]) {
      const result = normalizeAppBackgroundColor(bad)
      expect(result.value, bad).toBeNull()
      expect(result.error, bad).toBeTruthy()
    }
  })

  it("el valor normalizado siempre cumple la CHECK de 00159", () => {
    for (const input of ["#abc", "#1A2B3C", "  #f0a  "]) {
      const { value } = normalizeAppBackgroundColor(input)
      expect(value, input).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe("appBrandChecklist", () => {
  const complete = {
    logo_url: "https://cdn.example.com/logo.png",
    theme_color: "#8B1A1A",
    app_short_name: "La Parrilla",
    app_background_color: "#1a2b3c",
    status: "active",
    menuItemCount: 12,
  }

  it("todo hecho cuando el restaurante está completo", () => {
    const steps = appBrandChecklist(complete)
    expect(steps).toHaveLength(6)
    expect(steps.every((step) => step.done)).toBe(true)
    expect(appBrandProgress(steps).pending).toEqual([])
  })

  it("un restaurante recién creado tiene los seis pendientes", () => {
    const steps = appBrandChecklist({
      logo_url: null,
      theme_color: null,
      app_short_name: null,
      app_background_color: null,
      status: "draft",
      menuItemCount: 0,
    })
    expect(steps.filter((step) => step.done)).toHaveLength(0)
    expect(appBrandProgress(steps).ratio).toBe(0)
  })

  it("el logo vacío o en blanco cuenta como faltante", () => {
    for (const blank of ["", "   ", null, undefined]) {
      const steps = appBrandChecklist({ ...complete, logo_url: blank })
      expect(steps.find((step) => step.key === "logo")?.done, String(blank)).toBe(false)
    }
  })

  it("un restaurante en borrador no está listo aunque todo lo demás esté", () => {
    const steps = appBrandChecklist({ ...complete, status: "draft" })
    const published = steps.find((step) => step.key === "published")
    expect(published?.done).toBe(false)
    // El link público no carga en borrador: el paso tiene que llevar a resolverlo.
    expect(published?.href).toBeTruthy()
  })

  it("sin platillos disponibles la app abre vacía", () => {
    const steps = appBrandChecklist({ ...complete, menuItemCount: 0 })
    expect(steps.find((step) => step.key === "menu")?.done).toBe(false)
  })

  it("solo los pasos pendientes llevan a dónde ir", () => {
    const steps = appBrandChecklist({ ...complete, app_short_name: null })
    const pending = steps.filter((step) => !step.done)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.key).toBe("short_name")
    // El nombre corto se resuelve en esta misma pantalla: no se manda a otra.
    expect(pending[0]?.href).toBeUndefined()
    for (const step of steps.filter((s) => s.done)) {
      expect(step.href, step.key).toBeUndefined()
    }
  })

  it("cada paso tiene una clave única", () => {
    const keys = appBrandChecklist(complete).map((step) => step.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe("appBrandProgress", () => {
  it("cuenta y calcula la razón", () => {
    const steps = appBrandChecklist({
      logo_url: "x",
      theme_color: "x",
      app_short_name: null,
      app_background_color: null,
      status: "active",
      menuItemCount: 3,
    })
    const progress = appBrandProgress(steps)
    expect(progress.done).toBe(4)
    expect(progress.total).toBe(6)
    expect(progress.ratio).toBeCloseTo(4 / 6)
    expect(progress.pending.map((step) => step.key)).toEqual(["short_name", "background"])
  })

  it("no divide entre cero con una lista vacía", () => {
    expect(appBrandProgress([]).ratio).toBe(0)
  })
})
