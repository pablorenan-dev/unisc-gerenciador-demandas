import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Columns3, LayoutDashboard, Plus } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { briefing, emptyFilters, matchesFilters, summarize, type Filters } from '../../lib/insights'
import { BOARD_NAME_MAX, type Board, type Card, type Discipline } from '../../lib/types'
import { Chiquinho } from '../../mascot/Chiquinho'
import { Companion } from '../../mascot/Companion'
import { useAuth } from '../../state/auth'
import { useBoard, type BoardsState, type BoardStore } from '../../state/board'
import { catSay } from '../../state/feedback'
import { ConfirmDialog, PromptDialog } from '../../ui/Dialog'
import { CardDialog } from '../card/CardDialog'
import { NewCardDialog } from '../card/NewCardDialog'
import { DisciplinesDialog } from '../disciplines/DisciplinesDialog'
import { SettingsDialog, ShortcutsDialog } from '../settings/SettingsDialog'
import { FilterBar } from './FilterBar'
import { StatePanel } from './StatePanel'
import { Topbar } from './Topbar'

export type BoardContext = {
  board: Board
  store: BoardStore
  filters: Filters
  setFilters: (patch: Partial<Filters>) => void
  clearFilters: () => void
  visibleCards: Card[]
  openCard: (id: string) => void
  openNew: (preset?: { column?: string; due?: string }) => void
  /** Disciplinas do quadro por id, para mostrar ícone e cor nos cards. */
  disciplineById: Map<string, Discipline>
  openDisciplines: () => void
}

type DisciplinesRequest = { startNew?: boolean; onCreated?: (discipline: Discipline) => void }

type BoardDialog = 'create' | 'rename' | 'delete' | 'settings' | 'shortcuts' | null

/** Remonta a tela inteira ao trocar de quadro: filtros, seleção e dados começam do zero. */
export function BoardLayout() {
  const { boardId } = useParams()
  return <BoardScreen key={boardId} />
}

