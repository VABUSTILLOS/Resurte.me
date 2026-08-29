import { describe, expect, it } from "vitest"
import {
  canAccessTool,
  canManageMembers,
  canReadRows,
  canUseBackup,
  canWriteDishes,
  canWriteEntry,
  canWriteRows,
  toolsForRole,
  type PanelRole,
  type PanelToolKey,
} from "./panel-roles"

const ALL_TOOLS: PanelToolKey[] = [
  "costeo", "planificador", "mermas", "rentabilidad", "analitica",
  "temporada", "apertura", "comanda", "inventario", "ventas", "foodos", "personal",
]
const ROLES: PanelRole[] = ["dueno", "gerente", "cocina", "mesero"]

describe("panel-roles: matriz herramienta×rol", () => {
  it("el dueño accede a todas las herramientas", () => {
    for (const tool of ALL_TOOLS) {
      expect(canAccessTool("dueno", tool)).toBe(true)
    }
  })

  it("el gerente accede a todo menos personal", () => {
    for (const tool of ALL_TOOLS) {
      expect(canAccessTool("gerente", tool)).toBe(tool !== "personal")
    }
  })

  it("cocina solo accede a comanda, inventario y mermas", () => {
    expect(toolsForRole("cocina").sort()).toEqual(["comanda", "inventario", "mermas"])
  })

  it("mesero solo accede a ventas y comanda", () => {
    expect(toolsForRole("mesero").sort()).toEqual(["comanda", "ventas"])
  })

  it("todo rol tiene al menos una herramienta", () => {
    for (const role of ROLES) {
      expect(toolsForRole(role).length).toBeGreaterThan(0)
    }
  })
})

describe("panel-roles: escritura en rows", () => {
  it("ventas-entries: dueno/gerente/mesero escriben; cocina no", () => {
    expect(canWriteRows("dueno", "ventas-entries")).toBe(true)
    expect(canWriteRows("gerente", "ventas-entries")).toBe(true)
    expect(canWriteRows("mesero", "ventas-entries")).toBe(true)
    expect(canWriteRows("cocina", "ventas-entries")).toBe(false)
  })

  it("mermas-entries: cocina sí, mesero no", () => {
    expect(canWriteRows("cocina", "mermas-entries")).toBe(true)
    expect(canWriteRows("mesero", "mermas-entries")).toBe(false)
  })

  it("comanda-entries: todos escriben", () => {
    for (const role of ROLES) {
      expect(canWriteRows(role, "comanda-entries")).toBe(true)
    }
  })

  it("lectura sigue a la escritura (nadie lee lo que no puede operar)", () => {
    expect(canReadRows("cocina", "ventas-entries")).toBe(false)
    expect(canReadRows("mesero", "inventario-movimientos")).toBe(false)
    expect(canReadRows("gerente", "planificador-servicios")).toBe(true)
  })

  it("herramientas futuras sin entrada explícita: solo dueno/gerente", () => {
    expect(canWriteRows("dueno", "herramienta-nueva")).toBe(true)
    expect(canWriteRows("gerente", "herramienta-nueva")).toBe(true)
    expect(canWriteRows("mesero", "herramienta-nueva")).toBe(false)
  })
})

describe("panel-roles: entries, dishes, backup y personal", () => {
  it("panel-config solo la escribe el dueño", () => {
    expect(canWriteEntry("dueno", "panel-config")).toBe(true)
    expect(canWriteEntry("gerente", "panel-config-abc")).toBe(false)
    expect(canWriteEntry("mesero", "panel-config")).toBe(false)
  })

  it("claves por prefijo siguen la matriz de herramientas", () => {
    expect(canWriteEntry("mesero", "ventas-clientes")).toBe(true)
    expect(canWriteEntry("mesero", "inventario-items")).toBe(false)
    expect(canWriteEntry("cocina", "mermas-meta")).toBe(true)
    expect(canWriteEntry("cocina", "costeo-ingredientes")).toBe(false)
    expect(canWriteEntry("gerente", "costeo-ingredientes")).toBe(true)
  })

  it("claves desconocidas: solo dueno/gerente (default seguro)", () => {
    expect(canWriteEntry("dueno", "clave-nueva")).toBe(true)
    expect(canWriteEntry("gerente", "clave-nueva")).toBe(true)
    expect(canWriteEntry("cocina", "clave-nueva")).toBe(false)
  })

  it("dishes: dueno/gerente escriben; cocina/mesero no", () => {
    expect(canWriteDishes("dueno")).toBe(true)
    expect(canWriteDishes("gerente")).toBe(true)
    expect(canWriteDishes("cocina")).toBe(false)
    expect(canWriteDishes("mesero")).toBe(false)
  })

  it("respaldo y personal: solo el dueño", () => {
    for (const role of ROLES) {
      expect(canUseBackup(role)).toBe(role === "dueno")
      expect(canManageMembers(role)).toBe(role === "dueno")
    }
  })
})
