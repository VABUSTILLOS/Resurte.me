import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Cashback por Crecimiento — Resurte.me",
  description:
    "Convierte tus compras de insumos en marketing digital para tu restaurante. Sin costo extra. Solo crecimiento.",
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
