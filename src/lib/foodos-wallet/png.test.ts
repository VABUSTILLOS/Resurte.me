import { describe, expect, it } from "vitest"
import { inflateSync } from "node:zlib"
import {
  Canvas,
  encodePng,
  parseHexColor,
  renderWalletIcon,
  rgba,
} from "./png"

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Lee un entero big-endian de 4 bytes. */
function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  )
}

/** Recorre los chunks del PNG y devuelve `{ type, data }` en orden. */
function chunks(bytes: Uint8Array): { type: string; data: Uint8Array }[] {
  const out: { type: string; data: Uint8Array }[] = []
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset)
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0
    )
    out.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) })
    offset += 12 + length
    if (type === "IEND") break
  }
  return out
}

function chunkOf(bytes: Uint8Array, type: string) {
  return chunks(bytes).find((c) => c.type === type)
}

describe("foodos-wallet/png: estructura del archivo", () => {
  it("empieza con la firma PNG", () => {
    const bytes = encodePng(new Canvas(2, 2, rgba(1, 2, 3)))
    expect(Array.from(bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE)
  })

  it("declara ancho, alto, 8 bits por canal y RGBA en IHDR", () => {
    const bytes = encodePng(new Canvas(7, 3, rgba(0, 0, 0)))
    const ihdr = chunkOf(bytes, "IHDR")
    expect(ihdr).toBeDefined()
    expect(readU32(ihdr!.data, 0)).toBe(7)
    expect(readU32(ihdr!.data, 4)).toBe(3)
    expect(ihdr!.data[8]).toBe(8)
    expect(ihdr!.data[9]).toBe(6)
  })

  it("termina en IEND", () => {
    const bytes = encodePng(new Canvas(1, 1))
    const list = chunks(bytes)
    expect(list.at(-1)?.type).toBe("IEND")
  })

  it("el IDAT se descomprime a scanlines con filtro 0", () => {
    const canvas = new Canvas(2, 2, rgba(10, 20, 30, 255))
    const bytes = encodePng(canvas)
    const idat = chunkOf(bytes, "IDAT")
    const raw = new Uint8Array(inflateSync(Buffer.from(idat!.data)))
    // 2 filas × (1 byte de filtro + 2 px × 4 canales)
    expect(raw.length).toBe(2 * (1 + 2 * 4))
    expect(raw[0]).toBe(0)
    expect(raw[9]).toBe(0)
    expect(Array.from(raw.subarray(1, 5))).toEqual([10, 20, 30, 255])
  })

  it("es determinista: los mismos píxeles producen los mismos bytes", () => {
    const a = encodePng(new Canvas(4, 4, rgba(9, 9, 9)))
    const b = encodePng(new Canvas(4, 4, rgba(9, 9, 9)))
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe("foodos-wallet/png: lienzo", () => {
  it("redondea el tamaño a enteros y nunca baja de 1", () => {
    const canvas = new Canvas(3.7, 0)
    expect(canvas.width).toBe(3)
    expect(canvas.height).toBe(1)
  })

  it("ignora los píxeles fuera del lienzo", () => {
    const canvas = new Canvas(2, 2, rgba(0, 0, 0))
    canvas.blend(-1, 0, rgba(255, 255, 255))
    canvas.blend(0, 5, rgba(255, 255, 255))
    expect(Array.from(canvas.pixels)).toEqual([
      0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
    ])
  })

  it("mezcla alfa sobre un fondo opaco", () => {
    const canvas = new Canvas(1, 1, rgba(0, 0, 0))
    canvas.blend(0, 0, rgba(255, 255, 255, 128))
    // 50% de blanco sobre negro ≈ 128
    expect(canvas.pixels[0]).toBeGreaterThan(120)
    expect(canvas.pixels[0]).toBeLessThan(136)
    expect(canvas.pixels[3]).toBe(255)
  })

  it("no escribe nada si el alfa es cero", () => {
    const canvas = new Canvas(1, 1, rgba(10, 10, 10))
    canvas.blend(0, 0, rgba(255, 255, 255, 0))
    expect(Array.from(canvas.pixels)).toEqual([10, 10, 10, 255])
  })

  it("pinta rectángulos", () => {
    const canvas = new Canvas(3, 3)
    canvas.rect(1, 1, 1, 1, rgba(255, 0, 0))
    expect(canvas.pixels[(1 * 3 + 1) * 4]).toBe(255)
    expect(canvas.pixels[(0 * 3 + 0) * 4 + 3]).toBe(0)
  })

  it("pinta círculos y deja fuera las esquinas", () => {
    const canvas = new Canvas(11, 11)
    canvas.circle(5, 5, 3, rgba(255, 0, 0))
    expect(canvas.pixels[(5 * 11 + 5) * 4 + 3]).toBe(255)
    expect(canvas.pixels[0 * 11 * 4 + 3]).toBe(0)
  })

  it("el anillo deja el centro sin pintar", () => {
    const canvas = new Canvas(21, 21)
    canvas.ring(10, 10, 6, 2, rgba(255, 255, 255))
    expect(canvas.pixels[(10 * 21 + 10) * 4 + 3]).toBe(0)
    expect(canvas.pixels[(10 * 21 + 16) * 4 + 3]).toBe(255)
  })
})

describe("foodos-wallet/png: colores", () => {
  const fallback = rgba(1, 1, 1)

  it("lee #RRGGBB", () => {
    expect(parseHexColor("#0E7A0E", fallback)).toEqual({ r: 14, g: 122, b: 14, a: 255 })
  })

  it("lee #RGB y sin almohadilla", () => {
    expect(parseHexColor("#fff", fallback)).toEqual({ r: 255, g: 255, b: 255, a: 255 })
    expect(parseHexColor("000000", fallback)).toEqual({ r: 0, g: 0, b: 0, a: 255 })
  })

  it("cae al color por defecto si no es un hex válido", () => {
    expect(parseHexColor("verde", fallback)).toEqual(fallback)
    expect(parseHexColor(null, fallback)).toEqual(fallback)
    expect(parseHexColor("#12345", fallback)).toEqual(fallback)
  })
})

describe("foodos-wallet/png: ícono del pase", () => {
  it("produce un PNG válido del tamaño pedido", () => {
    const bytes = renderWalletIcon(58, { color: "#0E7A0E" })
    expect(Array.from(bytes.subarray(0, 8))).toEqual(PNG_SIGNATURE)
    const ihdr = chunkOf(bytes, "IHDR")
    expect(readU32(ihdr!.data, 0)).toBe(58)
    expect(readU32(ihdr!.data, 4)).toBe(58)
  })

  it("respeta el mínimo de Apple (29 px) y es determinista", () => {
    const a = renderWalletIcon(10, { color: "#123456" })
    const b = renderWalletIcon(10, { color: "#123456" })
    expect(readU32(chunkOf(a, "IHDR")!.data, 0)).toBe(29)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it("cambia con el color de marca", () => {
    const green = renderWalletIcon(29, { color: "#0E7A0E" })
    const red = renderWalletIcon(29, { color: "#FF0000" })
    expect(Array.from(green)).not.toEqual(Array.from(red))
  })

  it("usa el verde de Resurte si el color no es válido", () => {
    const invalid = renderWalletIcon(29, { color: "no-es-color" })
    const expected = renderWalletIcon(29, { color: "#0E7A0E" })
    expect(Array.from(invalid)).toEqual(Array.from(expected))
  })
})
