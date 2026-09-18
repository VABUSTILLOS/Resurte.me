import { describe, expect, it } from "vitest"
import {
  REORDER_CATALOG_COLUMNS,
  buildReorderPlan,
  reorderFeedback,
  resolveReorderItem,
  type ReorderCatalogProduct,
  type ReorderSourceItem,
} from "./order-reorder"

/**
 * «Repetir pedido»: qué se vuelve a agregar, a qué precio, y qué se le dice al
 * cliente cuando algo ya no está.
 *
 * El defecto que este módulo elimina tenía dos caras:
 *  1. la lógica vivía en línea dentro de un componente de página, así que no
 *     había una sola definición de la regla y no se podía probar;
 *  2. sólo existía en la LISTA de pedidos, así que las dos pantallas donde el
 *     cliente puede cancelar terminaban en «contacta a soporte».
 *
 * LA REGLA DE PRECIO es la parte que no se puede equivocar: se rehidrata con el
 * catálogo ACTUAL. El servidor recalcula el subtotal contra la base y rechaza
 * la orden si no coincide al centavo, así que usar el precio congelado hacía
 * fallar «Repetir» en cuanto cambiaba cualquier precio. La prueba R3 lo fija.
 */

const HISTORICO: ReorderSourceItem[] = [
  { product_id: 1, quantity: 2, unit_price: 10, product_name: "Leche", product_image: "leche.png" },
  { product_id: 2, quantity: 1, unit_price: 50, product_name: "Café", product_image: "cafe.png" },
]

function producto(over: Partial<ReorderCatalogProduct> & { id: number }): ReorderCatalogProduct {
  return {
    name: `Producto ${over.id}`,
    slug: `producto-${over.id}`,
    image_url: `img-${over.id}.png`,
    price: 100,
    sale_price: null,
    stock_status: "in_stock",
    brand: "Marca",
    ...over,
  }
}

function catalogo(...ps: ReorderCatalogProduct[]): Map<number, ReorderCatalogProduct> {
  return new Map(ps.map((p) => [p.id, p]))
}

