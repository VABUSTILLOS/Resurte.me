/**
 * order-reorder.contract.test.ts
 * ==============================
 * Congela **una sola definición** de «qué se puede volver a pedir y a qué
 * precio», y congela que las superficies donde el cliente cancela ofrezcan una
 * salida.
 *
 * Qué protege
 * -----------
 * Antes de este cambio, «Repetir pedido» existía **sólo en la lista de pedidos**
 * y su lógica estaba escrita en línea dentro del componente de página. Eso
 * producía dos defectos reales:
 *
 *   1. **Callejón sin salida.** Las dos pantallas donde el cliente PUEDE
 *      cancelar —el detalle del pedido y el seguimiento— no ofrecían ninguna
 *      forma de volver a pedir: al cancelar mostraban «contacta a soporte» y
 *      ahí terminaba el recorrido. Como «modificar» un pedido no se puede
 *      resolver editándolo (exigiría re-reservar stock y, si ya está cobrado,
 *      una devolución que `payments.ts` no sabe hacer), la vía honesta es
 *      cancelar y volver a pedir — y esa vía tiene que estar disponible justo
 *      donde el cliente acaba de cancelar.
 *
 *   2. **Tres copias divergentes.** La lista, la sección «Volver a pedir» del
 *      home y el carrito reimplementaban la regla. La copia del home no
 *      distinguía «fuera de catálogo» de «catálogo caído»: agregaba el producto
 *      al precio histórico, y el servidor —que recalcula el subtotal contra la
 *      base y rechaza la orden si no coincide al centavo— lo rechazaba al
 *      confirmar.
 *
 * Cómo se reintroduce el defecto
 * ------------------------------
 *   a) volver a escribir la rehidratación dentro de un componente en vez de
 *      llamar a `buildReorderPlan` (el marcador es el slug de reserva
 *      `producto-${…}`, que sólo el módulo debe producir);
 *   b) quitar el botón de una de las dos pantallas de cancelación, dejando otra
 *      vez al cliente sin salida;
 *   c) volver a agregar un producto al precio histórico en vez del vigente;
 *   d) duplicar el texto del aviso (`agregados al carrito`) fuera del módulo;
 *   e) que el botón no detenga el clic y, dentro del `<Link>` de la tarjeta,
 *      repetir el pedido navegue además al detalle;
 *   f) que la ruta de seguimiento deje de mandar `product_id`, con lo que la
 *      pantalla de seguimiento pierde la capacidad de volver a pedir.
 *
 * El test es estático y sin base de datos: mide el código, no el runtime. La
 * conducta del plan la cubre `order-reorder.test.ts` (26 casos).
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { REORDER_CATALOG_COLUMNS, buildReorderPlan, reorderFeedback } from "@/lib/order-reorder"
import type { ReorderCatalogProduct, ReorderSourceItem } from "@/lib/order-reorder"

const REPO = process.cwd()

/** La única definición de la regla de rehidratación. */
const MODULO_DE_LA_REGLA = "src/lib/order-reorder.ts"

/** La única implementación del botón. */
const BOTON = "src/components/shop/repeat-order-button.tsx"

/**
 * Las dos pantallas donde el cliente puede cancelar. Son el corazón de este
 * contrato: cancelar no puede terminar en «contacta a soporte».
 */
const SUPERFICIES_DE_CANCELACION = [
  "src/app/[slug]/mis-pedidos/[orderId]/order-detail-client.tsx",
  "src/app/[slug]/pedido/[orderId]/tracking-client.tsx",
] as const

/** La lista de pedidos y la sección del home: los otros dos consumidores. */
const OTRAS_SUPERFICIES = [
  "src/app/[slug]/mis-pedidos/page.tsx",
  "src/components/shop/reorder-section.tsx",
] as const

/** La ruta que alimenta la pantalla de seguimiento. */
const RUTA_DE_SEGUIMIENTO = "src/app/api/orders/[id]/track/route.ts"

function leer(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8")
}

