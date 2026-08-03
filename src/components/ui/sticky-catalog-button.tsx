"use client"

import { Grid3X3, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"

interface StickyCatalogButtonProps {
  citySlug: string
}

export function StickyCatalogButton({ citySlug }: StickyCatalogButtonProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Show after a short delay so it doesn't flash on load
    const timer = setTimeout(() => setVisible(true), 600)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Link
      href={`/${citySlug}/buscar`}
      className={`fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-40 flex items-center gap-2 px-4 py-3 bg-white text-[#1a1a1a] font-semibold rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-[#e0dbd2] hover:border-[#108910]/40 hover:shadow-[0_4px_24px_rgba(0,0,0,0.16)] hover:bg-[#f7f5f0] transition-all duration-300 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <Grid3X3 className="w-5 h-5 text-[#108910]" />
      <span className="text-sm hidden sm:inline">Ver todos los productos</span>
      <span className="text-sm sm:hidden">Ver todos</span>
      <ArrowRight className="w-3.5 h-3.5 text-[#108910] hidden sm:inline" />
    </Link>
  )
}
