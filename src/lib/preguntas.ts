// ============================================================
// HUB DE PREGUNTAS DE RESURTE.ME
// Preguntas conversacionales del dueño de restaurante en México,
// cada una con respuesta autocontenida (40–80 palabras) pensada
// para que un motor de respuesta (ChatGPT, Perplexity, AI
// Overviews, Copilot) pueda citarla sin necesitar el resto de la
// página.
//
// Reglas de contenido:
// - Cada respuesta se sostiene sola: no empieza con "Como vimos…".
// - Cifras SIEMPRE interpoladas desde `commercial-facts.ts`: nunca
//   escribir a mano el mínimo, el envío gratis, el número de ciudades,
//   el tipo de comprobante ni los días de crédito.
// - El `slug` es el ancla citable (/preguntas#slug) y DEBE coincidir
//   con slugifyHeading(question) — hay un test que lo verifica.
// ============================================================

import {
  CREDIT_DAYS_PROSE,
  DELIVERY_CITIES,
  FREE_SHIPPING_MXN,
  INVOICING,
  MIN_ORDER_MXN,
  formatMxn,
} from "./commercial-facts"

interface PreguntaLink {
  label: string
  href: string
}

export interface Pregunta {
  /** Ancla citable: /preguntas#slug */
  slug: string
  question: string
  /** Respuesta autocontenida, 40–80 palabras. */
  answer: string
  theme: PreguntaThemeSlug
  /** Guías y herramientas donde se profundiza. */
  links: PreguntaLink[]
}

type PreguntaThemeSlug =
  | "costos"
  | "proveeduria"
  | "operacion"
  | "marketing"
  | "herramientas"
  | "industria"

export interface PreguntaTheme {
  slug: PreguntaThemeSlug
  label: string
  emoji: string
  description: string
}

export const PREGUNTA_THEMES: PreguntaTheme[] = [
  {
    slug: "costos",
    label: "Costos y rentabilidad",
    emoji: "💰",
    description: "Food cost, precios de menú y margen por platillo.",
  },
  {
    slug: "proveeduria",
    label: "Proveeduría y compras",
    emoji: "🚚",
    description: "Mayoreo, proveedores, pedidos y abastecimiento.",
  },
  {
    slug: "operacion",
    label: "Operación y cocina",
    emoji: "👨‍🍳",
    description: "Mermas, inventario, porciones y procesos.",
  },
  {
    slug: "marketing",
    label: "Marketing y crecimiento",
    emoji: "📣",
    description: "Clientes nuevos, Google Maps, reseñas y delivery.",
  },
  {
    slug: "herramientas",
    label: "Herramientas y tecnología",
    emoji: "🛠️",
    description: "Panel, punto de venta, facturación y control.",
  },
  {
    slug: "industria",
    label: "Industria y datos",
    emoji: "📊",
    description: "Sector restaurantero en México y cómo funciona Resurte.me.",
  },
]