describe("order-reorder · el plan de rehidratación", () => {
  it("R1 · agrega lo que sigue en catálogo, con el precio VIGENTE", () => {
    const plan = buildReorderPlan(
      HISTORICO,
      catalogo(producto({ id: 1, price: 12 }), producto({ id: 2, price: 55 })),
    )

    expect(plan.skipped).toBe(0)
    expect(plan.catalogFailed).toBe(false)
    expect(plan.items).toEqual([
      {
        product_id: 1,
        name: "Producto 1",
        slug: "producto-1",
        image_url: "img-1.png",
        brand: "Marca",
        price: 12,
        sale_price: null,
        quantity: 2,
        stock_status: "in_stock",
      },
      {
        product_id: 2,
        name: "Producto 2",
        slug: "producto-2",
        image_url: "img-2.png",
        brand: "Marca",
        price: 55,
        sale_price: null,
        quantity: 1,
        stock_status: "in_stock",
      },
    ])
  })

  it("R2 · conserva la cantidad pedida y el orden de las partidas", () => {
    const plan = buildReorderPlan(
      [
        { product_id: 9, quantity: 7, unit_price: 1 },
        { product_id: 3, quantity: 4, unit_price: 2 },
      ],
      catalogo(producto({ id: 9 }), producto({ id: 3 })),
    )
    expect(plan.items.map((i) => i.product_id)).toEqual([9, 3])
    expect(plan.items.map((i) => i.quantity)).toEqual([7, 4])
  })

  it("R3 · NO usa el precio histórico cuando el producto sigue en catálogo", () => {
    // El defecto que costó un bug: con el precio congelado, el servidor
    // rechazaba la orden por discrepancia de subtotal.
    const plan = buildReorderPlan(HISTORICO, catalogo(producto({ id: 1, price: 999 })))
    const leche = plan.items.find((i) => i.product_id === 1)!
    expect(leche.price).toBe(999)
    expect(leche.price).not.toBe(10)
  })

  it("R4 · arrastra la oferta vigente y el estado de stock real", () => {
    const plan = buildReorderPlan(
      [{ product_id: 1, quantity: 1, unit_price: 10 }],
      catalogo(producto({ id: 1, price: 100, sale_price: 70, stock_status: "low_stock" })),
    )
    expect(plan.items[0]!.sale_price).toBe(70)
    expect(plan.items[0]!.stock_status).toBe("low_stock")
  })

  it("R5 · un producto agotado se salta y se cuenta, no se agrega", () => {
    const plan = buildReorderPlan(
      HISTORICO,
      catalogo(producto({ id: 1 }), producto({ id: 2, stock_status: "out_of_stock" })),
    )
    expect(plan.items.map((i) => i.product_id)).toEqual([1])
    expect(plan.skipped).toBe(1)
  })

  it("R6 · un producto fuera de catálogo se salta y se cuenta", () => {
    const plan = buildReorderPlan(HISTORICO, catalogo(producto({ id: 1 })))
    expect(plan.items.map((i) => i.product_id)).toEqual([1])
    expect(plan.skipped).toBe(1)
  })

  it("R7 · con el catálogo caído cae al snapshot histórico y NO salta nada", () => {
    const plan = buildReorderPlan(HISTORICO, null)

    expect(plan.catalogFailed).toBe(true)
    expect(plan.skipped).toBe(0)
    expect(plan.items).toEqual([
      {
        product_id: 1,
        name: "Leche",
        slug: "producto-1",
        image_url: "leche.png",
        brand: "",
        price: 10,
        sale_price: null,
        quantity: 2,
        stock_status: "in_stock",
      },
      {
        product_id: 2,
        name: "Café",
        slug: "producto-2",
        image_url: "cafe.png",
        brand: "",
        price: 50,
        sale_price: null,
        quantity: 1,
        stock_status: "in_stock",
      },
    ])
  })

  it("R8 · el catálogo manda sobre el snapshot para nombre e imagen", () => {
    const plan = buildReorderPlan(
      HISTORICO,
      catalogo(producto({ id: 1, name: "Leche Entera 1L", image_url: "nueva.png" })),
    )
    expect(plan.items[0]!.name).toBe("Leche Entera 1L")
    expect(plan.items[0]!.image_url).toBe("nueva.png")
  })

  it("R9 · si el catálogo no trae nombre/imagen, se usa el histórico", () => {
    const plan = buildReorderPlan(
      HISTORICO,
      catalogo(producto({ id: 1, name: "", image_url: null })),
    )
    expect(plan.items[0]!.name).toBe("Leche")
    expect(plan.items[0]!.image_url).toBe("leche.png")
  })

  it("R10 · sin nombre en ninguna de las dos fuentes, hay un nombre de reserva", () => {
    const plan = buildReorderPlan(
      [{ product_id: 42, quantity: 1, unit_price: 5 }],
      catalogo(producto({ id: 42, name: "" })),
    )
    expect(plan.items[0]!.name).toBe("Producto #42")
    expect(plan.items[0]!.slug).toBe("producto-42")
  })

  it("R11 · el snapshot tampoco queda sin nombre ni slug", () => {
    const plan = buildReorderPlan([{ product_id: 77, quantity: 1, unit_price: 5 }], null)
    expect(plan.items[0]!.name).toBe("Producto #77")
    expect(plan.items[0]!.slug).toBe("producto-77")
    expect(plan.items[0]!.image_url).toBe("")
    expect(plan.items[0]!.brand).toBe("")
  })

  it("R12 · una orden vacía no produce nada y no falla", () => {
    const plan = buildReorderPlan([], catalogo(producto({ id: 1 })))
    expect(plan).toEqual({ items: [], skipped: 0, catalogFailed: false })
    expect(reorderFeedback(plan)).toBeNull()
  })

  it("R13 · no muta la entrada", () => {
    const entrada: ReorderSourceItem[] = [
      { product_id: 1, quantity: 2, unit_price: 10, product_name: "Leche" },
    ]
    const copia = JSON.parse(JSON.stringify(entrada))
    buildReorderPlan(entrada, catalogo(producto({ id: 1 })))
    buildReorderPlan(entrada, null)
    expect(entrada).toEqual(copia)
  })
})

