/**
 * MarqueePlaceholder — hint de búsqueda animado para inputs de ancho reducido.
 *
 * Se muestra SOLO cuando el input está vacío y sin foco (sibling selector en
 * globals.css: `input.marquee-input:placeholder-shown:not(:focus) + .marquee-placeholder`).
 * El texto viaja de derecha a izquierda en bucle (~14s) para que en móvil se
 * alcance a leer el placeholder completo. Se desactiva en `sm+` y bajo
 * `prefers-reduced-motion` (queda el texto recortado; el label sr-only describe
 * el campo). Decorativo: `aria-hidden`.
 */
export function MarqueePlaceholder({
  text,
  className = "",
}: {
  text: string
  className?: string
}) {
  return (
    <span aria-hidden="true" className={`marquee-placeholder ${className}`}>
      {text}
    </span>
  )
}
