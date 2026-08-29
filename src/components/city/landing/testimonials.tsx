import { TestimonialCarousel } from "@/components/ui/testimonial-carousel"

export function TestimonialsSection() {
  return (
      <section className="bg-white py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 sm:mb-12">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#0E7A0E] mb-2.5">
              Lo que dicen
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] tracking-tight text-balance">
              Cocineros que confían en nosotros
            </h2>
          </div>
          <TestimonialCarousel />
        </div>
      </section>
  )
}
