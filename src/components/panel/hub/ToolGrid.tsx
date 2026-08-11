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
    <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
      {tools.filter((t) => !t.standalone).map((tool) => (
        <Link
          key={tool.href}
          href={selectedCollection ? tool.href : "#"}
          onClick={(e) => {
            if (!selectedCollection) e.preventDefault()
          }}
          className={`group relative bg-white rounded-xl sm:rounded-2xl border border-gray-100 p-3 sm:p-5 flex items-center gap-3 sm:block hover:shadow-lg hover:border-gray-200 transition-all ${
            !selectedCollection ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          <div className={`w-10 h-10 sm:w-11 sm:h-11 ${tool.bgColor} rounded-xl flex items-center justify-center shrink-0 sm:mb-4 group-hover:scale-110 transition-transform`}>
            <tool.icon className={`w-5 h-5 ${tool.color}`} />
          </div>
          <div className="min-w-0 flex-1 sm:flex-none">
            <h3 className="text-sm sm:text-base font-bold text-gray-900 sm:mb-1.5 truncate sm:whitespace-normal sm:overflow-visible">
              {tool.title}
            </h3>
            <p className="hidden sm:block text-sm text-gray-500 leading-relaxed sm:mb-3">
              {selectedCollection && tool.collectionDesc
                ? tool.collectionDesc(selectedCollection.name)
                : tool.description}
            </p>
            <p className="sm:hidden text-[13px] text-gray-500 leading-snug line-clamp-1">
              {selectedCollection && tool.collectionDesc
                ? tool.collectionDesc(selectedCollection.name)
                : tool.description}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-sm font-semibold text-[#0E7A0E] group-hover:gap-2 transition-all">
            {selectedCollection ? "Abrir herramienta" : "Selecciona tu cocina"}
            <ArrowRight className="w-4 h-4" />
          </div>
          <ArrowRight className="sm:hidden w-5 h-5 text-gray-300 shrink-0" />
          {!selectedCollection && (
            <div className="absolute inset-0 bg-white/40 rounded-xl sm:rounded-2xl flex items-center justify-center">
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
