/**
 * Guías paso a paso de las herramientas de negocio.
 *
 * Cada entrada describe los pasos que el usuario puede hacer dentro de una
 * herramienta. Opcionalmente cada paso puede incluir `example`: campos con
 * data de ejemplo que se renderizan como una vista previa (mockup) con el
 * sello "Datos de ejemplo", para que el usuario visualice cómo se verá la
 * herramienta en activo sin tocar sus datos reales.
 */

export interface ExampleField {
  label: string
  value: string
}

export interface ToolGuideStep {
  id: string
  title: string
  description: string
  example?: ExampleField[]
}

export interface ToolGuideConfig {
  /** Nombre corto y legible de la herramienta */
  tool: string
  /** Emoji representativo */
  icon: string
  /** Texto breve que se muestra como encabezado de la guía */
  intro: string
  steps: ToolGuideStep[]
}

export const GUIDE_NOTICE =
  "Estos son datos de ejemplo para que veas cómo se verá tu herramienta en activo."

/**
 * Registro de guías por ruta de la herramienta (pathname).
 */
export const TOOL_GUIDES: Record<string, ToolGuideConfig> = {
  "/panel": {
    tool: "Panel de herramientas",
    icon: "🏠",
    intro:
      "Bienvenido a tu panel. Aquí controlas costos, ventas, inventario y pedidos de tu restaurante.",
    steps: [
      {
        id: "coleccion",
        title: "Elige tu tipo de cocina",
        description:
          "Arriba selecciona tu tipo de restaurante (taquería, hamburguesas, sushi…). Cada tipo ajusta las herramientas con insumos y consejos específicos.",
      },
      {
        id: "estadisticas",
        title: "Lee tus números del día",
        description:
          "El panel muestra tus costos, mermas, ventas y rentabilidad en tiempo real. Todo se actualiza conforme usas las herramientas.",
        example: [
          { label: "Costo promedio del menú", value: "38% (food cost)" },
          { label: "Merma del mes", value: "$1,240.00" },
          { label: "Ventas de hoy", value: "$4,850.00 · 42 platillos" },
          { label: "Platillos en verde", value: "12 de 15 rentables" },
        ],
      },
      {
        id: "alertas",
        title: "Revisa tus alertas",
        description:
          "El panel te avisa si algo necesita atención: platillos que pierden rentabilidad, inventario bajo, mesas ocupadas más de 3 horas o merma por encima de tu meta.",
      },
      {
        id: "respaldos",
        title: "Respalda tu información",
        description:
          "Usa la franja de respaldo para exportar un archivo JSON de tus datos y restaurarlo cuando quieras, incluso en otro dispositivo.",
      },
      {
        id: "herramientas",
        title: "Entra a cada herramienta",
        description:
          "Usa la cuadrícula de herramientas para ir a costeo, ventas, mermas, inventario, planificador y tu menú digital. Cada una tiene su propia guía paso a paso.",
      },
    ],
  },

  "/panel/ventas": {
    tool: "Ventas del día",
    icon: "🧾",
    intro:
      "Registra tus ventas y conoce en tiempo real tus ingresos, costo de venta, margen y ticket promedio.",
    steps: [
      {
        id: "registrar",
        title: "Registra una venta",
        description:
          "Elige el platillo, la cantidad, el método de pago y guarda. El costo real se calcula solo con tu costeo.",
        example: [
          { label: "Platillo", value: "Tacos de pastor (orden)" },
          { label: "Cantidad", value: "2" },
          { label: "Precio de venta", value: "$28.00 c/u" },
          { label: "Método de pago", value: "Efectivo" },
          { label: "Total registrado", value: "$56.00" },
        ],
      },
      {
        id: "metas",
        title: "Define tus metas",
        description:
          "Pon una meta de ventas del día y del mes. El panel te dirá si vas en camino o si necesitas acelerar.",
        example: [
          { label: "Meta del día", value: "$6,000" },
          { label: "Meta del mes", value: "$180,000" },
          { label: "Proyección del día", value: "$5,480 (91%)" },
        ],
      },
      {
        id: "clientes",
        title: "Clientes frecuentes y puntos",
        description:
          "Vincula tus ventas a clientes para acumular puntos de lealtad (ej. 1 punto por cada $100) y detecta a tus comensales recurrentes.",
        example: [
          { label: "Cliente", value: "María López" },
          { label: "Ventas", value: "14" },
          { label: "Puntos acumulados", value: "320" },
        ],
      },
      {
        id: "operacion",
        title: "Mesas, checador y tarjetas",
        description:
          "Gestiona mesas del salón, registra la entrada/salida de tu equipo con el reloj checador y vende tarjetas de regalo.",
      },
      {
        id: "reporte",
        title: "Lee tu reporte del día",
        description:
          "Al final del día revisa tu corte de caja por método de pago, el reporte gerencial, la tendencia de la semana y tus platillos más vendidos.",
        example: [
          { label: "Ingresos", value: "$7,320" },
          { label: "Margen bruto", value: "$2,960 (40.4%)" },
          { label: "Ticket promedio", value: "$174.28" },
          { label: "Platillo top", value: "Hamburguesa clásica (18)" },
        ],
      },
    ],
  },

  "/panel/costeo": {
    tool: "Costeando mi menú",
    icon: "🧮",
    intro:
      "Calcula el costo real de cada platillo, define tu food cost ideal y recibe el precio de venta sugerido.",
    steps: [
      {
        id: "platillo",
        title: "Crea tu primer platillo",
        description:
          "Agrega el nombre del platillo y sus ingredientes con cantidad y precio por unidad. Resurte sugiere el precio de venta según tu food cost objetivo.",
        example: [
          { label: "Platillo", value: "Hamburguesa clásica" },
          { label: "Ingredientes", value: "Pan 1pz ($4), carne 150g ($22), queso 30g ($8), verdura ($4)" },
          { label: "Costo total", value: "$38.00" },
          { label: "Food cost objetivo", value: "30%" },
          { label: "Precio sugerido", value: "$127.00" },
        ],
      },
      {
        id: "food-cost",
        title: "Ajusta tu food cost objetivo",
        description:
          "Define qué porcentaje de tu precio debe representar el costo. Entre 25% y 35% es lo habitual en restaurantes.",
      },
      {
        id: "semaforo",
        title: "Usa el semáforo",
        description:
          "Cada platillo se pinta verde, amarillo o rojo según su rentabilidad. Los rojos te restan dinero: súbeles el precio o reduce ingredientes.",
        example: [
          { label: "🟢 Hamburguesa clásica", value: "Margen $89 (70%)" },
          { label: "🟡 Tacos de pastor", value: "Margen $12 (30%)" },
          { label: "🔴 Papas a la francesa", value: "Margen $2 (8%)" },
        ],
      },
      {
        id: "exportar",
        title: "Exporta o importa tu menú",
        description:
          "Descarga tu menú en CSV o impórtalo directo a tu menú digital (FoodOS) en un clic para publicarlo en línea.",
      },
    ],
  },

  "/panel/mermas": {
    tool: "Calculadora de mermas",
    icon: "🗑️",
    intro:
      "Registra tu desperdicio por categoría y descubre cuánto dinero estás perdiendo, con tips para reducirlo.",
    steps: [
      {
        id: "registrar",
        title: "Registra una merma",
        description:
          "Elige categoría, causa, cuántos kilos desperdiciaste y su costo por kilo. La calculadora convierte eso en dinero perdido.",
        example: [
          { label: "Categoría", value: "Frutas y verduras" },
          { label: "Causa", value: "Preparación" },
          { label: "Cantidad", value: "2 kg" },
          { label: "Costo por kg", value: "$25.00" },
          { label: "Pérdida", value: "$50.00" },
        ],
      },
      {
        id: "meta",
        title: "Pon tu meta mensual",
        description:
          "Define cuánto dinero máximo quieres perder en merma al mes. El panel te avisa si vas por encima de tu meta.",
        example: [
          { label: "Meta mensual", value: "$3,000" },
          { label: "Pérdida este mes", value: "$1,240 (41%)" },
        ],
      },
      {
        id: "causas",
        title: "Encuentra las causas top",
        description:
          "Revisa el desglose por categoría y las causas más frecuentes. Ahí es donde puedes ahorrar más rápido.",
      },
      {
        id: "tips",
        title: "Aplica los tips",
        description:
          "Recibe recomendaciones prácticas por tipo de insumo para reducir la merma típica de tu tipo de cocina.",
      },
    ],
  },

  "/panel/inventario": {
    tool: "Mi inventario",
    icon: "📦",
    intro:
      "Controla tu stock con semáforo 🟢🟡🔴 y genera órdenes de compra automáticas según tus niveles mínimos.",
    steps: [
      {
        id: "articulo",
        title: "Agrega un artículo",
        description:
          "Registra producto, unidad, stock actual y nivel mínimo. El semáforo te indica si estás bien, bajo o crítico.",
        example: [
          { label: "Artículo", value: "Tortillas de maíz" },
          { label: "Unidad", value: "kg" },
          { label: "Stock actual", value: "4 kg" },
          { label: "Nivel mínimo", value: "8 kg" },
          { label: "Estado", value: "🟡 Bajo — conviene pedir" },
        ],
      },
      {
        id: "importar",
        title: "Importa desde el planificador",
        description:
          "Trae a tu inventario los insumos que el planificador calculó para tus comensales esperados y ajusta tu stock en un clic.",
      },
      {
        id: "orden",
        title: "Genera tu orden de compra",
        description:
          "Con los artículos bajos o críticos, el panel arma la orden de compra sugerida con las cantidades que necesitas.",
        example: [
          { label: "Tortillas de maíz", value: "Pedir 6 kg" },
          { label: "Tomate", value: "Pedir 4 kg" },
          { label: "Carne de res", value: "Pedir 9 kg" },
        ],
      },
      {
        id: "movimientos",
        title: "Revisa tus movimientos",
        description:
          "Cada alta, baja o ajuste queda registrado para que sepas cuándo y cómo cambió tu stock.",
      },
    ],
  },

  "/panel/planificador": {
    tool: "Planificador de pedidos",
    icon: "🛒",
    intro:
      "Según tus comensales esperados, calcula cuánto pedir de cada insumo. Ajusta por merma y genera tu orden.",
    steps: [
      {
        id: "covers",
        title: "Define tus comensales esperados",
        description:
          "Indica cuántas personas esperas atender. El planificador calcula las cantidades usando tus recetas costeadas.",
        example: [
          { label: "Comensales esperados", value: "80 personas" },
          { label: "Hamburguesa clásica", value: "Requerido: 35" },
          { label: "Tacos de pastor", value: "Requerido: 28" },
        ],
      },
      {
        id: "insumos",
        title: "Revisa el cálculo por insumo",
        description:
          "Cada ingrediente muestra cuánto necesitas según tus recetas y cuánto ya tienes en inventario.",
        example: [
          { label: "Pan para hamburguesa", value: "Necesitas 120 pzas" },
          { label: "Carne molida", value: "Necesitas 18 kg" },
          { label: "Queso", value: "Necesitas 3.5 kg" },
        ],
      },
      {
        id: "merma",
        title: "Ajusta por merma",
        description:
          "Aplica un factor de seguridad (ej. +10%) para que nunca te quedes corto por merma o imprevistos.",
      },
      {
        id: "orden",
        title: "Genera tu orden",
        description:
          "Copia tu lista de compras o envíala a inventario para registrar el movimiento y armar la orden de compra.",
      },
    ],
  },

  "/panel/rentabilidad": {
    tool: "Semáforo de rentabilidad",
    icon: "📈",
    intro:
      "Visualiza tus platillos en verde, amarillo o rojo según su margen y recibe alertas cuando cambien los precios.",
    steps: [
      {
        id: "semaforo",
        title: "Lee el semáforo",
        description:
          "Verde = buen margen, amarillo = vigilar, rojo = pierdes dinero. Ordena por rentabilidad para ver tus mejores y peores platillos.",
        example: [
          { label: "🟢 Hamburguesa clásica", value: "Margen 70% · precio $127" },
          { label: "🟡 Tacos de pastor", value: "Margen 30% · precio $40" },
          { label: "🔴 Papas a la francesa", value: "Margen 8% · precio $25" },
        ],
      },
      {
        id: "alertas",
        title: "Recibe alertas de precio",
        description:
          "Si el precio de un insumo sube y afecta tu margen, el panel te avisa para que decidas si subes precio o cambias proveedor.",
      },
      {
        id: "accion",
        title: "Actúa sobre los rojos",
        description:
          "Usa los números para subir precios, reducir porciones o renegociar con proveedores y recuperar rentabilidad.",
      },
    ],
  },

  "/panel/temporada": {
    tool: "Planificador de temporada",
    icon: "🗓️",
    intro:
      "Calendario de frutas y verduras de temporada en México para armar menús con los insumos más frescos y baratos.",
    steps: [
      {
        id: "calendario",
        title: "Explora el calendario",
        description:
          "Consulta qué insumos están en su mejor temporada este mes. Frescos y más baratos = mejores márgenes.",
        example: [
          { label: "Temporada actual", value: "Agosto" },
          { label: "🌽 Elote", value: "En su mejor momento" },
          { label: "🍅 Jitomate", value: "Buen precio" },
          { label: "🥑 Aguacate", value: "Inicia temporada" },
        ],
      },
      {
        id: "menus",
        title: "Arma menús estacionales",
        description:
          "Diseña platillos o promociones con los insumos de temporada para ofrecer frescura y mejores costos.",
      },
      {
        id: "lista",
        title: "Crea tu lista de compras",
        description:
          "Agrega a tu lista los insumos de temporada que quieras pedir y llévala a tu orden del planificador o inventario.",
        example: [
          { label: "Elote", value: "8 kg · $12/kg" },
          { label: "Jitomate", value: "6 kg · $18/kg" },
          { label: "Ahorro estimado", value: "$96" },
        ],
      },
    ],
  },

  "/panel/apertura": {
    tool: "Kit de apertura",
    icon: "✅",
    intro:
      "Checklist paso a paso para abrir tu restaurante, con calculadora de inversión inicial y sugerencias de primeros pedidos.",
    steps: [
      {
        id: "checklist",
        title: "Avanza en tu checklist",
        description:
          "Marca cada tarea conforme la completes: planeación, legal, local, equipamiento, proveeduría, personal y soft opening.",
        example: [
          { label: "Planeación", value: "✔ Concepto definido" },
          { label: "Legal y permisos", value: "⏳ En trámite" },
          { label: "Equipamiento", value: "⏳ Pendiente" },
          { label: "Proveeduría", value: "⏳ Pendiente" },
        ],
      },
      {
        id: "inversion",
        title: "Calcula tu inversión inicial",
        description:
          "Estima cuánto necesitas para abrir según tu tipo de cocina: equipos, adecuación, primeros pedidos y capital de trabajo.",
      },
      {
        id: "primeros-pedidos",
        title: "Arma tus primeros pedidos",
        description:
          "Usa las sugerencias de primeros pedidos de tu tipo de restaurante para no comprar de más ni quedarte corto en la apertura.",
        example: [
          { label: "Primer pedido taquería", value: "Carne, tortillas, verdura, salsas" },
          { label: "Primer pedido hamburguesas", value: "Carne molida, pan, queso, papas" },
        ],
      },
    ],
  },

  "/panel/comanda": {
    tool: "Monitor de cocina",
    icon: "🔥",
    intro:
      "Cada venta genera una comanda. Lleva el ciclo pendiente → en cocina → listo y mide tus tiempos de producción.",
    steps: [
      {
        id: "ciclo",
        title: "Controla el ciclo de cada comanda",
        description:
          "Cuando llega una venta, la comanda aparece en pendiente. Márcala en cocina al empezarla y listo al entregarla.",
        example: [
          { label: "Mesa 4 · 2 hamburguesas", value: "⏳ Pendiente" },
          { label: "Mesa 1 · 3 tacos de pastor", value: "👨‍🍳 En cocina" },
          { label: "Mesa 5 · 1 orden de papas", value: "✔ Listo" },
        ],
      },
      {
        id: "canales",
        title: "Clasifica por tipo de servicio",
        description:
          "Filtra por canal (salón, para llevar, delivery) para que cada estación sepa qué producir y en qué orden.",
      },
      {
        id: "tiempos",
        title: "Mide tus tiempos de producción",
        description:
          "Revisa el tiempo promedio de cada comanda y detecta cuellos de botella en horas pico.",
      },
    ],
  },

  "/panel/foodos/restaurante": {
    tool: "Mi restaurante",
    icon: "🏪",
    intro:
      "Tu perfil público con marca, logo y sucursales, más tu link directo de pedidos y código QR.",
    steps: [
      {
        id: "perfil",
        title: "Completa tu perfil público",
        description:
          "Sube tu logo, foto de portada, descripción y datos de contacto. Así se verá tu ficha pública:",
        example: [
          { label: "Nombre", value: "Tacos El Pastorcito" },
          { label: "Descripción", value: "Tacos al pastor desde 1975" },
          { label: "Ciudad", value: "Ciudad de México" },
          { label: "Horario", value: "Lun–Dom · 11:00–23:00" },
        ],
      },
      {
        id: "link",
        title: "Comparte tu link y QR",
        description:
          "Cada sucursal tiene su link directo de pedidos y su código QR para mesas, empaques y redes sociales.",
        example: [
          { label: "Link de pedidos", value: "resurte.me/r/tacos-pastorcito" },
        ],
      },
      {
        id: "sucursales",
        title: "Agrega tus sucursales",
        description:
          "Registra cada local con su dirección y horario para que los comensales pidan en la sucursal correcta.",
      },
    ],
  },

  "/panel/foodos/menu": {
    tool: "Menú digital",
    icon: "🍽️",
    intro:
      "Publica tu menú en línea: categorías, platillos, destacados y disponibilidad. Impórtalo desde tu costeo en un clic.",
    steps: [
      {
        id: "importar",
        title: "Importa desde tu costeo",
        description:
          "Si ya costeaste tus platillos, impórtalos aquí con un clic en lugar de capturarlos de nuevo.",
        example: [
          { label: "Platillos importados", value: "15" },
          { label: "Hamburguesa clásica", value: "🟢 Disponible" },
          { label: "Tacos de pastor", value: "🟢 Disponible" },
        ],
      },
      {
        id: "categorias",
        title: "Organiza por categorías",
        description:
          "Agrupa tu menú (Entradas, Especialidades, Postres, Bebidas) para que el comensal encuentre rápido.",
      },
      {
        id: "destacados",
        title: "Marca destacados y disponibilidad",
        description:
          "Destaca tus platillos más vendidos y oculta los que se agotaron para no generar pedidos imposibles.",
      },
      {
        id: "publicar",
        title: "Publica y comparte",
        description:
          "Tu menú queda en tu micrositio con el link y QR de tu restaurante, listo para recibir pedidos sin comisiones.",
      },
    ],
  },

  "/panel/foodos/combos": {
    tool: "Combos y cross-sell",
    icon: "🎁",
    intro:
      "Crea combos y reglas de venta cruzada para subir tu ticket promedio con ofertas inteligentes.",
    steps: [
      {
        id: "combos",
        title: "Crea tu primer combo",
        description:
          "Agrupa platillos a un precio especial. Así se ve en el menú:",
        example: [
          { label: "Combo Clásico", value: "Hamburguesa + papas + refresco" },
          { label: "Precio regular", value: "$182" },
          { label: "Precio combo", value: "$149 (ahorras $33)" },
        ],
      },
      {
        id: "cross-sell",
        title: "Configura reglas de cross-sell",
        description:
          "Si piden X, sugiere Y: papas con cada hamburguesa, postre con cada pizza, bebida con cada taco.",
        example: [
          { label: "Si pide…", value: "Hamburguesa" },
          { label: "Sugerir…", value: "Papas +$35 · Refresco +$25" },
        ],
      },
      {
        id: "checkout",
        title: "Mide el impacto",
        description:
          "El tablero te muestra cuánto sube tu ticket con combos y cross-sell para afinar tus ofertas.",
      },
    ],
  },

  "/panel/foodos/clientes": {
    tool: "Clientes y recurrencia",
    icon: "📣",
    intro:
      "Base de clientes con segmentos (nuevo, recurrente, VIP) y automatizaciones por WhatsApp para que vuelvan.",
    steps: [
      {
        id: "base",
        title: "Conoce tu base de clientes",
        description:
          "Cada pedido suma un cliente con su segmento. Así se ven:",
        example: [
          { label: "María López", value: "⭐ Recurrente · 14 pedidos" },
          { label: "Juan Pérez", value: "🆕 Nuevo · 1 pedido" },
          { label: "Café La Esquina (VIP)", value: "👑 VIP · 48 pedidos" },
        ],
      },
      {
        id: "automatizaciones",
        title: "Automatiza por WhatsApp",
        description:
          "Configura mensajes automáticos: agradecer después del pedido, recuperar clientes que no vuelven y mandar promos a segmentos.",
      },
      {
        id: "campanas",
        title: "Lanza campañas",
        description:
          "Envía promociones a un segmento (ej. tuércoles de tacos para recurrentes) y mide cuántos regresan.",
      },
    ],
  },

  "/panel/foodos/tablero": {
    tool: "Tablero FoodTech",
    icon: "📊",
    intro:
      "Pedidos por día, canal y sucursal, ticket promedio, top platillos e ingresos. Mide la efectividad de combos y cross-sell.",
    steps: [
      {
        id: "pedidos",
        title: "Revisa tus pedidos por día",
        description:
          "Ve cuántos pedidos recibes al día y su tendencia en el tiempo.",
        example: [
          { label: "Pedidos hoy", value: "23" },
          { label: "Pedidos esta semana", value: "142 · +12%" },
        ],
      },
      {
        id: "canales",
        title: "Compara canales y sucursales",
        description:
          "Identifica de dónde viene tu venta (salón, para llevar, delivery) y qué sucursal rinde más.",
      },
      {
        id: "top",
        title: "Tu top platillos y combos",
        description:
          "Encuentra qué platillos, combos y reglas de cross-sell generan más ingresos para potenciarlos.",
        example: [
          { label: "Top 1", value: "Combo Clásico · $6,870" },
          { label: "Top 2", value: "Hamburguesa clásica · $5,432" },
          { label: "Ticket promedio", value: "$168.40" },
        ],
      },
    ],
  },

  "/panel/foodos/pedidos": {
    tool: "Pedidos en vivo",
    icon: "🧋",
    intro:
      "Recibe y atiende tus pedidos digitales: cambia su estado (pendiente → confirmado → en preparación → en camino → entregado) y filtra por canal.",
    steps: [
      {
        id: "monitor",
        title: "Monitorea los pedidos entrantes",
        description:
          "Cuando alguien pide por tu menú digital, el pedido aparece aquí al instante y se refresca solo. Acompáñalo por su flujo hasta entregarlo.",
        example: [
          { label: "Pedido #1042", value: "Hamburguesa doble · $178" },
          { label: "Canal", value: "QR / WhatsApp / Web" },
          { label: "Estado", value: "En preparación" },
        ],
      },
      {
        id: "estados",
        title: "Avanza los estados del pedido",
        description:
          "Cada tarjeta te deja mover el pedido de Pendiente → Confirmado → En preparación → En camino/Listo → Entregado. El cliente ve el avance en tiempo real.",
      },
      {
        id: "filtros",
        title: "Filtra por canal y estado",
        description:
          "Enfócate en lo que importa: solo delivery, solo WhatsApp o solo pedidos pendientes por atender.",
      },
      {
        id: "cobro",
        title: "Revisa el método de pago",
        description:
          "Verifica si el pedido ya está pagado en línea o si pagará en efectivo al entregar, para preparar el cambio.",
      },
    ],
  },
}

/**
 * Devuelve la guía registrada para una ruta, o null si no existe.
 */
export function getToolGuide(pathname: string): ToolGuideConfig | null {
  return TOOL_GUIDES[pathname] ?? null
}
