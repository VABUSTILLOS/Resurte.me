import { describe, expect, it } from "vitest"
import {
  canAccessFoodosSurface,
  canAccessPanelHref,
  canAccessTool,
  canManageMembers,
  canReadRows,
  canUseBackup,
  canWriteDishes,
  canWriteEntry,
  canWriteRows,
  foodosSurfaceForPath,
  FOODOS_SURFACE_ACCESS,
  MEMBER_ROLES,
  toolsForRole,
  type PanelRole,
  type PanelToolKey,
} from "./panel-roles"

const ALL_TOOLS: PanelToolKey[] = [
  "costeo", "planificador", "mermas", "rentabilidad", "analitica",
  "temporada", "apertura", "comanda", "inventario", "ventas", "foodos", "personal",
]
const ROLES: PanelRole[] = ["dueno", "gerente", "cajero", "cocina", "mesero"]

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

  it("mesero accede a comanda, ventas y las mesas de FoodOS", () => {
    expect(toolsForRole("mesero").sort()).toEqual(["comanda", "foodos", "ventas"])
  })

  it("el cajero sólo abre FoodOS: no toca costeo, inventario ni ventas", () => {
    expect(toolsForRole("cajero")).toEqual(["foodos"])
  })

  it("los roles asignables a miembros son los cuatro sin dueño", () => {
    expect(MEMBER_ROLES).toEqual(["gerente", "cajero", "cocina", "mesero"])
    for (const role of MEMBER_ROLES) {
      expect(ROLES).toContain(role)
    }
  })

  it("todo rol tiene al menos una herramienta", () => {
    for (const role of ROLES) {
      expect(toolsForRole(role).length).toBeGreaterThan(0)
    }
  })
})

describe("panel-roles: superficies de FoodOS", () => {
  const SURFACES = Object.keys(FOODOS_SURFACE_ACCESS)

  it("resuelve la superficie de una ruta de FoodOS", () => {
    expect(foodosSurfaceForPath("/panel/foodos/caja")).toBe("caja")
    expect(foodosSurfaceForPath("/panel/foodos/mesas/123")).toBe("mesas")
    expect(foodosSurfaceForPath("/panel/foodos")).toBeNull()
    expect(foodosSurfaceForPath("/panel/ventas")).toBeNull()
  })

  it("dueño y gerente entran a todas las superficies", () => {
    for (const surface of SURFACES) {
      expect(canAccessFoodosSurface("dueno", `/panel/foodos/${surface}`)).toBe(true)
      expect(canAccessFoodosSurface("gerente", `/panel/foodos/${surface}`)).toBe(true)
    }
  })

  it("el cajero entra a caja, mostrador, mesas, pedidos y tablero", () => {
    for (const surface of ["caja", "mostrador", "mesas", "pedidos", "tablero"]) {
      expect(canAccessFoodosSurface("cajero", `/panel/foodos/${surface}`)).toBe(true)
    }
    for (const surface of ["menu", "combos", "clientes", "restaurante", "wallet", "personal"]) {
      expect(canAccessFoodosSurface("cajero", `/panel/foodos/${surface}`)).toBe(false)
    }
  })

  it("el mesero sólo entra a mesas y cocina", () => {
    expect(canAccessFoodosSurface("mesero", "/panel/foodos/mesas")).toBe(true)
    expect(canAccessFoodosSurface("mesero", "/panel/foodos/cocina")).toBe(true)
    expect(canAccessFoodosSurface("mesero", "/panel/foodos/caja")).toBe(false)
    expect(canAccessFoodosSurface("mesero", "/panel/foodos/menu")).toBe(false)
  })

  it("una superficie nueva y no declarada queda cerrada para cajero y mesero", () => {
    expect(canAccessFoodosSurface("cajero", "/panel/foodos/superficie-nueva")).toBe(false)
    expect(canAccessFoodosSurface("mesero", "/panel/foodos/superficie-nueva")).toBe(false)
    // El dueño no depende del catálogo para llegar a una pantalla nueva.
    expect(canAccessFoodosSurface("dueno", "/panel/foodos/superficie-nueva")).toBe(true)
  })

  it("sin la herramienta foodos no hay superficie que valga", () => {
    expect(canAccessFoodosSurface("cocina", "/panel/foodos/cocina")).toBe(false)
  })

  it("canAccessPanelHref es el predicado único de navegación", () => {
    expect(canAccessPanelHref("cajero", "/panel/foodos/caja")).toBe(true)
    expect(canAccessPanelHref("cajero", "/panel/foodos/menu")).toBe(false)
    expect(canAccessPanelHref("cajero", "/panel/ventas")).toBe(false)
    expect(canAccessPanelHref("cajero", "/panel")).toBe(true)
    expect(canAccessPanelHref("cocina", "/panel/mermas")).toBe(true)
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

  it("comanda-entries: quien tiene la herramienta comanda escribe", () => {
    for (const role of ["dueno", "gerente", "cocina", "mesero"] as PanelRole[]) {
      expect(canWriteRows(role, "comanda-entries")).toBe(true)
    }
    // El cajero cobra, no captura comandas: no tiene la herramienta comanda.
    expect(canWriteRows("cajero", "comanda-entries")).toBe(false)
    expect(canAccessTool("cajero", "comanda")).toBe(false)
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
