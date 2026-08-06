// Categorías del blog de Resurte.me — especializado en dueños de restaurante.
// El `slug` se usa en el frontmatter de cada post y en los filtros del índice.

export interface BlogCategory {
  slug: string
  label: string
  emoji: string
  description: string
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    slug: "costos",
    label: "Costos y rentabilidad",
    emoji: "💰",
    description: "Food cost, márgenes, precios de menú y ganancias.",
  },
  {
    slug: "operacion",
    label: "Operación y cocina",
    emoji: "👨‍🍳",
    description: "Mermas, inventario, planificación y procesos en cocina.",
  },
  {
    slug: "proveeduria",
    label: "Proveeduría y compras",
    emoji: "🚚",
    description: "Compra por mayoreo, proveedores y abastecimiento.",
  },
  {
    slug: "marketing",
    label: "Marketing y crecimiento",
    emoji: "📣",
    description: "Google Maps, reseñas, redes, delivery y clientes nuevos.",
  },
  {
    slug: "herramientas",
    label: "Herramientas y tecnología",
    emoji: "🛠️",
    description: "Panel de Resurte, menú digital y apps para tu negocio.",
  },
  {
    slug: "industria",
    label: "Industria y tendencias",
    emoji: "📊",
    description: "Datos del sector restaurantero en México y tendencias.",
  },
]

export function getCategory(slug: string): BlogCategory {
  return (
    BLOG_CATEGORIES.find((c) => c.slug === slug) ?? {
      slug,
      label: slug,
      emoji: "📄",
      description: "",
    }
  )
}
