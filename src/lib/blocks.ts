/**
 * Conteúdo das observações: uma sequência de blocos de texto e de imagem.
 * Nunca guardamos HTML: o que vem do banco passa por `parseBlocks` e é desenhado como texto puro
 * ou como imagem do nosso próprio bucket. Assim não existe caminho para injetar script ou rastreador.
 */

export type StoredBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; path: string; w: number; h: number }

/** Bloco em edição: tem chave estável e, para imagens, o estado do envio. */
export type EditorBlock =
  | { key: string; type: 'text'; text: string }
  | { key: string; type: 'image'; path: string | null; preview: string | null; w: number; h: number; status: 'uploading' | 'ready' | 'error' }

export const NOTE_IMAGES_MAX = 10
export const NOTE_TEXT_MAX = 20000

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const CARD_IMAGE_PATH = new RegExp(`^${UUID}/${UUID}/${UUID}\\.(webp|jpg|png)$`)
export const AVATAR_PATH = new RegExp(`^${UUID}/${UUID}\\.(webp|jpg|png)$`)

const dimension = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(Math.round(value), 10000) : 0)

/** Aceita só blocos conhecidos e caminhos de imagem do bucket de cards; o resto é descartado. */
export function parseBlocks(value: unknown, isPath: (path: string) => boolean = (path) => CARD_IMAGE_PATH.test(path)): StoredBlock[] {
  if (!Array.isArray(value)) return []
  const blocks: StoredBlock[] = []
  let images = 0
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const block = item as Record<string, unknown>
    if (block.type === 'text' && typeof block.text === 'string') blocks.push({ type: 'text', text: block.text.slice(0, NOTE_TEXT_MAX) })
    else if (block.type === 'image' && typeof block.path === 'string' && isPath(block.path) && images < NOTE_IMAGES_MAX) {
      images += 1
      blocks.push({ type: 'image', path: block.path, w: dimension(block.w), h: dimension(block.h) })
    }
  }
  return blocks
}

export const imagePaths = (blocks: { type: string; path?: string | null }[]) =>
  blocks.flatMap((block) => (block.type === 'image' && block.path ? [block.path] : []))

export const isBlank = (blocks: StoredBlock[]) => blocks.every((block) => block.type === 'text' && !block.text.trim())

export const plainText = (blocks: StoredBlock[]) => blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n').trim()

/* ------------------------------ Edição ------------------------------ */

const textBlock = (key: string, text = ''): EditorBlock => ({ key, type: 'text', text })

export function toEditorBlocks(stored: StoredBlock[], keyPrefix = 'b'): EditorBlock[] {
  return normalize(stored.map((block, index) =>
    block.type === 'text'
      ? textBlock(`${keyPrefix}${index}`, block.text)
      : { key: `${keyPrefix}${index}`, type: 'image', path: block.path, preview: null, w: block.w, h: block.h, status: 'ready' },
  ))
}

/** Remove textos vazios e espaços sobrando nas pontas; imagens com erro ou ainda enviando ficam de fora. */
export function toStoredBlocks(blocks: EditorBlock[]): StoredBlock[] {
  const stored: StoredBlock[] = []
  for (const block of blocks) {
    if (block.type === 'text') {
      const text = block.text.replace(/^\n+|\s+$/g, '')
      if (text) stored.push({ type: 'text', text })
    } else if (block.status === 'ready' && block.path) {
      stored.push({ type: 'image', path: block.path, w: block.w, h: block.h })
    }
  }
  return stored
}

/**
 * Mantém a forma "texto, imagem, texto, imagem, texto": sempre há onde digitar antes,
 * entre e depois das imagens. Textos vizinhos são unidos. As chaves novas são determinísticas.
 */
export function normalize(blocks: EditorBlock[]): EditorBlock[] {
  const result: EditorBlock[] = []
  for (const block of blocks) {
    const previous = result[result.length - 1]
    if (block.type === 'text' && previous?.type === 'text') {
      result[result.length - 1] = { ...previous, text: [previous.text, block.text].filter(Boolean).join('\n') }
      continue
    }
    if (block.type === 'image' && (!previous || previous.type === 'image')) result.push(textBlock(`${block.key}-antes`))
    result.push(block)
  }
  const last = result[result.length - 1]
  if (!last || last.type === 'image') result.push(textBlock(`${last?.key ?? 'inicio'}-depois`))
  return result
}

/**
 * Insere imagens no ponto do cursor: o texto é partido em "antes" e "depois".
 * `afterKey` é a chave do texto que fica depois da última imagem (para receber o foco).
 */
export function insertImagesAt(blocks: EditorBlock[], images: EditorBlock[], at: { key: string; position: number } | null, afterKey: string): EditorBlock[] {
  const index = at ? blocks.findIndex((block) => block.key === at.key && block.type === 'text') : -1
  const between = (list: EditorBlock[]) => list.flatMap((image, i) => (i < list.length - 1 ? [image, textBlock(`${image.key}-depois`)] : [image]))
  if (index < 0) return normalize([...blocks, ...between(images), textBlock(afterKey)])
  const target = blocks[index] as Extract<EditorBlock, { type: 'text' }>
  const position = Math.max(0, Math.min(at!.position, target.text.length))
  const before = target.text.slice(0, position).replace(/\n$/, '')
  const after = target.text.slice(position).replace(/^\n/, '')
  return normalize([...blocks.slice(0, index), { ...target, text: before }, ...between(images), textBlock(afterKey, after), ...blocks.slice(index + 1)])
}

export const removeBlock = (blocks: EditorBlock[], key: string) => normalize(blocks.filter((block) => block.key !== key))

export const updateBlock = (blocks: EditorBlock[], key: string, patch: Partial<EditorBlock>) =>
  blocks.map((block) => (block.key === key ? ({ ...block, ...patch } as EditorBlock) : block))

export const countImages = (blocks: EditorBlock[]) => blocks.filter((block) => block.type === 'image' && block.status !== 'error').length

export const isUploading = (blocks: EditorBlock[]) => blocks.some((block) => block.type === 'image' && block.status === 'uploading')
