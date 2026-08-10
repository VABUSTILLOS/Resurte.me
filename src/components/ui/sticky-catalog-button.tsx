"use client"

import { Grid3X3, ArrowRight } from "lucide-react"
import Link from "next/link"

interface StickyCatalogButtonProps {
  citySlug: string
}

export function StickyCatalogButton({ citySlug }: StickyCatalogButtonProps) {
  return (
    <Link
      href={`/${citySlug}/buscar`}
      className="sticky-catalog-button fixed bottom-[var(--floating-bottom-offset)] left-4 sm:left-6 z-40 flex items-center gap-2 px-4 py-3 bg-white text-[#1a1a1a] font-semibold rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-[#e0dbd2] hover:border-[#0E7A0E]/40 hover:shadow-[0_4px_24px_rgba(0,0,0,0.16)] hover:bg-[#f7f5f0] transition-all duration-300 ease-out"
    >
      <Grid3X3 className="w-5 h-5 text-[#0E7A0E]" />
      <span className="text-sm hidden sm:inline">Ver todos los productos</span>
      <span className="text-sm sm:hidden">Ver todos</span>
      <ArrowRight className="w-3.5 h-3.5 text-[#0E7A0E] hidden sm:inline" />
    </Link>
  )
}
