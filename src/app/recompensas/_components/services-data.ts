import type { ServiceItem } from "./types";

/**
 * Catálogo de la Tienda de Crecimiento.
 * Módulo de datos plano (sin "use client") para poder importarlo
 * tanto desde componentes de UI como desde rutas API del servidor.
 */
export const SERVICES: ServiceItem[] = [
  {
    id: "google-maps",
    name: "Optimización Google Maps",
    tier: "verde",
    cost: 2800,
    category: "presencia",
    description:
      "Perfil de negocio optimizado con fotos profesionales y keywords locales para que te encuentren más clientes.",
    deliverables: ["30 fotos profesionales", "Descripción SEO local", "Horarios y menú actualizados"],
    estimatedImpact: "+40% en visitas al perfil en 60 días",
    testimonials: "Desde que optimizaron mi perfil de Google, recibo 15 llamadas más por semana.",
    icon: "🗺️",
  },
  {
    id: "foto-profesional",
    name: "Fotografía Profesional",
    tier: "verde",
    cost: 3500,
    category: "presencia",
    description:
      "Sesión de fotos profesional para tus platillos estrella. Imágenes que venden antes que las palabras.",
    deliverables: ["40 fotos en alta resolución", "Edición profesional", "Optimizadas para redes sociales"],
    estimatedImpact: "+60% en interacciones en redes sociales",
    icon: "📸",
  },
  {
    id: "redes-sociales",
    name: "Gestión de Redes Sociales",
    tier: "verde",
    cost: 4500,
    category: "presencia",
    description:
      "Community management básico: 3 posts por semana, historias diarias y respuesta a comentarios.",
    deliverables: ["12 posts al mes", "Stories diarias", "Reporte mensual de métricas"],
    estimatedImpact: "+200% en engagement en 90 días",
    icon: "📱",
  },
  {
    id: "meta-ads",
    name: "Campaña Meta Ads Local",
    tier: "plata",
    cost: 16000,
    category: "trafico",
    description:
      "Campaña publicitaria completa en Facebook e Instagram geolocalizada en un radio de 5km de tu restaurante.",
    deliverables: [
      "15 creatividades publicitarias",
      "Segmentación geolocalizada por zona",
      "2 meses de gestión y optimización",
    ],
    estimatedImpact: "Alcance estimado: 50,000 personas en tu zona por mes",
    testimonials:
      "Llenamos el restaurante los martes, que era nuestro día más flojo. La inversión se pagó en la primera semana.",
    icon: "📣",
  },
  {
    id: "google-ads",
    name: "Google Ads Local",
    tier: "plata",
    cost: 14000,
    category: "trafico",
    description:
      "Anuncios en Google para aparecer cuando alguien busque 'restaurante cerca de mí' o 'mejor comida en [tu zona]'.",
    deliverables: ["Campaña de búsqueda local", "5 landing pages optimizadas", "Seguimiento de conversiones"],
    estimatedImpact: "+25% en tráfico web y llamadas en 30 días",
    icon: "🔍",
  },
  {
    id: "tiktok",
    name: "TikTok para Restaurantes",
    tier: "plata",
    cost: 12000,
    category: "trafico",
    description:
      "Estrategia de contenido en TikTok: videos de tus platillos, detrás de cámaras, y trends adaptados a tu marca.",
    deliverables: ["8 videos editados al mes", "Estrategia de hashtags", "Análisis de tendencias locales"],
    estimatedImpact: "+500% en visibilidad orgánica en 60 días",
    icon: "🎵",
  },
  {
    id: "menu-digital",
    name: "Menú Digital Interactivo",
    tier: "oro",
    cost: 25000,
    category: "infraestructura",
    description:
      "Menú digital responsive con fotos, descripciones y precios. Accesible vía QR en tu restaurante y en línea.",
    deliverables: ["Diseño web responsive", "Código QR para mesas", "Panel para actualizar precios"],
    estimatedImpact: "+15% en ticket promedio (los clientes piden más cuando ven fotos)",
    icon: "🍽️",
  },
  {
    id: "ecommerce",
    name: "Tienda Online + Pedidos",
    tier: "oro",
    cost: 45000,
    category: "infraestructura",
    description:
      "Sitio web completo con sistema de pedidos en línea integrado con WhatsApp y pasarela de pago.",
    deliverables: [
      "Sitio web personalizado",
      "Sistema de pedidos en línea",
      "Integración WhatsApp Business",
      "Panel de administración",
    ],
    estimatedImpact: "+30% en ventas mensuales por canal digital",
    testimonials:
      "Ahora el 40% de mis pedidos llegan por la web. Ya no dependo de apps que me cobran hasta 30% de comisión.",
    icon: "🛒",
  },
  {
    id: "web-completa",
    name: "Desarrollo Web Completo",
    tier: "diamante",
    cost: 60000,
    category: "infraestructura",
    description:
      "Sitio web profesional completo con SEO, blog integrado, menú digital y sistema de reservaciones.",
    deliverables: [
      "Sitio web 5 páginas",
      "Blog + SEO",
      "Sistema de reservaciones",
      "Integración Google Analytics",
    ],
    estimatedImpact: "Presencia digital profesional que compite con cadenas grandes",
    icon: "💻",
  },
];
