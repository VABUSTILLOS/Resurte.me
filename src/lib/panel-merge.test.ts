import { describe, expect, it } from "vitest"
import { isRealConflict, mergePanelValue, type MergeOutcome } from "./panel-merge"

/** Atajo: solo el desenlace, que es lo que decide el mensaje de la UI. */
function outcomeOf(local: unknown, server: unknown): MergeOutcome {
  return mergePanelValue(local, server).outcome
}

describe("mergePanelValue — sin choque real", () => {
  it("dos valores idénticos son 'identical' y devuelve el del servidor", () => {
    const r = mergePanelValue({ a: 1 }, { a: 1 })
    expect(r.outcome).toBe("identical")
    expect(r.value).toEqual({ a: 1 })
  })

  it("'identical' no reporta conteos: no hubo nada que combinar", () => {
    const r = mergePanelValue([{ id: "x", n: 1 }], [{ id: "x", n: 1 }])
    expect(r).toMatchObject({ keptFromServer: 0, localOverwrote: 0, localAdded: 0 })
  })

  it("un arreglo con el mismo contenido en distinto orden NO es idéntico", () => {
    // El orden es parte del valor: el usuario puede haber reordenado a mano.
    expect(outcomeOf([1, 2], [2, 1])).toBe("merged")
  })

  it("isRealConflict solo calla en 'identical'", () => {
    expect(isRealConflict(mergePanelValue(1, 1))).toBe(false)
    expect(isRealConflict(mergePanelValue(1, 2))).toBe(true)
  })
})

describe("mergePanelValue — arreglos con id (el caso de inventario-items)", () => {
  it("conserva la fila que el otro dispositivo agregó y no borra la edición local", () => {
    // t=0 ambos leen [A,B]; tablet agrega C; laptop corrige A con base obsoleta.
    const server = [
      { id: "A", stock: 10 },
      { id: "B", stock: 5 },
      { id: "C", stock: 7 },
    ]
    const local = [
      { id: "A", stock: 99 },
      { id: "B", stock: 5 },
    ]
    const r = mergePanelValue(local, server)
    expect(r.outcome).toBe("merged")
    expect(r.value).toEqual([
      { id: "A", stock: 99 },
      { id: "B", stock: 5 },
      { id: "C", stock: 7 },
    ])
    expect(r.keptFromServer).toBe(1)
    expect(r.localOverwrote).toBe(1)
    expect(r.localAdded).toBe(0)
  })

  it("la versión local gana cuando el mismo id aparece en ambos lados", () => {
    const r = mergePanelValue([{ id: "A", v: "local" }], [{ id: "A", v: "server" }])
    expect(r.value).toEqual([{ id: "A", v: "local" }])
    expect(r.localOverwrote).toBe(1)
  })

  it("conserva el orden local y agrega lo del servidor al final", () => {
    const r = mergePanelValue([{ id: "b" }, { id: "a" }], [{ id: "a" }, { id: "b" }, { id: "c" }])
    expect((r.value as Array<{ id: string }>).map((x) => x.id)).toEqual(["b", "a", "c"])
  })

  it("un elemento que solo existe en local se cuenta como localAdded", () => {
    const r = mergePanelValue([{ id: "a" }, { id: "nuevo" }], [{ id: "a" }])
    expect(r.localAdded).toBe(1)
    expect(r.keptFromServer).toBe(0)
  })

  it("acepta `name` como identidad cuando no hay id (apertura-custom)", () => {
    const r = mergePanelValue(
      [{ name: "Caja", low: 1, high: 2 }],
      [
        { name: "Caja", low: 1, high: 2 },
        { name: "Barra", low: 3, high: 4 },
      ],
    )
    expect(r.outcome).toBe("merged")
    expect(r.keptFromServer).toBe(1)
  })

  it("acepta el propio primitivo como identidad (apertura-checked: string[])", () => {
    const r = mergePanelValue(["paso-1", "paso-3"], ["paso-1", "paso-2"])
    expect(r.outcome).toBe("merged")
    expect(r.value).toEqual(["paso-1", "paso-3", "paso-2"])
    expect(r.keptFromServer).toBe(1)
  })

  it("un arreglo con UN elemento sin identidad cae a 'local-wins'", () => {
    // Combinar la mitad y reemplazar la otra daría un resultado inexplicable.
    const r = mergePanelValue([{ id: "a" }, { suelto: true }], [{ id: "a" }])
    expect(r.outcome).toBe("local-wins")
    expect(r.value).toEqual([{ id: "a" }, { suelto: true }])
  })

  it("un id vacío no cuenta como identidad", () => {
    expect(outcomeOf([{ id: "" }], [{ id: "", n: 1 }])).toBe("local-wins")
  })

  it("un id numérico tampoco: el tipo tiene que ser string", () => {
    expect(outcomeOf([{ id: 7 }], [{ id: 7, n: 1 }])).toBe("local-wins")
  })

  it("no cuenta dos veces la misma identidad si el servidor la trae duplicada", () => {
    const r = mergePanelValue([{ id: "a" }], [{ id: "a" }, { id: "a" }])
    expect(r.outcome).toBe("merged")
    expect(r.value).toEqual([{ id: "a" }])
    expect(r.keptFromServer).toBe(0)
  })

  it("un arreglo vacío contra uno con filas conserva las del servidor", () => {
    const r = mergePanelValue([], [{ id: "a" }, { id: "b" }])
    expect(r.value).toEqual([{ id: "a" }, { id: "b" }])
    expect(r.keptFromServer).toBe(2)
  })
})

