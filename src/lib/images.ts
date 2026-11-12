/**
 * Preparo de imagens no navegador, antes do envio:
 * - reduz para no máximo `maxSide` pixels (economiza banda e espaço);
 * - regrava como WebP (ou JPEG, se o navegador não gerar WebP);
 * - ao regravar, os metadados do arquivo (EXIF, incluindo a localização GPS da foto) são descartados.
 */

export class ImageError extends Error {}

export type PreparedImage = { blob: Blob; width: number; height: number; extension: 'webp' | 'jpg' }

export const MAX_INPUT_BYTES = 15 * 1024 * 1024
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024

export const isImageFile = (file: { type: string }) => /^image\/(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file.type)

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function prepareImage(file: Blob, options: { maxSide?: number; square?: boolean } = {}): Promise<PreparedImage> {
  const { maxSide = 1600, square = false } = options
  if (!isImageFile(file)) throw new ImageError('Esse arquivo não é uma imagem.')
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('Imagem grande demais (máximo de 15 MB).')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new ImageError('Não consegui abrir essa imagem. Tente PNG, JPG ou WebP.')
  }

  let sx = 0
  let sy = 0
  let sw = bitmap.width
  let sh = bitmap.height
  if (square) {
    const side = Math.min(sw, sh)
    sx = (sw - side) / 2
    sy = (sh - side) / 2
    sw = side
    sh = side
  }
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new ImageError('Seu navegador não conseguiu processar a imagem.')
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height)
  bitmap.close()

  let blob = await toBlob(canvas, 'image/webp', 0.82)
  let extension: PreparedImage['extension'] = 'webp'
  if (!blob || blob.type !== 'image/webp') {
    // JPEG não tem transparência: pinta o fundo de branco para prints com fundo transparente.
    const flat = document.createElement('canvas')
    flat.width = width
    flat.height = height
    const flatContext = flat.getContext('2d')
    if (!flatContext) throw new ImageError('Seu navegador não conseguiu processar a imagem.')
    flatContext.fillStyle = '#ffffff'
    flatContext.fillRect(0, 0, width, height)
    flatContext.drawImage(canvas, 0, 0)
    blob = await toBlob(flat, 'image/jpeg', 0.85)
    extension = 'jpg'
  }
  if (!blob) throw new ImageError('Seu navegador não conseguiu processar a imagem.')
  if (blob.size > MAX_OUTPUT_BYTES) throw new ImageError('A imagem continua grande demais depois de reduzida.')
  return { blob, width, height, extension }
}

/** Arquivos de imagem de um colar (Ctrl+V) ou de um arrastar-e-soltar. */
export function imagesFromTransfer(data: DataTransfer | null): File[] {
  if (!data) return []
  const files = Array.from(data.files ?? []).filter(isImageFile)
  if (files.length) return files
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file' && isImageFile(item))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
}
