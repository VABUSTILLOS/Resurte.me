import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { CityProvider } from "@/contexts/city-context"
import { CartProvider } from "@/contexts/cart-context"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { CityDetector } from "@/components/city/city-detector"
import { CartDrawer, MobileCartBar } from "@/components/cart/cart-drawer"
import { WhatsAppButton } from "@/components/whatsapp/whatsapp-button"
import { getOrganizationSchema } from "@/lib/structured-data"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Resurte.me — Central de Abastos Digital",
  description:
    "Central de abastos en línea para tu negocio. Abarrotes, frutas, verduras y carnes por mayoreo. Sin membresía, envío gratis desde $2,500 MXN.",
  keywords: [
    "central de abastos",
    "mayoreo",
    "proveeduría",
    "restaurantes",
    "ingredientes frescos",
    "abastecer negocio",
    "frutas y verduras",
    "carnes",
    "México",
    "resurte",
    "distribuidor alimentos",
    "abarrotes por mayoreo",
  ],
  metadataBase: new URL("https://resurte.me"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Resurte.me — Central de Abastos Digital",
    description:
      "Central de abastos en línea para tu negocio. Abarrotes, frutas, verduras y carnes por mayoreo. Sin membresía, envío gratis desde $2,500 MXN.",
    url: "https://resurte.me",
    siteName: "Resurte.me",
    locale: "es_MX",
    type: "website",
    images: [
      {
        url: "https://resurte.me/og-image.png",
        width: 1200,
        height: 630,
        alt: "Resurte.me — Central de Abastos Digital",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Resurte.me — Central de Abastos Digital",
    description:
      "Central de abastos en línea para tu negocio. Abarrotes, frutas, verduras y carnes por mayoreo. Envío gratis desde $2,500 MXN.",
    images: ["https://resurte.me/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "google-site-verification-code",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es-MX"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F7F5F0] text-[#343538] antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getOrganizationSchema()),
          }}
        />
        <CityProvider>
          <CartProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
            <CityDetector />
            <CartDrawer />
            <MobileCartBar />
            <MobileCartBar />
            <WhatsAppButton
              phoneNumber={process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"}
              message="¡Hola! Quiero hacer un pedido en Resurte.me"
              label="Pedir por WhatsApp"
            />
          </CartProvider>
        </CityProvider>
      </body>
    </html>
  )
}
