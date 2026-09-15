/**
 * Recorte 1:1 centrado de una imagen (client-side, canvas) para el panel
 * admin: devuelve un Blob JPEG listo para subir. La decisión de recortar o
 * usar el original la toma el llamador (confirm).
 */
export async function cropImageToSquare(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error("No se pudo leer la imagen"))
      i.src = url
    })
    const size = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas no disponible")
    ctx.drawImage(
      img,
      (img.naturalWidth - size) / 2,
      (img.naturalHeight - size) / 2,
      size,
      size,
      0,
      0,
      size,
      size
    )
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("No se pudo recortar"))),
        "image/jpeg",
        0.92
      )
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
