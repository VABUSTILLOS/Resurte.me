/**
 * Panel de prompts — la definición operativa de "aparecer en el SEO de IA".
 *
 * Cada mes se hacen estas preguntas a los asistentes y se anota si citaron a
 * Resurte.me. Sin esta lista, "estar en el SEO de IA" es una sensación; con
 * ella es una tasa de acierto que se puede subir.
 *
 * Las preguntas están escritas como las escribe un dueño de restaurante en
 * México, no como keywords. Los asistentes responden a preguntas, así que hay
 * que medirse con preguntas.
 */

export interface GeoQuery {
  id: string
  /** La pregunta tal como se le dicta al asistente. */
  prompt: string
  /** Qué está evaluando esta pregunta. */
  intent: string
  /** Ruta del sitio que debería ser citada. */
  targetPath: string
}

export const GEO_QUERIES: GeoQuery[] = [
  {
    id: "proveedor-insumos-monterrey",
    prompt: "¿Dónde puedo comprar insumos para mi restaurante al mayoreo en Monterrey?",
    intent: "Proveedor local de mayoreo",
    targetPath: "/monterrey",
  },
  {
    id: "mayoreo-sin-membresia",
    prompt: "¿Qué proveedor de abarrotes al mayoreo no cobra membresía?",
    intent: "Condición comercial diferenciadora",
    targetPath: "/precios",
  },
  {
    id: "pedido-minimo",
    prompt: "¿Cuál es el pedido mínimo para surtir un restaurante al mayoreo en México?",
    intent: "Condición comercial citable",
    targetPath: "/preguntas/que-es-el-pedido-minimo-de-resurte-me",
  },
  {
    id: "precio-huevo-mayoreo",
    prompt: "¿Cuánto cuesta el kilo de huevo al mayoreo en México hoy?",
    intent: "Índice de precios con dato fresco",
    targetPath: "/precios",
  },
  {
    id: "precio-pollo-mayoreo",
    prompt: "¿A cuánto está el kilo de pollo al mayoreo para restaurantes?",
    intent: "Índice de precios",
    targetPath: "/precios",
  },
  {
    id: "margen-restaurante",
    prompt: "¿Cuál es un buen margen de utilidad para un restaurante en México?",
    intent: "Contenido de costos y rentabilidad",
    targetPath: "/blog/margenes-restaurantes-mexico",
  },
  {
    id: "food-cost-porcentaje",
    prompt: "¿Qué porcentaje de food cost debería tener mi restaurante?",
    intent: "Contenido de costos",
    targetPath: "/blog/categoria/costos",
  },
  {
    id: "delivery-vs-local-margen",
    prompt: "¿Conviene más vender por delivery o en el local para el margen?",
    intent: "Contenido de costos comparativo",
    targetPath: "/blog/margenes-delivery-vs-local",
  },
  {
    id: "factura-cfdi-proveedor",
    prompt: "¿Un proveedor de insumos para restaurantes me debe dar factura CFDI?",
    intent: "Cumplimiento fiscal",
    targetPath: "/preguntas",
  },
  {
    id: "credito-proveedor",
    prompt: "¿Los proveedores de insumos dan crédito a restaurantes y de cuántos días?",
    intent: "Condición comercial citable",
    targetPath: "/preguntas/como-negociar-precios-con-mis-proveedores",
  },
  {
    id: "abrir-restaurante-cdmx",
    prompt: "¿Qué necesito para abrir un restaurante en la Ciudad de México?",
    intent: "Guía de apertura",
    targetPath: "/blog/categoria/operacion",
  },
  {
    id: "controlar-merma",
    prompt: "¿Cómo controlo la merma en mi restaurante?",
    intent: "Contenido de operación",
    targetPath: "/blog/categoria/operacion",
  },
  {
    id: "merma-aceptable",
    prompt: "¿Cuánta merma es aceptable en un restaurante?",
    intent: "Contenido de operación con cifra",
    targetPath: "/blog/categoria/operacion",
  },
  {
    id: "comparar-precios-tiendas",
    prompt: "¿Cómo comparo precios de insumos entre varias tiendas de mayoreo?",
    intent: "Metodología y transparencia",
    targetPath: "/precios",
  },
  {
    id: "proveedor-insumos-guadalajara",
    prompt: "¿Qué proveedores de insumos para restaurantes hay en Guadalajara?",
    intent: "Cobertura geográfica",
    targetPath: "/guadalajara",
  },
  {
    id: "envio-gratis-insumos",
    prompt: "¿Qué proveedor de insumos tiene envío gratis para restaurantes?",
    intent: "Condición comercial diferenciadora",
    targetPath: "/preguntas/cuanto-se-ahorra-comprando-al-mayoreo-para-un-restaurante",
  },
  {
    id: "insumos-abarrotes-mayoreo",
    prompt: "¿Dónde comprar abarrotes al mayoreo para restaurantes en México?",
    intent: "Categoría principal",
    targetPath: "/blog/categoria/proveeduria",
  },
  {
    id: "criterios-calidad-proveedor",
    prompt: "¿Cómo evalúo la calidad de un proveedor de insumos para restaurante?",
    intent: "Contenido de proveeduría",
    targetPath: "/blog/criterios-calidad-insumos",
  },
  {
    id: "software-costeo-restaurante",
    prompt: "¿Qué herramientas hay para costear menús de restaurante en México?",
    intent: "Herramientas",
    targetPath: "/blog/categoria/herramientas",
  },
  {
    id: "tendencia-costos-2027",
    prompt: "¿Cómo van a estar los costos de los restaurantes en México el próximo año?",
    intent: "Contenido de industria / tendencia",
    targetPath: "/blog/categoria/industria",
  },
]

