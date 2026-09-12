"use client"

import dynamic from "next/dynamic"

// Below-the-fold carousel: keep framer-motion out of the initial bundle.
export const TestimonialCarouselLazy = dynamic(
  () =>
    import("./testimonial-carousel").then((m) => m.TestimonialCarousel),
  {
    ssr: false,
    loading: () => <div className="max-w-3xl mx-auto min-h-64" />,
  },
)
