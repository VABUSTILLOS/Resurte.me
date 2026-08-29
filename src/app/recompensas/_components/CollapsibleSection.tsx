"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Sección colapsable: en móvil arranca plegada y se expande con un toque;
 * en md+ siempre visible y el encabezado deja de ser interactivo.
 * Pensada para secciones secundarias del home (beneficios, historias).
 */
export function CollapsibleSection({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left touch-target md:pointer-events-none md:cursor-default"
      >
        {title}
        <ChevronDown
          className={`ml-auto h-4 w-4 flex-shrink-0 text-[#6e737b] transition-transform duration-200 md:hidden ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {subtitle && <div className="mt-1">{subtitle}</div>}
      <div className={open ? "" : "max-md:hidden"}>{children}</div>
    </section>
  );
}
