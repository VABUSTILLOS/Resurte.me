/**
 * Primitivas de tasa compartidas por los embudos del panel.
 *
 * Vive en su propio módulo porque la regla que implementa es una invariante del
 * proyecto, no un detalle de un embudo: **una tasa sin denominador es `null`**
 * ("No medido"), nunca `0%`. Pintar 0 ahí hace que el panel parezca roto cuando
 * en realidad está vacío, y esconde la diferencia entre "nadie convirtió" y
 * "todavía no hay nada que medir".
 *
 * Los embudos de leads (`crm-funnel.ts`) y de pedidos (`conversion-funnel.ts`)
 * la importan de aquí en vez de llevar cada uno su copia.
 *
 * Módulo puro: sin Supabase y sin React, para poder probar los bordes.
 */

/** Tasa en porcentaje entero, o `null` si el denominador es cero. */
export function rate(part: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((part / total) * 100)
}

/** Formatea una tasa para la UI sin inventar un cero cuando no se midió. */
export function formatRate(value: number | null): string {
  return value === null ? "No medido" : `${value}%`
}
