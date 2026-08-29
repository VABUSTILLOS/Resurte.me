// Datos estáticos y tipos compartidos del panel de Mermas.
// Extraído de src/app/panel/mermas/page.tsx (Fase 11).

export interface WasteCategory {
  key: string
  label: string
  icon: string
  avgWastePercent: number
}

export const WASTE_CATEGORIES: WasteCategory[] = [
  { key: "frutas_verduras", label: "Frutas y verduras", icon: "🥬", avgWastePercent: 12 },
  { key: "proteinas", label: "Carnes / Proteínas", icon: "🥩", avgWastePercent: 8 },
  { key: "lacteos", label: "Lácteos", icon: "🧀", avgWastePercent: 6 },
  { key: "granos", label: "Granos y harinas", icon: "🌾", avgWastePercent: 4 },
  { key: "preparados", label: "Alimentos preparados", icon: "🍲", avgWastePercent: 10 },
  { key: "bebidas", label: "Bebidas", icon: "🥤", avgWastePercent: 3 },
]

export interface WasteCause {
  key: string
  label: string
  icon: string
}

export const CAUSAS: WasteCause[] = [
  { key: "preparacion", label: "Preparación", icon: "🔪" },
  { key: "caducidad", label: "Caducidad", icon: "📅" },
  { key: "sobreproduccion", label: "Sobreproducción", icon: "📦" },
  { key: "devolucion", label: "Devolución", icon: "↩️" },
  { key: "otro", label: "Otro", icon: "❓" },
]

export const TIPS: Record<string, string[]> = {
  "frutas_verduras": [
    "Refrigera verduras de hoja verde envueltas en papel para absorber humedad.",
    "Compra frutas en diferentes estados de madurez para usarlas en el momento óptimo.",
    "Almacena cebollas y papas en lugares oscuros y frescos, separados entre sí.",
    "Congela hierbas frescas picadas en aceite de oliva en charolas de hielo.",
  ],
  "proteinas": [
    "Porciona y congela al recibir. Etiqueta con fecha de congelación.",
    "Usa el sistema PEPS (primero en entrar, primero en salir) en tu refrigerador.",
    "Aprovecha huesos y recortes para fondos y caldos.",
    "Descongela en refrigeración, nunca a temperatura ambiente.",
  ],
  "lacteos": [
    "Guarda los quesos envueltos en papel encerado, no en plástico.",
    "La crema y nata se pueden congelar si es para cocinar (no para montar).",
    "Revisa fechas de caducidad al recibir mercancía de Resurte.me.",
  ],
  "granos": [
    "Almacena harinas y granos en contenedores herméticos para evitar humedad y plagas.",
    "Usa el sistema PEPS: rota el stock viejo al frente y el nuevo atrás.",
    "Revisa periódicamente señales de gorgojo o polilla en harinas y cereales.",
  ],
  "preparados": [
    "Etiqueta siempre con fecha de preparación y caducidad (máx. 3 días en refrigeración).",
    "Enfría rápidamente los preparados calientes antes de refrigerar para evitar proliferación bacteriana.",
    "Congela porciones individuales de salsas y caldos para usar solo lo necesario.",
  ],
  "bebidas": [
    "Revisa fechas de caducidad al recibir y rota el inventario mensualmente.",
    "Almacena botellas abiertas de vino o licor con tapa hermética y úsalas en máximo 1 semana.",
    "Los concentrados y jarabes abiertos deben refrigerarse y etiquetarse con fecha de apertura.",
  ],
}

export interface WasteEntry {
  id: string
  category: string
  amountKg: number
  costPerKg: number
  date: string // ISO date
  note?: string
  cause: string // key from CAUSAS
  itemId?: string // item de inventario vinculado (descuento de stock opcional)
  itemName?: string
  stockDeducted?: boolean // true si la merma descontó stock (para revertir al borrar)
}

let wasteId = 0
export function nextWasteId() {
  wasteId++
  return `waste-${Date.now()}-${wasteId}`
}
