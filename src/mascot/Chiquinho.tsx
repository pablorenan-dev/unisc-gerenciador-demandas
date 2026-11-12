import type { CSSProperties } from 'react'
import rosto96 from '../assets/chiquinho/rosto-96.webp'
import rosto256 from '../assets/chiquinho/rosto-256.webp'
import rosto512 from '../assets/chiquinho/rosto-512.webp'
import lingua96 from '../assets/chiquinho/lingua-96.webp'
import lingua256 from '../assets/chiquinho/lingua-256.webp'
import lingua512 from '../assets/chiquinho/lingua-512.webp'
import zoiao96 from '../assets/chiquinho/zoiao-96.webp'
import zoiao256 from '../assets/chiquinho/zoiao-256.webp'
import zoiao512 from '../assets/chiquinho/zoiao-512.webp'
import dormindo96 from '../assets/chiquinho/dormindo-96.webp'
import dormindo256 from '../assets/chiquinho/dormindo-256.webp'
import dormindo512 from '../assets/chiquinho/dormindo-512.webp'
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

/** Quatro fotos reais do Chiquinho, cada uma em três tamanhos. */
const faces = {
  rosto: [rosto96, rosto256, rosto512],
  lingua: [lingua96, lingua256, lingua512],
  zoiao: [zoiao96, zoiao256, zoiao512],
  dormindo: [dormindo96, dormindo256, dormindo512],
}

/** Cada humor usa a foto que combina: língua de fora na alegria, zoião no aperto, soneca no vazio. */
const faceByMood: Record<Mood, keyof typeof faces> = {
  idle: 'rosto',
  curious: 'rosto',
  thinking: 'rosto',
  happy: 'lingua',
  party: 'lingua',
  worried: 'zoiao',
  oops: 'zoiao',
  sleepy: 'dormindo',
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
  const [small, medium, large] = faces[faceByMood[mood]]
  const src = face ? (size <= 48 ? small : size <= 128 ? medium : large) : size <= 180 ? sentado360 : sentado720
  const srcSet = face ? `${small} 96w, ${medium} 256w, ${large} 512w` : `${sentado360} 360w, ${sentado720} 720w`
  return (
    <span className={`cat cat--${pose} cat--${mood} ${className}`} style={{ '--cat-size': `${size}px` } as CSSProperties}>
      <span className="cat__sticker">
        <img src={src} srcSet={srcSet} sizes={`${size}px`} alt={alt} width={size} height={face ? size : Math.round(size * 4 / 3)} decoding="async" draggable={false} />
      </span>
      <Prop mood={mood} />
    </span>
  )
}
