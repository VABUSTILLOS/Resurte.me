import { describe, expect, it } from "vitest"
import {
  MANAGED_ROLES,
  isManagedRole,
  validateRoleChange,
} from "./admin-roles"

describe("admin-roles: isManagedRole", () => {
  it("acepta admin, vendedor y cliente", () => {
    for (const role of MANAGED_ROLES) {
      expect(isManagedRole(role)).toBe(true)
    }
  })

  it("rechaza roles desconocidos", () => {
    expect(isManagedRole("superadmin")).toBe(false)
    expect(isManagedRole("")).toBe(false)
    expect(isManagedRole("ADMIN")).toBe(false)
  })
})

describe("admin-roles: validateRoleChange", () => {
  const base = { callerId: "admin-1", targetId: "user-2" }

  it("permite promover un cliente a admin", () => {
    expect(
      validateRoleChange({ ...base, newRole: "admin", otherAdminsCount: 0 })
    ).toBeNull()
  })

  it("permite degradar un admin si quedan otros admins", () => {
    expect(
      validateRoleChange({ ...base, newRole: "cliente", otherAdminsCount: 1 })
    ).toBeNull()
  })

  it("rechaza un rol inválido", () => {
    expect(
      validateRoleChange({ ...base, newRole: "root", otherAdminsCount: 5 })
    ).toMatch(/rol inválido/i)
  })

  it("un admin no puede quitarse su propio rol", () => {
    expect(
      validateRoleChange({
        callerId: "admin-1",
        targetId: "admin-1",
        newRole: "cliente",
        otherAdminsCount: 3,
      })
    ).toMatch(/propio rol/i)
  })

  it("un admin puede reafirmar su propio rol admin", () => {
    expect(
      validateRoleChange({
        callerId: "admin-1",
        targetId: "admin-1",
        newRole: "admin",
        otherAdminsCount: 0,
      })
    ).toBeNull()
  })

  it("rechaza degradar al último admin del sistema", () => {
    expect(
      validateRoleChange({ ...base, newRole: "vendedor", otherAdminsCount: 0 })
    ).toMatch(/al menos un administrador/i)
  })
})