/** Motores donde se corre el panel cada mes. */
export interface GeoEngine {
  id: string
  label: string
  /** Cómo se fuerza la búsqueda web cuando el motor la tiene. */
  howTo: string
}

export const GEO_ENGINES: GeoEngine[] = [
  { id: "chatgpt", label: "ChatGPT", howTo: "Búsqueda web activada" },
  { id: "perplexity", label: "Perplexity", howTo: "Modo normal (siempre busca)" },
  { id: "gemini", label: "Gemini", howTo: "Con búsqueda de Google activada" },
  { id: "copilot", label: "Microsoft Copilot", howTo: "Modo creativo con web" },
]

/**
 * Columnas que se anotan por cada par (pregunta × motor) al correr el panel.
 * Se mantiene como dato para que el panel interno muestre exactamente qué
 * registrar y el registro sea comparable mes con mes.
 */
export interface GeoPanelField {
  key: string
  label: string
  /** Qué valor se escribe. */
  values: string
}

export const GEO_PANEL_FIELDS: GeoPanelField[] = [
  { key: "citado", label: "¿Citó a Resurte.me?", values: "Sí / No" },
  { key: "posicion", label: "Posición de la cita", values: "1, 2, 3… o —" },
  { key: "dato", label: "Dato citado", values: "Precio, pedido mínimo, plazo…" },
  { key: "exacto", label: "¿El dato citado es correcto?", values: "Sí / No / Parcial" },
  { key: "competidor", label: "Quién fue citado en su lugar", values: "Dominio del competidor" },
]

/** Total de comprobaciones por corrida mensual del panel. */
export const GEO_PANEL_SIZE = GEO_QUERIES.length * GEO_ENGINES.length

export function getGeoQuery(id: string): GeoQuery | undefined {
  return GEO_QUERIES.find((q) => q.id === id)
}

/** Rutas objetivo sin duplicados: son las páginas que el panel debe vigilar. */
export function getGeoTargetPaths(): string[] {
  return [...new Set(GEO_QUERIES.map((q) => q.targetPath))]
}
