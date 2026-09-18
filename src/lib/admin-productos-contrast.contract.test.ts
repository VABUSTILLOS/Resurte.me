import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrato de contraste del perímetro de productos (B36).
 *
 * El panel de admin **no** entra en `e2e/a11y.spec.ts`: `/admin/productos` exige
 * sesión, así que axe nunca lo ha recorrido y el `✅` de C14 (deuda AA de las
 * rutas públicas) no cubría esta superficie. Por eso la deuda de contraste se
 * quedó ahí sin que nada la señalara.
 *
 * Las ratios de abajo están calculadas con la matemática real de WCAG sobre el
 * color compuesto (no sobre el token nominal), en sRGB:
 *
 *   FALLABAN                              AHORA
 *   blanco sobre bg-amber-600   3.20:1    blanco sobre bg-amber-700   5.03:1
 *   blanco sobre bg-green-600   3.22:1    blanco sobre bg-green-700   4.95:1
 *   blanco sobre bg-amber-500   2.13:1    (ya no se usa como relleno)
 *   blanco sobre blanco/20*     3.51:1    blanco sobre negro/20*      7.03:1
 *   amber-600 sobre amber-50    3.09:1    amber-700 sobre amber-50    4.85:1
 *   green-600 sobre green-50    3.08:1    green-700 sobre green-50    4.72:1
 *   red-600 sobre red-50        4.36:1    red-700 sobre red-50        5.87:1
 *   gray-500 sobre gray-100     4.39:1    gray-600 sobre gray-100     6.87:1
 *   red-500 sobre red-50        3.48:1    red-700 sobre red-50        5.87:1
 *   amber-600 sobre blanco      3.20:1    amber-700 sobre blanco      5.03:1
 *   gray-300 sobre blanco       1.47:1    gray-500 sobre blanco       4.84:1
 *
 *   * el chip de conteo vive **dentro** del botón de filtro activo, así que su
 *     fondo se compone con el del botón: aclararlo con blanco empeora el texto
 *     blanco. Se oscurece.
 *
 * Controles superpuestos a la miniatura de galería (`ProductFormModal`): el
 * scrim del 40% sobre una foto **blanca** deja `#999999`, y ahí `text-white/70`
 * daba 2.16:1, la estrella 2.15:1 y el hover rojo 1.48:1. Al 60% el hover rojo
 * se queda en 2.99:1, por debajo del 3:1 que exige 1.4.11 para glifos. Al 70%
 * (`#4d4d4d`) quedan 5.16 / 6.37 / 4.40: el único scrim que pasa **cualquier**
 * foto, incluida una quemada a blanco.
 *
 * Regla general que fija este test: un `-600` de amber/verde **no** es válido ni
 * como relleno (con texto blanco) ni como color de texto sobre fondos claros;
 * sube a `-700` (y a `-800` cuando el fondo es `-200`). Los grises `-300`/`-400`
 * decorativos (`aria-hidden`, placeholders `—`, iconos de estado vacío) quedan
 * fuera del contrato: no son texto informativo.
 *
 * Los archivos son `.tsx` y el entorno de vitest es `node` (sin jsdom), así que
 * el contrato se fija sobre el texto del archivo, igual que en
 * `admin-restock-a11y.contract.test.ts`.
 */

const SRC = join(process.cwd(), "src", "app", "admin")

const PERIMETRO = [
  join(SRC, "productos", "page.tsx"),
  join(SRC, "components", "ProductFormModal.tsx"),
  join(SRC, "components", "ImportProductsModal.tsx"),
  join(SRC, "components", "ProductsSkeleton.tsx"),
  join(SRC, "components", "RowActionMenu.tsx"),
  join(SRC, "components", "RestockPanel.tsx"),
]

/** Sin comentarios: las aserciones hablan del código, no de lo que dice de él. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

function leer(file: string): string {
  return stripComments(readFileSync(file, "utf8"))
}

const page = leer(PERIMETRO[0]!)
const modal = leer(PERIMETRO[1]!)
const importModal = leer(PERIMETRO[2]!)
const rowMenu = leer(PERIMETRO[4]!)
const restock = leer(PERIMETRO[5]!)

/** Cuenta ocurrencias literales de un fragmento de clase. */
function contar(src: string, token: string): number {
  return src.split(token).length - 1
}

