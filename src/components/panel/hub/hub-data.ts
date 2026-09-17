import type { LucideIcon } from "lucide-react"
import type { RestaurantCollection } from "@/types"
import type { FoodosFeature } from "@/lib/foodos-entitlements"
import { entryTotal } from "@/components/panel/ventas/ventas-shared"
import {
  Calculator, ShoppingCart, Trash2, TrendingUp, Calendar, ClipboardCheck,
  Package, Receipt, Flame, QrCode, UtensilsCrossed, Gift, Megaphone,
  BarChart3, Compass, Users, Ticket, MessageCircle, Inbox, Bot, Truck,
  Wallet, Globe, Server, CalendarHeart,
} from "lucide-react"

export type HubCollection = RestaurantCollection

export interface HubAlert {
  id: string
  type: "danger" | "warning" | "info" | "success"
  icon: LucideIcon
  title: string
  detail: string
  href: string
}

export interface HubStats {
  totalCosteo: number
  totalMerma: number
  green: number
  red: number
  dishesCount: number
  mermaCount: number
  aperturaCount: number
  avgFoodCost: number
  avgMargin: number
  monthLoss: number
  mermaVsGoal: number
  seasonalSavings: number
  totalPrice: number
  monthlyGoal: number
}

interface HubMethodStats {
  key: string
  label: string
  icon: string
  revenue: number
  count: number
}

export interface HubTodaySales {
  revenue: number
  margin: number
  marginPct: number
  foodCost: number
  units: number
  count: number
  avgTicket: number
  methods: HubMethodStats[]
  todayMerma: number
}

export interface HubComandas {
  active: number
  pendiente: number
  enCocina: number
  readyToday: number
}

export interface HubMesasInfo {
  occupied: number
  total: number
  longCount: number
  longNames: string[]
}

export interface HubGoalProgress {
  pct: number
  projected: number
  goal: number
}

export type HubVenta = {
  id: string
  dishId: string
  dishName: string
  quantity: number
  date: string
  unitPrice: number
  unitCost: number
  paymentMethod?: string
  channel?: string
  discount?: { type: "monto" | "porcentaje"; value: number }
  clienteId?: string
  mesaId?: string
  createdAt?: string
}

export type HubMesa = {
  id: string
  nombre: string
  capacidad: number
  zona?: string
}

/**
 * Total de una venta del hub. Delega en `entryTotal` (ventas-shared) para que
 * el hub y /panel/ventas no puedan dar cifras distintas del mismo día: el
 * cálculo estaba duplicado y divergía en el descuento porcentual (el del hub no
 * recortaba en 0, así que un descuento > 100 % daba un total negativo).
 */
export function hubEntryTotal(e: HubVenta): number {
  return entryTotal(e)
}

export const COLLECTION_ICONS: Record<string, string> = {
  "hamburguesas-hot-dogs": "🍔",
  "taquerias-antojitos": "🌮",
  "sushi-comida-asiatica": "🍣",
  "pizzas-comida-italiana": "🍕",
  "pollo-alitas": "🍗",
  "comida-mexicana-corrida": "🍲",
  "mariscos-pescados": "🦐",
  "cortes-carne-asaderos": "🥩",
  "cafeterias-crepas-desayunos": "☕",
  "saludable-ensaladas-pokes": "🥗",
  "postres-panaderia-helados": "🍰",
  "comida-arabe-griega": "🥙",
  "comida-venezolana-latina": "🇻🇪",
  "bebidas-bares-botanas": "🍺",
}

export type ToolArea = "costos" | "planeacion" | "operacion" | "sistema"

export interface Tool {
  title: string
  description: string
  icon: typeof Calculator
  href: string
  color: string
  bgColor: string
  area: ToolArea
  short?: string
  collectionDesc?: (name: string) => string
  standalone?: boolean
  /**
   * Capacidad premium que abre esta herramienta. Si se declara, la tarjeta
   * muestra el nivel requerido y se bloquea hasta alcanzarlo
   * (`src/lib/foodos-entitlements.ts`). Sin este campo la herramienta es base.
   */
  feature?: FoodosFeature
}

