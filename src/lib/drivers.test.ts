import { describe, it, expect } from "vitest"
import { activeDrivers, driverNameById, type DriverLike } from "./drivers"

const DRIVERS: DriverLike[] = [
  { id: 1, name: "Zoe", is_active: true },
  { id: 2, name: "Ángel", is_active: true },
  { id: 3, name: "Beto", is_active: false },
]

describe("activeDrivers", () => {
  it("descarta los inactivos", () => {
    expect(activeDrivers(DRIVERS).map((d) => d.id)).toEqual([2, 1])
  })

  it("ordena por nombre respetando acentos (es-MX)", () => {
    // "Ángel" va antes que "Zoe": localeCompare con locale es-MX normaliza la tilde.
    expect(activeDrivers(DRIVERS).map((d) => d.name)).toEqual(["Ángel", "Zoe"])
  })

  it("no muta la lista de entrada", () => {
    const input = [{ id: 1, name: "Zoe", is_active: true }, { id: 2, name: "Ana", is_active: true }]
    const before = input.map((d) => d.id)
    activeDrivers(input)
    expect(input.map((d) => d.id)).toEqual(before)
  })

  it("devuelve vacío cuando no hay activos", () => {
    expect(activeDrivers([{ id: 3, name: "Beto", is_active: false }])).toEqual([])
    expect(activeDrivers([])).toEqual([])
  })
})

describe("driverNameById", () => {
  it("devuelve el nombre del repartidor asignado", () => {
    expect(driverNameById(DRIVERS, 1)).toBe("Zoe")
  })

  it("devuelve null sin asignación", () => {
    expect(driverNameById(DRIVERS, null)).toBeNull()
    expect(driverNameById(DRIVERS, undefined)).toBeNull()
  })

  it("devuelve null si el id ya no está en la lista", () => {
    expect(driverNameById(DRIVERS, 99)).toBeNull()
  })
})
