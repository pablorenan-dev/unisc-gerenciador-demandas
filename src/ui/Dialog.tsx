import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

type DialogProps = {
  title: string
  /** Texto acima do título (ex.: "NOVA DEMANDA"). */
  eyebrow?: string
  onClose: () => void
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  footer?: ReactNode
  /** Conteúdo no lugar do título visível (o `title` continua nomeando o diálogo). */
  header?: ReactNode
}

/** Diálogo modal acessível: foco preso, Esc fecha, clique fora fecha, foco volta para quem abriu. */
export function Dialog({ title, eyebrow, onClose, size = 'md', children, footer, header }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const node = panel.current
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node)?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (!node) return
      // Só o diálogo do topo responde (há diálogos abertos sobre diálogos, ex.: confirmação).
      const all = document.querySelectorAll('[role="dialog"]')
      if (all[all.length - 1] !== node) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => item.offsetParent !== null || item === document.activeElement)
      if (!items.length) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus() }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [])

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={panel} className={`dialog dialog--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="dialog__header">
          <div className="dialog__heading">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={titleId} className={header ? 'sr-only' : undefined}>{title}</h2>
            {header}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={20} aria-hidden /></button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </div>
  )
}

type ConfirmProps = { title: string; text: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }

export function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  return (
    <Dialog title={title} size="sm" onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose} data-autofocus>Cancelar</button>
      <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
    </>}>
      <p className="dialog__text">{text}</p>
    </Dialog>
  )
}

type PromptProps = { title: string; label: string; initial?: string; maxLength: number; confirmLabel: string; placeholder?: string; onSubmit: (value: string) => void; onClose: () => void }

export function PromptDialog({ title, label, initial = '', maxLength, confirmLabel, placeholder, onSubmit, onClose }: PromptProps) {
  const input = useRef<HTMLInputElement>(null)
  const formId = useId()
  return (
    <Dialog title={title} size="sm" onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Cancelar</button>
      <button type="submit" form={formId} className="btn btn--primary">{confirmLabel}</button>
    </>}>
      <form id={formId} onSubmit={(event) => { event.preventDefault(); const value = input.current?.value.trim() ?? ''; if (!value) return; onSubmit(value); onClose() }}>
        <label className="field">
          <span>{label}</span>
          <input ref={input} className="input" defaultValue={initial} maxLength={maxLength} placeholder={placeholder} required data-autofocus onFocus={(event) => event.currentTarget.select()} />
        </label>
      </form>
    </Dialog>
  )
}
