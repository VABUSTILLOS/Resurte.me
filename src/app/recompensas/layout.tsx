import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Programa de Recompensas — Resurte.me",
  description:
    "Potencia tu negocio con Resurte.me. Convierte tus compras de insumos en servicios de marketing digital para tu restaurante.",
  openGraph: {
    title: "Programa de Recompensas — Resurte.me",
    description:
      "Acumula del 5% al 20% en cada pedido y canjéalo por marketing digital, fotografía y desarrollo web para tu negocio.",
    url: "https://resurte.me/recompensas",
    siteName: "Resurte.me",
    locale: "es_MX",
    type: "website",
  },
};

export default function CashbackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Cargando recompensas">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}
