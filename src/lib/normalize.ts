/**
 * Normalización de nombres entre herramientas del panel.
 *
 * Muchas tools (temporada, planificador, inventario, costeo, ventas) hacen joins
 * por nombre de ingrediente/producto sobre `localStorage`. Los nombres vienen con
 * emojis ("🥬 Cilantro"), espacios extra o capitalización distinta, lo que rompe
 * la comparación por igualdad. Esta función es la única fuente de verdad para
 * comparar nombres de forma consistente.
 */
export function normalizeName(name: string): string {
  return (name ?? "")
    // elimina emojis y símbolos decorativos
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{2705}\u{00A9}\u{00AE}\u{2122}]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
