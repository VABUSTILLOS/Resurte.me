/**
 * Analytics — GA4 + Meta Pixel
 * =============================
 * Zero-dependency analytics using next/script.
 * 
 * Env vars required:
 *   NEXT_PUBLIC_GA_MEASUREMENT_ID   — Google Analytics 4 (e.g., G-XXXXXXXXXX)
 *   NEXT_PUBLIC_META_PIXEL_ID       — Meta/Facebook Pixel (e.g., 1234567890)
 * 
 * Tracks:
 *   - Page views (automatically via GA4 config)
 *   - Custom events available via window.gtag()
 */
import Script from "next/script"

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
  }
}

export function Analytics() {
  return (
    <>
      {/* Google Analytics 4 */}
      {GA_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', {
                page_path: window.location.pathname,
                send_page_view: true,
              });
            `}
          </Script>
        </>
      )}

      {/* Meta Pixel */}
      {PIXEL_ID && (
        <>
          <Script id="meta-pixel-init" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}
    </>
  )
}

// ============================================================
// Ecommerce event helpers — call these on key user actions
// ============================================================

/** Track a custom event in GA4 and/or Meta Pixel */
export function trackEvent(
  eventName: string,
  params?: Record<
    string,
    | string
    | number
    | boolean
    | undefined
    | Array<Record<string, string | number | boolean | undefined>>
  >
) {
  if (typeof window === "undefined") return

  window.gtag?.("event", eventName, params)

  window.fbq?.("track", eventName, params)
}

// Pre-built ecommerce events
export const AnalyticsEvents = {
  /** Product viewed */
  viewItem: (product: { id: number; name: string; price: number; category?: string }) =>
    trackEvent("view_item", {
      currency: "MXN",
      value: product.price,
      items: [{ item_id: product.id, item_name: product.name, item_category: product.category }],
    }),

  /** Product added to cart */
  addToCart: (product: { id: number; name: string; price: number; quantity?: number }) =>
    trackEvent("add_to_cart", {
      currency: "MXN",
      value: product.price * (product.quantity ?? 1),
      items: [{ item_id: product.id, item_name: product.name, quantity: product.quantity ?? 1 }],
    }),

  /** Checkout started */
  beginCheckout: (value: number, itemCount: number) =>
    trackEvent("begin_checkout", { currency: "MXN", value, item_count: itemCount }),

  /** Order completed */
  purchase: (orderId: string, value: number) =>
    trackEvent("purchase", { currency: "MXN", value, transaction_id: orderId }),

  /** User registered */
  signUp: (method: "email" | "google") =>
    trackEvent("sign_up", { method }),

  /** Repeat order clicked */
  repeatOrder: (orderId: number) =>
    trackEvent("repeat_order", { order_id: orderId }),

  /** WhatsApp share tapped */
  shareReferral: () =>
    trackEvent("share", { method: "whatsapp", content_type: "referral" }),
}
