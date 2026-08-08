"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { HubCollection, Tool } from "./hub-data"

interface ToolGridProps {
  tools: Tool[]
  selectedCollection: HubCollection | null
}

export default function ToolGrid({ tools, selectedCollection }: ToolGridProps) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tools.filter((t) => !t.standalone).map((tool) => (
        <Link
          key={tool.href}
          href={selectedCollection ? tool.href : "#"}
          onClick={(e) => {
            if (!selectedCollection) e.preventDefault()
          }}
          className={`group relative bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-gray-200 transition-all ${
            !selectedCollection ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          <div className={`w-11 h-11 ${tool.bgColor} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
            <tool.icon className={`w-5 h-5 ${tool.color}`} />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1.5">{tool.title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed mb-3">
            {selectedCollection && tool.collectionDesc
              ? tool.collectionDesc(selectedCollection.name)
              : tool.description}
          </p>
          <div className="flex items-center gap-1 text-sm font-semibold text-[#0E7A0E] group-hover:gap-2 transition-all">
            {selectedCollection ? "Abrir herramienta" : "Selecciona tu cocina"}
            <ArrowRight className="w-4 h-4" />
          </div>
          {!selectedCollection && (
            <div className="absolute inset-0 bg-white/40 rounded-2xl flex items-center justify-center">
              <span className="text-xs font-semibold text-gray-400 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                🔒 Bloqueado
              </span>
            </div>
          )}
        </Link>
      ))}
    </div>
  )
}
