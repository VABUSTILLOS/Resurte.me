import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { CityProvider } from "@/contexts/city-context"
import { CartProvider } from "@/contexts/cart-context"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar"
import { CityDetector } from "@/components/city/city-detector"
import { CartDrawer, MobileCartBar } from "@/components/cart/cart-drawer"
import { WhatsAppButton } from "@/components/whatsapp/whatsapp-button"
import { Analytics } from "@/lib/analytics"
import { CookieConsent } from "@/components/ui/cookie-consent"
import { OnboardingWizard } from "@/components/onboarding-wizard"
import { getOrganizationSchema } from "@/lib/structured-data"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#108910",
}

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
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.webp", sizes: "180x180", type: "image/webp" },
    ],
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
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "",
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
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased overflow-x-clip`}
    >
      <body className="min-h-full flex flex-col bg-[#faf8f5] text-[#343538] antialiased max-w-full overflow-x-clip">
        {/* Apply stored theme before hydration to avoid flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("resurte-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`,
          }}
        />
        {/* Skip to main content — keyboard accessibility */}
        <a href="#main-content" className="skip-to-main">
          Saltar al contenido principal
        </a>
        {/* Preconnect to external origins for faster resource loading */}
        <link rel="preconnect" href="https://storage.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://storage.googleapis.com" />
        <link rel="dns-prefetch" href="https://isogthougrpctnfzcdes.supabase.co" />
        <link rel="preload" href="/images/hero-grocery.webp" as="image" fetchPriority="high" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Resurte.me" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getOrganizationSchema()),
          }}
        />
        <Analytics />
        <CityProvider>
          <CartProvider>
            <OnboardingWizard />
            <Header />
            <main id="main-content" className="flex-1"><div className="flex"><DashboardSidebar /><div className="flex-1 min-w-0">{children}</div></div></main>
            <Footer />
            <CityDetector />
            <CartDrawer />
            <MobileCartBar />
            <WhatsAppButton
              phoneNumber={process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"}
              message="¡Hola! Quiero hacer un pedido en Resurte.me"
              label="Pedir por WhatsApp"
            />
            <CookieConsent />
          </CartProvider>
        </CityProvider>
      </body>
    </html>
  )
}
