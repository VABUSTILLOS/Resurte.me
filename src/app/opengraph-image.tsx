import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

// OG image estática 1200x630 generada con ImageResponse (F23).
// Sustituye al /og-image.png inexistente que rompía las tarjetas de
// compartir en WhatsApp/Facebook/LinkedIn (devolvía el HTML de la app).
// Next.js la sirve en /opengraph-image.
// Nota: satori (motor de next/og) no soporta data-URI en webp, por eso
// se usa el PNG público (icon-512.png, generado del logo en F23).
export const alt = "Resurte.me — Central de Abastos Digital"
export const size = { width: 1200, height: 630 }
// Se genera una vez en build y la sirve el CDN (no por request).
export const dynamic = "force-static"
export const contentType = "image/png"

export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/icon-512.png"))
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0B3D0B 0%, #0E7A0E 55%, #108910 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: 48,
        }}
      >
        <img
          src={logoSrc}
          width={160}
          height={160}
          alt=""
          style={{ borderRadius: 80, marginBottom: 24 }}
        />
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: -1,
            textAlign: "center",
          }}
        >
          Resurte.me
        </div>
        <div
          style={{
            fontSize: 32,
            opacity: 0.92,
            textAlign: "center",
            marginTop: 12,
            maxWidth: 900,
          }}
        >
          Central de Abastos Digital para tu negocio
        </div>
        <div
          style={{
            fontSize: 24,
            opacity: 0.75,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          Frutas, verduras, carnes y abarrotes por mayoreo · Envío gratis desde $2,500 MXN
        </div>
      </div>
    ),
    { ...size }
  )
}
