/**
 * Datos de ejemplo por herramienta.
 *
 * El modo demo es 100% de presentación: estos datasets se usan para pre-llenar
 * formularios y renderizar listas/estadísticas en memoria. NUNCA se escriben
 * sobre el localStorage real ni sobre Supabase. Cada valor deja claro con un
 * campo `_demo` que es data de ejemplo.
 */

interface DemoStat {
  label: string
  value: string
  tone?: "default" | "positive" | "warning" | "danger"
}

interface DemoListItem {
  id: string
  emoji?: string
  title: string
  detail: string
  tone?: "default" | "positive" | "warning" | "danger"
}

interface DemoFormField {
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
const TOOL_DEMOS: Record<string, ToolDemoConfig> = {
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

  // ---- Herramientas premium (nivel Diamante) ------------------------------
  // Mismo formato que las demás: se ven completas en modo demo aunque el
  // nivel del restaurante todavía no alcance para usarlas.

  "/panel/foodos/mostrador": {
    form: [
      { label: "Cliente", value: "Público general" },
      { label: "Producto", value: "Tacos de pastor (orden)" },
      { label: "Cantidad", value: "2" },
      { label: "Forma de pago", value: "Efectivo" },
      { label: "Efectivo recibido", value: "200" },
    ],
    stats: [
      { label: "Ventas de hoy", value: "$3,480.00", tone: "positive" },
      { label: "Tickets", value: "27" },
      { label: "Ticket promedio", value: "$128.89" },
      { label: "Efectivo en caja", value: "$1,240.00" },
    ],
    list: [
      { id: "mo1", emoji: "🧾", title: "Ticket #A-027 · $178.00", detail: "2 tacos + 2 refrescos · Efectivo · Cambio $22.00", tone: "positive" },
      { id: "mo2", emoji: "💳", title: "Ticket #A-028 · $96.00", detail: "Orden de pastor · Tarjeta (Clip)", tone: "positive" },
      { id: "mo3", emoji: "🔀", title: "Ticket #A-029 · $210.00", detail: "Pago combinado: $100 efectivo + $110 transferencia", tone: "warning" },
    ],
  },

  "/panel/foodos/mesas": {
    form: [
      { label: "Zona", value: "Terraza" },
      { label: "Mesa", value: "Mesa 4" },
      { label: "Comensales", value: "3" },
      { label: "Mesero", value: "Ana" },
    ],
    stats: [
      { label: "Mesas ocupadas", value: "6 de 14", tone: "warning" },
      { label: "Cuentas abiertas", value: "6" },
      { label: "Consumo abierto", value: "$2,140.00" },
      { label: "Tiempo promedio", value: "38 min" },
    ],
    list: [
      { id: "me1", emoji: "🪑", title: "Mesa 3 · Terraza", detail: "Abierta 42 min · $486.00 · 4 comensales", tone: "warning" },
      { id: "me2", emoji: "🍽️", title: "Mesa 7 · Salón", detail: "Cuenta pedida · $312.00 · lista para cobrar", tone: "positive" },
      { id: "me3", emoji: "🔗", title: "Mesas 5 + 6 unidas", detail: "Grupo de 8 · $1,342.00 · enviado a cocina", tone: "default" },
    ],
  },

  "/panel/foodos/caja": {
    form: [
      { label: "Fondo inicial", value: "1500" },
      { label: "Concepto del movimiento", value: "Compra de tortillas" },
      { label: "Monto", value: "240" },
    ],
    stats: [
      { label: "Turno", value: "Abierto · Ana", tone: "positive" },
      { label: "Efectivo esperado", value: "$1,984.00" },
      { label: "Tarjeta", value: "$2,415.00" },
      { label: "Diferencia", value: "$0.00", tone: "positive" },
    ],
    list: [
      { id: "ca1", emoji: "🟢", title: "Apertura de turno · 08:00", detail: "Fondo inicial $1,500.00 · Ana", tone: "positive" },
      { id: "ca2", emoji: "💸", title: "Retiro · 13:20", detail: "Compra de tortillas · −$240.00", tone: "warning" },
      { id: "ca3", emoji: "📊", title: "Corte parcial · 16:00", detail: "Sistema $3,480.00 vs contado $3,480.00", tone: "positive" },
    ],
  },

  "/panel/foodos/pos": {
    form: [
      { label: "Punto de venta", value: "Soft Restaurant" },
      { label: "Sucursal", value: "Matriz Centro" },
      { label: "Sincronización de menú", value: "Cada 30 min" },
    ],
    stats: [
      { label: "Conexiones activas", value: "1 de 1", tone: "positive" },
      { label: "Última sincronización", value: "hace 12 min", tone: "positive" },
      { label: "Platillos sincronizados", value: "146" },
      { label: "Webhooks 24 h", value: "38", tone: "default" },
    ],
    list: [
      { id: "po1", emoji: "✅", title: "Soft Restaurant · Matriz Centro", detail: "Menú al día · 146 platillos · sin errores", tone: "positive" },
      { id: "po2", emoji: "🔄", title: "Sync de menú · 14:30", detail: "+3 platillos, 2 precios actualizados", tone: "positive" },
      { id: "po3", emoji: "⚠️", title: "Webhook con reintento", detail: "Pedido #1041 · entregado en el 2º intento", tone: "warning" },
    ],
  },

  "/panel/foodos/wallet": {
    form: [
      { label: "Nombre del programa", value: "Club La Esquina" },
      { label: "Puntos por peso", value: "1" },
      { label: "Meta de recompensa", value: "150 puntos = postre gratis" },
    ],
    stats: [
      { label: "Tarjetas emitidas", value: "312" },
      { label: "Tarjetas activas", value: "248", tone: "positive" },
      { label: "Puntos en circulación", value: "18,420" },
      { label: "Canjes del mes", value: "37", tone: "positive" },
    ],
    list: [
      { id: "wa1", emoji: "🍎", title: "Apple Wallet · 171 tarjetas", detail: "68% de las emisiones", tone: "positive" },
      { id: "wa2", emoji: "🤖", title: "Google Wallet · 141 tarjetas", detail: "32% de las emisiones", tone: "positive" },
      { id: "wa3", emoji: "🎂", title: "Cumpleaños del mes", detail: "12 comensales · mensaje automático listo", tone: "warning" },
    ],
  },

  "/panel/foodos/catering": {
    form: [
      { label: "Nombre del paquete", value: "Comida corrida para 50" },
      { label: "Personas mínimas", value: "30" },
      { label: "Precio por persona", value: "185" },
      { label: "Anticipación", value: "72 horas" },
    ],
    stats: [
      { label: "Solicitudes del mes", value: "8" },
      { label: "Cotizado", value: "$148,500.00", tone: "positive" },
      { label: "Ganadas", value: "5", tone: "positive" },
      { label: "Paquetes activos", value: "4" },
    ],
    list: [
      { id: "ct1", emoji: "🏢", title: "Oficinas Torre Norte · 80 personas", detail: "Solicitud nueva · $14,800.00 · 12 de marzo", tone: "warning" },
      { id: "ct2", emoji: "🎉", title: "XV años · 120 personas", detail: "Confirmado · $22,200.00 · anticipo recibido", tone: "positive" },
      { id: "ct3", emoji: "📝", title: "Escuela primaria · 60 personas", detail: "Cotización enviada · esperando respuesta", tone: "default" },
    ],
  },

  "/panel/foodos/sitio-ia": {
    form: [
      { label: "Ciudad objetivo", value: "Guadalajara" },
      { label: "Platillo destacado", value: "Tacos de pastor" },
      { label: "Tono de la descripción", value: "Cercano y local" },
    ],
    stats: [
      { label: "Páginas publicadas", value: "12", tone: "positive" },
      { label: "Borradores", value: "3" },
      { label: "Impresiones (28 d)", value: "9,480", tone: "positive" },
      { label: "Clics (28 d)", value: "612", tone: "positive" },
    ],
    list: [
      { id: "si1", emoji: "✅", title: "Mejores tacos de pastor en Guadalajara", detail: "Publicada · 2,140 impresiones · posición 4.2", tone: "positive" },
      { id: "si2", emoji: "✍️", title: "Menú para eventos en Zapopan", detail: "Borrador generado · listo para revisar", tone: "warning" },
      { id: "si3", emoji: "🔍", title: "Preguntas frecuentes del negocio", detail: "8 preguntas generadas desde tu menú", tone: "positive" },
    ],
  },

  "/panel/foodos/mesero-ia": {
    form: [
      { label: "Saludo inicial", value: "¡Hola! ¿Qué se te antoja hoy? 🌮" },
      { label: "Tono", value: "Amable" },
      { label: "Horario de atención", value: "13:00 – 23:00" },
    ],
    stats: [
      { label: "Conversaciones hoy", value: "34" },
      { label: "Pedidos armados", value: "19", tone: "positive" },
      { label: "Tomados por IA", value: "16 de 19", tone: "positive" },
      { label: "Respuesta promedio", value: "4 s" },
    ],
    list: [
      { id: "mi1", emoji: "💬", title: "+52 33 1234 5678 · 19:42", detail: "Pidió 2 órdenes de pastor · comanda enviada a cocina", tone: "positive" },
      { id: "mi2", emoji: "🙋", title: "+52 33 8765 4321 · 19:58", detail: "Preguntó por entrega a domicilio · atendido por IA", tone: "positive" },
      { id: "mi3", emoji: "🧑‍🍳", title: "+52 33 5555 1111 · 20:14", detail: "Caso especial (alergias) · tomado por una persona", tone: "warning" },
    ],
  },

  "/panel/foodos/flotilla": {
    form: [
      { label: "Nombre del repartidor", value: "Luis Ramírez" },
      { label: "Teléfono", value: "33 1234 5678" },
      { label: "Zona", value: "Centro" },
      { label: "Tarifa base", value: "35" },
    ],
    stats: [
      { label: "Repartidores activos", value: "5 de 6", tone: "positive" },
      { label: "Entregas en curso", value: "4", tone: "warning" },
      { label: "Entregas hoy", value: "38", tone: "positive" },
      { label: "Tiempo promedio", value: "24 min", tone: "positive" },
    ],
    list: [
      { id: "fl1", emoji: "🛵", title: "Luis Ramírez · Centro", detail: "3 entregas activas · 1.2 km de la más cercana", tone: "warning" },
      { id: "fl2", emoji: "✅", title: "Ana Torres · Chapultepec", detail: "2 entregas completadas · 12:40 y 13:15", tone: "positive" },
      { id: "fl3", emoji: "📦", title: "Sin asignar · 2 pedidos", detail: "Colonia Americana · asignación automática en curso", tone: "default" },
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

export interface PanelNavItem {
  /** Ruta de la herramienta (ej. /panel/ventas) */
  pathname: string
  /** Identificador corto (para tests y accesibilidad) */
  toolKey: string
  icon: string
  label: string
  /** Familia de la herramienta (misma agrupación que TOOL_AREAS del hub) */
  area?: "operacion" | "costos" | "planeacion" | "sistema"
}

/**
 * Herramientas disponibles en la barra de navegación del panel.
 * Todas tienen dataset demo en `TOOL_DEMOS`. Ordenadas por familia
 * (operación → costos → planeación → sistema) igual que el hub, para que
 * la barra persistente refleje la misma agrupación que /panel.
 */
export const PANEL_NAV: PanelNavItem[] = [
  { pathname: "/panel", toolKey: "panel", icon: "🏠", label: "Inicio" },
  { pathname: "/panel/ventas", toolKey: "ventas", icon: "🧾", label: "Ventas", area: "operacion" },
  { pathname: "/panel/comanda", toolKey: "comanda", icon: "👨‍🍳", label: "Comandas", area: "operacion" },
  { pathname: "/panel/apertura", toolKey: "apertura", icon: "🚀", label: "Apertura", area: "operacion" },
  { pathname: "/panel/costeo", toolKey: "costeo", icon: "🧮", label: "Costeo", area: "costos" },
  { pathname: "/panel/mermas", toolKey: "mermas", icon: "🗑️", label: "Mermas", area: "costos" },
  { pathname: "/panel/rentabilidad", toolKey: "rentabilidad", icon: "📈", label: "Rentabilidad", area: "costos" },
  { pathname: "/panel/planificador", toolKey: "planificador", icon: "📋", label: "Planificador", area: "planeacion" },
  { pathname: "/panel/inventario", toolKey: "inventario", icon: "📦", label: "Inventario", area: "planeacion" },
  { pathname: "/panel/temporada", toolKey: "temporada", icon: "🗓️", label: "Temporada", area: "planeacion" },
  { pathname: "/panel/foodos/restaurante", toolKey: "restaurante", icon: "🏪", label: "Restaurante", area: "sistema" },
  { pathname: "/panel/foodos/menu", toolKey: "menu", icon: "🍽️", label: "Menú digital", area: "sistema" },
  { pathname: "/panel/foodos/combos", toolKey: "combos", icon: "🎁", label: "Combos", area: "sistema" },
  { pathname: "/panel/foodos/clientes", toolKey: "clientes", icon: "👥", label: "Clientes", area: "sistema" },
  { pathname: "/panel/foodos/tablero", toolKey: "tablero", icon: "📊", label: "Tablero", area: "sistema" },
  { pathname: "/panel/foodos/pedidos", toolKey: "pedidos", icon: "🧾", label: "Pedidos", area: "sistema" },
]
