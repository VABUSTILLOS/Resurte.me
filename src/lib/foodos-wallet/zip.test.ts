import { describe, expect, it } from "vitest"
import { buildZip, crc32, type ZipEntry } from "./zip"

const encoder = new TextEncoder()

function bytes(text: string): Uint8Array {
  return encoder.encode(text)
}

/** Lee un `u32` little-endian. */
function u32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] ?? 0) |
      ((data[offset + 1] ?? 0) << 8) |
      ((data[offset + 2] ?? 0) << 16) |
      ((data[offset + 3] ?? 0) << 24)) >>>
    0
  )
}

function u16(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8)
}

describe("foodos-wallet/zip: crc32", () => {
  it("coincide con los vectores de referencia del estándar", () => {
    expect(crc32(bytes(""))).toBe(0x00000000)
    expect(crc32(bytes("a"))).toBe(0xe8b7be43)
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926)
  })

  it("distingue contenidos distintos", () => {
    expect(crc32(bytes("pass.json"))).not.toBe(crc32(bytes("manifest.json")))
  })
})

describe("foodos-wallet/zip: buildZip", () => {
  const entries: ZipEntry[] = [
    { name: "pass.json", data: bytes('{"formatVersion":1}') },
    { name: "icon.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
  ]

  it("empieza con la firma de entrada local y termina con el EOCD", () => {
    const zip = buildZip(entries)
    expect(u32(zip, 0)).toBe(0x04034b50)
    expect(u32(zip, zip.length - 22)).toBe(0x06054b50)
  })

  it("declara el número de entradas en el EOCD", () => {
    const zip = buildZip(entries)
    expect(u16(zip, zip.length - 14)).toBe(2)
    expect(u16(zip, zip.length - 12)).toBe(2)
  })

  it("guarda sin comprimir (tamaño comprimido = tamaño real)", () => {
    const zip = buildZip(entries)
    // Local header de la primera entrada: offset 18 = comprimido, 22 = real.
    expect(u32(zip, 18)).toBe(entries[0]!.data.length)
    expect(u32(zip, 22)).toBe(entries[0]!.data.length)
    expect(u16(zip, 8)).toBe(0) // método STORED
  })

  it("es determinista: el mismo pase produce los mismos bytes", () => {
    expect(buildZip(entries)).toEqual(buildZip(entries))
  })

  it("cambiar el contenido cambia el CRC del encabezado", () => {
    const a = buildZip([{ name: "x", data: bytes("uno") }])
    const b = buildZip([{ name: "x", data: bytes("dos") }])
    expect(u32(a, 14)).not.toBe(u32(b, 14))
    expect(u32(a, 14)).toBe(crc32(bytes("uno")))
  })

  it("incluye los nombres en UTF-8 con la bandera marcada", () => {
    const zip = buildZip([{ name: "manifest.json", data: bytes("{}") }])
    expect(u16(zip, 6)).toBe(0x0800)
    const text = Buffer.from(zip).toString("latin1")
    expect(text).toContain("manifest.json")
  })

  it("un ZIP vacío sigue siendo un ZIP válido", () => {
    const zip = buildZip([])
    expect(zip.length).toBe(22)
    expect(u32(zip, 0)).toBe(0x06054b50)
    expect(u16(zip, 8)).toBe(0)
  })
})
