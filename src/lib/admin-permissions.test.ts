import { describe, expect, it } from "vitest"

import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_LABEL,
  ADMIN_SECTIONS,
  adminSectionForPath,
  canAccessAdminPath,
  describeAdminScope,
  effectiveAdminPermissions,
  filterAdminNav,
  hasAdminPermission,
  isAdminPermission,
  isFullAdminScope,
  parseAdminScope,
  type AdminScope,
  validateScopeChange,
} from "./admin-permissions"

describe("isAdminPermission", () => {
  it("acepta solo los dominios declarados", () => {
    for (const permission of ADMIN_PERMISSIONS) {
      expect(isAdminPermission(permission)).toBe(true)
    }
    expect(isAdminPermission("dinero")).toBe(false)
    expect(isAdminPermission("")).toBe(false)
    expect(isAdminPermission(null)).toBe(false)
    expect(isAdminPermission(["productos"])).toBe(false)
  })

  it("cada dominio tiene etiqueta y descripción", () => {
    for (const permission of ADMIN_PERMISSIONS) {
      expect(ADMIN_PERMISSION_LABEL[permission]).toBeTruthy()
    }
  })
})

describe("parseAdminScope", () => {
  it("null/undefined es ámbito sin restringir, no lista vacía", () => {
    expect(parseAdminScope(null)).toBeNull()
    expect(parseAdminScope(undefined)).toBeNull()
    // La diferencia importa: `[]` degrada, `null` concede.
    expect(parseAdminScope([])).toEqual([])
    expect(isFullAdminScope(parseAdminScope(null))).toBe(true)
    expect(isFullAdminScope(parseAdminScope([]))).toBe(false)
  })

  it("descarta valores desconocidos en vez de romper", () => {
    expect(parseAdminScope(["productos", "inventado"])).toEqual(["productos"])
  })

  it("quita duplicados y ordena canónicamente", () => {
    expect(parseAdminScope(["sistema", "productos", "sistema"])).toEqual([
      "productos",
      "sistema",
    ])
  })

  it("un valor ilegible restringe a nada, nunca concede", () => {
    expect(parseAdminScope("productos")).toEqual([])
    expect(parseAdminScope({ productos: true })).toEqual([])
    expect(parseAdminScope(42)).toEqual([])
  })
})

describe("effectiveAdminPermissions", () => {
  it("un rol que no es admin no tiene ningún dominio, aunque la columna traiga valores", () => {
    expect(effectiveAdminPermissions("vendedor", ["productos"])).toEqual([])
    expect(effectiveAdminPermissions("cliente", null)).toEqual([])
  })

  it("admin sin restringir ve todos los dominios", () => {
    expect(effectiveAdminPermissions("admin", null)).toEqual([...ADMIN_PERMISSIONS])
  })

  it("admin restringido ve exactamente los suyos", () => {
    expect(effectiveAdminPermissions("admin", ["comisiones"])).toEqual(["comisiones"])
    expect(effectiveAdminPermissions("admin", [])).toEqual([])
  })
})

describe("hasAdminPermission", () => {
  it("sin restringir concede cualquier dominio", () => {
    for (const permission of ADMIN_PERMISSIONS) {
      expect(hasAdminPermission("admin", null, permission)).toBe(true)
    }
  })

  it("restringido concede solo lo declarado", () => {
    expect(hasAdminPermission("admin", ["pedidos"], "pedidos")).toBe(true)
    expect(hasAdminPermission("admin", ["pedidos"], "comisiones")).toBe(false)
  })

  it("restringido a nada no concede nada", () => {
    expect(hasAdminPermission("admin", [], "pedidos")).toBe(false)
  })

  it("un no-admin nunca pasa, ni con el ámbito lleno", () => {
    expect(hasAdminPermission("vendedor", null, "pedidos")).toBe(false)
    expect(hasAdminPermission("cliente", ["pedidos"], "pedidos")).toBe(false)
  })
})

describe("adminSectionForPath", () => {
  it("el dashboard no tiene dominio", () => {
    expect(adminSectionForPath("/admin")).toBeNull()
  })

  it("resuelve la sección declarada", () => {
    expect(adminSectionForPath("/admin/productos")).toBe("productos")
    expect(adminSectionForPath("/admin/comisiones")).toBe("comisiones")
  })

  it("gana la coincidencia más larga, no el prefijo corto", () => {
    // `/admin/foodos/dispersiones` es dinero; `/admin/foodos/restaurantes` es
    // cuentas. Un mapa por prefijo corto los confundiría.
    expect(adminSectionForPath("/admin/foodos/dispersiones")).toBe("comisiones")
    expect(adminSectionForPath("/admin/foodos/restaurantes")).toBe("clientes")
  })

  it("resuelve las subrutas por su sección", () => {
    expect(adminSectionForPath("/admin/productos/123")).toBe("productos")
    expect(adminSectionForPath("/admin/pedidos/abc/print")).toBe("pedidos")
    expect(adminSectionForPath("/admin/whatsapp/automations")).toBe("marketing")
  })

  it("ignora query, hash y barra final", () => {
    expect(adminSectionForPath("/admin/productos?page=2")).toBe("productos")
    expect(adminSectionForPath("/admin/productos/")).toBe("productos")
    expect(adminSectionForPath("/admin#top")).toBeNull()
  })

  it("una ruta no declarada devuelve undefined, que no es lo mismo que null", () => {
    expect(adminSectionForPath("/admin/inventado")).toBeUndefined()
    expect(adminSectionForPath("/panel")).toBeUndefined()
    expect(adminSectionForPath("/")).toBeUndefined()
  })

  it("no confunde /adminX con /admin", () => {
    expect(adminSectionForPath("/administracion")).toBeUndefined()
  })
})

