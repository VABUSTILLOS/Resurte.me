"use client"

import { MessageCircle } from "lucide-react"
import { AnalyticsEvents } from "@/lib/analytics"

interface WhatsAppButtonProps {
  phoneNumber: string
  message?: string
  label?: string
  position?: "bottom-right" | "bottom-left"
}

export function WhatsAppButton({
  phoneNumber,
  message = "¡Hola! Quiero hacer un pedido en Resurte.me",
  label = "Chatear por WhatsApp",
  position = "bottom-right",
}: WhatsAppButtonProps) {
  const cleanNumber = phoneNumber.replace(/\D/g, "")
  const encodedMessage = encodeURIComponent(message)
  const waLink = `https://wa.me/${cleanNumber}?text=${encodedMessage}`

  const handleWhatsAppClick = () => {
    AnalyticsEvents.lead()
  }

  const positionClass = position === "bottom-right" ? "right-4 sm:right-6" : "left-4 sm:left-6"

  // El offset vertical viene de --floating-bottom-offset (globals.css), que
  // sube automáticamente cuando el carrito tiene items (body.cart-bar-active)
  // para no chocar con el MobileCartBar.
  return (
    <div
      role="complementary"
      aria-label="Contacto rápido por WhatsApp"
      className={`whatsapp-floating fixed bottom-[var(--floating-bottom-offset)] ${positionClass} z-50`}
    >
      <a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleWhatsAppClick}
        className="flex items-center gap-2 px-4 py-3 bg-green-700 text-white font-semibold rounded-full shadow-lg hover:bg-green-800 hover:shadow-xl transition-all group"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm hidden sm:inline">{label}</span>
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-300 rounded-full animate-ping" aria-hidden="true" />
      </a>
    </div>
  )
}

export function WhatsAppBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 text-[10px] font-medium rounded-full border border-green-200 ${className}`}
    >
      <MessageCircle className="w-3 h-3" />
      WhatsApp
    </span>
  )
}

export function OrderByWhatsAppButton({
  phoneNumber,
  productName,
  productPrice,
  quantity = 1,
  className,
}: {
  phoneNumber: string
  productName: string
  productPrice: number
  quantity?: number
  className?: string
}) {
  const cleanNumber = phoneNumber.replace(/\D/g, "")
  const total = (productPrice * quantity).toFixed(2)
  const message = encodeURIComponent(
    `🛒 *Pedido desde Resurte.me*\n\n` +
      `*Producto:* ${productName}\n` +
      `*Cantidad:* ${quantity}\n` +
      `*Precio unitario:* $${productPrice.toFixed(2)} MXN\n` +
      `*Total:* $${total} MXN\n\n` +
      `¿Pueden confirmarme disponibilidad y tiempo de entrega?`
  )
  const waLink = `https://wa.me/${cleanNumber}?text=${message}`

  return (
    <a
      href={waLink}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-700 text-white font-semibold rounded-xl hover:bg-green-800 transition-colors"
      }
    >
      <MessageCircle className="w-5 h-5" />
      Pedir por WhatsApp
    </a>
  )
}
