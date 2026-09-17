import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrato de accesibilidad del modal de producto (`ProductFormModal`).
 *
 * La página del listado y el modal resuelven la MISMA decisión —recortar la
 * imagen a 1:1 antes de subirla— pero por caminos distintos: el listado usa el
 * diálogo accesible de `useConfirmDialog` (B3) y el modal usaba
 * `window.confirm` (B33). Un diálogo nativo bloquea el hilo, no se puede
 * estilar y, sobre todo, se salta el trap de foco que el modal monta: el foco
 * se iba a la ventana del sistema y al volver quedaba fuera del `aria-modal`.
 *
 * Nada ata las dos mitades: el modal puede volver a `window.confirm` y seguir
 * compilando, y el `confirm` que la página le pasa puede dejar de llegar sin
 * que ningún tipo se queje si alguien lo hace opcional. Estas pruebas fijan el
 * contrato en el texto de los dos archivos, que es lo único estable aquí
 * (el componente no tiene pruebas de unidad: es `.tsx` y el entorno de vitest
 * es `node`, sin jsdom).
 */

const MODAL = join(process.cwd(), "src", "app", "admin", "components", "ProductFormModal.tsx")
const PAGE = join(process.cwd(), "src", "app", "admin", "productos", "page.tsx")

/** Sin comentarios: las aserciones hablan del código, no de lo que dice de él. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const modal = stripComments(readFileSync(MODAL, "utf8"))
const page = stripComments(readFileSync(PAGE, "utf8"))

/** Cuerpo de `uploadGalleryImage`, hasta el cierre de la función. */
function uploadBody(): string {
  const start = modal.indexOf("async function uploadGalleryImage(")
  expect(start).toBeGreaterThan(-1)
  return modal.slice(start, start + 2000)
}

describe("contrato a11y del modal de producto", () => {
  it("no queda ningún diálogo nativo en la superficie de productos", () => {
    for (const [name, src] of [
      ["ProductFormModal.tsx", modal],
      ["productos/page.tsx", page],
    ] as const) {
      expect(src, name).not.toMatch(/window\.(confirm|prompt|alert)\s*\(/)
    }
  })

  it("el recorte 1:1 del modal pasa por el diálogo accesible", () => {
    const body = uploadBody()
    expect(body).toMatch(/await confirm\(/)
    // Mismas etiquetas que el listado: la decisión es la misma y debe leerse igual.
    expect(body).toContain("¿Recortar la imagen a cuadrado (1:1)?")
    expect(body).toContain('confirmLabel: "Recortar"')
    expect(body).toContain('cancelLabel: "Usar original"')
  })

  it("conserva el fallback: si el recorte falla, sube el original", () => {
    const body = uploadBody()
    expect(body).toMatch(/try \{\s*upload = await cropImageToSquare\(file\)\s*\} catch \{/)
    expect(body).toMatch(/form\.append\("file", upload, file\.name\)/)
  })

  it("el modal no monta un segundo diálogo: lo recibe de la página", () => {
    // Dos `useConfirmDialog()` serían dos diálogos en el DOM y dos traps de Tab.
    expect(modal).not.toMatch(/useConfirmDialog\s*\(/)
    expect(page.match(/useConfirmDialog\s*\(/g)).toHaveLength(1)
  })

  it("`confirm` es una prop obligatoria y la página la pasa", () => {
    expect(modal).toMatch(/confirm: \(options: ConfirmDialogOptions \| string\) => Promise<boolean>/)
    expect(modal).toMatch(/\n\s*confirm,\n\}: ProductFormModalProps\)/)
    expect(page).toMatch(/<ProductFormModal[\s\S]*?\n\s*confirm=\{confirm\}\n\s*\/>/)
  })

  it("el diálogo es hermano del modal, no hijo: el trap de Escape/Tab no choca", () => {
    // Si el diálogo quedara dentro del `<form role="dialog">`, el Escape
    // dispararía además `requestClose()` del modal y el trap de Tab del modal
    // competiría con el del diálogo.
    const modalRender = page.indexOf("<ProductFormModal")
    const dialogMount = page.indexOf("{confirmDialog}", modalRender)
    expect(modalRender).toBeGreaterThan(-1)
    expect(dialogMount).toBeGreaterThan(modalRender)
  })

  it("anuncia el trabajo asíncrono con una región viva", () => {
    expect(modal).toMatch(/role="status" aria-live="polite" className="sr-only"/)
    expect(modal).toContain("Subiendo imagen…")
    expect(modal).toContain("Imagen agregada a la galería")
    expect(modal).toContain("Guardando el producto…")
  })

  it("marca los botones asíncronos con `aria-busy`", () => {
    expect(modal).toMatch(/disabled=\{uploadingImg\}\s*aria-busy=\{uploadingImg\}/)
    expect(modal).toMatch(/disabled=\{saving \|\| staleWrite !== null\}\s*aria-busy=\{saving\}/)
  })

  it("vacía la región viva cuando el error ya se anuncia con `role=\"alert\"`", () => {
    // Duplicar el mismo texto en `role="alert"` y en la región viva hace que el
    // lector de pantalla lo lea dos veces.
    const occurrences = modal.match(/setLiveStatus\(""\)/g) ?? []
    expect(occurrences.length).toBeGreaterThanOrEqual(2)
  })
})
