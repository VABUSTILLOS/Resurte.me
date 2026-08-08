/**
 * Analytics — GA4 + Meta Pixel
 * =============================
 * Zero-dependency analytics using next/script.
 * 
 * Env vars accepted (either naming works):
 *   NEXT_PUBLIC_GA_MEASUREMENT_ID | GOOGLEANALYTICS  — GA4 (e.g., G-XXXXXXXXXX)
 *   NEXT_PUBLIC_META_PIXEL_ID     | FBPIXEL          — Meta/Facebook Pixel (e.g., 1234567890)
 * 
 * Tracks:
 *   - Page views (automatically via GA4 config)
 *   - Custom events available via window.gtag()
 */
import Script from "next/script"

const GA_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || process.env.GOOGLEANALYTICS
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.FBPIXEL

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
  }
}

export function Analytics({ nonce }: { nonce?: string | null }) {
  return (
    <>
      {/* Google Analytics 4 */}
      {GA_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
            nonce={nonce ?? undefined}
          />
          <Script id="ga4-init" strategy="afterInteractive" nonce={nonce ?? undefined}>
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
          <Script id="meta-pixel-init" strategy="afterInteractive" nonce={nonce ?? undefined}>
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
// Meta Pixel standard events (https://developers.facebook.com/docs/meta-pixel)
// ============================================================

/** GA4 snake_case event name → Meta Pixel standard event name */
const META_EVENT_MAP: Record<string, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  add_to_wishlist: "AddToWishlist",
  add_payment_info: "AddPaymentInfo",
  begin_checkout: "InitiateCheckout",
  complete_registration: "CompleteRegistration",
  purchase: "Purchase",
  search: "Search",
  lead: "Lead",
  contact: "Contact",
}

type EventParamValue =
  | string
  | number
  | boolean
  | undefined
  | EventParamValue[]
  | { [key: string]: EventParamValue }

type EventParams = Record<string, EventParamValue>

/**
 * Convert GA4-style params to Meta Pixel object properties.
 * Translates `items` → `content_ids` + `contents`, `item_count` → `num_items`,
 * and drops Meta-incompatible keys (`items`, `event_id`).
 */
function toMetaParams(params?: EventParams): EventParams | undefined {
  if (!params) return undefined

  const { items, item_count, event_id: _event_id, item_id, item_name: _item_name, ...rest } = params
  const meta: EventParams = { ...rest }

  if (Array.isArray(items) && items.length > 0) {
    const contentIds: string[] = []
    const contents: Array<{ id: string; quantity: number }> = []
    for (const raw of items) {
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const i = raw as Record<string, EventParamValue>
        const id = String(i.item_id ?? i.id ?? "")
        if (!id) continue
        contentIds.push(id)
        contents.push({ id, quantity: typeof i.quantity === "number" ? i.quantity : 1 })
      }
    }
    if (contentIds.length > 0) {
      meta.content_ids = contentIds
      meta.contents = contents
    }
    if (!meta.content_type) meta.content_type = "product"
  } else if (item_id != null) {
    meta.content_ids = [String(item_id)]
    meta.contents = [{ id: String(item_id), quantity: 1 }]
    if (!meta.content_type) meta.content_type = "product"
  }

  if (typeof item_count === "number") meta.num_items = item_count

  return meta
}

/** Track a custom event in GA4 and/or Meta Pixel */
export function trackEvent(eventName: string, params?: EventParams) {
  if (typeof window === "undefined") return

  window.gtag?.("event", eventName, params)

  const metaEvent = META_EVENT_MAP[eventName]
  const fbParams = toMetaParams(params)
  if (metaEvent) {
    // Standard events use Meta's exact PascalCase names; the 4th arg (event_id)
    // enables deduplication with the Conversions API.
    window.fbq?.("track", metaEvent, fbParams, params?.event_id)
  } else {
    window.fbq?.("trackCustom", eventName, fbParams)
  }
}

// ============================================================
// Ecommerce event helpers — call these on key user actions
// ============================================================

/** A line item in an ecommerce event payload */
type AnalyticsItem = {
  item_id: string | number
  item_name: string
  item_category?: string
  price?: number
  quantity?: number
}

// Pre-built ecommerce events
export const AnalyticsEvents = {
  /** Product viewed */
  viewItem: (product: { id: number | string; name: string; price: number; category?: string }) =>
    trackEvent("view_item", {
      currency: "MXN",
      value: product.price,
      content_type: "product",
      items: [{ item_id: product.id, item_name: product.name, item_category: product.category }],
    }),

  /** Product added to cart */
  addToCart: (product: { id: number | string; name: string; price: number; quantity?: number }) =>
    trackEvent("add_to_cart", {
      currency: "MXN",
      value: product.price * (product.quantity ?? 1),
      content_type: "product",
      items: [{ item_id: product.id, item_name: product.name, quantity: product.quantity ?? 1 }],
    }),

  /** Product added to wishlist */
  addToWishlist: (product: { id: number | string; name: string; price: number }) =>
    trackEvent("add_to_wishlist", {
      currency: "MXN",
      value: product.price,
      content_type: "product",
      items: [{ item_id: product.id, item_name: product.name }],
    }),

  /** Payment info added during checkout */
  addPaymentInfo: (value: number, itemCount: number) =>
    trackEvent("add_payment_info", { currency: "MXN", value, item_count: itemCount }),

  /** Checkout started */
  beginCheckout: (value: number, itemCount: number, items?: AnalyticsItem[]) =>
    trackEvent("begin_checkout", {
      currency: "MXN",
      value,
      item_count: itemCount,
      ...(items ? { items } : {}),
    }),

  /** Order completed */
  purchase: (orderId: string, value?: number, eventId?: string, items?: AnalyticsItem[]) =>
    trackEvent("purchase", {
      currency: "MXN",
      ...(value != null ? { value } : {}),
      transaction_id: orderId,
      ...(items ? { items } : {}),
      ...(eventId ? { event_id: eventId } : {}),
    }),

  /** Registration completed */
  signUp: (method: "email" | "google") =>
    trackEvent("sign_up", { method }),

  /** Search performed */
  search: (query: string) =>
    trackEvent("search", { search_string: query }),

  /** Lead captured (pricing page, contact form, WhatsApp) */
  lead: (value?: number) =>
    trackEvent("lead", value != null ? { currency: "MXN", value } : undefined),

  /** Repeat order clicked */
  repeatOrder: (orderId: number, itemCount?: number) =>
    trackEvent(
      "repeat_order",
      itemCount != null ? { order_id: orderId, item_count: itemCount } : { order_id: orderId }
    ),

  /** WhatsApp share tapped */
  shareReferral: () =>
    trackEvent("share", { method: "whatsapp", content_type: "referral" }),
}
