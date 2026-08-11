"use client"

import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react"
import { cn } from "@/lib/utils"

interface Testimonial {
  id: string
  quote: string
  author: string
  role: string
  city: string
  rating: number
  avatarInitial: string
  avatarColor: string
}

const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-teal-100 text-teal-700",
]

const TESTIMONIALS: Testimonial[] = [
  {
    id: "1",
    quote: "Desde que pedimos con Resurte, nuestra merma bajó un 30%. La verdura llega más fresca que cuando íbamos a la central.",
    author: "Chef Ricardo M.",
    role: "Dueño de La Piccola Trattoria",
    city: "Chihuahua",
    rating: 5,
    avatarInitial: "R",
    avatarColor: AVATAR_COLORS[0]!,
  },
  {
    id: "2",
    quote: "Los precios son estables y la facturación es inmediata. Para un restaurante pequeño como el mío, eso es oro.",
    author: "María Elena G.",
    role: "Propietaria de Las Tlayudas de Doña Mary",
    city: "Chihuahua",
    rating: 5,
    avatarInitial: "M",
    avatarColor: AVATAR_COLORS[1]!,
  },
  {
    id: "3",
    quote: "Programo mi pedido el lunes y el martes a las 8 AM ya tengo todo en la cocina. Así da gusto hacer negocios.",
    author: "Carlos R.",
    role: "Chef ejecutivo, Hotel Casa Grande",
    city: "Chihuahua",
    rating: 5,
    avatarInitial: "C",
    avatarColor: AVATAR_COLORS[2]!,
  },
  {
    id: "4",
    quote: "La calidad de la carne es superior a la que conseguía en el mercado. Mis clientes notaron la diferencia de inmediato.",
    author: "Fernando L.",
    role: "Dueño de Carnes Asadas El Güero",
    city: "Chihuahua",
    rating: 5,
    avatarInitial: "F",
    avatarColor: AVATAR_COLORS[3]!,
  },
  {
    id: "5",
    quote: "Antes perdía 2 horas diarias yendo a la central. Ahora invierto ese tiempo en mi cocina y en mis clientes.",
    author: "Patricia V.",
    role: "Chef propietaria de Casa Toño",
    city: "Chihuahua",
    rating: 4,
    avatarInitial: "P",
    avatarColor: AVATAR_COLORS[4]!,
  },
  {
    id: "6",
    quote: "El servicio al cliente es excepcional. Una vez tuve un problema con un pedido y lo resolvieron en 10 minutos por WhatsApp.",
    author: "Luis H.",
    role: "Administrador de Restaurante Los Comales",
    city: "Chihuahua",
    rating: 5,
    avatarInitial: "L",
    avatarColor: AVATAR_COLORS[5]!,
  },
]

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const starSize = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"
  return (
    <div role="img" className="flex gap-0.5" aria-label={`${rating} de 5 estrellas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(starSize, i < rating ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200")}
        />
      ))}
    </div>
  )
}

export function TestimonialCarousel() {
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState(1)

  const goTo = useCallback((index: number) => {
    setDirection(index > current ? 1 : -1)
    setCurrent(index)
  }, [current])

  const next = useCallback(() => {
    setDirection(1)
    setCurrent((prev) => (prev + 1) % TESTIMONIALS.length)
  }, [])

  const prev = useCallback(() => {
    setDirection(-1)
    setCurrent((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)
  }, [])

  // Auto-play
  useEffect(() => {
    const interval = setInterval(next, 5000)
    return () => clearInterval(interval)
  }, [next])

  // Pause on hover
  const [isPaused, setIsPaused] = useState(false)
  useEffect(() => {
    if (isPaused) {
      const interval = setInterval(next, 5000)
      return () => clearInterval(interval)
    }
  }, [isPaused, next])

  const t = TESTIMONIALS[current]
  if (!t) return null
  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({
      x: dir > 0 ? -60 : 60,
      opacity: 0,
    }),
  }

  return (
    <div
      className="relative max-w-3xl mx-auto"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Main card */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-[#E8E9EB] shadow-sm">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="p-8 sm:p-10"
          >
            {/* Quote icon */}
            <div className="flex justify-center mb-5">
              <div className="w-12 h-12 rounded-full bg-[#E9FBE9] flex items-center justify-center">
                <Quote className="w-5 h-5 text-[#0E7A0E]" />
              </div>
            </div>

            {/* Quote text */}
            <blockquote className="text-center">
              <p className="text-lg sm:text-xl text-[#343538] leading-relaxed font-medium italic">
                &ldquo;{t.quote}&rdquo;
              </p>
            </blockquote>

            {/* Rating */}
            <div className="flex justify-center mt-5">
              <StarRating rating={t.rating} size="md" />
            </div>

            {/* Author */}
            <div className="flex items-center justify-center gap-3 mt-6">
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${t.avatarColor}`}
              >
                {t.avatarInitial}
              </div>
              <div>
                <p className="text-sm font-bold text-[#242529]">{t.author}</p>
                <p className="text-[13px] text-[var(--text-secondary)]">
                  {t.role} · {t.city}
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        <button
          onClick={prev}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-[#E8E9EB] shadow-sm flex items-center justify-center text-[#5C6068] hover:text-[#0E7A0E] hover:border-[#0E7A0E]/30 transition-colors z-10"
          aria-label="Testimonio anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={next}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-[#E8E9EB] shadow-sm flex items-center justify-center text-[#5C6068] hover:text-[#0E7A0E] hover:border-[#0E7A0E]/30 transition-colors z-10"
          aria-label="Siguiente testimonio"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 mt-5">
        {TESTIMONIALS.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`rounded-full transition-all ${
              i === current
                ? "w-6 h-2 bg-[#0E7A0E]"
                : "w-2 h-2 bg-[#D1D3D6] hover:bg-[#0E7A0E]/40"
            }`}
            aria-label={`Ir al testimonio ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
