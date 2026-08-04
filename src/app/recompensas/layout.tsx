import type { Metadata } from "next";
import "@/app/globals.css";

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
    <div className="min-h-screen bg-gray-950">
      {children}
    </div>
  );
}