describe("canAccessAdminPath", () => {
  it("un no-admin no entra a nada", () => {
    expect(canAccessAdminPath("vendedor", null, "/admin")).toBe(false)
    expect(canAccessAdminPath("cliente", ["productos"], "/admin/productos")).toBe(false)
  })

  it("el admin sin restringir entra a todo, declarado o no", () => {
    expect(canAccessAdminPath("admin", null, "/admin")).toBe(true)
    expect(canAccessAdminPath("admin", null, "/admin/comisiones")).toBe(true)
    expect(canAccessAdminPath("admin", null, "/admin/inventado")).toBe(true)
  })

  it("el admin restringido entra a su dominio y al dashboard", () => {
    expect(canAccessAdminPath("admin", ["productos"], "/admin")).toBe(true)
    expect(canAccessAdminPath("admin", ["productos"], "/admin/productos")).toBe(true)
    expect(canAccessAdminPath("admin", ["productos"], "/admin/proveedores")).toBe(true)
    expect(canAccessAdminPath("admin", ["productos"], "/admin/comisiones")).toBe(false)
  })

  it("el admin restringido no entra a una ruta no declarada (fail-closed)", () => {
    // Una sección nueva sin declarar no debe convertirse en puerta abierta.
    expect(canAccessAdminPath("admin", ["productos"], "/admin/inventado")).toBe(false)
  })

  it("el admin restringido a nada solo ve el dashboard", () => {
    expect(canAccessAdminPath("admin", [], "/admin")).toBe(true)
    expect(canAccessAdminPath("admin", [], "/admin/productos")).toBe(false)
  })
})

describe("filterAdminNav", () => {
  const items = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/productos", label: "Productos" },
    { href: "/admin/comisiones", label: "Comisiones" },
    { href: "/admin/inventado", label: "Inventado" },
  ]

  it("el admin completo conserva la navegación entera", () => {
    expect(filterAdminNav("admin", null, items)).toHaveLength(4)
  })

  it("el admin restringido pierde las pestañas que le darían 403", () => {
    expect(filterAdminNav("admin", ["productos"], items).map((i) => i.href)).toEqual([
      "/admin",
      "/admin/productos",
    ])
  })

  it("restringido a nada conserva solo el dashboard", () => {
    expect(filterAdminNav("admin", [], items).map((i) => i.href)).toEqual(["/admin"])
  })
})

describe("describeAdminScope", () => {
  it("distingue los tres estados", () => {
    expect(describeAdminScope(null)).toBe("Todos")
    expect(describeAdminScope([])).toBe("Ninguno")
    expect(describeAdminScope(["productos", "comisiones"])).toBe("Catálogo, Dinero de la red")
  })
})

describe("integridad de ADMIN_SECTIONS", () => {
  it("no hay rutas duplicadas", () => {
    const paths = ADMIN_SECTIONS.map((section) => section.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it("cada sección es resoluble por sí misma", () => {
    for (const section of ADMIN_SECTIONS) {
      expect(adminSectionForPath(section.path)).toBe(section.permission)
    }
  })
})

describe("validateScopeChange", () => {
  const base = { callerId: "u1", targetId: "u2", callerScope: null as AdminScope }

  it("deja pasar a un admin sin restricciones sobre otro usuario", () => {
    expect(validateScopeChange(base)).toBeNull()
  })

  it("rechaza a un admin restringido aunque tenga el dominio de usuarios", () => {
    expect(validateScopeChange({ ...base, callerScope: ["clientes"] })).toMatch(
      /acceso completo/
    )
  })

  it("rechaza a un admin restringido a nada", () => {
    expect(validateScopeChange({ ...base, callerScope: [] })).toMatch(/acceso completo/)
  })

  it("rechaza que alguien cambie su propio ámbito", () => {
    expect(validateScopeChange({ ...base, targetId: "u1" })).toMatch(/tus propios permisos/)
  })

  it("comprueba la delegación antes que la identidad", () => {
    // Un admin restringido editándose a sí mismo no debe poder llegar siquiera
    // a la segunda regla: el mensaje tiene que hablar de la delegación.
    expect(
      validateScopeChange({ callerId: "u1", targetId: "u1", callerScope: ["pedidos"] })
    ).toMatch(/acceso completo/)
  })
})
