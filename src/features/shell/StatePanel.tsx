import type { ReactNode } from 'react'
import { Chiquinho } from '../../mascot/Chiquinho'
import type { Mood } from '../../state/feedback'

type Props = { mood: Mood; title: string; text?: string; action?: ReactNode; busy?: boolean; pose?: 'rosto' | 'sentado' }

/** Estado de tela cheia (carregando, erro, vazio, 404) apresentado pelo Chiquinho. */
export function StatePanel({ mood, title, text, action, busy, pose = 'rosto' }: Props) {
  return (
    <div className="state" role={busy ? 'status' : undefined} aria-busy={busy || undefined}>
      <Chiquinho mood={mood} pose={pose} size={pose === 'sentado' ? 200 : 132} />
      <h1 className="state__title">{title}</h1>
      {text && <p className="state__text">{text}</p>}
      {busy && <span className="dots" aria-hidden><i /><i /><i /></span>}
      {action && <div className="state__action">{action}</div>}
    </div>
  )
}
