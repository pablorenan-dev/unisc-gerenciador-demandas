import { CalendarDays, Check, ChevronDown, Columns3, GraduationCap, Keyboard, LayoutDashboard, LogOut, Monitor, Moon, Pencil, Plus, Settings, Sun, Target, Trash2, Volume2, VolumeX } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import type { Board } from '../../lib/types'
import { Chiquinho } from '../../mascot/Chiquinho'
import { useAuth } from '../../state/auth'
import { toast } from '../../state/feedback'
import { setPrefs, usePrefs } from '../../state/prefs'
import { Avatar } from '../../ui/Avatar'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../../ui/Menu'

type Props = {
  board: Board
  boards: Board[]
  base: string
  userName: string
  userEmail: string
  onNewCard: () => void
  onSwitch: (id: string) => void
  onCreateBoard: () => void
  onRenameBoard: () => void
  onDisciplines: () => void
  onDeleteBoard: () => void
  onSettings: () => void
  onShortcuts: () => void
}

/**
 * Barra superior. Esquerda: marca + quadro atual (o contexto de tudo).
 * Centro: as três visões do quadro. Direita: ação principal + menu da conta.
 */
export function Topbar({ board, boards, base, userName, userEmail, onNewCard, onSwitch, onCreateBoard, onRenameBoard, onDeleteBoard, onDisciplines, onSettings, onShortcuts }: Props) {
  const prefs = usePrefs()
  const { signOut, profile } = useAuth()

  return (
    <header className="topbar">
      <Link to={base} className="brand" aria-label="UGD, ir para a visão geral">
        <Chiquinho size={38} />
        <span className="brand__name">UGD</span>
      </Link>

      <Menu label={`Quadro atual: ${board.name}. Trocar ou gerenciar quadros`} align="start" triggerClassName="board-switch"
        trigger={<><span className="board-switch__name">{board.name}</span><ChevronDown size={16} aria-hidden /></>}>
        {(close) => <>
          <MenuLabel>Seus quadros</MenuLabel>
          {boards.map((item) => <MenuItem key={item.id} checked={item.id === board.id} onSelect={() => { close(); if (item.id !== board.id) onSwitch(item.id) }}>{item.name}</MenuItem>)}
          <MenuSeparator />
          <MenuItem icon={<Plus size={16} />} onSelect={() => { close(); onCreateBoard() }}>Novo quadro</MenuItem>
          <MenuItem icon={<GraduationCap size={16} />} onSelect={() => { close(); onDisciplines() }}>Disciplinas deste quadro</MenuItem>
          <MenuItem icon={<Pencil size={16} />} onSelect={() => { close(); onRenameBoard() }}>Renomear este quadro</MenuItem>
          <MenuItem danger icon={<Trash2 size={16} />} disabled={boards.length <= 1} onSelect={() => { close(); onDeleteBoard() }}>Excluir este quadro</MenuItem>
        </>}
      </Menu>

      <nav className="views" aria-label="Visões do quadro">
        <NavLink to={base} end className="views__item"><LayoutDashboard size={17} aria-hidden /> Visão geral</NavLink>
        <NavLink to={`${base}/kanban`} className="views__item"><Columns3 size={17} aria-hidden /> Kanban</NavLink>
        <NavLink to={`${base}/calendario`} className="views__item"><CalendarDays size={17} aria-hidden /> Calendário</NavLink>
        <NavLink to={`${base}/foco`} className="views__item"><Target size={17} aria-hidden /> Foco</NavLink>
      </nav>

      <div className="topbar__end">
        <button type="button" className="btn btn--primary topbar__new" onClick={onNewCard}><Plus size={18} aria-hidden /> Nova demanda</button>
        <Menu label={`Conta de ${userName}`} triggerClassName="avatar-btn" trigger={<Avatar name={userName} path={profile?.avatarPath} />}>
          {(close) => <>
            <div className="menu__profile"><Avatar name={userName} path={profile?.avatarPath} size={44} /><div><strong>{userName}</strong><span>{userEmail}</span></div></div>
            <MenuSeparator />
            <MenuLabel>Tema</MenuLabel>
            <MenuItem icon={<Monitor size={16} />} checked={prefs.theme === 'system'} onSelect={() => setPrefs({ theme: 'system' })}>Igual ao sistema</MenuItem>
            <MenuItem icon={<Sun size={16} />} checked={prefs.theme === 'light'} onSelect={() => setPrefs({ theme: 'light' })}>Claro</MenuItem>
            <MenuItem icon={<Moon size={16} />} checked={prefs.theme === 'dark'} onSelect={() => setPrefs({ theme: 'dark' })}>Escuro</MenuItem>
            <MenuSeparator />
            <MenuItem icon={prefs.sound ? <Volume2 size={16} /> : <VolumeX size={16} />} onSelect={() => setPrefs({ sound: !prefs.sound })}>{prefs.sound ? 'Silenciar o Chiquinho' : 'Ligar o som do Chiquinho'}</MenuItem>
            <MenuItem icon={<Settings size={16} />} onSelect={() => { close(); onSettings() }}>Configurações</MenuItem>
            <MenuItem icon={<Keyboard size={16} />} onSelect={() => { close(); onShortcuts() }}>Atalhos de teclado</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<LogOut size={16} />} onSelect={async () => { close(); const error = await signOut(); if (error) toast.error(error) }}>Sair</MenuItem>
            <div className="menu__version"><Check size={12} aria-hidden /> UGD v{__APP_VERSION__}</div>
          </>}
        </Menu>
      </div>
    </header>
  )
}
