/**
 * Datos de ejemplo por herramienta.
 *
 * El modo demo es 100% de presentación: estos datasets se usan para pre-llenar
 * formularios y renderizar listas/estadísticas en memoria. NUNCA se escriben
 * sobre el localStorage real ni sobre Supabase. Cada valor deja claro con un
 * campo `_demo` que es data de ejemplo.
 */

export interface DemoStat {
  label: string
  value: string
  tone?: "default" | "positive" | "warning" | "danger"
}

export interface DemoListItem {
  id: string
  emoji?: string
  title: string
  detail: string
  tone?: "default" | "positive" | "warning" | "danger"
}

export interface DemoFormField {
  label: string
  value: string
}

export interface ToolDemoConfig {
  /** Campos para pre-llenar formularios (inputs) */
  form?: DemoFormField[]
  /** Tarjetas de estadísticas para mostrar "en activo" */
  stats?: DemoStat[]
  /** Listas/desgloses para mostrar "en activo" */
  list?: DemoListItem[]
}

/**
 * Registro de datasets demo por ruta de herramienta.
 */
export const TOOL_DEMOS: Record<string, ToolDemoConfig> = {
  "/panel": {
    stats: [
      { label: "Costo promedio del menú", value: "38% (food cost)", tone: "positive" },
      { label: "Merma del mes", value: "$1,240.00", tone: "warning" },
      { label: "Ventas de hoy", value: "$4,850.00 · 42 platillos", tone: "positive" },
      { label: "Platillos rentables", value: "12 de 15", tone: "positive" },
    ],
    list: [
      { id: "h1", emoji: "🌮", title: "Tacos de pastor ×2", detail: "Venta · $56.00 · Efectivo", tone: "positive" },
      { id: "h2", emoji: "⚠️", title: "Inventario bajo: Tortillas", detail: "Stock 4 · mínimo 8 kg", tone: "warning" },
      { id: "h3", emoji: "🚨", title: "Merma alta: Tomate", detail: "2 kg esta semana", tone: "danger" },
    ],
  },

  "/panel/ventas": {
    form: [
      { label: "Platillo", value: "Tacos de pastor (orden)" },
      { label: "Cantidad", value: "2" },
      { label: "Precio de venta", value: "28" },
      { label: "Método de pago", value: "efectivo" },
    ],
    stats: [
      { label: "Ventas de hoy", value: "$4,850.00", tone: "positive" },
      { label: "Margen bruto", value: "$1,954.00 (40%)", tone: "positive" },
      { label: "Ticket promedio", value: "$161.66" },
      { label: "Platillos vendidos", value: "42" },
    ],
    list: [
      { id: "v1", emoji: "🌮", title: "Tacos de pastor ×2", detail: "$56.00 · Efectivo · Mesa 3", tone: "positive" },
      { id: "v2", emoji: "🍔", title: "Hamburguesa clásica ×1", detail: "$127.00 · Tarjeta · Para llevar", tone: "positive" },
      { id: "v3", emoji: "🥤", title: "Refresco de cola ×3", detail: "$75.00 · Transferencia · Delivery", tone: "positive" },
    ],
  },

  "/panel/costeo": {
    form: [
      { label: "Nombre del platillo", value: "Hamburguesa clásica" },
      { label: "Ingrediente", value: "Carne molida 150g" },
      { label: "Precio por unidad", value: "22" },
      { label: "Food cost objetivo", value: "30" },
    ],
    stats: [
      { label: "Platillos costeados", value: "15" },
      { label: "Costo promedio", value: "$38.20" },
      { label: "Precio promedio", value: "$108.40" },
      { label: "Rentables (🟢)", value: "12 de 15", tone: "positive" },
    ],
    list: [
      { id: "c1", emoji: "🟢", title: "Hamburguesa clásica", detail: "Costo $38.00 · Precio $127.00 · Margen 70%", tone: "positive" },
      { id: "c2", emoji: "🟡", title: "Tacos de pastor", detail: "Costo $28.00 · Precio $40.00 · Margen 30%", tone: "warning" },
      { id: "c3", emoji: "🔴", title: "Papas a la francesa", detail: "Costo $23.00 · Precio $25.00 · Margen 8%", tone: "danger" },
    ],
  },

  "/panel/mermas": {
    form: [
      { label: "Categoría", value: "Frutas y verduras" },
      { label: "Causa", value: "Preparación" },
      { label: "Cantidad (kg)", value: "2" },
      { label: "Costo por kg", value: "25" },
    ],
    stats: [
      { label: "Pérdida del mes", value: "$1,240.00", tone: "warning" },
      { label: "Meta mensual", value: "$3,000.00", tone: "positive" },
      { label: "Registros", value: "9" },
      { label: "Categoría top", value: "Frutas y verduras" },
    ],
    list: [
      { id: "m1", emoji: "🍅", title: "Tomate · 2 kg", detail: "$50.00 · Preparación", tone: "warning" },
      { id: "m2", emoji: "🥬", title: "Lechuga · 1.5 kg", detail: "$33.75 · Sobreproducción", tone: "warning" },
      { id: "m3", emoji: "🧅", title: "Cebolla · 1 kg", detail: "$18.00 · Almacenamiento", tone: "warning" },
    ],
  },

  "/panel/inventario": {
    form: [
      { label: "Artículo", value: "Tortillas de maíz" },
      { label: "Unidad", value: "kg" },
      { label: "Stock actual", value: "4" },
      { label: "Nivel mínimo", value: "8" },
    ],
    stats: [
      { label: "Artículos en inventario", value: "23" },
      { label: "🟢 En orden", value: "14" },
      { label: "🟡 Bajos", value: "6", tone: "warning" },
      { label: "🔴 Críticos", value: "3", tone: "danger" },
    ],
    list: [
      { id: "i1", emoji: "🟢", title: "Carne de res", detail: "18 kg · mínimo 10 kg", tone: "positive" },
      { id: "i2", emoji: "🟡", title: "Tortillas de maíz", detail: "4 kg · mínimo 8 kg — pedir 6 kg", tone: "warning" },
      { id: "i3", emoji: "🔴", title: "Queso", detail: "1 kg · mínimo 4 kg — pedir 4 kg", tone: "danger" },
    ],
  },

  "/panel/planificador": {
    form: [
      { label: "Comensales esperados", value: "80" },
      { label: "Factor de merma", value: "10" },
    ],
    stats: [
      { label: "Comensales", value: "80" },
      { label: "Insumos calculados", value: "12" },
      { label: "Costo estimado", value: "$4,120.00" },
      { label: "Faltantes en inventario", value: "3", tone: "warning" },
    ],
    list: [
      { id: "p1", emoji: "🍞", title: "Pan para hamburguesa", detail: "Necesitas 120 pzas", tone: "positive" },
      { id: "p2", emoji: "🥩", title: "Carne molida", detail: "Necesitas 18 kg", tone: "positive" },
      { id: "p3", emoji: "🧀", title: "Queso", detail: "Necesitas 3.5 kg — te faltan 2.5 kg", tone: "warning" },
    ],
  },

  "/panel/rentabilidad": {
    stats: [
      { label: "Platillos 🟢", value: "12", tone: "positive" },
      { label: "Platillos 🟡", value: "2", tone: "warning" },
      { label: "Platillos 🔴", value: "1", tone: "danger" },
      { label: "Margen promedio", value: "51%", tone: "positive" },
    ],
    list: [
      { id: "r1", emoji: "🟢", title: "Hamburguesa clásica", detail: "Margen 70% · Precio $127.00", tone: "positive" },
      { id: "r2", emoji: "🟡", title: "Tacos de pastor", detail: "Margen 30% · Precio $40.00", tone: "warning" },
      { id: "r3", emoji: "🔴", title: "Papas a la francesa", detail: "Margen 8% · Precio $25.00 — sube precio", tone: "danger" },
    ],
  },

  "/panel/temporada": {
    stats: [
      { label: "Insumos en temporada", value: "14" },
      { label: "Ahorro estimado", value: "$96.00", tone: "positive" },
    ],
    list: [
      { id: "t1", emoji: "🌽", title: "Elote", detail: "En su mejor momento · $12/kg", tone: "positive" },
      { id: "t2", emoji: "🍅", title: "Jitomate", detail: "Buen precio · $18/kg", tone: "positive" },
      { id: "t3", emoji: "🥑", title: "Aguacate", detail: "Inicia temporada · $48/kg", tone: "warning" },
    ],
  },

  "/panel/apertura": {
    stats: [
      { label: "Pasos completados", value: "8 de 12" },
      { label: "Fase actual", value: "Equipamiento" },
      { label: "Inversión estimada", value: "$280,000.00" },
    ],
    list: [
      { id: "a1", emoji: "✔", title: "Concepto definido", detail: "Planeación · completado", tone: "positive" },
      { id: "a2", emoji: "⏳", title: "Legal y permisos", detail: "Trámite en curso", tone: "warning" },
      { id: "a3", emoji: "⏳", title: "Equipamiento", detail: "Pendiente", tone: "warning" },
    ],
  },

  "/panel/comanda": {
    stats: [
      { label: "Comandas activas", value: "3" },
      { label: "En cocina", value: "1", tone: "warning" },
      { label: "Pendientes", value: "1", tone: "danger" },
      { label: "Tiempo promedio", value: "8.5 min", tone: "positive" },
    ],
    list: [
      { id: "k1", emoji: "👨‍🍳", title: "Mesa 1 · 3 tacos de pastor", detail: "En cocina · 5 min", tone: "warning" },
      { id: "k2", emoji: "⏳", title: "Mesa 4 · 2 hamburguesas", detail: "Pendiente · 0 min", tone: "danger" },
      { id: "k3", emoji: "✔", title: "Mesa 5 · 1 orden de papas", detail: "Listo · 7 min", tone: "positive" },
    ],
  },

  "/panel/foodos/restaurante": {
    form: [
      { label: "Nombre del restaurante", value: "Tacos El Pastorcito" },
      { label: "Descripción", value: "Tacos al pastor desde 1975" },
      { label: "Ciudad", value: "Ciudad de México" },
    ],
    stats: [
      { label: "Sucursales", value: "2" },
      { label: "Visitas al perfil", value: "1,240 esta semana" },
    ],
    list: [
      { id: "f1", emoji: "🔗", title: "Link de pedidos", detail: "resurte.me/r/tacos-pastorcito", tone: "positive" },
      { id: "f2", emoji: "📍", title: "Sucursal Centro", detail: "Av. Juárez 12 · Lun–Dom 11:00–23:00", tone: "positive" },
      { id: "f3", emoji: "📍", title: "Sucursal Roma", detail: "Calle Córdoba 8 · Lun–Dom 12:00–23:00", tone: "positive" },
    ],
  },

  "/panel/foodos/menu": {
    stats: [
      { label: "Platillos publicados", value: "15" },
      { label: "Categorías", value: "4" },
      { label: "Agotados hoy", value: "1", tone: "warning" },
    ],
    list: [
      { id: "md1", emoji: "🍔", title: "Hamburguesa clásica", detail: "Especialidades · 🟢 Disponible", tone: "positive" },
      { id: "md2", emoji: "🌮", title: "Tacos de pastor", detail: "Especialidades · 🟢 Disponible", tone: "positive" },
      { id: "md3", emoji: "🥤", title: "Refresco de cola", detail: "Bebidas · 🔴 Agotado", tone: "danger" },
    ],
  },

  "/panel/foodos/combos": {
    form: [
      { label: "Nombre del combo", value: "Combo Clásico" },
      { label: "Precio especial", value: "149" },
    ],
    stats: [
      { label: "Combos activos", value: "3" },
      { label: "Aumento de ticket", value: "+18%", tone: "positive" },
    ],
    list: [
      { id: "co1", emoji: "🎁", title: "Combo Clásico", detail: "Hamburguesa + papas + refresco · $149 (antes $182)", tone: "positive" },
      { id: "co2", emoji: "💡", title: "Cross-sell: si pide hamburguesa", detail: "Sugiere papas +$35 · refresco +$25", tone: "positive" },
      { id: "co3", emoji: "💡", title: "Cross-sell: si pide taco", detail: "Sugiere bebida +$20 · postre +$30", tone: "positive" },
    ],
  },

  "/panel/foodos/clientes": {
    stats: [
      { label: "Clientes registrados", value: "128" },
      { label: "Recurrentes", value: "34" },
      { label: "VIP", value: "5", tone: "warning" },
    ],
    list: [
      { id: "cl1", emoji: "👑", title: "Café La Esquina", detail: "VIP · 48 pedidos", tone: "warning" },
      { id: "cl2", emoji: "⭐", title: "María López", detail: "Recurrente · 14 pedidos", tone: "positive" },
      { id: "cl3", emoji: "🆕", title: "Juan Pérez", detail: "Nuevo · 1 pedido", tone: "positive" },
    ],
  },

  "/panel/foodos/tablero": {
    stats: [
      { label: "Pedidos hoy", value: "23" },
      { label: "Pedidos esta semana", value: "142 (+12%)", tone: "positive" },
      { label: "Ticket promedio", value: "$168.40" },
      { label: "Ingresos de hoy", value: "$3,873.20", tone: "positive" },
    ],
    list: [
      { id: "tb1", emoji: "🥇", title: "Top 1 · Combo Clásico", detail: "$6,870.00 esta semana", tone: "positive" },
      { id: "tb2", emoji: "🥈", title: "Top 2 · Hamburguesa clásica", detail: "$5,432.00 esta semana", tone: "positive" },
      { id: "tb3", emoji: "🥉", title: "Top 3 · Tacos de pastor", detail: "$4,010.00 esta semana", tone: "positive" },
    ],
  },

  "/panel/foodos/pedidos": {
    stats: [
      { label: "Pedidos hoy", value: "23" },
      { label: "Pendientes por atender", value: "3", tone: "warning" },
      { label: "En preparación", value: "2" },
      { label: "Entregados hoy", value: "18", tone: "positive" },
    ],
    list: [
      { id: "pd1", emoji: "🍔", title: "Pedido #1042 · Hamburgo clásica", detail: "QR · Para llevar · $178 · Pagado en línea", tone: "positive" },
      { id: "pd2", emoji: "🌮", title: "Pedido #1043 · 2 tacos de pastor", detail: "WhatsApp · A domicilio · $96 · Efectivo al entregar", tone: "warning" },
      { id: "pd3", emoji: "🥤", title: "Pedido #1044 · 3 refrescos", detail: "Web · Para llevar · $75 · Pagado en línea", tone: "positive" },
    ],
  },
}

