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
      <div className="mt-8 mb-3 flex items-center gap-2">
        <UtensilsCrossed className="w-4 h-4 text-emerald-600" />
        <h2 className="text-sm font-black text-stone-900 uppercase tracking-wide">Sistema de pedidos</h2>
        <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">Incluido gratis para clientes Resurte</span>
        <div className="flex-1 h-px bg-stone-200" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.filter((t) => t.standalone).map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group relative bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-gray-200 transition-all"
          >
            <div className={`w-11 h-11 ${tool.bgColor} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <tool.icon className={`w-5 h-5 ${tool.color}`} />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1.5">{tool.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-3">{tool.description}</p>
            <div className="flex items-center gap-1 text-sm font-semibold text-[#108910] group-hover:gap-2 transition-all">
              Abrir herramienta
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