export const PREGUNTAS: Pregunta[] = [
  // ---------------------------------------------------------
  // Costos y rentabilidad
  // ---------------------------------------------------------
  {
    slug: "como-calcular-el-food-cost-de-un-platillo",
    question: "¿Cómo calculo el food cost de un platillo?",
    answer:
      "Suma el costo de cada ingrediente en la porción que realmente sirves y divide entre el precio de venta. La fórmula es food cost % = (costo de insumos ÷ precio de venta) × 100. Si un platillo lleva $38 de insumos y lo vendes en $120, tu food cost es 31.7%. Lo importante es usar el precio que pagaste en tu última compra, no un precio promedio viejo.",
    theme: "costos",
    links: [
      { label: "Guía completa de food cost", href: "/blog/guia-food-cost-restaurante-2026" },
      { label: "Calculadora de food cost", href: "/panel/costeo" },
    ],
  },
  {
    slug: "cual-es-el-food-cost-ideal-de-un-restaurante",
    question: "¿Cuál es el food cost ideal de un restaurante en México?",
    answer:
      "El rango sano para un restaurante en México es 28% a 35% del precio de venta. Por debajo de 28% suele indicar porciones chicas o precios altos; arriba de 35% el margen se aprieta. No todos los platillos deben caer en el rango: los que son imán de clientes pueden ir más alto si el resto del menú compensa.",
    theme: "costos",
    links: [
      { label: "Qué es el food cost y cómo bajarlo", href: "/blog/guia-food-cost-restaurante-2026" },
      { label: "Costeo semanal con el Panel", href: "/blog/costeo-semanal-panel" },
    ],
  },
  {
    slug: "como-calcular-el-precio-de-venta-de-un-platillo",
    question: "¿Cómo calculo el precio de venta de un platillo?",
    answer:
      "Divide el costo de insumos entre tu food cost objetivo. Con un objetivo de 30%: costo $38 ÷ 0.30 = $127. Después compara contra el precio de platillos parecidos en tu zona y ajusta. El error común es calcular el precio una vez y no volver a revisarlo cuando cambian los precios de compra.",
    theme: "costos",
    links: [
      { label: "Cómo poner precio a tu menú", href: "/blog/como-calcular-precio-venta-restaurante" },
      { label: "Costeo con el Panel", href: "/panel/costeo" },
    ],
  },
  {
    slug: "que-hago-si-mis-insumos-suben-de-precio",
    question: "¿Qué hago si mis insumos suben de precio?",
    answer:
      "Primero verifica cuánto subió y en qué insumo; no todos los aumentos exigen subir el menú. Revisa en orden: negociar o cambiar de proveedor, ajustar la porción si se está sirviendo de más, sustituir el ingrediente por uno equivalente y, solo al final, subir el precio de venta. Una semana sin actuar es margen que se escapa.",
    theme: "costos",
    links: [
      { label: "Qué hacer cuando suben tus insumos", href: "/blog/renegociar-precios-inflacion" },
      { label: "Índice de precios de insumos", href: "/precios" },
    ],
  },
  {
    slug: "que-es-el-margen-de-contribucion-en-un-restaurante",
    question: "¿Qué es el margen de contribución en un restaurante?",
    answer:
      "Es lo que le queda a cada venta después de pagar los insumos, y es lo que cubre renta, sueldos y utilidad. Se calcula precio de venta menos costo de insumos. Un platillo de $120 con $38 de insumos deja $82 de contribución. Ordena tu menú por contribución total, no solo por porcentaje: un platillo de margen bajo que vende mucho puede aportar más que uno de margen alto que casi no se pide.",
    theme: "costos",
    links: [
      { label: "Margen de contribución en restaurantes", href: "/blog/margen-de-contribucion-platillo" },
      { label: "Costos y rentabilidad", href: "/blog/categoria/costos" },
    ],
  },
  {
    slug: "como-saber-si-un-platillo-me-esta-haciendo-perder-dinero",
    question: "¿Cómo sé si un platillo me está haciendo perder dinero?",
    answer:
      "Compara su food cost real contra el objetivo de su categoría. Si un platillo debería ir en 30% y va en 42%, cada venta te deja menos de lo que necesitas para cubrir gastos. Señales de alerta: el costo de insumos se movió y no actualizaste el costeo, la porción se sirve a ojo, o el platillo se vende mucho y el margen del mes no se mueve.",
    theme: "costos",
    links: [
      { label: "Cómo detectar platillos que pierden dinero", href: "/blog/ingenieria-de-menu-restaurante" },
      { label: "Analizar rentabilidad por platillo", href: "/panel/costeo" },
    ],
  },
  {
    slug: "como-bajar-el-food-cost-sin-cambiar-el-menu",
    question: "¿Cómo bajo el food cost sin cambiar el menú?",
    answer:
      "Compra al mayoreo, estandariza porciones y controla merma. El mayoreo suele ahorrar entre 15% y 30% frente al menudeo, y en abarrotes es el ahorro más fácil de capturar porque no hay cadena de frío de por medio. Después ataca la merma: pesar antes de porcionar y registrar lo que se tira. Casi siempre el food cost baja por compra y porción, no por receta.",
    theme: "costos",
    links: [
      { label: "Cómo bajar el food cost", href: "/blog/guia-food-cost-restaurante-2026" },
      { label: "Abarrotes al mayoreo", href: "/blog/abarrotes-mayoreo-restaurantes" },
    ],
  },
  {
    slug: "cada-cuanto-debo-actualizar-los-precios-de-mi-costeo",
    question: "¿Cada cuánto debo actualizar los precios de mi costeo?",
    answer:
      "Cada semana para tus insumos clase A (los que concentran el gasto) y cada dos o tres semanas para el resto. Los precios de insumos en México se mueven rápido en verduras, lácteos y carnes. Un costeo con precios de hace dos meses te puede decir que un platillo da 30% cuando en realidad da 36%.",
    theme: "costos",
    links: [
      { label: "Costeo semanal paso a paso", href: "/blog/costeo-semanal-panel" },
      { label: "Índice de precios por ciudad", href: "/precios" },
    ],
  },
  {
    slug: "como-subir-precios-del-menu-sin-perder-clientes",
    question: "¿Cómo subo los precios del menú sin perder clientes?",
    answer:
      "Sube primero los platillos menos sensibles al precio y deja intactos los que tus clientes usan como referencia. Ajusta en pasos pequeños y frecuentes en vez de un salto grande. Comunica el cambio con una razón concreta (costo del insumo) y acompaña el aumento con valor visible: mejor porción, mejor presentación o un servicio más rápido.",
    theme: "costos",
    links: [
      { label: "Cómo subir precios sin perder clientes", href: "/blog/subir-precios-menu-restaurante" },
      { label: "Precios de menú", href: "/blog/categoria/costos" },
    ],
  },

  // ---------------------------------------------------------
  // Proveeduría y compras
  // ---------------------------------------------------------
  {
    slug: "cuanto-se-ahorra-comprando-al-mayoreo-para-un-restaurante",
    question: "¿Cuánto se ahorra comprando al mayoreo para un restaurante?",
    answer:
      "El ahorro típico del mayoreo frente al menudeo es de 15% a 30%, y depende del tipo de insumo. En abarrotes es el más fácil de capturar porque no hay merma acelerada ni riesgo de cadena de frío. En perecederos el ahorro existe pero exige calcular bien el volumen para no perder en merma lo que ganaste en precio.",
    theme: "proveeduria",
    links: [
      { label: "Abarrotes al mayoreo para restaurantes", href: "/blog/abarrotes-mayoreo-restaurantes" },
      { label: "Comprar al mayoreo", href: "/catalogo" },
    ],
  },
  {
    slug: "donde-comprar-insumos-para-restaurante-al-mayoreo-en-mexico",
    question: "¿Dónde compro insumos para restaurante al mayoreo en México?",
    answer:
      `Tienes cuatro rutas: central de abasto, mayoristas especializados, distribuidores regionales y proveeduría en línea. Resurte.me cubre la cuarta: abarrotes, frutas, verduras, carnes, lácteos y desechables con entrega a domicilio en ${DELIVERY_CITIES} ciudades, sin membresía, pedido mínimo de ${formatMxn(MIN_ORDER_MXN)} y envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}.`,
    theme: "proveeduria",
    links: [
      { label: "Comprar insumos al mayoreo", href: "/catalogo" },
      { label: "Ciudades con entrega", href: "/ciudades" },
    ],
  },
  {
    slug: "como-elegir-proveedores-para-mi-restaurante",
    question: "¿Cómo elijo proveedores para mi restaurante?",
    answer:
      "Evalúa cuatro cosas: precio por unidad de uso (no por empaque), cumplimiento de entrega, consistencia de calidad y qué tan fácil es resolver un problema. Pide una muestra antes de comprometer volumen y prueba un pedido completo antes de volverlo tu proveedor principal. El proveedor más barato que falla una entrega te cuesta más que el que cobra un poco más y llega.",
    theme: "proveeduria",
    links: [
      { label: "Cómo elegir proveedores", href: "/blog/elegir-proveedor-mayorista" },
      { label: "Proveeduría y compras", href: "/blog/categoria/proveeduria" },
    ],
  },
  {
    slug: "cada-cuanto-debo-hacer-mi-compra-de-insumos",
    question: "¿Cada cuánto debo hacer mi compra de insumos?",
    answer:
      "Depende del insumo, no de tu calendario. Perecederos y producto fresco: dos o tres veces por semana. Abarrotes, desechables y congelados: una vez por semana o por quincena, según tu espacio de almacén y tu flujo de efectivo. La regla práctica es comprar cada insumo con la frecuencia con la que se echa a perder o se agota.",
    theme: "proveeduria",
    links: [
      { label: "Cómo planear tus compras", href: "/blog/planificador-pedidos-restaurante" },
      { label: "Surtir tu despensa", href: "/catalogo" },
    ],
  },
  {
    slug: "conviene-tener-varios-proveedores-o-uno-solo",
    question: "¿Conviene tener varios proveedores o uno solo?",
    answer:
      "Varios, pero con un principal por categoría. Un solo proveedor simplifica la operación pero te deja expuesto: si falla, te quedas sin insumos y sin poder comparar precios. Ten un proveedor principal y uno de respaldo por familia de producto, y revisa precios cada trimestre para que el respaldo siga siendo competitivo.",
    theme: "proveeduria",
    links: [
      { label: "Cómo elegir proveedores", href: "/blog/elegir-proveedor-mayorista" },
      { label: "Compras y abastecimiento", href: "/blog/categoria/proveeduria" },
    ],
  },
  {
    slug: "como-negociar-precios-con-mis-proveedores",
    question: "¿Cómo negocio precios con mis proveedores?",
    answer:
      "Negocia con datos, no con regateo: lleva tu volumen mensual real, el precio que pagas hoy y una cotización alterna. Pide precio por unidad de uso y no por empaque, para poder comparar. Los mejores acuerdos salen de ofrecer algo a cambio: volumen comprometido, pedido recurrente en día fijo o pago puntual.",
    theme: "proveeduria",
    links: [
      { label: "Cómo negociar con proveedores", href: "/blog/negociacion-proveedores-restaurante" },
      { label: "Surtir por volumen", href: "/comercializacion" },
    ],
  },
  {
    slug: "que-es-el-pedido-minimo-de-resurte-me",
    question: "¿Cuál es el pedido mínimo de Resurte.me?",
    answer:
      `El pedido mínimo es de ${formatMxn(MIN_ORDER_MXN)} y no hay costo de membresía. Si tu pedido supera los ${formatMxn(FREE_SHIPPING_MXN)}, el envío va por nuestra cuenta. Entregamos en ${DELIVERY_CITIES} ciudades de México y todas las compras se pueden facturar con ${INVOICING}, sin costo extra.`,
    theme: "proveeduria",
    links: [
      { label: "Preguntas frecuentes", href: "/faq" },
      { label: "Empezar a surtir", href: "/catalogo" },
    ],
  },
  {
    slug: "como-evitar-quedarme-sin-insumos-en-fin-de-semana",
    question: "¿Cómo evito quedarme sin insumos en fin de semana?",
    answer:
      "Haz tu pedido de perecederos con dos días de anticipación a tu día de mayor venta y ten un colchón de una semana en los insumos que no se echan a perder. Define un punto de reorden por insumo: cuando el inventario baja de ese nivel, se pide, sin discutirlo. El fin de semana es cuando más vendes y cuando menos puedes improvisar.",
    theme: "proveeduria",
    links: [
      { label: "Cómo planear tus compras", href: "/blog/planificador-pedidos-restaurante" },
      { label: "Surtir tu despensa", href: "/catalogo" },
    ],
  },
  {
    slug: "que-hacer-si-mi-proveedor-me-falla",
    question: "¿Qué hago si mi proveedor me falla?",
    answer:
      "Activa el respaldo ese mismo día y documenta la falla: qué faltó, cuánto costó resolverlo y cómo afectó el servicio. Después decide con datos: una falla aislada se conversa, dos en un trimestre justifican mover el volumen. Si el faltante te costó ventas, pide compensación concreta en el siguiente pedido, no una disculpa.",
    theme: "proveeduria",
    links: [
      { label: "Cómo elegir proveedores", href: "/blog/elegir-proveedor-mayorista" },
      { label: "Preguntas frecuentes", href: "/faq" },
    ],
  },

  // ---------------------------------------------------------
  // Operación y cocina
  // ---------------------------------------------------------
  {
    slug: "como-reducir-mermas-en-mi-restaurante",
    question: "¿Cómo reduzco las mermas en mi restaurante?",
    answer:
      "Mide antes de actuar. Registra por una semana qué se tira, cuánto costaba y por qué se tiró: sobreproducción, mal almacenamiento, mala preparación o caducidad. En la mayoría de los casos la merma se concentra en pocos insumos, y atacar esos tres o cuatro reduce más que un cambio general de procesos.",
    theme: "operacion",
    links: [
      { label: "Cómo reducir mermas", href: "/blog/como-reducir-merma-cocina" },
      { label: "Operación y cocina", href: "/blog/categoria/operacion" },
    ],
  },
  {
    slug: "como-hacer-un-inventario-de-cocina-sin-perder-tiempo",
    question: "¿Cómo hago un inventario de cocina sin perder tiempo?",
    answer:
      "Cuenta por excepción, no todo. Lleva un inventario teórico (lo que deberías tener según compras y ventas) y cuenta físicamente solo los insumos de mayor valor y los que sospechas que no cuadran. Con eso detectas la diferencia en 20 minutos en lugar de tres horas, y el dato sirve igual para tomar decisiones.",
    theme: "operacion",
    links: [
      { label: "Inventario sin Excel", href: "/blog/apps-gestion-inventario-movil" },
      { label: "Control de inventario", href: "/panel/inventario" },
    ],
  },
  {
    slug: "que-es-el-porcionamiento-y-por-que-importa",
    question: "¿Qué es el porcionamiento y por qué importa?",
    answer:
      "Es servir cada platillo con la misma cantidad, medida con báscula, cuchara o cucharón calibrado. Importa porque el food cost se calcula sobre una porción específica: si el cocinero sirve 15% más proteína de la receta, ese platillo sube alrededor de cuatro puntos de food cost sin que nadie lo note en el punto de venta.",
    theme: "operacion",
    links: [
      { label: "Estandarizar porciones", href: "/blog/estandarizar-porciones-cocina" },
      { label: "Operación y cocina", href: "/blog/categoria/operacion" },
    ],
  },
  {
    slug: "como-organizar-la-recepcion-de-mercancia",
    question: "¿Cómo organizo la recepción de mercancía?",
    answer:
      "Recibe siempre contra el pedido: revisa cantidad, peso y temperatura antes de firmar. Ten una báscula a la mano y una lista de verificación por proveedor. Separa de inmediato lo que va a refrigeración, congelación y almacén seco; cada minuto que un perecedero pasa en el pasillo es vida útil que pierdes.",
    theme: "operacion",
    links: [
      { label: "Recepción de mercancía", href: "/blog/recepcion-mercancia-verificacion" },
      { label: "Operación y cocina", href: "/blog/categoria/operacion" },
    ],
  },
  {
    slug: "como-hacer-una-planificacion-semanal-de-cocina",
    question: "¿Cómo hago una planificación semanal de cocina?",
    answer:
      "Parte de tu pronóstico de ventas por día, no de lo que te gustaría vender. Con ese pronóstico calcula cuánto necesitas de cada insumo, revisa lo que ya tienes en almacén y de ahí sale el pedido. Revisa el plan cada semana con los números reales de la anterior: el pronóstico mejora solo si lo corriges.",
    theme: "operacion",
    links: [
      { label: "Planificación semanal de cocina", href: "/blog/control-de-produccion-cocina" },
      { label: "Panel de operación", href: "/panel" },
    ],
  },
  {
    slug: "que-es-el-rendimiento-de-un-insumo-y-como-se-mide",
    question: "¿Qué es el rendimiento de un insumo y cómo se mide?",
    answer:
      "Es cuánto producto utilizable queda después de limpiar, deshuesar o cocinar. Se mide dividiendo el peso utilizable entre el peso comprado. Un kilo de cebolla que rinde 850 gramos tiene 85% de rendimiento. Si costeas con el precio del kilo comprado y no con el del kilo utilizable, subestimas el costo real del platillo.",
    theme: "operacion",
    links: [
      { label: "Rendimiento y merma de insumos", href: "/blog/precio-por-gramo-rendimiento-restaurante" },
      { label: "Costeo con el Panel", href: "/panel/costeo" },
    ],
  },
  {
    slug: "conviene-comprar-diario-o-semanal-en-un-restaurante",
    question: "¿Conviene comprar diario o semanal en un restaurante?",
    answer:
      "Diario solo para lo que se echa a perder en horas: pan, hierbas, mariscos frescos. Semanal para el resto. Comprar diario reduce merma pero sube el costo de logística y te expone a faltantes; comprar semanal baja el precio unitario pero exige espacio y control de inventario. Casi todo restaurante termina en un esquema mixto.",
    theme: "operacion",
    links: [
      { label: "Cómo planear tus compras", href: "/blog/planificador-pedidos-restaurante" },
      { label: "Surtir tu despensa", href: "/catalogo" },
    ],
  },
  {
    slug: "como-capacitar-a-mi-equipo-de-cocina-en-costos",
    question: "¿Cómo capacito a mi equipo de cocina en costos?",
    answer:
      "Enseña el efecto, no la teoría. Muestra el costo del plato mal servido en pesos y compara con lo que gana por hora. Pon ayudas visuales en la estación: cucharones calibrados, fotos de la porción correcta y el nombre del insumo con su costo unitario. Un cocinero que entiende cuánto cuesta cada gramo cuida la porción sin supervisión.",
    theme: "operacion",
    links: [
      { label: "Capacitar al equipo en costos", href: "/blog/capacitacion-equipo-cocina" },
      { label: "Operación y cocina", href: "/blog/categoria/operacion" },
    ],
  },
  {
    slug: "como-controlar-el-uso-de-insumos-en-cocina",
    question: "¿Cómo controlo el uso de insumos en cocina?",
    answer:
      "Haz visible el costo. Publica el food cost de los platillos principales donde los vea el equipo y revisa la variación semanal por estación. Cuando el consumo de un insumo se dispara, pregunta antes de asumir robo: casi siempre es una receta cambiada, una porción a ojo o un desperdicio en preparación.",
    theme: "operacion",
    links: [
      { label: "Control de insumos en cocina", href: "/blog/control-de-produccion-cocina" },
      { label: "Panel de operación", href: "/panel" },
    ],
  },

  // ---------------------------------------------------------
  // Marketing y crecimiento
  // ---------------------------------------------------------
  {
    slug: "como-aparecer-en-google-maps-si-tengo-un-restaurante",
    question: "¿Cómo aparezco en Google Maps si tengo un restaurante?",
    answer:
      "Crea o reclama tu ficha en Google Business Profile y completa todo: nombre exacto, dirección, teléfono, horarios, categoría, fotos y menú. Después mantén la ficha activa: publica novedades y responde reseñas. La ficha es el factor que más mueve las visitas locales, porque es lo que aparece cuando alguien busca cerca de ti.",
    theme: "marketing",
    links: [
      { label: "Aparecer en Google Maps", href: "/blog/google-maps-restaurantes-2026" },
      { label: "Marketing y crecimiento", href: "/blog/categoria/marketing" },
    ],
  },
  {
    slug: "como-conseguir-mas-resenas-en-google",
    question: "¿Cómo consigo más reseñas en Google?",
    answer:
      "Pide la reseña en el momento de mayor satisfacción: al entregar el postre o al cobrar, con un enlace corto o un código QR en la cuenta. Responde todas las reseñas, incluidas las negativas, en menos de 48 horas. La consistencia importa más que el volumen: reseñas nuevas cada semana pesan más que cien de golpe.",
    theme: "marketing",
    links: [
      { label: "Cómo conseguir más reseñas", href: "/blog/pedir-resenas-restaurante" },
      { label: "Marketing y crecimiento", href: "/blog/categoria/marketing" },
    ],
  },
  {
    slug: "como-aumentar-las-ventas-de-mi-restaurante",
    question: "¿Cómo aumento las ventas de mi restaurante?",
    answer:
      "Es más barato venderle más a quien ya te compra que conseguir clientes nuevos. Empieza por tres palancas: subir el ticket promedio con complementos y postres sugeridos, recuperar clientes que dejaron de venir y aumentar la frecuencia con un motivo para volver. El crecimiento sostenido sale de la mezcla, no de una sola táctica.",
    theme: "marketing",
    links: [
      { label: "Cómo aumentar las ventas", href: "/blog/guia-crecer-restaurante" },
      { label: "Marketing y crecimiento", href: "/blog/categoria/marketing" },
    ],
  },
  {
    slug: "conviene-vender-por-apps-de-delivery",
    question: "¿Conviene vender por apps de delivery?",
    answer:
      "Sí, si ajustas el precio para absorber la comisión. El error común es vender el mismo platillo al mismo precio que en salón: con comisiones de dos dígitos el margen puede desaparecer. Sube el precio en la app, simplifica el menú a los platillos que viajan bien y mide el margen por platillo después de comisión, no el volumen.",
    theme: "marketing",
    links: [
      { label: "Delivery y márgenes", href: "/blog/margenes-delivery-vs-local" },
      { label: "Integrar POS con delivery", href: "/blog/integrar-pos-con-delivery" },
    ],
  },
  {
    slug: "como-hacer-un-menu-digital-para-mi-restaurante",
    question: "¿Cómo hago un menú digital para mi restaurante?",
    answer:
      "Empieza por lo que se lee en el celular: nombre, precio y una foto por platillo. Un menú digital no necesita una app; necesita cargar rápido, funcionar sin descargar nada y mostrar precios siempre actualizados. Mantén una sola fuente de verdad para los precios, o terminarás con tres versiones distintas del mismo platillo.",
    theme: "marketing",
    links: [
      { label: "Menú digital para restaurantes", href: "/blog/menu-digital-restaurante-guia" },
      { label: "Marketing y crecimiento", href: "/blog/categoria/marketing" },
    ],
  },
  {
    slug: "como-recuperar-clientes-que-dejaron-de-venir",
    question: "¿Cómo recupero clientes que dejaron de venir?",
    answer:
      "Identifica a quién dejaste de ver en los últimos 60 a 90 días y contáctalo con un motivo concreto, no con un descuento genérico. Funciona mejor un mensaje corto: qué cambió, qué hay de nuevo o qué platillo volvió. Los clientes que ya te conocen convierten mucho mejor que un cliente nuevo.",
    theme: "marketing",
    links: [
      { label: "Recuperar clientes", href: "/blog/recuperar-clientes-inactivos-restaurante" },
      { label: "Recompensas Resurte.me", href: "/recompensas" },
    ],
  },
  {
    slug: "como-promocionar-mi-restaurante-en-redes-sociales",
    question: "¿Cómo promociono mi restaurante en redes sociales?",
    answer:
      "Elige una red y publica con ritmo constante en lugar de estar en todas de vez en cuando. Los formatos que mejor funcionan para restaurantes son el producto en preparación, el equipo y el detrás de cámara. Ten un calendario mensual armado con anticipación para no depender de la inspiración del día.",
    theme: "marketing",
    links: [
      { label: "Calendario de contenidos", href: "/blog/calendario-contenidos-redes-restaurante" },
      { label: "Marketing y crecimiento", href: "/blog/categoria/marketing" },
    ],
  },
  {
    slug: "que-hacer-si-mi-restaurante-no-tiene-clientes",
    question: "¿Qué hago si mi restaurante no tiene clientes?",
    answer:
      "Antes de gastar en publicidad, revisa si te encuentran: ficha de Google completa, horarios correctos, fotos reales y reseñas respondidas. Muchos restaurantes con poca clientela tienen un problema de visibilidad, no de producto. Después revisa el ticket promedio y la frecuencia; suele haber más venta en tus clientes actuales que en la calle.",
    theme: "marketing",
    links: [
      { label: "Aparecer en Google Maps", href: "/blog/google-maps-restaurantes-2026" },
      { label: "Marketing y crecimiento", href: "/blog/categoria/marketing" },
    ],
  },
  {
    slug: "como-medir-si-mi-marketing-esta-funcionando",
    question: "¿Cómo mido si mi marketing está funcionando?",
    answer:
      "Mide cuatro números cada mes: cuánta gente nueva te encontró, cuánto gastaste, cuánto vendieron esos clientes y cuántos volvieron. Sin el cuarto dato no sabes si compraste clientes o compraste visitas. Registra de dónde viene cada cliente nuevo, aunque sea preguntando al cobrar.",
    theme: "marketing",
    links: [
      { label: "Medir tu marketing", href: "/blog/datos-restaurante-para-decidir" },
      { label: "Google Analytics para restaurantes", href: "/blog/google-analytics-restaurante" },
    ],
  },

  // ---------------------------------------------------------
  // Herramientas y tecnología
  // ---------------------------------------------------------
  {
    slug: "que-es-el-panel-de-resurte-me",
    question: "¿Qué es el Panel de Resurte.me?",
    answer:
      "Es el conjunto de herramientas gratuitas de Resurte.me para operar tu restaurante: costeo de platillos, control de inventario y cálculo de food cost. Está incluido al comprar en Resurte.me, funciona en el navegador del celular o la computadora y no requiere instalar nada.",
    theme: "herramientas",
    links: [
      { label: "Abrir el Panel", href: "/panel" },
      { label: "Calculadora de costeo", href: "/panel/costeo" },
    ],
  },
  {
    slug: "como-llevar-el-control-de-inventario-sin-excel",
    question: "¿Cómo llevo el control de inventario sin Excel?",
    answer:
      "Captura el inventario desde el celular en el momento del conteo, no al final del turno. El doble paso —contar en papel y luego transcribir— es donde se pierde la información: números mal copiados, notas ilegibles y conteos que nunca se capturan. Una sola captura que alimente costeo y compras elimina ese paso.",
    theme: "herramientas",
    links: [
      { label: "Inventario desde el móvil", href: "/blog/apps-gestion-inventario-movil" },
      { label: "Control de inventario", href: "/panel/inventario" },
    ],
  },
  {
    slug: "como-conectar-mi-punto-de-venta-con-el-delivery",
    question: "¿Cómo conecto mi punto de venta con el delivery?",
    answer:
      "Busca que el punto de venta reciba los pedidos de las apps sin recapturarlos a mano. Cada pedido que se teclea dos veces es un error potencial y tiempo del equipo en hora pico. Antes de contratar, confirma qué apps integra de forma nativa y si puedes descontar inventario automáticamente al cerrar el pedido.",
    theme: "herramientas",
    links: [
      { label: "Integrar POS con delivery", href: "/blog/integrar-pos-con-delivery" },
      { label: "Herramientas y tecnología", href: "/blog/categoria/herramientas" },
    ],
  },
  {
    slug: "que-hago-si-no-se-usar-tecnologia-en-mi-restaurante",
    question: "¿Qué hago si no sé usar tecnología en mi restaurante?",
    answer:
      "Empieza por un solo problema y una sola herramienta. Si tu dolor es no saber cuánto cuesta cada platillo, resuelve el costeo; no intentes digitalizar todo el restaurante el mismo mes. Elige herramientas que funcionen en el celular y que no exijan capacitar a todo el equipo desde el primer día.",
    theme: "herramientas",
    links: [
      { label: "Automatizar procesos del restaurante", href: "/blog/automatizar-procesos-restaurante" },
      { label: "Abrir el Panel", href: "/panel" },
    ],
  },
  {
    slug: "como-facturar-mis-compras-de-insumos",
    question: "¿Cómo facturo mis compras de insumos?",
    answer:
      `Solicítala y te emitimos la factura con ${INVOICING}. Necesitamos tu RFC, razón social, régimen fiscal, uso de CFDI y código postal fiscal: con eso la factura queda lista para deducir. En Resurte.me no tienes que perseguir al proveedor por tu comprobante.`,
    theme: "herramientas",
    links: [
      { label: "Preguntas frecuentes", href: "/faq" },
      { label: "Empezar a surtir", href: "/catalogo" },
    ],
  },
  {
    slug: "como-medir-mis-ventas-con-google-analytics",
    question: "¿Cómo mido mis ventas con Google Analytics?",
    answer:
      "Configura eventos para las acciones que te importan: ver menú, pedido por WhatsApp, llamada y compra en línea. Enviar solo las vistas de página te dice cuánta gente entró, no cuánta te contactó. Con eventos puedes comparar qué canal trae pedidos reales y cuál solo trae tráfico.",
    theme: "herramientas",
    links: [
      { label: "Google Analytics para restaurantes", href: "/blog/google-analytics-restaurante" },
      { label: "Medir tu marketing", href: "/blog/datos-restaurante-para-decidir" },
    ],
  },
  {
    slug: "conviene-un-punto-de-venta-para-una-fonda-pequena",
    question: "¿Conviene un punto de venta para una fonda pequeña?",
    answer:
      "Sí, cuando el control manual ya te cuesta más de lo que cuesta el sistema. Señales de que toca: no sabes tu food cost, cierras caja sin cuadrar o no distingues tus platillos más rentables. Si aún vendes poco volumen y conoces bien tus números, un sistema completo puede ser más de lo que necesitas.",
    theme: "herramientas",
    links: [
      { label: "Herramientas para fondas", href: "/blog/punto-venta-restaurante-guia" },
      { label: "Herramientas y tecnología", href: "/blog/categoria/herramientas" },
    ],
  },
  {
    slug: "como-automatizar-el-costeo-de-mi-menu",
    question: "¿Cómo automatizo el costeo de mi menú?",
    answer:
      "Guarda tus recetas una vez y actualiza precios, en lugar de recalcular todo cada vez. Cuando el precio de un insumo cambia, el costo del platillo se recalcula solo y ves qué platillos se movieron. La primera carga es la más lenta; después el costeo es mantenimiento semanal de minutos.",
    theme: "herramientas",
    links: [
      { label: "Costeo semanal con el Panel", href: "/blog/costeo-semanal-panel" },
      { label: "Calculadora de costeo", href: "/panel/costeo" },
    ],
  },
  {
    slug: "que-herramientas-gratis-existen-para-restaurantes-en-mexico",
    question: "¿Qué herramientas gratis existen para restaurantes en México?",
    answer:
      "Las más útiles son la ficha de Google Business Profile, una hoja de cálculo para inventario y las calculadoras de costeo. Resurte.me incluye costeo, inventario y cálculo de food cost sin costo para sus clientes, y todo funciona en el navegador del celular, sin instalaciones ni licencias.",
    theme: "herramientas",
    links: [
      { label: "Abrir el Panel", href: "/panel" },
      { label: "Herramientas y tecnología", href: "/blog/categoria/herramientas" },
    ],
  },

  // ---------------------------------------------------------
  // Industria y datos
  // ---------------------------------------------------------
  {
    slug: "que-es-resurte-me-y-como-funciona",
    question: "¿Qué es Resurte.me y cómo funciona?",
    answer:
      `Resurte.me es una proveeduría en línea de insumos para restaurantes en México. Vendes abarrotes, frutas, verduras, carnes, lácteos y desechables al mayoreo, con entrega a domicilio en ${DELIVERY_CITIES} ciudades, sin membresía, pedido mínimo de ${formatMxn(MIN_ORDER_MXN)}, envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}, facturación ${INVOICING} y crédito a ${CREDIT_DAYS_PROSE} días.`,
    theme: "industria",
    links: [
      { label: "Sobre Resurte.me", href: "/about" },
      { label: "Ver catálogo", href: "/catalogo" },
    ],
  },
  {
    slug: "cuantas-ciudades-cubre-resurte-me",
    question: "¿Cuántas ciudades cubre Resurte.me?",
    answer:
      `Resurte.me entrega en ${DELIVERY_CITIES} ciudades de México: CDMX, Guadalajara, Monterrey, Puebla, Toluca, Querétaro, León, Tijuana, Mérida, San Luis Potosí, Aguascalientes, Hermosillo, Saltillo, Culiacán, Morelia, Chihuahua, Veracruz, Villahermosa, Cancún y Torreón. La cobertura crece cada mes; en la página de ciudades puedes ver la lista vigente y las zonas de entrega.`,
    theme: "industria",
    links: [
      { label: "Ciudades con entrega", href: "/ciudades" },
      { label: "Sobre Resurte.me", href: "/about" },
    ],
  },
  {
    slug: "cuanto-gasta-un-restaurante-en-insumos-al-mes",
    question: "¿Cuánto gasta un restaurante en insumos al mes?",
    answer:
      "Depende del concepto, pero el costo de insumos suele representar entre 28% y 35% de las ventas. Para una venta mensual de $200,000 MXN eso equivale a entre $56,000 y $70,000 MXN. Dentro de ese gasto, los abarrotes concentran entre 20% y 25%, y son la categoría donde el mayoreo genera el ahorro más fácil de capturar.",
    theme: "industria",
    links: [
      { label: "Abarrotes al mayoreo", href: "/blog/abarrotes-mayoreo-restaurantes" },
      { label: "Índice de precios de insumos", href: "/precios" },
    ],
  },
  {
    slug: "como-afecta-la-inflacion-a-los-restaurantes-en-mexico",
    question: "¿Cómo afecta la inflación a los restaurantes en México?",
    answer:
      "La inflación golpea al restaurante por dos lados: suben los insumos y suben los gastos fijos, pero el menú tarda en ajustarse. El resultado es un food cost que se desliza sin que el dueño lo note hasta el cierre del mes. La defensa es costear con precios de compra actualizados cada semana y no con los del mes pasado.",
    theme: "industria",
    links: [
      { label: "Índice de precios de insumos", href: "/precios" },
      { label: "Qué hacer cuando suben tus insumos", href: "/blog/renegociar-precios-inflacion" },
    ],
  },
  {
    slug: "que-es-la-canirac-y-conviene-afiliarse",
    question: "¿Qué es la CANIRAC y conviene afiliarse?",
    answer:
      "La CANIRAC es la Cámara Nacional de la Industria de Restaurantes y Alimentos Condimentados, creada en 1959. Agrupa a la industria restaurantera en México y representa al sector ante autoridades federales, estatales y municipales. Ofrece capacitación, asesoría, vinculación y descuentos a sus afiliados. La afiliación no es obligatoria para operar un restaurante; su valor está en la representación gremial y los servicios.",
    theme: "industria",
    links: [
      { label: "CANIRAC: qué es y cómo afiliarse", href: "/blog/canirac-que-es-afiliarse" },
      { label: "Industria y tendencias", href: "/blog/categoria/industria" },
    ],
  },
  {
    slug: "como-compite-una-fonda-contra-las-cadenas",
    question: "¿Cómo compite una fonda contra las cadenas?",
    answer:
      "Compites en lo que la cadena no puede copiar rápido: sazón propio, trato de barrio y rapidez de adaptación. Lo que sí debes igualar es el control: costos por platillo, porciones estandarizadas y presencia en Google. La mayoría de las fondas pierde contra las cadenas por falta de datos, no por falta de sabor.",
    theme: "industria",
    links: [
      { label: "Herramientas para fondas", href: "/blog/punto-venta-restaurante-guia" },
      { label: "Costos y rentabilidad", href: "/blog/categoria/costos" },
    ],
  },
  {
    slug: "que-documentos-necesito-para-abrir-un-restaurante-en-mexico",
    question: "¿Qué documentos necesito para abrir un restaurante en México?",
    answer:
      "Como mínimo: RFC y alta en el SAT, aviso de funcionamiento ante COFEPRIS, licencia de funcionamiento municipal y protección civil. Si vendes alcohol se suma la licencia de bebidas alcohólicas. Los requisitos cambian por estado y municipio, así que conviene confirmar en la ventanilla local antes de firmar la renta del local.",
    theme: "industria",
    links: [
      { label: "Abrir un restaurante paso a paso", href: "/blog/licencias-permisos-restaurante-mexico" },
      { label: "Industria y tendencias", href: "/blog/categoria/industria" },
    ],
  },
  {
    slug: "como-esta-cambiando-el-consumo-en-restaurantes",
    question: "¿Cómo está cambiando el consumo en restaurantes?",
    answer:
      "El consumo se está moviendo hacia tres cosas: pedidos para llevar y delivery, conveniencia (listo para comer o casi listo) y decisiones de compra influidas por precio más que por marca. Para el restaurante eso significa que el menú tiene que funcionar igual de bien en mesa que en empaque, y que el margen se defiende con datos, no con volumen.",
    theme: "industria",
    links: [
      { label: "Tendencias del sector", href: "/blog/categoria/industria" },
      { label: "Delivery y márgenes", href: "/blog/margenes-delivery-vs-local" },
    ],
  },
  {
    slug: "como-empezar-a-surtir-con-resurte-me",
    question: "¿Cómo empiezo a surtir con Resurte.me?",
    answer:
      `Creas tu cuenta con los datos de tu negocio en menos de cinco minutos, eliges tu ciudad, buscas los insumos que necesitas y cierras el pedido. No hay membresía ni visita presencial. El pedido mínimo es de ${formatMxn(MIN_ORDER_MXN)} y si superas ${formatMxn(FREE_SHIPPING_MXN)} el envío corre por nuestra cuenta.`,
    theme: "industria",
    links: [
      { label: "Crear cuenta", href: "/auth/register" },
      { label: "Preguntas frecuentes", href: "/faq" },
    ],
  },
]

/** Preguntas agrupadas por tema, en el orden declarado en PREGUNTA_THEMES. */
export function getPreguntaGroups(): {
  theme: PreguntaTheme
  preguntas: Pregunta[]
}[] {
  return PREGUNTA_THEMES.map((theme) => ({
    theme,
    preguntas: PREGUNTAS.filter((p) => p.theme === theme.slug),
  })).filter((group) => group.preguntas.length > 0)
}

export function getPregunta(slug: string): Pregunta | undefined {
  return PREGUNTAS.find((p) => p.slug === slug)
}

export function getPreguntasByTheme(slug: PreguntaThemeSlug): Pregunta[] {
  return PREGUNTAS.filter((p) => p.theme === slug)
}

/** Ancla citable de una pregunta: `/preguntas#slug`. */
export function getPreguntaUrl(pregunta: Pregunta): string {
  return `/preguntas#${pregunta.slug}`
}

