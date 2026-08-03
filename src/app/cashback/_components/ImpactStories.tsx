"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { TrendingUp, Star, Quote, ArrowRight, Play } from "lucide-react";
import type { ImpactStory } from "./types";

const stories: ImpactStory[] = [
  {
    id: "s1",
    restaurantName: "Taquería El Güero",
    ownerName: "Carlos Mendoza",
    serviceUsed: "Campaña Meta Ads Local",
    beforeMetric: "30",
    afterMetric: "95",
    metricLabel: "clientes nuevos por semana",
    quote:
      "Pasé de tener mesas vacías entre semana a tener lista de espera. La campaña se pagó sola en 10 días.",
    photoUrl: "",
    months: 2,
  },
  {
    id: "s2",
    restaurantName: "Marisquería La Perla",
    ownerName: "María Elena Ríos",
    serviceUsed: "Tienda Online + Pedidos",
    beforeMetric: "0",
    afterMetric: "40",
    metricLabel: "% de pedidos por canal digital",
    quote:
      "Ahora el 40% de mis pedidos llegan por mi propia web. Dejé de pagar 30% de comisión a las apps de delivery.",
    photoUrl: "",
    months: 3,
  },
  {
    id: "s3",
    restaurantName: "Café Altura",
    ownerName: "Andrés Huerta",
    serviceUsed: "Google Maps + Fotografía",
    beforeMetric: "120",
    afterMetric: "340",
    metricLabel: "visitas al perfil por mes",
    quote:
      "No sabía que mi perfil de Google era tan importante. En 2 meses tripliqué las llamadas de clientes nuevos.",
    photoUrl: "",
    months: 1,
  },
  {
    id: "s4",
    restaurantName: "Pizzería Da Luigi",
    ownerName: "Luigi Ferrara",
    serviceUsed: "Menú Digital Interactivo",
    beforeMetric: "180",
    afterMetric: "245",
    metricLabel: "ticket promedio por mesa ($ MXN)",
    quote:
      "El menú digital con fotos incrementó nuestro ticket promedio un 36%. La gente pide más cuando ve las fotos.",
    photoUrl: "",
    months: 2,
  },
];

export function ImpactStories() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const itemWidth = container.scrollWidth / stories.length;
      const index = Math.round(scrollLeft / itemWidth);
      setActiveIndex(index);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="mx-4 mt-6 mb-2 md:mx-6 lg:mx-0">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white text-base font-bold">Historias de Crecimiento</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            Restaurantes como el tuyo ya están creciendo
          </p>
        </div>
        <button className="text-emerald-400 text-xs font-medium flex items-center gap-1 hover:underline">
          Ver más <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Horizontal Scroll */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2"
        style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
      >
        {stories.map((story, i) => (
          <motion.div
            key={story.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08 * i }}
            className="flex-shrink-0 w-[85%] snap-center rounded-2xl bg-white/5 border border-white/10 
              overflow-hidden hover:border-white/20 transition-colors"
          >
            {/* Photo placeholder */}
            <div className="relative h-36 bg-gradient-to-br from-emerald-900/60 to-teal-900/60 flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-3xl">
                {["🌮", "🦐", "☕", "🍕"][i]}
              </div>
              {/* Play button overlay */}
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-3 py-1.5">
                <Play className="h-3 w-3 text-white fill-white" />
                <span className="text-white text-[10px] font-medium">Ver historia</span>
              </div>
            </div>

            <div className="p-4">
              {/* Restaurant info */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-white font-bold text-sm">{story.restaurantName}</span>
                <span className="text-gray-600 text-xs">•</span>
                <span className="text-gray-500 text-xs">{story.ownerName}</span>
              </div>

              {/* Before → After */}
              <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/15 p-3 mb-3">
                <div className="text-center">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider">Antes</p>
                  <p className="text-gray-400 text-xl font-black tabular-nums">{story.beforeMetric}</p>
                </div>
                <div className="flex-1 flex items-center">
                  <div className="flex-1 h-px bg-emerald-500/20" />
                  <TrendingUp className="h-4 w-4 text-emerald-400 mx-1" />
                  <div className="flex-1 h-px bg-emerald-500/20" />
                </div>
                <div className="text-center">
                  <p className="text-emerald-400 text-[10px] uppercase tracking-wider">Ahora</p>
                  <p className="text-emerald-400 text-xl font-black tabular-nums">{story.afterMetric}</p>
                </div>
              </div>

              <p className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-1">
                {story.metricLabel}
              </p>

              {/* Quote */}
              <div className="mt-3 flex gap-2">
                <Quote className="h-4 w-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <p className="text-gray-400 text-xs italic leading-relaxed">
                  &ldquo;{story.quote}&rdquo;
                </p>
              </div>

              {/* Service tag */}
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold px-2.5 py-0.5">
                  {story.serviceUsed}
                </span>
                <span className="text-gray-600 text-[10px]">
                  En {story.months} {story.months === 1 ? "mes" : "meses"}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pagination Dots */}
      <div className="flex justify-center gap-1.5 mt-3">
        {stories.map((_, i) => (
          <motion.div
            key={i}
            className="h-1.5 rounded-full transition-all"
            animate={{
              width: i === activeIndex ? 16 : 6,
              backgroundColor: i === activeIndex ? "#10B981" : "#374151",
            }}
          />
        ))}
      </div>
    </div>
  );
}
