import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Programa de Recompensas — Resurte.me",
  description:
    "Potencia tu negocio con Resurte.me. Convierte tus compras de insumos en servicios de marketing digital para tu restaurante.",
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
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}