/**
 * Quita comentarios de línea y de bloque. Necesario porque los comentarios
 * NOMBRAN los defectos que se están explicando (`order-reorder.ts` cita el
 * slug de reserva, el botón cita el `<Link>`): sin esto el analizador se
 * delata a sí mismo.
 */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

function listarArchivos(dir: string): string[] {
  const abs = join(REPO, dir)
  const out: string[] = []
  for (const entry of readdirSync(abs)) {
    const rel = `${dir}/${entry}`
    if (statSync(join(REPO, rel)).isDirectory()) {
      out.push(...listarArchivos(rel))
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(rel)
    }
  }
  return out
}

const ARCHIVOS = listarArchivos("src")
const CODIGO = new Map(ARCHIVOS.map((rel) => [rel, sinComentarios(leer(rel))]))

describe("order-reorder · una sola definición de la regla", () => {
  it("R1 · canario: el analizador está viendo el repositorio, no una carpeta vacía", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(300)
  })

  it("R2 · sólo el módulo rehidrata una partida contra el catálogo", () => {
    // El marcador es la TRIPLE que define la regla: se lee el precio vigente
    // (`current.price` / `current.sale_price`) y el histórico (`item.unit_price`)
    // convive en el mismo archivo. Quien escribe esa triple está
    // reconstruyendo la regla por su cuenta.
    //
    // No se usa el slug de reserva `producto-${…}` como marcador porque
    // `api/cart/restore` y `app/cart` lo producen legítimamente: restaurar un
    // carrito persistido es otra función, con su propio snapshot, y no vuelve
    // a pedir un pedido.
    const infractores = ARCHIVOS.filter((rel) => {
      if (rel === MODULO_DE_LA_REGLA) return false
      const src = CODIGO.get(rel) ?? ""
      return src.includes("current.price") && src.includes("item.unit_price")
    })
    expect(infractores).toEqual([])
  })

  it("R3 · quien arma un plan recibe el aviso del módulo, no lo escribe", () => {
    // El texto «N productos agregados al carrito» también existe en toasts
    // genéricos de otros flujos (favoritos, listas compartidas, tarjeta de
    // producto), y ahí es otra función: no hay un pedido de por medio. Lo que
    // sí es la regla de repetir un pedido es que NADIE construya el aviso a
    // partir de un plan: quien llama a `buildReorderPlan` tiene que llamar
    // también a `reorderFeedback`.
    const consumidores = ARCHIVOS.filter(
      (rel) => rel !== MODULO_DE_LA_REGLA && (CODIGO.get(rel) ?? "").includes("buildReorderPlan("),
    )
    expect(consumidores.length, "control positivo: hay consumidores que medir").toBeGreaterThan(0)
    for (const rel of consumidores) {
      expect(CODIGO.get(rel) ?? "", `${rel} arma el aviso por su cuenta`).toContain(
        "reorderFeedback(",
      )
    }
  })

  it("R4 · el módulo es quien decide el precio vigente", () => {
    const src = CODIGO.get(MODULO_DE_LA_REGLA) ?? ""
    expect(src).toContain("sale_price: current.sale_price")
    expect(src).toContain("price: current.price")
    expect(src).toContain("REORDER_CATALOG_COLUMNS")
  })

  it("R5 · control negativo: el analizador SÍ distingue un archivo que sí lo escribe", () => {
    // Si `sinComentarios` o el filtro se rompieran, R2 y R3 pasarían por
    // vacuidad. Aquí se comprueba que el módulo real coincide.
    const src = CODIGO.get(MODULO_DE_LA_REGLA) ?? ""
    expect(src).toContain("current.price")
    expect(src).toContain("item.unit_price")
    // Y que la concordancia sigue viva: el singular no puede volver.
    expect(src).toContain('"agregados" : "agregado"')
  })
})