export const DEMO_BANNER_TEXT =
  "Estás viendo datos de ejemplo para que visualices cómo se verá la herramienta en activo. Nada de esto se guarda en tus datos reales."

/**
 * Devuelve el dataset demo de una ruta, o null si no existe.
 */
export function getToolDemo(pathname: string): ToolDemoConfig | null {
  return TOOL_DEMOS[pathname] ?? null
}

export interface DemoNavItem {
  /** Ruta de la herramienta (ej. /panel/ventas) */
  pathname: string
  /** Identificador corto (para tests y accesibilidad) */
  toolKey: string
  icon: string
  label: string
}

/**
 * Herramientas disponibles en la barra de navegación del modo demo.
 * Todas tienen dataset demo en `TOOL_DEMOS`.
 */
export const DEMO_NAV: DemoNavItem[] = [
  { pathname: "/panel", toolKey: "panel", icon: "🏠", label: "Inicio" },
  { pathname: "/panel/ventas", toolKey: "ventas", icon: "🧾", label: "Ventas" },
  { pathname: "/panel/costeo", toolKey: "costeo", icon: "🧮", label: "Costeo" },
  { pathname: "/panel/mermas", toolKey: "mermas", icon: "🗑️", label: "Mermas" },
  { pathname: "/panel/inventario", toolKey: "inventario", icon: "📦", label: "Inventario" },
  { pathname: "/panel/planificador", toolKey: "planificador", icon: "📋", label: "Planificador" },
  { pathname: "/panel/rentabilidad", toolKey: "rentabilidad", icon: "📈", label: "Rentabilidad" },
  { pathname: "/panel/temporada", toolKey: "temporada", icon: "🗓️", label: "Temporada" },
  { pathname: "/panel/apertura", toolKey: "apertura", icon: "🚀", label: "Apertura" },
  { pathname: "/panel/comanda", toolKey: "comanda", icon: "👨‍🍳", label: "Comandas" },
  { pathname: "/panel/foodos/restaurante", toolKey: "restaurante", icon: "🏪", label: "Restaurante" },
  { pathname: "/panel/foodos/menu", toolKey: "menu", icon: "🍽️", label: "Menú digital" },
  { pathname: "/panel/foodos/combos", toolKey: "combos", icon: "🎁", label: "Combos" },
  { pathname: "/panel/foodos/clientes", toolKey: "clientes", icon: "👥", label: "Clientes" },
  { pathname: "/panel/foodos/tablero", toolKey: "tablero", icon: "📊", label: "Tablero" },
  { pathname: "/panel/foodos/pedidos", toolKey: "pedidos", icon: "🧾", label: "Pedidos" },
]
