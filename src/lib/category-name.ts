/**
 * Nombre de categoría: comparación para detectar duplicados.
 *
 * POR QUÉ EXISTE
 * --------------
 * `slugify` garantiza que dos categorías no choquen en la URL, pero **no**
 * impide dos nombres iguales: crear "Frutas y Verduras" tres veces produjo
 * `frutas-y-verduras`, `-2` y `-3`, tres categorías distintas con el mismo
 * nombre visible. Pasó porque el alta no daba confirmación visible y el usuario
 * lo reintentó; el slug único convirtió el reintento en basura silenciosa en
 * vez de en un error.
 *
 * La comparación es la del ojo humano, no la de la URL: "Frutas y Verduras",
 * "frutas y verduras" y "Frutas  y  Verduras" son el mismo nombre. Se ignoran
 * mayúsculas, acentos y espacios de más — lo contrario deja pasar duplicados
 * que el admin ve como idénticos.
 *
 * Puro y sin dependencias: se prueba sin montar nada.
 */

/** Forma canónica de un nombre para comparar (no para guardar). */
export function normalizeCategoryName(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/\s+/g, " ")
    .trim()
}

export interface NamedCategory {
  id: number
  name: string
}

/**
 * Categoría existente con el mismo nombre normalizado, o `null`.
 *
 * Devuelve la primera coincidencia, así que el llamador puede nombrarla en el
 * error: "ya existe «Frutas y Verduras»" es accionable; "nombre duplicado" no.
 */
export function findCategoryByName<T extends NamedCategory>(
  categories: readonly T[],
  name: string
): T | null {
  const target = normalizeCategoryName(name)
  if (!target) return null
  for (const category of categories) {
    if (normalizeCategoryName(category.name) === target) return category
  }
  return null
}
