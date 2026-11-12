import { useState } from 'react'
import { imagePaths, type StoredBlock } from '../lib/blocks'
import { useMediaUrls } from '../state/media'
import { Dialog } from './Dialog'

/** Mostra uma observação salva: texto puro (sem HTML) e imagens do bucket privado. */
export function RichContent({ blocks }: { blocks: StoredBlock[] }) {
  const urls = useMediaUrls('card-images', imagePaths(blocks))
  const [zoom, setZoom] = useState<string | null>(null)
  return (
    <div className="rich-content">
      {blocks.map((block, index) => block.type === 'text' ? (
        <p key={index} className="rich-content__text">{block.text}</p>
      ) : (
        <button key={index} type="button" className="rich-content__image" style={block.w && block.h ? { aspectRatio: `${block.w} / ${block.h}` } : undefined}
          onClick={() => urls[block.path] && setZoom(urls[block.path] as string)} aria-label="Ampliar imagem">
          {urls[block.path] ? <img src={urls[block.path]} alt="" loading="lazy" decoding="async" draggable={false} /> : <span className="rich-editor__placeholder" />}
        </button>
      ))}
      {zoom && (
        <Dialog title="Imagem" size="lg" onClose={() => setZoom(null)}>
          <img className="zoomed" src={zoom} alt="Imagem ampliada da observação" />
        </Dialog>
      )}
    </div>
  )
}
