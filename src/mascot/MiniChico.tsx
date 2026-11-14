import { useEffect } from 'react'
import { watchCats } from './gaze'

/**
 * `idle` fica olhando para o ponteiro; `working` pega o lápis e escreve;
 * `happy` é a comemoração de quando algo é concluído; `done` é o normal, só que verde.
 */
export type MiniState = 'idle' | 'working' | 'happy' | 'done'

/**
 * Chiquinho em miniatura: só a silhueta (orelhas, olhos e boquinha), desenhada em SVG.
 * As cores vêm do CSS: `--mc-fill` pinta a cabeça e `--mc-face` (a cor do fundo) os olhos e a boca.
 * É decorativo: todo estado que ele mostra também aparece em texto na tela.
 */
export function MiniChico({ state = 'idle', size = 26, className = '' }: { state?: MiniState; size?: number; className?: string }) {
  useEffect(() => watchCats(), [])
  const happy = state === 'happy'
  return (
    <svg className={`mini-chico mini-chico--${state} ${className}`} viewBox="0 0 32 32" width={size} height={size} aria-hidden focusable="false">
      <g className="mini-chico__body">
        <path className="mini-chico__head" d="M4.6 14 L6.2 4.2 L12.6 8.4 Q16 7.6 19.4 8.4 L25.8 4.2 L27.4 14 C28.6 15.8 29 17.6 29 19.4 C29 24.8 23.4 28.4 16 28.4 C8.6 28.4 3 24.8 3 19.4 C3 17.6 3.4 15.8 4.6 14 Z" />
        {happy ? (
          <>
            <path className="mini-chico__line" d="M8.9 19.2 Q11.2 15.8 13.5 19.2 M18.5 19.2 Q20.8 15.8 23.1 19.2" />
            <path className="mini-chico__mouth" d="M13.2 22.7 Q16 27.4 18.8 22.7 Z" />
          </>
        ) : (
          <>
            <g className="mini-chico__eyes">
              <ellipse className="mini-chico__eye" cx="11.2" cy="18.4" rx="2.5" ry="2.9" />
              <ellipse className="mini-chico__eye" cx="20.8" cy="18.4" rx="2.5" ry="2.9" />
              <g className="mini-chico__pupils">
                <ellipse cx="11.2" cy="18.4" rx="1.05" ry="1.9" />
                <ellipse cx="20.8" cy="18.4" rx="1.05" ry="1.9" />
              </g>
            </g>
            <path className="mini-chico__nose" d="M15.1 21.5 H16.9 L16 22.6 Z" />
            <path className="mini-chico__line" d="M16 22.6 V23.5 M13 23.5 Q14.5 25.1 16 23.5 Q17.5 25.1 19 23.5" />
          </>
        )}
      </g>
      {happy && <path className="mini-chico__sparks" d="M16 1.2 V4 M14.6 2.6 H17.4 M2 3.6 V6 M0.8 4.8 H3.2 M30 3.6 V6 M28.8 4.8 H31.2" />}
      {state === 'working' && (
        <>
          <path className="mini-chico__scribble" pathLength={1} d="M8.4 31 q1.6 -1.9 3.2 0 t3.2 0 t3.2 0 t3.2 0" />
          <g transform="translate(22.4 30.6) rotate(34) scale(1.3)">
            <g className="mini-chico__pencil">
              <rect className="mini-chico__eraser" x="-1.7" y="-11.8" width="3.4" height="1.7" rx="0.6" />
              <rect className="mini-chico__shaft" x="-1.7" y="-10.1" width="3.4" height="6.5" />
              <path className="mini-chico__wood" d="M-1.7 -3.6 H1.7 L0.9 -1.8 H-0.9 Z" />
              <path className="mini-chico__lead" d="M-0.9 -1.8 H0.9 L0 0 Z" />
            </g>
          </g>
          <ellipse className="mini-chico__paw" cx="26.3" cy="24.9" rx="3" ry="2.5" />
        </>
      )}
    </svg>
  )
}
