/**
 * Escritor de ZIP mínimo, **sin compresión** (método STORED).
 *
 * Un `.pkpass` es un ZIP con `pass.json`, `manifest.json`, `signature` y las
 * imágenes. Apple acepta entradas sin comprimir, así que no necesitamos deflate
 * ni una dependencia más: solo el contenedor.
 *
 * La fecha de las entradas es **fija**: un mismo pase produce bytes idénticos,
 * lo que hace la salida cacheable y los tests deterministas. Apple no usa esa
 * fecha para nada.
 */

export interface ZipEntry {
  name: string
  data: Uint8Array
}

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

/** CRC-32 (polinomio 0xEDB88320), el que exige el formato ZIP. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/** 1980-01-01 00:00:00 en formato MS-DOS (el mínimo válido). */
const DOS_TIME = 0
const DOS_DATE = 0x0021

class ByteWriter {
  private chunks: Uint8Array[] = []
  private length = 0

  push(bytes: Uint8Array): void {
    this.chunks.push(bytes)
    this.length += bytes.length
  }

  u16(value: number): void {
    const b = new Uint8Array(2)
    b[0] = value & 0xff
    b[1] = (value >>> 8) & 0xff
    this.push(b)
  }

  u32(value: number): void {
    const b = new Uint8Array(4)
    b[0] = value & 0xff
    b[1] = (value >>> 8) & 0xff
    b[2] = (value >>> 16) & 0xff
    b[3] = (value >>> 24) & 0xff
    this.push(b)
  }

  bytes(value: Uint8Array): void {
    this.push(value)
  }

  get size(): number {
    return this.length
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.length)
    let offset = 0
    for (const chunk of this.chunks) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }
}

const encoder = new TextEncoder()

/**
 * Empaqueta las entradas en un ZIP válido. Los nombres deben ser ASCII; se
 * codifican en UTF-8 y se marca la bandera correspondiente.
 */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const out = new ByteWriter()
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = []

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const offset = out.size

    // Local file header
    out.u32(0x04034b50)
    out.u16(20) // versión mínima
    out.u16(0x0800) // UTF-8
    out.u16(0) // STORED
    out.u16(DOS_TIME)
    out.u16(DOS_DATE)
    out.u32(crc)
    out.u32(entry.data.length) // comprimido
    out.u32(entry.data.length) // sin comprimir
    out.u16(name.length)
    out.u16(0) // extra
    out.bytes(name)
    out.bytes(entry.data)

    central.push({ name, crc, size: entry.data.length, offset })
  }

  const centralStart = out.size

  for (const item of central) {
    out.u32(0x02014b50)
    out.u16(20) // versión que lo creó
    out.u16(20) // versión mínima
    out.u16(0x0800) // UTF-8
    out.u16(0) // STORED
    out.u16(DOS_TIME)
    out.u16(DOS_DATE)
    out.u32(item.crc)
    out.u32(item.size)
    out.u32(item.size)
    out.u16(item.name.length)
    out.u16(0) // extra
    out.u16(0) // comentario
    out.u16(0) // disco
    out.u16(0) // atributos internos
    out.u32(0) // atributos externos
    out.u32(item.offset)
    out.bytes(item.name)
  }

  const centralSize = out.size - centralStart

  // End of central directory
  out.u32(0x06054b50)
  out.u16(0) // disco
  out.u16(0) // disco del directorio
  out.u16(central.length)
  out.u16(central.length)
  out.u32(centralSize)
  out.u32(centralStart)
  out.u16(0) // comentario

  return out.toUint8Array()
}
