"use client"

import Link from "next/link"
import { UtensilsCrossed, ArrowRight } from "lucide-react"
import type { Tool } from "./hub-data"

interface StandaloneToolGridProps {
  tools: Tool[]
}

export default function StandaloneToolGrid({ tools }: StandaloneToolGridProps) {
  return (
    <>
      <div className="mt-6 sm:mt-8 mb-3 flex items-center gap-2">
        <UtensilsCrossed className="w-4 h-4 text-emerald-600" />
        <h2 className="text-sm font-black text-stone-900 uppercase tracking-wide">Sistema de pedidos</h2>
        <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">Incluido gratis para clientes Resurte</span>
        <div className="flex-1 h-px bg-stone-200" />
      </div>
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
        {tools.filter((t) => t.standalone).map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group relative bg-white rounded-xl sm:rounded-2xl border border-gray-100 p-3 sm:p-5 flex items-center gap-3 sm:block hover:shadow-lg hover:border-gray-200 transition-all"
          >
            <div className={`w-10 h-10 sm:w-11 sm:h-11 ${tool.bgColor} rounded-xl flex items-center justify-center shrink-0 sm:mb-4 group-hover:scale-110 transition-transform`}>
              <tool.icon className={`w-5 h-5 ${tool.color}`} />
            </div>
            <div className="min-w-0 flex-1 sm:flex-none">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 sm:mb-1.5 truncate sm:whitespace-normal sm:overflow-visible">
                {tool.title}
              </h3>
              <p className="hidden sm:block text-sm text-gray-500 leading-relaxed sm:mb-3">{tool.description}</p>
              <p className="sm:hidden text-[13px] text-gray-500 leading-snug line-clamp-1">{tool.description}</p>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-sm font-semibold text-[#0E7A0E] group-hover:gap-2 transition-all">
              Abrir herramienta
              <ArrowRight className="w-4 h-4" />
            </div>
            <ArrowRight className="sm:hidden w-5 h-5 text-gray-300 shrink-0" />
          </Link>
        ))}
      </div>
    </>
  )
}
