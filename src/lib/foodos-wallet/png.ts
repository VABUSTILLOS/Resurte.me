/**
 * Codificador PNG mínimo, **sin dependencias**.
 *
 * Un `.pkpass` exige `icon.png` y el respaldo sin certificados dibuja la
 * tarjeta; en ambos casos necesitamos bytes PNG de verdad. El formato es
 * simple: firma, `IHDR`, `IDAT` (los píxeles comprimidos con zlib, que Node ya
 * trae) e `IEND`. No hay filtros adaptativos ni paletas: escribimos RGBA
 * directo con filtro 0, que es lo que cualquier lector acepta.
 *
 * Regla: la salida es **determinista**. Mismo tamaño y mismos píxeles producen
 * bytes idénticos, así que el ícono se puede cachear y los tests comparan.
 */

import { deflateSync } from "node:zlib"

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Color RGBA, cada canal 0..255. */
export interface Rgba {
  r: number
  g: number
  b: number
  a?: number
}

export function rgba(r: number, g: number, b: number, a = 255): Rgba {
  return { r, g, b, a }
}

function channel(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(255, Math.max(0, Math.round(value)))
}

function u32(value: number): Uint8Array {
  const b = new Uint8Array(4)
  b[0] = (value >>> 24) & 0xff
  b[1] = (value >>> 16) & 0xff
  b[2] = (value >>> 8) & 0xff
  b[3] = value & 0xff
  return b
}

const encoder = new TextEncoder()

/** CRC-32 con el polinomio del formato PNG (0xEDB88320). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const name = encoder.encode(type)
  const out = new Uint8Array(12 + data.length)
  out.set(u32(data.length), 0)
  out.set(name, 4)
  out.set(data, 8)
  const crcInput = new Uint8Array(name.length + data.length)
  crcInput.set(name, 0)
  crcInput.set(data, name.length)
  out.set(u32(crc32(crcInput)), 8 + data.length)
  return out
}

/**
 * Lienzo RGBA en memoria. Se pinta con primitivas simples (rectángulo,
 * círculo, anillo) para no arrastrar un motor de dibujo.
 */
export class Canvas {
  readonly width: number
  readonly height: number
  readonly pixels: Uint8Array

  constructor(width: number, height: number, fill?: Rgba) {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.pixels = new Uint8Array(this.width * this.height * 4)
    if (fill) this.fill(fill)
  }

  /** Escribe un píxel con mezcla alfa normal (`source-over`). */
  blend(x: number, y: number, color: Rgba): void {
    const px = Math.floor(x)
    const py = Math.floor(y)
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return
    const alpha = channel(color.a ?? 255) / 255
    if (alpha <= 0) return
    const i = (py * this.width + px) * 4
    const src = [channel(color.r), channel(color.g), channel(color.b)]
    if (alpha >= 1) {
      this.pixels[i] = src[0] ?? 0
      this.pixels[i + 1] = src[1] ?? 0
      this.pixels[i + 2] = src[2] ?? 0
      this.pixels[i + 3] = 255
      return
    }
    const dstA = (this.pixels[i + 3] ?? 0) / 255
    const outA = alpha + dstA * (1 - alpha)
    for (let c = 0; c < 3; c++) {
      const dst = this.pixels[i + c] ?? 0
      const value = ((src[c] ?? 0) * alpha + dst * dstA * (1 - alpha)) / (outA || 1)
      this.pixels[i + c] = channel(value)
    }
    this.pixels[i + 3] = channel(outA * 255)
  }

  fill(color: Rgba): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) this.blend(x, y, color)
    }
  }

  rect(x0: number, y0: number, w: number, h: number, color: Rgba): void {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) this.blend(x, y, color)
    }
  }

  /** Círculo relleno. Se apoya en el cuadrado de la distancia al centro. */
  circle(cx: number, cy: number, radius: number, color: Rgba): void {
    const r2 = radius * radius
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
      for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= r2) this.blend(x, y, color)
      }
    }
  }

  /** Anillo (borde de círculo) de grosor `thickness`. */
  ring(cx: number, cy: number, radius: number, thickness: number, color: Rgba): void {
    const outer = radius + thickness / 2
    const inner = Math.max(0, radius - thickness / 2)
    const outer2 = outer * outer
    const inner2 = inner * inner
    for (let y = Math.floor(cy - outer); y <= cy + outer; y++) {
      for (let x = Math.floor(cx - outer); x <= cx + outer; x++) {
        const dx = x - cx
        const dy = y - cy
        const d2 = dx * dx + dy * dy
        if (d2 <= outer2 && d2 >= inner2) this.blend(x, y, color)
      }
    }
  }
}

/**
 * Empaqueta el lienzo como PNG. `width`/`height` salen del propio lienzo.
 * Filtro 0 en cada scanline y `deflateSync` de Node para el `IDAT`.
 */
export function encodePng(canvas: Canvas): Uint8Array {
  const { width, height, pixels } = canvas
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }

  const ihdr = new Uint8Array(13)
  ihdr.set(u32(width), 0)
  ihdr.set(u32(height), 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0 // compresión deflate
  ihdr[11] = 0 // filtro adaptativo
  ihdr[12] = 0 // sin entrelazado

  const idat = new Uint8Array(deflateSync(raw))
  const parts = [SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** `#RRGGBB` → canales. Acepta también `#RGB`. Cae a negro si no es válido. */
export function parseHexColor(value: string | null | undefined, fallback: Rgba): Rgba {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? "").trim())
  if (!match) return fallback
  const hex = match[1] ?? ""
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex
  return rgba(
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16)
  )
}

export interface IconOptions {
  /** Color de marca del disco. */
  color: string | null | undefined
  /** Radio del disco como fracción del lado (0..0.5). */
  scale?: number
}

/**
 * Ícono del pase: un disco del color de marca con un anillo interior claro.
 * Es deliberadamente abstracto —no lleva texto— porque el logo real del
 * restaurante puede no estar disponible y un ícono genérico es mejor que un
 * pase que Apple rechaza por falta de `icon.png`.
 */
export function renderWalletIcon(size: number, options: IconOptions): Uint8Array {
  const side = Math.max(29, Math.floor(size))
  const canvas = new Canvas(side, side)
  const base = parseHexColor(options.color, rgba(14, 122, 14))
  const radius = side * Math.min(0.5, Math.max(0.2, options.scale ?? 0.46))
  const center = side / 2
  canvas.circle(center, center, radius, base)
  canvas.ring(center, center, radius * 0.52, Math.max(1, side * 0.07), rgba(255, 255, 255, 235))
  return encodePng(canvas)
}