describe("order-reorder · cancelar no puede ser un callejón sin salida", () => {
  it("R6 · las dos pantallas de cancelación ofrecen volver a pedir", () => {
    for (const rel of SUPERFICIES_DE_CANCELACION) {
      const src = CODIGO.get(rel)
      expect(src, `${rel} no existe`).toBeDefined()
      expect(src, `${rel} no ofrece volver a pedir`).toContain("<RepeatOrderButton")
      expect(src, `${rel} no importa el botón`).toContain(
        'from "@/components/shop/repeat-order-button"',
      )
    }
  })

  it("R7 · y siguen preguntándole a la regla de cancelación", () => {
    // Lo exige `order-cancellation.contract.test.ts` R5; se repite aquí porque
    // la edición que añade el botón toca justo esas líneas.
    for (const rel of SUPERFICIES_DE_CANCELACION) {
      expect(CODIGO.get(rel) ?? "", `${rel} dejó de preguntar`).toContain(
        "customerCancelRefusal(",
      )
    }
  })

  it("R8 · las otras dos superficies también usan la fuente compartida", () => {
    expect(CODIGO.get(OTRAS_SUPERFICIES[0]) ?? "").toContain("<RepeatOrderButton")
    const home = CODIGO.get(OTRAS_SUPERFICIES[1]) ?? ""
    expect(home).toContain("buildReorderPlan(")
    expect(home).toContain("resolveReorderItem(")
    expect(home).toContain("reorderFeedback(")
  })

  it("R9 · el botón detiene el clic: en la lista vive dentro de un <Link>", () => {
    const src = CODIGO.get(BOTON) ?? ""
    expect(src).toContain("e.preventDefault()")
    expect(src).toContain("e.stopPropagation()")
  })

  it("R10 · el botón no reimplementa la regla: sólo la llama", () => {
    const src = CODIGO.get(BOTON) ?? ""
    expect(src).toContain("buildReorderPlan(")
    expect(src).toContain("reorderFeedback(")
    expect(src).toContain("REORDER_CATALOG_COLUMNS")
    expect(src).not.toContain("current.price")
  })
})

describe("order-reorder · la ruta de seguimiento puede alimentar el botón", () => {
  it("R11 · manda `product_id` en cada partida", () => {
    // Sin `product_id` la pantalla de seguimiento no tiene qué consultar en el
    // catálogo, así que el botón quedaría inerte: exactamente el defecto que
    // este contrato elimina.
    const src = CODIGO.get(RUTA_DE_SEGUIMIENTO) ?? ""
    expect(src).toContain("product_id:")
    expect(src).toMatch(/product_id:\s*item\.products\?\.id/)
  })
})

describe("order-reorder · el módulo y su contrato siguen de acuerdo", () => {
  it("R12 · el texto del aviso sale del módulo, no del componente", () => {
    const vacio = buildReorderPlan([], new Map())
    expect(reorderFeedback(vacio)).toBeNull()

    const items: ReorderSourceItem[] = [
      { product_id: 1, quantity: 1, unit_price: 10 },
      { product_id: 2, quantity: 1, unit_price: 10 },
    ]
    const cat = new Map<number, ReorderCatalogProduct>([
      [
        1,
        {
          id: 1,
          name: "A",
          slug: "a",
          image_url: null,
          price: 11,
          sale_price: null,
          stock_status: "in_stock",
          brand: null,
        },
      ],
      [
        2,
        {
          id: 2,
          name: "B",
          slug: "b",
          image_url: null,
          price: 12,
          sale_price: null,
          stock_status: "out_of_stock",
          brand: null,
        },
      ],
    ])
    expect(reorderFeedback(buildReorderPlan(items, cat))).toBe(
      "1 producto ya no está disponible y no se agregó",
    )
    expect(buildReorderPlan(items, cat).items[0]!.price).toBe(11)
  })

  it("R13 · las columnas del select están declaradas una sola vez", () => {
    const infractores = ARCHIVOS.filter(
      (rel) =>
        rel !== MODULO_DE_LA_REGLA &&
        CODIGO.get(rel)?.includes("stock_status, brand") &&
        !rel.endsWith(".test.ts"),
    )
    expect(infractores).toEqual([])
    expect(REORDER_CATALOG_COLUMNS).toContain("stock_status")
  })
})
