"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Sparkles, TrendingUp, Users, X } from "lucide-react";
import type { ServiceItem, Tier } from "./types";

export const SERVICES: ServiceItem[] = [
  {
    id: "google-maps",
    name: "Optimización Google Maps",
    tier: "basic",
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
    tier: "basic",
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
    tier: "basic",
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
    tier: "intermediate",
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
    tier: "intermediate",
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
    tier: "intermediate",
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
    tier: "advanced",
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
    tier: "advanced",
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
      "Ahora el 40% de mis pedidos llegan por la web. Ya no dependo de apps que me cobran 30% de comisión.",
    icon: "🛒",
  },
  {
    id: "web-completa",
    name: "Desarrollo Web Completo",
    tier: "advanced",
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

const tierConfig: Record<Tier, { label: string; bg: string; text: string; border: string }> = {
  basic: {
    label: "Básico",
    bg: "bg-sky-600/20",
    text: "text-sky-400",
    border: "border-sky-500/30",
  },
  intermediate: {
    label: "Intermedio",
    bg: "bg-amber-600/20",
    text: "text-amber-400",
    border: "border-amber-500/30",
  },
  advanced: {
    label: "Avanzado",
    bg: "bg-violet-600/20",
    text: "text-violet-400",
    border: "border-violet-500/30",
  },
};

const categories = [
  { id: "all", label: "Todos", icon: "🏪" },
  { id: "presencia", label: "Presencia", icon: "🗺️" },
  { id: "trafico", label: "Tráfico", icon: "📣" },
  { id: "infraestructura", label: "Infra", icon: "💻" },
] as const;

interface StoreScreenProps {
  onServiceSelect: (service: ServiceItem) => void;
  onOpenCalculator: (service?: ServiceItem) => void;
}

export function StoreScreen({ onServiceSelect, onOpenCalculator }: StoreScreenProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [detailService, setDetailService] = useState<ServiceItem | null>(null);

  const filtered =
    activeCategory === "all"
      ? SERVICES
      : SERVICES.filter((s) => s.category === activeCategory);

  const balance = 12450;
  const monthlySpend = 32000;
  const cashbackRate = 0.05;
  const monthlyCashback = monthlySpend * cashbackRate;

  return (
    <div className="px-4 pt-6 pb-6 md:px-6 lg:px-8 lg:max-w-6xl lg:mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-400" />
          <h1 className="text-white text-xl font-bold">Tienda de Crecimiento</h1>
        </div>
        <p className="text-gray-400 text-sm mt-1">
          Convierte tu cashback en clientes nuevos. Sin gastar un peso extra.
        </p>
      </motion.div>

      {/* Category filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-4">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium 
              whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/30"
                  : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
          >
            <span>{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Service Grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((service, i) => {
            const monthsToUnlock = Math.ceil(service.cost / monthlyCashback);
            const isUnlocked = balance >= service.cost;
            const tier = tierConfig[service.tier];

            return (
              <motion.div
                key={service.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
              >
                <ServiceCard
                  service={service}
                  isUnlocked={isUnlocked}
                  monthsToUnlock={monthsToUnlock}
                  tier={tier}
                  balance={balance}
                  onSelect={() => setDetailService(service)}
                  onRedeem={() => onServiceSelect(service)}
                  onCalculator={() => onOpenCalculator(service)}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Detail Bottom Sheet */}
      <AnimatePresence>
        {detailService && (
          <ServiceDetailSheet
            service={detailService}
            balance={balance}
            monthlyCashback={monthlyCashback}
            onClose={() => setDetailService(null)}
            onRedeem={() => {
              onServiceSelect(detailService);
              setDetailService(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ServiceCard({
  service,
  isUnlocked,
  monthsToUnlock,
  tier,
  balance,
  onSelect,
  onRedeem,
  onCalculator,
}: {
  service: ServiceItem;
  isUnlocked: boolean;
  monthsToUnlock: number;
  tier: { label: string; bg: string; text: string; border: string };
  balance: number;
  onSelect: () => void;
  onRedeem: () => void;
  onCalculator: () => void;
}) {
  const remaining = service.cost - balance;
  // Simulated social proof counters
  const socialProofCounts: Record<string, string> = {
    "google-maps": "247 restaurantes",
    "foto-profesional": "189 restaurantes",
    "redes-sociales": "312 restaurantes",
    "meta-ads": "156 restaurantes",
    "google-ads": "134 restaurantes",
    "tiktok": "98 restaurantes",
    "menu-digital": "73 restaurantes",
    "ecommerce": "41 restaurantes",
    "web-completa": "28 restaurantes",
  };

  return (
    <div
      onClick={onSelect}
      className={`group relative overflow-hidden rounded-2xl border transition-all 
        active:scale-[0.98] cursor-pointer ${
          isUnlocked
            ? "border-emerald-500/40 bg-white/5 hover:border-emerald-400/60"
            : "border-white/10 bg-white/5 hover:border-white/20"
        }`}
    >
      {/* Unlocked glow */}
      {isUnlocked && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* Tier Badge */}
      <div className="absolute top-3 left-3 z-10">
        <span
          className={`inline-flex items-center gap-1 rounded-full ${tier.bg} ${tier.text} 
            ${tier.border} border px-2.5 py-0.5 text-[10px] font-bold`}
        >
          {tier.label}
        </span>
      </div>

      {/* Unlocked badge */}
      {isUnlocked && (
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300 }}
          className="absolute top-3 right-3 z-10"
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-bold">
            <CheckCircle className="h-3 w-3" /> Disponible
          </span>
        </motion.div>
      )}

      <div className="p-4 pt-9">
        {/* Icon + Name */}
        <div className="flex items-start gap-3">
          <motion.div
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-xl"
            whileHover={{ scale: 1.1, rotate: -5 }}
          >
            {service.icon}
          </motion.div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-sm leading-tight">{service.name}</h3>
            <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{service.description}</p>
          </div>
        </div>

        {/* Impact Badge */}
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/10 px-2.5 py-1.5">
          <TrendingUp className="h-3 w-3 text-emerald-400 flex-shrink-0" />
          <p className="text-emerald-400 text-[10px] font-medium leading-tight">
            {service.estimatedImpact}
          </p>
        </div>

        {/* Social Proof */}
        <div className="mt-2 flex items-center gap-1.5">
          <Users className="h-3 w-3 text-gray-600" />
          <span className="text-gray-600 text-[10px]">
            {socialProofCounts[service.id] || "0 restaurantes"} ya lo canjearon
          </span>
        </div>

        {/* Cost + CTA */}
        <div className="mt-3 flex items-center justify-between">
          <div>
            <p className="text-gray-500 text-[10px] uppercase tracking-wider">Inversión</p>
            <p className="text-white font-bold text-lg tabular-nums">
              ${service.cost.toLocaleString("es-MX")}
            </p>
          </div>

          {isUnlocked ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.stopPropagation();
                onRedeem();
              }}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white 
                shadow-lg shadow-emerald-900/30 transition-all hover:bg-emerald-500"
            >
              Canjear ahora
            </motion.button>
          ) : (
            <div className="text-right">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCalculator();
                }}
                className="text-amber-400 text-[10px] font-medium hover:underline"
              >
                Te faltan ${remaining.toLocaleString("es-MX")}
              </button>
              <p className="text-gray-600 text-[10px] mt-0.5">
                ~{monthsToUnlock} {monthsToUnlock === 1 ? "mes" : "meses"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceDetailSheet({
  service,
  balance,
  monthlyCashback,
  onClose,
  onRedeem,
}: {
  service: ServiceItem;
  balance: number;
  monthlyCashback: number;
  onClose: () => void;
  onRedeem: () => void;
}) {
  const isUnlocked = balance >= service.cost;
  const remaining = service.cost - balance;
  const monthsToUnlock = Math.ceil(service.cost / monthlyCashback);
  const tier = tierConfig[service.tier];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl bg-gray-900 
          border border-white/10 p-6 max-h-[80vh] overflow-y-auto"
      >
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-700" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full bg-white/10 p-1.5 text-gray-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-3xl mb-4">
          {service.icon}
        </div>

        {/* Tier + Name */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`rounded-full ${tier.bg} ${tier.text} border ${tier.border} px-2 py-0.5 text-xs font-bold`}>
            {tier.label}
          </span>
          <span className="text-gray-500 text-xs">• {service.category === "presencia" ? "Presencia" : service.category === "trafico" ? "Tráfico" : "Infraestructura"}</span>
        </div>
        <h2 className="text-white text-xl font-bold">{service.name}</h2>
        <p className="text-gray-400 text-sm mt-2">{service.description}</p>

        {/* Deliverables */}
        <div className="mt-4 rounded-xl bg-white/5 p-4">
          <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-2">Entregables</p>
          <ul className="space-y-1.5">
            {service.deliverables.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-white">
                <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>

        {/* Impact */}
        <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/15 p-3">
          <p className="text-emerald-400 text-sm font-medium">{service.estimatedImpact}</p>
        </div>

        {/* Testimonial */}
        {service.testimonials && (
          <div className="mt-3 rounded-xl bg-purple-500/10 border border-purple-500/15 p-3">
            <p className="text-purple-300 text-xs italic">💬 &ldquo;{service.testimonials}&rdquo;</p>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
          <div>
            <p className="text-gray-500 text-xs">Inversión</p>
            <p className="text-white font-bold text-xl tabular-nums">
              ${service.cost.toLocaleString("es-MX")}
            </p>
          </div>
          {isUnlocked ? (
            <button
              onClick={onRedeem}
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white 
                shadow-lg shadow-emerald-900/30 active:scale-95 transition-transform"
            >
              Canjear ahora
            </button>
          ) : (
            <div className="text-right">
              <p className="text-amber-400 text-xs font-medium">
                Te faltan ${remaining.toLocaleString("es-MX")}
              </p>
              <p className="text-gray-500 text-xs mt-0.5">
                ~{monthsToUnlock} {monthsToUnlock === 1 ? "mes" : "meses"} con tu consumo actual
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
