import type { CSSProperties } from 'react'
import rosto96 from '../assets/chiquinho/rosto-96.webp'
import rosto256 from '../assets/chiquinho/rosto-256.webp'
import rosto512 from '../assets/chiquinho/rosto-512.webp'
import sentado360 from '../assets/chiquinho/sentado-360.webp'
import sentado720 from '../assets/chiquinho/sentado-720.webp'
import type { Mood } from '../state/feedback'

type Props = {
  mood?: Mood
  /** Lado da figurinha, em px. */
  size?: number
  /** `rosto` = close quadrado; `sentado` = foto de corpo inteiro (3:4). */
  pose?: 'rosto' | 'sentado'
  /** Texto alternativo. Vazio = decorativo. */
  alt?: string
  className?: string
}

/** Adereços desenhados por cima da foto real: é daí que vem a graça de cada estado. */
function Prop({ mood }: { mood: Mood }) {
  if (mood === 'party') return (
    <svg className="cat__prop cat__prop--hat" viewBox="0 0 60 70" aria-hidden>
      <path d="M30 4 52 60H8Z" fill="#f5a524" stroke="#241703" strokeWidth="3" strokeLinejoin="round" />
      <path d="M22 26 40 34M16 42l32 12" stroke="#241703" strokeWidth="4" strokeLinecap="round" />
      <circle cx="30" cy="6" r="6" fill="#ff7a66" stroke="#241703" strokeWidth="3" />
    </svg>
  )
  if (mood === 'sleepy') return <span className="cat__prop cat__prop--zzz" aria-hidden><i>z</i><i>z</i><i>Z</i></span>
  if (mood === 'worried') return (
    <svg className="cat__prop cat__prop--drop" viewBox="0 0 24 34" aria-hidden>
      <path d="M12 2C7 12 3 17 3 23a9 9 0 0 0 18 0c0-6-4-11-9-21Z" fill="#8fd8f0" stroke="#17323d" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
  if (mood === 'happy') return <span className="cat__prop cat__prop--hearts" aria-hidden><i>♥</i><i>♥</i></span>
  if (mood === 'curious' || mood === 'thinking') return <span className="cat__prop cat__prop--mark" aria-hidden>{mood === 'curious' ? '?' : '…'}</span>
  if (mood === 'oops') return <span className="cat__prop cat__prop--stars" aria-hidden><i>✦</i><i>✦</i><i>✦</i></span>
  return null
}

/** A figurinha do Chiquinho: foto real do gato, com moldura de adesivo e um adereço por humor. */
export function Chiquinho({ mood = 'idle', size = 64, pose = 'rosto', alt = '', className = '' }: Props) {
  const face = pose === 'rosto'
  const src = face ? (size <= 48 ? rosto96 : size <= 128 ? rosto256 : rosto512) : size <= 180 ? sentado360 : sentado720
  const srcSet = face ? `${rosto96} 96w, ${rosto256} 256w, ${rosto512} 512w` : `${sentado360} 360w, ${sentado720} 720w`
  return (
    <span className={`cat cat--${pose} cat--${mood} ${className}`} style={{ '--cat-size': `${size}px` } as CSSProperties}>
      <span className="cat__sticker">
        <img src={src} srcSet={srcSet} sizes={`${size}px`} alt={alt} width={size} height={face ? size : Math.round(size * 4 / 3)} decoding="async" draggable={false} />
      </span>
      <Prop mood={mood} />
    </span>
  )
}