export const TOOL_AREAS: { key: ToolArea; label: string; icon: LucideIcon }[] = [
  { key: "costos", label: "Costos y rentabilidad", icon: Calculator },
  { key: "planeacion", label: "Planeación y compras", icon: Calendar },
  { key: "operacion", label: "Operación y apertura", icon: Flame },
  { key: "sistema", label: "Sistema de pedidos", icon: UtensilsCrossed },
]

export const PAYMENT_METHODS = [
  { key: "efectivo", label: "Efectivo", icon: "💵" },
  { key: "tarjeta", label: "Tarjeta", icon: "💳" },
  { key: "transferencia", label: "Transferencia", icon: "🏦" },
] as const

export const TOOLS: Tool[] = [
  {
    title: "Costeando mi menú",
    description: "Calcula el costo real de cada platillo usando precios del catálogo de Resurte.me. Define tu food cost ideal y recibe el precio de venta sugerido.",
    icon: Calculator,
    href: "/panel/costeo",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    area: "costos",
    short: "Costear",
    collectionDesc: (name) => `Costea los platillos típicos de ${name} con precios reales de Resurte.me.`,
  },
  {
    title: "Planificador de pedidos",
    description: "Según tus comensales esperados, calcula cuánto pedir de cada insumo. Ajusta por merma y genera tu orden directamente en Resurte.me.",
    icon: ShoppingCart,
    href: "/panel/planificador",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    area: "planeacion",
    short: "Planear compras",
    collectionDesc: (name) => `Planea tus compras para ${name} según la demanda esperada.`,
  },
  {
    title: "Calculadora de mermas",
    description: "Registra tu desperdicio por categoría y descubre cuánto dinero estás perdiendo. Recibe tips prácticos para reducir merma en cada tipo de insumo.",
    icon: Trash2,
    href: "/panel/mermas",
    color: "text-red-600",
    bgColor: "bg-red-50",
    area: "costos",
    short: "Mermas",
    collectionDesc: (name) => `Controla el desperdicio típico de ${name} y reduce pérdidas.`,
  },
  {
    title: "Semáforo de rentabilidad",
    description: "Visualiza tus platillos en verde, amarillo o rojo según su margen. Recibe alertas cuando los precios de insumos cambien y afecten tu rentabilidad.",
    icon: TrendingUp,
    href: "/panel/rentabilidad",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    area: "costos",
    short: "Rentabilidad",
    collectionDesc: (name) => `Monitorea la rentabilidad de tu menú de ${name} en tiempo real.`,
  },
  {
    title: "Analítica del restaurante",
    description: "KPIs cruzados de ventas, mermas y costeo real: tasa de merma, food cost real, tendencias y top de platillos por margen.",
    icon: BarChart3,
    href: "/panel/analitica",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    area: "costos",
    short: "Analítica",
    collectionDesc: (name) => `Cruza ventas, mermas y costeo de ${name} para ver tus márgenes reales.`,
  },
  {
    title: "Planificador de temporada",
    description: "Calendario de frutas y verduras de temporada en México. Arma menús estacionales con los insumos más frescos y baratos del momento.",
    icon: Calendar,
    href: "/panel/temporada",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    area: "planeacion",
    short: "Temporada",
    collectionDesc: (name) => `Descubre los insumos de temporada ideales para ${name}.`,
  },
  {
    title: "Kit de apertura",
    description: "Checklist paso a paso para abrir tu restaurante. Calculadora de inversión inicial y sugerencias de primeros pedidos según tu tipo de cocina.",
    icon: ClipboardCheck,
    href: "/panel/apertura",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    area: "operacion",
    short: "Kit apertura",
    collectionDesc: (name) => `Todo lo que necesitas para abrir tu ${name}, en un solo lugar.`,
  },
  {
    title: "Mi inventario",
    description: "Gestiona tu stock de productos con indicadores 🟢🟡🔴. Genera órdenes de compra automáticas basadas en niveles mínimos y lo que planeaste pedir.",
    icon: Package,
    href: "/panel/inventario",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    area: "planeacion",
    short: "Inventario",
    collectionDesc: (name) => `Controla el inventario de tu ${name} y nunca te quedes sin insumos.`,
  },
  {
    title: "Ventas del día",
    description: "Registra tus ventas y conoce en tiempo real tus ingresos, costo de venta, margen bruto y ticket promedio. Compara tus últimos 7 días.",
    icon: Receipt,
    href: "/panel/ventas",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    area: "operacion",
    short: "Ventas",
    collectionDesc: (name) => `Registra las ventas de tu ${name} y conoce tu margen real del día.`,
  },
  {
    title: "Monitor de cocina",
    description: "Cada venta genera una comanda para tu cocina. Lleva el ciclo pendiente → en cocina → listo, clasifica por tipo de servicio y mide tus tiempos de producción.",
    icon: Flame,
    href: "/panel/comanda",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    area: "operacion",
    short: "Comandas",
    collectionDesc: (name) => `Despacha las comandas de tu ${name} por tipo de servicio y controla los tiempos en cocina.`,
  },
  // ---- Sistema de pedidos (FoodOS) ----
  {
    title: "Mi restaurante",
    description: "Perfil público con tu marca, logo y sucursales. Obtén tu link directo de pedidos y el código QR para compartir en mesas, empaques y redes.",
    icon: QrCode,
    href: "/panel/foodos/restaurante",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    area: "sistema",
    short: "Perfil",
    standalone: true,
  },
  {
    title: "Menú digital",
    description: "Publica tu menú en línea: categorías, platillos, destacados y disponibilidad. Impórtalo desde tu costeo de Resurte.me en un clic.",
    icon: UtensilsCrossed,
    href: "/panel/foodos/menu",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    area: "sistema",
    short: "Menú digital",
    standalone: true,
  },
  {
    title: "Combos y cross-sell",
    description: "Crea combos y reglas de venta cruzada: si piden X sugiere Y, o sube el ticket con ofertas inteligentes en el checkout.",
    icon: Gift,
    href: "/panel/foodos/combos",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    area: "sistema",
    short: "Combos",
    standalone: true,
  },
  {
    title: "Clientes y recurrencia",
    description: "Base de clientes con segmentos (nuevo, recurrente, VIP) y automatizaciones por WhatsApp: agradecimientos, recuperación y promos.",
    icon: Megaphone,
    href: "/panel/foodos/clientes",
    color: "text-red-600",
    bgColor: "bg-red-50",
    area: "sistema",
    short: "Clientes",
    standalone: true,
    feature: "marketing_ia",
  },
  {
    title: "Mesero IA",
    description: "Un mesero que atiende WhatsApp 24/7: entiende el pedido, arma el carrito, cobra con las mismas reglas de tu tienda y lo manda a cocina. Nunca inventa precios.",
    icon: Bot,
    href: "/panel/foodos/mesero-ia",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    area: "sistema",
    short: "Mesero IA",
    standalone: true,
    feature: "mesero_ia",
  },
  {
    title: "Flotilla",
    description: "Repartidores propios, zonas por radio con tarifa y mínimo, asignación de entregas y seguimiento del estado. La tarifa siempre la calcula el servidor.",
    icon: Truck,
    href: "/panel/foodos/flotilla",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    area: "sistema",
    short: "Flotilla",
    standalone: true,
    feature: "flotilla",
  },
  {
    title: "Tarjeta de lealtad",
    description: "El pase que tu cliente guarda en el teléfono: saldo, valor y recompensa. Se actualiza solo al acreditar puntos y se puede revocar.",
    icon: Wallet,
    href: "/panel/foodos/wallet",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    area: "sistema",
    short: "Tarjeta",
    standalone: true,
    feature: "wallet_passes",
  },
  {
    title: "Sitio web y app",
    description: "Tu carta indexable en Google, páginas de contenido que la IA redacta y tú apruebas, y tu micrositio instalable como app en el teléfono.",
    icon: Globe,
    href: "/panel/foodos/sitio-ia",
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    area: "sistema",
    short: "Sitio web",
    standalone: true,
    feature: "sitio_ia",
  },
  {
    title: "Punto de venta",
    description: "Conecta tu caja para no capturar el menú dos veces. Mientras el adaptador de tu proveedor no exista, el panel te lo dice en la cara y la importación CSV de tu menú sigue funcionando.",
    icon: Server,
    href: "/panel/foodos/pos",
    color: "text-slate-600",
    bgColor: "bg-slate-50",
    area: "sistema",
    short: "Punto de venta",
    standalone: true,
    feature: "pos_integraciones",
  },
  {
    title: "Catering",
    description: "Paquetes por persona para eventos: el comensal ve el total antes de enviar y tú decides si lo tomas. El total siempre lo calcula el servidor.",
    icon: CalendarHeart,
    href: "/panel/foodos/catering",
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    area: "sistema",
    short: "Catering",
    standalone: true,
    feature: "catering",
  },
  {
    title: "Cupones",
    description: "Crea códigos de descuento (% o monto fijo) con pedido mínimo, límite de usos y expiración. Los clientes los aplican en el checkout de tu menú.",
    icon: Ticket,
    href: "/panel/foodos/cupones",
    color: "text-pink-600",
    bgColor: "bg-pink-50",
    area: "sistema",
    short: "Cupones",
    standalone: true,
  },
  {
    title: "WhatsApp del restaurante",
    description: "Catálogo nativo de WhatsApp ordenado a tu manera: tú eliges qué platillos aparecen y en qué orden, conexión con tu propio número y envío directo a clientes.",
    icon: MessageCircle,
    href: "/panel/foodos/whatsapp",
    color: "text-green-600",
    bgColor: "bg-green-50",
    area: "sistema",
    short: "WhatsApp",
    standalone: true,
  },
  {
    title: "Inbox de WhatsApp",
    description: "Conversaciones de tus clientes en tu número de WhatsApp Business: lee y responde sin salir del panel.",
    icon: Inbox,
    href: "/panel/foodos/inbox",
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    area: "sistema",
    short: "Inbox",
    standalone: true,
  },
  {
    title: "Cocina en vivo (KDS)",
    description: "Pantalla de cocina: pedidos confirmados y en preparación con tiempo transcurrido, modificadores y mesa. Avanza estados con un toque.",
    icon: Flame,
    href: "/panel/foodos/cocina",
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    area: "sistema",
    short: "Cocina",
    standalone: true,
  },
  {
    title: "Tablero FoodTech",
    description: "Pedidos por día, canal y sucursal, ticket promedio, top platillos e ingresos. Mide la efectividad de combos y cross-sell.",
    icon: BarChart3,
    href: "/panel/foodos/tablero",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    area: "sistema",
    short: "Tablero",
    standalone: true,
  },
  {
    title: "Marketplace hoyquecomemos",
    description: "Tu menú aparece en el directorio público de hoyquecomemos.mx: los comensales te encuentran por ciudad y platillo y piden directo en tu micrositio, sin comisiones.",
    icon: Compass,
    href: "/comer",
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    area: "sistema",
    short: "Marketplace",
    standalone: true,
  },
  {
    title: "Personal y roles",
    description: "Invita a tu equipo al panel: gerente, cocina y meseros ven solo sus herramientas. Cada quien entra con su propia cuenta.",
    icon: Users,
    href: "/panel/personal",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    area: "sistema",
    short: "Personal",
    standalone: true,
  },
]
