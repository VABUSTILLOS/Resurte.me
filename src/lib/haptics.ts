/**
 * Haptics — micro-vibración táctil en acciones clave (agregar al carrito,
 * confirmar checkout). Mejora la percepción de respuesta en móvil.
 * Fail-safe: no-op en escritorio, iOS Safari (sin API) y contextos sin
 * permiso; nunca lanza.
 */
export function haptic(pattern: number | number[] = 10): void {
  if (typeof navigator === "undefined") return
  if (!("vibrate" in navigator)) return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* vibración no soportada/permitida — ignorar */
  }
}
