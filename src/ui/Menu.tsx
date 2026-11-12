import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type MenuProps = {
  /** Nome acessível do botão. */
  label: string
  trigger: ReactNode
  triggerClassName?: string
  align?: 'start' | 'end'
  children: (close: () => void) => ReactNode
}

/** Menu suspenso: abre com clique/Enter, navega com setas, fecha com Esc ou clique fora. */
export function Menu({ label, trigger, triggerClassName = 'icon-btn', align = 'end', children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)

  // Fechar por escolha de item ou Esc devolve o foco ao botão (feito em efeito, fora do render).
  const [refocus, setRefocus] = useState(0)
  const close = () => {
    setOpen(false)
    setRefocus((value) => value + 1)
  }
  useEffect(() => { if (refocus > 0) button.current?.focus() }, [refocus])

  // Posição fixa calculada a partir do botão: o menu nunca é cortado por colunas com rolagem.
  useLayoutEffect(() => {
    if (!open || !button.current || !list.current) return
    const anchor = button.current.getBoundingClientRect()
    const size = list.current.getBoundingClientRect()
    const margin = 8
    let left = align === 'end' ? anchor.right - size.width : anchor.left
    left = Math.max(margin, Math.min(left, window.innerWidth - size.width - margin))
    let top = anchor.bottom + 6
    if (top + size.height > window.innerHeight - margin) top = Math.max(margin, anchor.top - size.height - 6)
    setStyle({ left, top, visibility: 'visible' })
    list.current.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus()
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (!list.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    const dismiss = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); return }
    if (event.key === 'Tab') { setOpen(false); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <>
      <button ref={button} type="button" className={triggerClassName} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); setStyle({ visibility: 'hidden' }); setOpen((value) => !value) }}
        onPointerDown={(event) => event.stopPropagation()}>
        {trigger}
      </button>
      {open && (
        <div ref={list} className="menu" role="menu" aria-label={label} style={style} onKeyDown={onKeyDown} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          {children(close)}
        </div>
      )}
    </>
  )
}

type ItemProps = { onSelect: () => void; children: ReactNode; icon?: ReactNode; danger?: boolean; disabled?: boolean; checked?: boolean }

export function MenuItem({ onSelect, children, icon, danger, disabled, checked }: ItemProps) {
  return (
    <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={checked} className={`menu__item ${danger ? 'menu__item--danger' : ''}`} disabled={disabled} onClick={onSelect}>
      {icon && <span className="menu__icon" aria-hidden>{icon}</span>}
      <span className="menu__label">{children}</span>
      {checked && <span className="menu__check" aria-hidden>✓</span>}
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu__heading">{children}</div>
}

export function MenuSeparator() {
  return <div className="menu__separator" role="separator" />
}