describe("perímetro de productos — contraste (B36)", () => {
  it("no reintroduce los rellenos de color que no aguantan texto blanco", () => {
    for (const file of PERIMETRO) {
      const src = leer(file)
      expect(src, `${file} usa bg-amber-500`).not.toContain("bg-amber-500")
      expect(src, `${file} usa bg-amber-600`).not.toContain("bg-amber-600")
      expect(src, `${file} usa bg-green-600`).not.toContain("bg-green-600")
    }
  })

  it("no reintroduce los colores de texto -600 sobre fondos claros", () => {
    for (const file of PERIMETRO) {
      const src = leer(file)
      expect(src, `${file} usa text-amber-500`).not.toContain("text-amber-500")
      expect(src, `${file} usa text-amber-600`).not.toContain("text-amber-600")
      expect(src, `${file} usa text-green-600`).not.toContain("text-green-600")
      expect(src, `${file} usa text-amber-600/80`).not.toContain("text-amber-600/80")
    }
  })

  it("no reintroduce los grises de texto que no llegan a 4.5:1", () => {
    // `text-gray-400` = 2.60:1 sobre blanco y `text-brand-400` = 2.15:1 sobre
    // `brand-50`. La ronda 15 los barrió a `gray-600` / `brand-600` en todo
    // `/admin/**`, incluidos estos 6 archivos. El trinquete impide que vuelvan.
    for (const file of PERIMETRO) {
      const src = leer(file)
      expect(src, `${file} usa text-gray-400`).not.toContain("text-gray-400")
      expect(src, `${file} usa text-brand-400`).not.toContain("text-brand-400")
    }
  })

  it("no reintroduce el chip translúcido blanco dentro del botón activo", () => {
    for (const file of PERIMETRO) {
      expect(leer(file), `${file} usa bg-white/20 text-white`).not.toContain("bg-white/20 text-white")
    }
  })

  it("sube los rellenos primarios de amber y verde a 700", () => {
    expect(contar(page, '"bg-amber-700 text-white"')).toBe(7)
    expect(contar(page, "bg-green-700 text-white")).toBe(3)
    expect(page).toContain("bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800")
    expect(modal).toContain("bg-amber-700")
    expect(modal).toContain("hover:bg-amber-800")
    expect(modal).not.toContain("hover:bg-amber-700")
  })

  it("oscurece el chip de conteo en vez de aclararlo", () => {
    expect(contar(page, '"bg-black/20 text-white"')).toBe(12)
  })

  it("sube los chips inactivos al shade que sí contrasta con su fondo", () => {
    expect(contar(page, '"bg-amber-50 text-amber-700"')).toBe(8)
    expect(contar(page, '"bg-red-50 text-red-700"')).toBe(4)
    expect(contar(page, '"bg-green-50 text-green-700"')).toBe(2)
    expect(contar(page, '"bg-gray-100 text-gray-600"')).toBe(4)
  })

  it("sube el texto ámbar suelto a 700", () => {
    // La rama hermana (contador dentro de límite) era `text-gray-400` = 2.60:1
    // sobre blanco; la ronda 15 la subió a `text-gray-600` = 7.24:1.
    expect(page).toContain('? "text-amber-700" : "text-gray-600"')
    expect(page).toContain("font-semibold text-amber-800 bg-amber-50 border border-amber-200")
    expect(contar(modal, '? "text-amber-700" : "text-gray-600"')).toBe(2)
  })

  it("deja legible la afordancia destructiva que estaba en gray-300", () => {
    expect(page).toContain("p-1.5 rounded-lg text-gray-500 hover:text-red-700 hover:bg-red-50")
    expect(page).not.toContain("text-gray-300 hover:text-red-500")
  })

  it("deja legible el rojo de error de 11px en los modales", () => {
    expect(importModal).toContain('"text-[11px] text-red-700"')
    expect(importModal).not.toContain("text-red-500")
    expect(rowMenu).toContain('"text-red-700 hover:bg-red-50"')
  })

  it("nunca pone texto blanco sobre un relleno que no contrasta", () => {
    // Rellenos con >=4.5:1 frente a texto blanco. Cualquier relleno nuevo que
    // aparezca aquí tiene que estar medido y añadirse a la lista.
    const PERMITIDOS = new Set([
      "bg-brand-500",
      "bg-brand-600",
      "bg-amber-700",
      "bg-amber-800",
      "bg-green-700",
      "bg-green-800",
      "bg-red-600",
      "bg-red-700",
      "bg-gray-700",
      "bg-gray-900",
      "bg-gray-900/80",
      "bg-black/20",
      "bg-violet-600",
      "bg-purple-600",
      "bg-pink-600",
      "bg-indigo-600",
    ])
    const sinRelleno: string[] = []
    for (const file of PERIMETRO) {
      const src = leer(file)
      for (const m of src.matchAll(/text-white(?:\/\d+)?/g)) {
        const ctx = src.slice(Math.max(0, m.index - 90), m.index)
        const rellenos = [
          ...ctx.matchAll(
            /bg-(?:brand|amber|green|red|gray|violet|purple|pink|indigo)-(?:400|500|600|700|800|900)(?:\/\d+)?|bg-black\/\d+/g,
          ),
        ].map((x) => x[0])
        const relleno = rellenos.at(-1)
        if (!relleno) {
          sinRelleno.push(`${file}:${src.slice(0, m.index).split("\n").length}`)
          continue
        }
        expect(PERMITIDOS.has(relleno), `${file} pinta texto blanco sobre ${relleno}`).toBe(true)
      }
    }
    // Cuatro sitios sin relleno propio, porque lo heredan de un ancestro:
    // - `page.tsx`: el conteo del chip "Todos" hereda `bg-brand-500` del botón
    //   padre vía `chipClass(active)`.
    // - `ProductFormModal.tsx`: los tres glifos de la tira de la galería (las dos
    //   variantes de la estrella y el botón de quitar) heredan el scrim
    //   `bg-black/70`, que se verifica en el test siguiente.
    expect(sinRelleno).toHaveLength(4)
  })

  it("oscurece el scrim de la miniatura lo suficiente para cualquier foto", () => {
    // Sobre una foto quemada a blanco, el 40% dejaba 2.16:1 en el texto y
    // 1.48:1 en el hover destructivo; el 70% los lleva a 5.16 y 4.40.
    expect(modal).toContain("flex justify-between bg-black/70 px-0.5")
    expect(modal).not.toContain("flex justify-between bg-black/40")
    expect(modal).toContain('? "text-yellow-300" : "text-white/70 hover:text-white"')
    expect(modal).toContain('className="p-0.5 text-white/70 hover:text-red-300"')
  })

  it("mantiene el panel de reabasto dentro del mismo contrato", () => {
    expect(restock).toContain("bg-amber-700")
    expect(restock).toContain("bg-amber-800")
    expect(restock).not.toContain("bg-amber-50 text-amber-600")
  })
})