describe("order-reorder · lo que se le dice al cliente", () => {
  it("R14 · todo agregado: cuántos productos entraron", () => {
    const plan = buildReorderPlan(
      HISTORICO,
      catalogo(producto({ id: 1 }), producto({ id: 2 })),
    )
    expect(reorderFeedback(plan)).toBe("2 productos agregados al carrito")
  })

  it("R15 · uno solo, en singular (concordancia)", () => {
    const plan = buildReorderPlan(
      [{ product_id: 1, quantity: 1, unit_price: 10 }],
      catalogo(producto({ id: 1 })),
    )
    expect(reorderFeedback(plan)).toBe("1 producto agregado al carrito")
  })

  it("R16 · parcial: dice cuántos quedaron fuera", () => {
    const plan = buildReorderPlan(
      HISTORICO,
      catalogo(producto({ id: 1 }), producto({ id: 2, stock_status: "out_of_stock" })),
    )
    expect(reorderFeedback(plan)).toBe("1 producto ya no está disponible y no se agregó")
  })

  it("R17 · parcial en plural concuerda", () => {
    const plan = buildReorderPlan(
      [
        { product_id: 1, quantity: 1, unit_price: 1 },
        { product_id: 2, quantity: 1, unit_price: 1 },
        { product_id: 3, quantity: 1, unit_price: 1 },
      ],
      catalogo(producto({ id: 1 })),
    )
    expect(reorderFeedback(plan)).toBe("2 productos ya no están disponibles y no se agregó")
  })

  it("R18 · nada disponible: un mensaje propio, no un cero", () => {
    const plan = buildReorderPlan(HISTORICO, catalogo())
    expect(plan.items).toEqual([])
    expect(reorderFeedback(plan)).toBe("Estos productos ya no están disponibles por ahora")
  })

  it("R19 · con el catálogo caído no se le dice que algo faltó", () => {
    const plan = buildReorderPlan(HISTORICO, null)
    expect(reorderFeedback(plan)).toBe("2 productos agregados al carrito")
  })
})

describe("order-reorder · el resolver de una sola partida", () => {
  it("R22 · con catálogo, resuelve con precio vigente y stock real", () => {
    const r = resolveReorderItem(
      { product_id: 1, quantity: 3, unit_price: 10, product_name: "Leche" },
      catalogo(producto({ id: 1, price: 20, sale_price: 15, stock_status: "low_stock" })),
    )
    expect(r).toMatchObject({ price: 20, sale_price: 15, quantity: 3, stock_status: "low_stock" })
  })

  it("R23 · con catálogo, un producto ausente NO es repetible (null)", () => {
    // Antes, la sección «Volver a pedir» del home lo agregaba al precio
    // histórico; el servidor lo rechazaba al confirmar. Ahora no hay ambigüedad.
    expect(resolveReorderItem(HISTORICO[0]!, catalogo(producto({ id: 2 })))).toBeNull()
  })

  it("R24 · conserva el agotado en lugar de descartarlo, para poder deshabilitarlo", () => {
    const r = resolveReorderItem(
      { product_id: 1, quantity: 1, unit_price: 10 },
      catalogo(producto({ id: 1, stock_status: "out_of_stock" })),
    )
    expect(r).not.toBeNull()
    expect(r!.stock_status).toBe("out_of_stock")
  })

  it("R25 · con catálogo caído SÍ es repetible (snapshot, mejor que nada)", () => {
    const r = resolveReorderItem(HISTORICO[0]!, null)
    expect(r).toMatchObject({ price: 10, stock_status: "in_stock", name: "Leche" })
  })

  it("R26 · el plan y el resolver coinciden partida por partida", () => {
    // El guardia de coherencia: no pueden divergir en qué es repetible.
    const cat = catalogo(
      producto({ id: 1 }),
      producto({ id: 2, stock_status: "out_of_stock" }),
    )
    const plan = buildReorderPlan(HISTORICO, cat)
    const repetibles = HISTORICO.map((i) => resolveReorderItem(i, cat)).filter(
      (i): i is NonNullable<typeof i> => i !== null && i.stock_status !== "out_of_stock",
    )
    expect(plan.items).toEqual(repetibles)
    expect(plan.skipped).toBe(HISTORICO.length - repetibles.length)
  })
})

describe("order-reorder · la consulta y el tipo no pueden desincronizarse", () => {
  it("R20 · las columnas del select cubren todos los campos del tipo", () => {
    // Si alguien añade un campo a `ReorderCatalogProduct` y olvida el `select`,
    // el precio llegaría `undefined` y el carrito mostraría NaN.
    const declarados = new Set([
      "id",
      "name",
      "slug",
      "image_url",
      "price",
      "sale_price",
      "stock_status",
      "brand",
    ])
    const pedidos = REORDER_CATALOG_COLUMNS.split(",").map((c) => c.trim())
    expect(new Set(pedidos)).toEqual(declarados)
  })

  it("R21 · un campo ausente en el catálogo se propaga como undefined, no como 0", () => {
    // Control positivo del guardia anterior: si el select se quedara corto, el
    // precio NO llegaría. Aquí se documenta el síntoma.
    const incompleto = { id: 1, name: "X", slug: "x", image_url: null, sale_price: null, stock_status: "in_stock", brand: null } as unknown as ReorderCatalogProduct
    const plan = buildReorderPlan([{ product_id: 1, quantity: 1, unit_price: 10 }], catalogo(incompleto))
    expect(plan.items[0]!.price).toBeUndefined()
  })
})
