import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ImagePlus, Loader2, RotateCcw, X } from 'lucide-react'
import { countImages, insertImagesAt, NOTE_IMAGES_MAX, NOTE_TEXT_MAX, removeBlock, updateBlock, type EditorBlock } from '../lib/blocks'
import { ImageError, imagesFromTransfer, isImageFile } from '../lib/images'
import { toast } from '../state/feedback'
import { useMediaUrls } from '../state/media'

export type UploadResult = { path: string; w: number; h: number }

type Props = {
  value: EditorBlock[]
  onChange: Dispatch<SetStateAction<EditorBlock[]>>
  /** Prepara e envia a imagem; devolve o caminho salvo. */
  upload: (file: File) => Promise<UploadResult>
  placeholder?: string
  label: string
  autoFocus?: boolean
  /** Ctrl+Enter / Cmd+Enter. */
  onSubmit?: () => void
}

let sequence = 0
const newKey = () => `n${Date.now().toString(36)}${(sequence += 1)}`

function AutoTextarea({ value, onChange, ...rest }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { value: string; onChange: (value: string) => void; inputRef?: (node: HTMLTextAreaElement | null) => void }) {
  const { inputRef, ...props } = rest
  const node = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const element = node.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])
  return (
    <textarea {...props} ref={(element) => { node.current = element; inputRef?.(element) }} rows={1} value={value} onChange={(event) => onChange(event.target.value)} />
  )
}

/**
 * Editor de observação: escreva, cole uma imagem (Ctrl+V), continue escrevendo abaixo.
 * Também aceita arrastar arquivos e o botão "Imagem" (útil no celular).
 */
export function RichEditor({ value, onChange, upload, placeholder, label, autoFocus, onSubmit }: Props) {
  const cursor = useRef<{ key: string; position: number } | null>(null)
  const inputs = useRef(new Map<string, HTMLTextAreaElement>())
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const latest = useRef(value)
  useEffect(() => { latest.current = value })

  const firstText = value.find((block) => block.type === 'text')
  useEffect(() => {
    if (autoFocus && firstText) inputs.current.get(firstText.key)?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Depois de inserir uma imagem, o cursor vai para o texto logo abaixo dela.
  useEffect(() => {
    const key = pendingFocus.current
    const element = key ? inputs.current.get(key) : undefined
    if (!element) return
    element.focus()
    element.setSelectionRange(0, 0)
    pendingFocus.current = null
  }, [value])

  const paths = value.flatMap((block) => (block.type === 'image' && block.path && !block.preview ? [block.path] : []))
  const urls = useMediaUrls('card-images', paths)
  const totalText = value.reduce((total, block) => total + (block.type === 'text' ? block.text.length : 0), 0)

  function addImages(files: File[], at = cursor.current) {
    const valid = files.filter(isImageFile)
    if (!valid.length) { toast.error('Só dá para inserir imagens (PNG, JPG, WebP).'); return }
    const room = NOTE_IMAGES_MAX - countImages(latest.current)
    if (room <= 0) { toast.error(`Cada observação aceita até ${NOTE_IMAGES_MAX} imagens.`); return }
    const chosen = valid.slice(0, room)
    if (valid.length > room) toast.info(`Só cabem mais ${room} ${room === 1 ? 'imagem' : 'imagens'} nesta observação.`)

    const images: EditorBlock[] = chosen.map((file) => ({
      key: newKey(), type: 'image', path: null, w: 0, h: 0, status: 'uploading',
      preview: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null,
    }))
    const afterKey = newKey()
    onChange((current) => insertImagesAt(current, images, at, afterKey))
    pendingFocus.current = afterKey
    cursor.current = { key: afterKey, position: 0 }

    chosen.forEach((file, index) => {
      const key = images[index].key
      upload(file).then(
        (result) => onChange((current) => updateBlock(current, key, { ...result, status: 'ready' })),
        (error: unknown) => {
          onChange((current) => updateBlock(current, key, { status: 'error' }))
          toast.error(error instanceof ImageError ? error.message : 'Não foi possível enviar a imagem. Tente de novo.')
        },
      )
    })
  }

  function retry(block: Extract<EditorBlock, { type: 'image' }>) {
    // Sem o arquivo original em memória, a forma segura de tentar de novo é escolher a imagem outra vez.
    onChange((current) => removeBlock(current, block.key))
    fileInput.current?.click()
  }

  const remember = (key: string, element: HTMLTextAreaElement) => { cursor.current = { key, position: element.selectionStart ?? element.value.length } }

  return (
    <div className={`rich-editor ${dragging ? 'rich-editor--drop' : ''}`}
      onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); setDragging(true) } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
      onDrop={(event) => {
        const files = imagesFromTransfer(event.dataTransfer)
        setDragging(false)
        if (!files.length) return
        event.preventDefault()
        addImages(files)
      }}>
      <div className="rich-editor__blocks" role="group" aria-label={label}>
        {value.map((block, index) => block.type === 'text' ? (
          <AutoTextarea key={block.key} className="rich-editor__text" value={block.text} maxLength={Math.max(block.text.length, NOTE_TEXT_MAX - totalText + block.text.length)}
            aria-label={index === 0 ? label : 'Continuação do texto'}
            placeholder={index === 0 && value.length === 1 ? placeholder : index === value.length - 1 ? 'Continue escrevendo…' : undefined}
            inputRef={(element) => { if (element) inputs.current.set(block.key, element); else inputs.current.delete(block.key) }}
            onChange={(text) => onChange((current) => updateBlock(current, block.key, { text }))}
            onSelect={(event) => remember(block.key, event.currentTarget)}
            onFocus={(event) => remember(block.key, event.currentTarget)}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && onSubmit) { event.preventDefault(); onSubmit() } }}
            onPaste={(event) => {
              const files = imagesFromTransfer(event.clipboardData)
              if (!files.length) return
              event.preventDefault()
              addImages(files, { key: block.key, position: event.currentTarget.selectionStart ?? block.text.length })
            }} />
        ) : (
          <figure key={block.key} className={`rich-editor__image rich-editor__image--${block.status}`} style={block.w && block.h ? { aspectRatio: `${block.w} / ${block.h}` } : undefined}>
            {(block.preview || (block.path && urls[block.path])) ? <img src={block.preview ?? urls[block.path as string]} alt="Imagem da observação" draggable={false} /> : <span className="rich-editor__placeholder" />}
            {block.status === 'uploading' && <span className="rich-editor__badge"><Loader2 size={15} className="spin" aria-hidden /> Enviando…</span>}
            {block.status === 'error' && <button type="button" className="rich-editor__badge rich-editor__badge--error" onClick={() => retry(block)}><RotateCcw size={15} aria-hidden /> Falhou. Escolher de novo</button>}
            <button type="button" className="rich-editor__remove" aria-label="Remover imagem" onClick={() => onChange((current) => removeBlock(current, block.key))}><X size={16} aria-hidden /></button>
          </figure>
        ))}
      </div>
      <div className="rich-editor__tools">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => fileInput.current?.click()}><ImagePlus size={16} aria-hidden /> Imagem</button>
        <span className="rich-editor__hint">Cole imagens com Ctrl+V ou arraste para cá</span>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
          onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) addImages(files) }} />
      </div>
    </div>
  )
}