describe("mergePanelValue — objetos planos (comanda-statuses, planner-manual-qtys)", () => {
  it("combina clave por clave y conserva las claves que solo tiene el servidor", () => {
    const r = mergePanelValue({ mesa1: "listo" }, { mesa1: "en-cocina", mesa2: "listo" })
    expect(r.outcome).toBe("merged")
    expect(r.value).toEqual({ mesa1: "listo", mesa2: "listo" })
    expect(r.keptFromServer).toBe(1)
    expect(r.localOverwrote).toBe(1)
  })

  it("conserva una clave local que el servidor no tiene", () => {
    const r = mergePanelValue({ a: 1, nueva: 2 }, { a: 1 })
    expect(r.localAdded).toBe(1)
    expect(r.value).toEqual({ a: 1, nueva: 2 })
  })

  it("no reporta choque cuando el valor anidado es igual", () => {
    const r = mergePanelValue({ a: { x: 1 } }, { a: { x: 1 } })
    expect(r.outcome).toBe("identical")
  })

  it("un objeto vacío contra uno con claves conserva las del servidor", () => {
    const r = mergePanelValue({}, { a: 1, b: 2 })
    expect(r.keptFromServer).toBe(2)
  })

  it("no confunde una clave heredada de Object.prototype con una propia", () => {
    const r = mergePanelValue({ a: 1 }, { toString: "x" } as Record<string, unknown>)
    expect(r.keptFromServer).toBe(1)
    expect((r.value as Record<string, unknown>)["toString"]).toBe("x")
  })
})

describe("mergePanelValue — escalares (no hay merge posible)", () => {
  it("dos números distintos conservan el local y se reportan", () => {
    const r = mergePanelValue(50, 100)
    expect(r.outcome).toBe("local-wins")
    expect(r.value).toBe(50)
    expect(r.localOverwrote).toBe(0)
  })

  it("dos cadenas distintas conservan la local", () => {
    expect(mergePanelValue("es", "en")).toMatchObject({ outcome: "local-wins", value: "es" })
  })

  it("dos booleanos distintos conservan el local", () => {
    expect(mergePanelValue(false, true)).toMatchObject({ outcome: "local-wins", value: false })
  })

  it("null contra un número conserva el local", () => {
    expect(mergePanelValue(null, 5)).toMatchObject({ outcome: "local-wins", value: null })
  })

  it("null contra null es idéntico", () => {
    expect(outcomeOf(null, null)).toBe("identical")
  })

  it("no se reporta ningún conteo en 'local-wins': no hubo elementos", () => {
    const r = mergePanelValue(1, 2)
    expect(r).toMatchObject({ keptFromServer: 0, localOverwrote: 0, localAdded: 0 })
  })
})

describe("mergePanelValue — formas incompatibles", () => {
  it("arreglo contra objeto es 'incompatible' y conserva el local", () => {
    const r = mergePanelValue([1], { a: 1 })
    expect(r.outcome).toBe("incompatible")
    expect(r.value).toEqual([1])
  })

  it("objeto contra arreglo es 'incompatible'", () => {
    expect(outcomeOf({ a: 1 }, [1])).toBe("incompatible")
  })

  it("escalar contra objeto es 'incompatible', no 'local-wins'", () => {
    // Distinto mensaje: aquí el usuario debe sospechar de un cambio de forma
    // (una migración, otra versión de la app), no de dos ediciones suyas.
    expect(outcomeOf(5, { a: 1 })).toBe("incompatible")
  })

  it("objeto contra escalar es 'incompatible'", () => {
    expect(outcomeOf({ a: 1 }, 5)).toBe("incompatible")
  })

  it("nunca lanza con formas raras", () => {
    expect(() => mergePanelValue([undefined], [undefined])).not.toThrow()
    expect(() => mergePanelValue({ a: undefined }, { a: undefined })).not.toThrow()
    expect(() => mergePanelValue([[[1]]], [[[1]]])).not.toThrow()
  })
})

describe("mergePanelValue — propiedad invariante", () => {
  it("el valor devuelto siempre es uno de los dos que entraron, o el merge de ambos", () => {
    const casos: Array<[unknown, unknown]> = [
      [1, 2],
      ["a", "b"],
      [null, 3],
      [[{ id: "a" }], [{ id: "b" }]],
      [{ a: 1 }, { b: 2 }],
      [[1], { a: 1 }],
      [[], []],
      [{}, {}],
    ]
    for (const [local, server] of casos) {
      const r = mergePanelValue(local, server)
      if (r.outcome === "merged") expect(Array.isArray(r.value) || typeof r.value === "object").toBe(true)
      else expect(r.value).toEqual(r.outcome === "identical" ? server : local)
    }
  })

  it("combinar nunca pierde un elemento del servidor que tenga identidad propia", () => {
    const server = [{ id: "a" }, { id: "b" }, { id: "c" }]
    const local = [{ id: "b", editado: true }]
    const r = mergePanelValue(local, server)
    const ids = (r.value as Array<{ id: string }>).map((x) => x.id).sort()
    expect(ids).toEqual(["a", "b", "c"])
  })
})