function BoardScreen() {
  const { boardId } = useParams()
  const boards = useOutletContext<BoardsState>()
  const { api, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const board = boards.boards.find((item) => item.id === boardId)
  const store = useBoard(api!, board?.id)
  const [filters, setFiltersState] = useState<Filters>(emptyFilters)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newCard, setNewCard] = useState<{ column?: string; due?: string } | null>(null)
  const [dialog, setDialog] = useState<BoardDialog>(null)
  const [disciplinesDialog, setDisciplinesDialog] = useState<DisciplinesRequest | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const base = `/q/${boardId}`
  const view = location.pathname.endsWith('/kanban') ? 'kanban' : location.pathname.endsWith('/calendario') ? 'calendario' : location.pathname.endsWith('/foco') ? 'foco' : 'visao-geral'

  const setFilters = useCallback((patch: Partial<Filters>) => setFiltersState((current) => ({ ...current, ...patch })), [])
  const clearFilters = useCallback(() => setFiltersState(emptyFilters), [])
  const visibleCards = useMemo(() => store.cards.filter((card) => matchesFilters(card, filters, store.columns)), [store.cards, store.columns, filters])
  const disciplineById = useMemo(() => new Map(store.disciplines.map((discipline) => [discipline.id, discipline])), [store.disciplines])
  const newDiscipline = (onCreated: (discipline: Discipline) => void) => setDisciplinesDialog({ startNew: true, onCreated })
  const selected = selectedId ? store.cards.find((card) => card.id === selectedId) : undefined
  const summary = useMemo(() => summarize(store.cards, store.columns), [store.cards, store.columns])
  const brief = useMemo(() => briefing(summary), [summary])

  useEffect(() => {
    if (board) { try { window.localStorage.setItem('ugd-last-board', board.id) } catch { /* ignora */ } }
  }, [board])

  // Ao abrir o quadro, o Chiquinho resume o que importa agora.
  const greeted = useRef<string | null>(null)
  useEffect(() => {
    if (store.status !== 'ready' || !board || greeted.current === board.id) return
    greeted.current = board.id
    // Na visão geral o resumo já está no topo da página; repetir no balão seria ruído.
    if (view === 'visao-geral' || view === 'foco') return
    const timer = window.setTimeout(() => catSay(`${brief.title} ${brief.text}`, brief.mood, 7000), 900)
    return () => window.clearTimeout(timer)
  }, [store.status, board, brief, view])

  // Atalhos de teclado (ignorados enquanto se digita ou com diálogo aberto).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return
      if (document.querySelector('[role="dialog"]')) return
      const go = (path: string) => { event.preventDefault(); navigate(`${base}${path}`) }
      if (event.key === 'n' || event.key === 'N') { event.preventDefault(); setNewCard({}) }
      else if (event.key === '/') { event.preventDefault(); if (view === 'visao-geral' || view === 'foco') navigate(`${base}/kanban`); window.setTimeout(() => searchRef.current?.focus(), 30) }
      else if (event.key === '1') go('')
      else if (event.key === '2') go('/kanban')
      else if (event.key === '3') go('/calendario')
      else if (event.key === '4') go('/foco')
      else if (event.key === '?') { event.preventDefault(); setDialog('shortcuts') }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [base, navigate, view])

  if (!board) {
    return (
      <div className="app">
        <main className="main main--center">
          <StatePanel mood="curious" title="Não achei esse quadro." text="Ele pode ter sido excluído, ou o endereço está errado."
            action={boards.boards[0] && <Link className="btn btn--primary" to={`/q/${boards.boards[0].id}`}>Ir para {boards.boards[0].name}</Link>} />
        </main>
      </div>
    )
  }

  const context: BoardContext = { board, store, filters, setFilters, clearFilters, visibleCards, openCard: setSelectedId, openNew: (preset) => setNewCard(preset ?? {}), disciplineById, openDisciplines: () => setDisciplinesDialog({}) }

  return (
    <div className={`app app--${view}`}>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <Topbar board={board} boards={boards.boards} base={base} userName={user?.name ?? ''} userEmail={user?.email ?? ''}
        onNewCard={() => setNewCard({})} onSwitch={(id) => navigate(`/q/${id}${view === 'visao-geral' ? '' : `/${view}`}`)}
        onCreateBoard={() => setDialog('create')} onRenameBoard={() => setDialog('rename')} onDeleteBoard={() => setDialog('delete')} onDisciplines={() => setDisciplinesDialog({})}
        onSettings={() => setDialog('settings')} onShortcuts={() => setDialog('shortcuts')} />

      <main id="conteudo" className="main" tabIndex={-1}>
        {store.status === 'loading' && <StatePanel mood="thinking" title="Buscando suas demandas…" text="O Chiquinho foi lá no banco de dados e já volta." busy />}
        {store.status === 'error' && <StatePanel mood="oops" title="Não consegui carregar o quadro." text="Pode ser a internet. Seus dados continuam salvos; nada foi perdido."
          action={<button type="button" className="btn btn--primary" onClick={store.retry}>Tentar de novo</button>} />}
        {store.status === 'ready' && <>
          {(view === 'kanban' || view === 'calendario') && <FilterBar filters={filters} setFilters={setFilters} clearFilters={clearFilters} cards={store.cards} searchRef={searchRef} shown={visibleCards.length} />}
          <Outlet context={context} />
        </>}
      </main>

      <nav className="tabbar" aria-label="Navegação principal">
        <NavLink to={base} end className="tabbar__item"><LayoutDashboard size={22} aria-hidden /><span>Visão geral</span></NavLink>
        <NavLink to={`${base}/kanban`} className="tabbar__item"><Columns3 size={22} aria-hidden /><span>Kanban</span></NavLink>
        <button type="button" className="tabbar__add" onClick={() => setNewCard({})} aria-label="Nova demanda"><Plus size={26} aria-hidden /></button>
        <NavLink to={`${base}/calendario`} className="tabbar__item"><CalendarDays size={22} aria-hidden /><span>Calendário</span></NavLink>
        <NavLink to={`${base}/foco`} className="tabbar__item tabbar__cat"><Chiquinho size={28} /><span>Foco</span></NavLink>
      </nav>

      <Companion fallbackMood={store.status === 'ready' ? (brief.mood === 'curious' ? 'idle' : brief.mood) : 'thinking'} />

      {selected && <CardDialog key={selected.id} card={selected} columns={store.columns} boardName={board.name} disciplines={store.disciplines} disciplinesReady={store.disciplinesReady} onNewDiscipline={newDiscipline}
        onClose={() => setSelectedId(null)} onSave={store.saveCard}
        onDelete={() => { setSelectedId(null); store.deleteCard(selected.id) }}
        onDuplicate={async () => { const copy = await store.duplicateCard(selected.id); if (copy) setSelectedId(copy.id) }} />}
      {newCard && <NewCardDialog columns={store.columns} preset={newCard} disciplines={store.disciplines} disciplinesReady={store.disciplinesReady} onNewDiscipline={newDiscipline}
        onClose={() => setNewCard(null)} onCreate={store.addCard} />}
      {dialog === 'create' && <PromptDialog title="Novo quadro" label="Nome do quadro" maxLength={BOARD_NAME_MAX} confirmLabel="Criar quadro" placeholder="Ex.: Demandas 2027/1" onClose={() => setDialog(null)}
        onSubmit={async (name) => { const created = await boards.createBoard(name); if (created) navigate(`/q/${created.id}/kanban`) }} />}
      {dialog === 'rename' && <PromptDialog title="Renomear quadro" label="Nome do quadro" initial={board.name} maxLength={BOARD_NAME_MAX} confirmLabel="Salvar" onClose={() => setDialog(null)} onSubmit={(name) => void boards.renameBoard(board.id, name)} />}
      {dialog === 'delete' && <ConfirmDialog danger title={`Excluir o quadro "${board.name}"?`} confirmLabel="Excluir quadro" onClose={() => setDialog(null)}
        text={`Todas as colunas, as ${store.cards.length} demandas e as tarefas deste quadro serão apagadas. Não dá para desfazer.`}
        onConfirm={async () => { const next = boards.boards.find((item) => item.id !== board.id); if (await boards.deleteBoard(board.id)) navigate(next ? `/q/${next.id}` : '/') }} />}
      {disciplinesDialog && <DisciplinesDialog store={store} boardName={board.name} startNew={disciplinesDialog.startNew} onCreated={disciplinesDialog.onCreated} onClose={() => setDisciplinesDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </div>
  )
}
