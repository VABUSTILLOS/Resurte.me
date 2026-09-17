/**
 * Matemática del focus trap de Tab en diálogos y bottom sheets.
 *
 * Dado el índice (dentro del panel) del elemento que tiene el foco y cuántos
 * elementos enfocables hay, devuelve el índice que debe recibirlo. Devuelve
 * `-1` cuando no hay nada que hacer y el navegador debe seguir con su
 * comportamiento nativo; cualquier otro valor obliga al llamador a hacer
 * `preventDefault()` y mover el foco a ese índice.
 *
 * Un `currentIndex` fuera de rango (normalmente `-1`) significa que el foco se
 * escapó del panel —p. ej. porque el elemento enfocado se desmontó—: se
 * recaptura en el primer elemento, o en el último si se navega hacia atrás.
 */
export function nextTrapFocus(currentIndex: number, count: number, shift: boolean): number {
  if (count <= 0) return -1
  if (currentIndex < 0 || currentIndex >= count) return shift ? count - 1 : 0
  if (shift && currentIndex === 0) return count - 1
  if (!shift && currentIndex === count - 1) return 0
  return -1
}

/** Selector de elementos enfocables dentro de un panel. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
