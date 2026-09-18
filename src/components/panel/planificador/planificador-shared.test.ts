import { describe, expect, it } from "vitest"
import {
  COLLECTION_PRODUCTS,
  DEFAULT_PRODUCTS,
  WASTE_CATEGORIES,
  getWasteCategory,
} from "./planificador-shared"

const CLAVES_DECLARADAS = new Set(WASTE_CATEGORIES.map((w) => w.key))

/**
 * Categorías de producto que hoy caen en "Otros" a propósito: condimentos,
 * salsas, aceites, botanas y secos marinos tienen perfil de merma bajo y no
 * comparten el de verduras ni el de granos. Si aparece una categoría nueva en
 * `COLLECTION_PRODUCTS` y cae aquí sin querer, este test lo obliga a decidir.
 */
const OTROS_A_PROPOSITO = new Set(["Salsas", "Aceites", "Botana", "Algas", "Condimentos", "Bebidas"])

describe("getWasteCategory — de categoría de producto a grupo de merma", () => {
  it("agrupa las proteínas", () => {
    expect(getWasteCategory("Proteína")).toBe("Proteína")
    expect(getWasteCategory("Carne")).toBe("Proteína")
  })

  it("las frutas van con las verduras: comparten perfil de merma", () => {
    expect(getWasteCategory("Fruta")).toBe("Verdura")
    expect(getWasteCategory("Verdura")).toBe("Verdura")
  })

  it("'Acompañamiento' y 'Guarnición' son sinónimos y van juntos", () => {
    expect(getWasteCategory("Acompañamiento")).toBe("Verdura")
    expect(getWasteCategory("Guarnición")).toBe("Verdura")
  })

  it("los granos y sus derivados van a Secos", () => {
    for (const c of ["Granos", "Harinas", "Endulzantes", "Chocolate", "Pan", "Tortillas", "Base"]) {
      expect(getWasteCategory(c), c).toBe("Secos")
    }
  })

  it("los lácteos y el queso van juntos", () => {
    expect(getWasteCategory("Lácteos")).toBe("Lácteos")
    expect(getWasteCategory("Queso")).toBe("Lácteos")
  })

  it("lo que no reconoce cae en 'Otros', no en un grupo caro", () => {
    expect(getWasteCategory("Salsas")).toBe("Otros")
    expect(getWasteCategory("Bebidas")).toBe("Otros")
    expect(getWasteCategory("")).toBe("Otros")
  })

  it("solo devuelve claves declaradas: el fallback de la página nunca se dispara", () => {
    // planificador/page.tsx usa `?? 8` como red de seguridad al leer
    // wastePcts. Si esta función solo devuelve claves declaradas, esa red es
    // código muerto y no hay forma de que aparezca un porcentaje inventado.
    for (const p of Object.values(COLLECTION_PRODUCTS).flat()) {
      expect(CLAVES_DECLARADAS.has(getWasteCategory(p.category)), p.category).toBe(true)
    }
    for (const c of ["", "???", "Proteína", "Verdura", "Lácteos", "Secos", "Otros"]) {
      expect(CLAVES_DECLARADAS.has(getWasteCategory(c)), c).toBe(true)
    }
  })

  it("la coincidencia es por subcadena: una categoría compuesta hereda el grupo", () => {
    // Trampa documentada: "Proteína vegetal" cuenta como proteína aunque sea
    // vegetal. Es el comportamiento actual y el que hay que preservar.
    expect(getWasteCategory("Proteína vegetal")).toBe("Proteína")
    expect(getWasteCategory("Quesos madurados")).toBe("Lácteos")
  })

  it("el orden de las listas decide en caso de empate", () => {
    // "Fruta" está en la lista de verduras, así que una categoría que contenga
    // ambas palabras cae del lado de las verduras.
    expect(getWasteCategory("Fruta con Verdura")).toBe("Verdura")
  })
})

describe("taxonomía del planificador — coherencia entre catálogo y grupos", () => {
  const categorias = [...new Set(Object.values(COLLECTION_PRODUCTS).flat().map((p) => p.category))]

  it("hay catálogo que revisar (canario: no pasar en vacío)", () => {
    expect(Object.keys(COLLECTION_PRODUCTS).length).toBeGreaterThanOrEqual(10)
    expect(categorias.length).toBeGreaterThanOrEqual(10)
  })

  it("ninguna categoría del catálogo cae en 'Otros' por descuido", () => {
    const huerfanas = categorias.filter(
      (c) => getWasteCategory(c) === "Otros" && !OTROS_A_PROPOSITO.has(c),
    )
    expect(huerfanas).toEqual([])
  })

  it("cada colección trae productos con precio y consumo por persona positivos", () => {
    for (const [coleccion, productos] of Object.entries(COLLECTION_PRODUCTS)) {
      expect(productos.length, coleccion).toBeGreaterThan(0)
      for (const p of productos) {
        expect(p.price, `${coleccion}/${p.name}`).toBeGreaterThan(0)
        expect(p.perPerson, `${coleccion}/${p.name}`).toBeGreaterThan(0)
        expect(p.unit.length, `${coleccion}/${p.name}`).toBeGreaterThan(0)
      }
    }
  })

  it("cada grupo de merma tiene un porcentaje por defecto creíble", () => {
    for (const w of WASTE_CATEGORIES) {
      expect(w.defaultPct, w.key).toBeGreaterThan(0)
      expect(w.defaultPct, w.key).toBeLessThan(50)
    }
  })

  it("los grupos por defecto están ordenados por riesgo: proteína y verdura arriba", () => {
    const porClave = new Map(WASTE_CATEGORIES.map((w) => [w.key, w.defaultPct]))
    expect(porClave.get("Verdura")).toBeGreaterThan(porClave.get("Secos") ?? 0)
    expect(porClave.get("Proteína")).toBeGreaterThan(porClave.get("Otros") ?? 0)
  })

  it("no hay claves de grupo repetidas", () => {
    expect(new Set(WASTE_CATEGORIES.map((w) => w.key)).size).toBe(WASTE_CATEGORIES.length)
  })

  it("el catálogo por defecto (sin colección elegida) también es válido", () => {
    expect(DEFAULT_PRODUCTS.length).toBeGreaterThan(0)
    for (const p of DEFAULT_PRODUCTS) {
      expect(CLAVES_DECLARADAS.has(getWasteCategory(p.category)), p.category).toBe(true)
      expect(p.price).toBeGreaterThan(0)
    }
  })
})
