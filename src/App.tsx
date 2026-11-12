import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Columns3,
  Filter,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sun,
  Target,
  X,
} from 'lucide-react'
import './App.css'
import './kanban-theme.css'
import './overrides.css'
import { supabase } from './lib/supabase'
import chiquinho from './assets/chiquinho.jpg'

type Priority = 'baixa' | 'media' | 'alta' | 'urgente' | 'critica'
type CardType = 'trabalho' | 'prova' | 'seminario' | 'leitura' | 'projeto' | 'exercicios' | 'estudo' | 'outro'
type View = 'overview' | 'board' | 'calendar'

type Task = { id: string; title: string; done: boolean; elapsedSeconds: number; timerStartedAt: string | null }
type Card = {
  id: string
  title: string
  description: string
  discipline: string
  type: CardType
  priority: Priority
  dueStart?: string
  due: string
  column: string
  tasks: Task[]
  labels: string[]
}

const initialCards: Card[] = [
  { id: '1', title: 'Trabalho de Compiladores', description: 'Implementar o analisador léxico e entregar o relatório.', discipline: 'Compiladores', type: 'trabalho', priority: 'alta', due: '2026-11-12', column: 'doing', tasks: [{ id: 't1', title: 'Definir gramática', done: true, elapsedSeconds: 0, timerStartedAt: null }, { id: 't2', title: 'Implementar lexer', done: true, elapsedSeconds: 0, timerStartedAt: null }, { id: 't3', title: 'Escrever relatório', done: false, elapsedSeconds: 0, timerStartedAt: null }], labels: ['Código'] },
  { id: '2', title: 'Prova de Banco de Dados', description: 'Revisar normalização, SQL e transações.', discipline: 'Banco de Dados', type: 'prova', priority: 'alta', due: '2026-11-18', column: 'todo', tasks: [{ id: 't4', title: 'Revisar material', done: false, elapsedSeconds: 0, timerStartedAt: null }, { id: 't5', title: 'Resolver exercícios', done: false, elapsedSeconds: 0, timerStartedAt: null }], labels: ['Prova'] },
  { id: '3', title: 'Seminário de IA', description: 'Preparar apresentação sobre redes neurais.', discipline: 'Inteligência Artificial', type: 'seminario', priority: 'media', due: '2026-11-22', column: 'review', tasks: [{ id: 't6', title: 'Escolher referências', done: true, elapsedSeconds: 0, timerStartedAt: null }, { id: 't7', title: 'Montar slides', done: false, elapsedSeconds: 0, timerStartedAt: null }], labels: ['Apresentação'] },
  { id: '4', title: 'Ler artigo científico', description: 'Artigo indicado para a próxima aula.', discipline: 'Metodologia', type: 'leitura', priority: 'baixa', due: '2026-11-28', column: 'done', tasks: [{ id: 't8', title: 'Fazer anotações', done: true, elapsedSeconds: 0, timerStartedAt: null }], labels: ['Leitura'] },
]

const defaultColumns = [
  { id: 'todo', title: 'A fazer', color: '#94a3b8' },
  { id: 'doing', title: 'Em andamento', color: '#4f46e5' },
  { id: 'review', title: 'Em revisão', color: '#f59e0b' },
  { id: 'done', title: 'Concluído', color: '#10b981' },
]

const columnColors = ['#94a3b8', '#64748b', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899']

const typeLabels: Record<CardType, string> = { trabalho: 'Trabalho', prova: 'Prova', seminario: 'Seminário', leitura: 'Leitura', projeto: 'Projeto', exercicios: 'Exercícios', estudo: 'Estudo', outro: 'Outro' }
const priorityLabels: Record<Priority, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente', critica: 'Crítica' }

function daysUntil(date: string) {
  if (!date) return Infinity
  const today = new Date('2026-11-10T12:00:00')
  return Math.ceil((new Date(`${date}T12:00:00`).getTime() - today.getTime()) / 86400000)
}

function App() {
  const [sessionReady, setSessionReady] = useState(!supabase)
  const [authenticated, setAuthenticated] = useState(!supabase)
  const [cards, setCards] = useState(initialCards)
  const [activeView, setActiveView] = useState<View>(() => {
    const stored = window.localStorage.getItem('ugd-active-view')
    return stored === 'board' || stored === 'calendar' ? stored : 'overview'
  })
  const [calendarMode, setCalendarMode] = useState<'month' | 'week' | 'list'>('month')
  const [cardFocus, setCardFocus] = useState<'all' | 'completed'>('all')
  const [columns, setColumns] = useState(defaultColumns)
  const [boardId, setBoardId] = useState<string | null>(null)
  const [activeColumn, setActiveColumn] = useState('all')
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState<'all' | Priority>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | CardType>('all')
  const [disciplineFilter, setDisciplineFilter] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Card | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newCardColumn, setNewCardColumn] = useState<string | null>(null)
  const [dark, setDark] = useState(() => window.localStorage.getItem('ugd-dark-mode') !== 'false')
  const [showSettings, setShowSettings] = useState(false)
  const [sidebar, setSidebar] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(242)
  const [toast, setToast] = useState('')
  const [user, setUser] = useState<{ email?: string; user_metadata?: { nome?: string; name?: string } } | null>(null)

  useEffect(() => {
    window.localStorage.setItem('ugd-dark-mode', String(dark))
  }, [dark])

  useEffect(() => {
    const stored = window.localStorage.getItem('ugd-compact-sidebar')
    if (stored !== null) setSidebarCollapsed(stored === 'true')
  }, [])

  useEffect(() => {
    window.localStorage.setItem('ugd-compact-sidebar', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session))
      setUser(data.session?.user ?? null)
      setSessionReady(true)
      if (data.session?.user) void loadFirstBoard(data.session.user.id)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthenticated(Boolean(session))
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN') {
        if (session?.user) void loadFirstBoard(session.user.id)
        setToast('Logado com sucesso!')
        window.setTimeout(() => setToast(''), 2400)
      }
    })
    if (window.localStorage.getItem('ugd-login-success') === 'true') {
      window.localStorage.removeItem('ugd-login-success')
      window.setTimeout(() => {
        setToast('Login realizado com sucesso')
        window.setTimeout(() => setToast(''), 2400)
      }, 0)
    }
    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadFirstBoard(userId: string) {
    if (!supabase) return
    let { data: boards, error: boardError } = await supabase
      .from('boards')
      .select('id')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
    if (boardError) {
      setToast(`Não foi possível carregar o quadro: ${boardError.message}`)
      window.setTimeout(() => setToast(''), 4000)
      return
    }
    let firstBoard = boards?.[0]
    if (!firstBoard) {
      const created = await supabase.from('boards').insert({ nome: 'Demandas 2026/2', descricao: 'Demandas acadêmicas do segundo semestre', owner_id: userId }).select('id').single()
      boardError = created.error
      firstBoard = created.data ?? undefined
    }
    if (!firstBoard) {
      setToast(`Não foi possível criar o quadro: ${boardError?.message ?? 'erro desconhecido'}`)
      window.setTimeout(() => setToast(''), 4000)
      return
    }
    let { data: boardColumns, error: columnsError } = await supabase
      .from('columns')
      .select('id, nome, cor, posicao')
      .eq('board_id', firstBoard.id)
      .order('posicao', { ascending: true })
    if (columnsError) {
      setToast(`Não foi possível carregar as colunas: ${columnsError.message}`)
      window.setTimeout(() => setToast(''), 4000)
      return
    }
    if (!boardColumns?.length) {
      const { data: createdColumns, error: createColumnsError } = await supabase.from('columns').insert(defaultColumns.map((column, index) => ({
        board_id: firstBoard.id,
        nome: column.title,
        posicao: (index + 1) * 1000,
        cor: column.color,
      }))).select('id, nome, cor, posicao')
      if (createColumnsError || !createdColumns?.length) {
        setToast(`Não foi possível criar as colunas do quadro: ${createColumnsError?.message ?? 'nenhuma coluna foi criada'}`)
        window.setTimeout(() => setToast(''), 4000)
        return
      }
      boardColumns = createdColumns
    }
    setBoardId(firstBoard.id)
    const loadedColumns = boardColumns.map((column) => ({ id: column.id, title: column.nome, color: column.cor }))
    setColumns(loadedColumns)
    const { data: boardCards, error: cardsError } = await supabase.from('cards').select('id, column_id, titulo, descricao, disciplina, tipo, prioridade, data_inicio, data_entrega, labels').eq('board_id', firstBoard.id).order('posicao', { ascending: true })
    if (cardsError) {
      setToast(`Não foi possível carregar as demandas: ${cardsError.message}`)
      window.setTimeout(() => setToast(''), 4000)
      return
    }
    if (boardCards?.length) {
      const { data: boardTasks, error: tasksError } = await supabase.from('tasks').select('id, card_id, titulo, concluida, tempo_segundos, timer_iniciado_em').in('card_id', boardCards.map((card) => card.id))
      if (tasksError) {
        setToast(`Não foi possível carregar as tarefas: ${tasksError.message}`)
        window.setTimeout(() => setToast(''), 4000)
        return
      }
      setCards(boardCards.map((card) => ({
        id: card.id,
        title: card.titulo,
        description: card.descricao,
        discipline: card.disciplina,
        type: card.tipo,
        priority: card.prioridade,
        dueStart: card.data_inicio ?? '',
        due: card.data_entrega ?? '2026-11-30',
        column: card.column_id,
        tasks: (boardTasks ?? []).filter((task) => task.card_id === card.id).map((task) => ({ id: task.id, title: task.titulo, done: task.concluida, elapsedSeconds: task.tempo_segundos ?? 0, timerStartedAt: task.timer_iniciado_em })),
        labels: card.labels,
      })))
    } else {
      setCards([])
    }
  }

  function changeView(view: View) {
    setActiveView(view)
    window.localStorage.setItem('ugd-active-view', view)
  }

  const filteredCards = useMemo(() => cards.filter((card) => {
    const matchesText = `${card.title} ${card.description} ${card.discipline}`.toLowerCase().includes(search.toLowerCase())
    return matchesText &&
      (activeColumn === 'all' || card.column === activeColumn) &&
      (priority === 'all' || card.priority === priority) &&
      (typeFilter === 'all' || card.type === typeFilter) &&
      (disciplineFilter === 'all' || card.discipline === disciplineFilter) &&
      (cardFocus === 'all' || (card.tasks.length > 0 && card.tasks.every((task) => task.done)))
  }), [cards, search, activeColumn, priority, typeFilter, disciplineFilter, cardFocus])

  const disciplines = useMemo(() => [...new Set(cards.map((card) => card.discipline).filter(Boolean))].sort(), [cards])

  function clearFilters() {
    setSearch('')
    setActiveColumn('all')
    setPriority('all')
    setTypeFilter('all')
    setDisciplineFilter('all')
  }

  function openCompletedCards() {
    clearFilters()
    setCardFocus('completed')
    changeView('board')
  }

  async function moveCard(id: string, column: string, targetIndex?: number) {
    let reorderedCards: Card[] = []
    setCards((current) => {
      const moving = current.find((card) => card.id === id)
      if (!moving) return current
      const remaining = current.filter((card) => card.id !== id)
      const destinationCards = remaining.filter((card) => card.column === column)
      const insertionIndex = Math.max(0, Math.min(targetIndex ?? destinationCards.length, destinationCards.length))
      destinationCards.splice(insertionIndex, 0, { ...moving, column })
      reorderedCards = columns.flatMap((item) => item.id === column ? destinationCards : remaining.filter((card) => card.column === item.id))
      return reorderedCards
    })
    if (supabase && boardId) {
      const updates = columns.flatMap((item) => reorderedCards.filter((card) => card.column === item.id).map((card, position) => supabase.from('cards').update({ column_id: card.column, posicao: (position + 1) * 1000 }).eq('id', card.id).eq('board_id', boardId)))
      const results = await Promise.all(updates)
      const error = results.find((result) => result.error)?.error
      if (error) { setToast(`Não foi possível salvar a ordem das demandas: ${error.message}`); return }
    }
    setToast('Card atualizado com sucesso')
    window.setTimeout(() => setToast(''), 2400)
  }

  async function duplicateCard(card: Card) {
    const title = `${card.title} (cópia)`
    if (supabase && boardId) {
      const { data, error } = await supabase.from('cards').insert({ board_id: boardId, column_id: card.column, titulo: title, descricao: card.description, disciplina: card.discipline, tipo: card.type, prioridade: card.priority, data_inicio: card.dueStart || null, data_entrega: card.due || null, labels: card.labels }).select('id').single()
      if (error || !data) { setToast(`Não foi possível duplicar a demanda: ${error?.message ?? 'erro desconhecido'}`); return }
      setCards((current) => [...current, { ...card, id: data.id, title, tasks: card.tasks.map((task) => ({ ...task, id: crypto.randomUUID(), timerStartedAt: null })) }])
    } else {
      setCards((current) => [...current, { ...card, id: crypto.randomUUID(), title, tasks: card.tasks.map((task) => ({ ...task, id: crypto.randomUUID(), timerStartedAt: null })) }])
    }
    setToast('Demanda duplicada')
    window.setTimeout(() => setToast(''), 2400)
  }

  async function deleteCard(id: string) {
    if (supabase && boardId) {
      const { error } = await supabase.from('cards').delete().eq('id', id).eq('board_id', boardId)
      if (error) { setToast(`Não foi possível excluir a demanda: ${error.message}`); return }
    }
    setCards((current) => current.filter((card) => card.id !== id))
    setSelected((current) => current?.id === id ? null : current)
    setToast('Demanda excluída')
    window.setTimeout(() => setToast(''), 2400)
  }

  async function renameColumn(id: string) {
    const column = columns.find((item) => item.id === id)
    const title = window.prompt('Nome da coluna', column?.title)
    if (!title?.trim()) return
    if (supabase && boardId) {
      const { error } = await supabase.from('columns').update({ nome: title.trim() }).eq('id', id).eq('board_id', boardId)
      if (error) { setToast(`Não foi possível renomear a coluna: ${error.message}`); return }
    }
    setColumns((current) => current.map((item) => item.id === id ? { ...item, title: title.trim() } : item))
    setToast('Coluna renomeada')
    window.setTimeout(() => setToast(''), 2400)
  }

  async function deleteColumn(id: string) {
    const column = columns.find((item) => item.id === id)
    const cardCount = cards.filter((card) => card.column === id).length
    const warning = cardCount
      ? `Excluir "${column?.title}" também excluirá ${cardCount} demanda${cardCount === 1 ? '' : 's'} e suas tarefas. Continuar?`
      : `Excluir a coluna "${column?.title}"?`
    if (!window.confirm(warning)) return
    if (supabase && boardId) {
      const { error: cardsError } = await supabase.from('cards').delete().eq('column_id', id).eq('board_id', boardId)
      if (cardsError) {
        setToast(`Não foi possível excluir as demandas da coluna: ${cardsError.message}`)
        window.setTimeout(() => setToast(''), 4000)
        return
      }
      const { error: columnError } = await supabase.from('columns').delete().eq('id', id).eq('board_id', boardId)
      if (columnError) {
        setToast(`Não foi possível excluir a coluna: ${columnError.message}`)
        window.setTimeout(() => setToast(''), 4000)
        return
      }
    }
    setCards((current) => current.filter((card) => card.column !== id))
    setColumns((current) => current.filter((column) => column.id !== id))
    setSelected((current) => current && current.column === id ? null : current)
    setToast('Coluna excluída')
    window.setTimeout(() => setToast(''), 2400)
  }

  async function reorderColumn(id: string, direction: 'up' | 'down') {
    const index = columns.findIndex((column) => column.id === id)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= columns.length) return
    const next = [...columns]
    ;[next[index], next[target]] = [next[target], next[index]]

    if (supabase && boardId) {
      const temporaryUpdates = next.map((column, position) => supabase.from('columns').update({ posicao: -(position + 1) }).eq('id', column.id).eq('board_id', boardId))
      const temporaryResults = await Promise.all(temporaryUpdates)
      const temporaryError = temporaryResults.find((result) => result.error)?.error
      if (temporaryError) {
        setToast(`Não foi possível reordenar as colunas: ${temporaryError.message}`)
        window.setTimeout(() => setToast(''), 4000)
        return
      }
      const finalUpdates = next.map((column, position) => supabase.from('columns').update({ posicao: (position + 1) * 1000 }).eq('id', column.id).eq('board_id', boardId))
      const finalResults = await Promise.all(finalUpdates)
      const finalError = finalResults.find((result) => result.error)?.error
      if (finalError) {
        setToast(`Não foi possível salvar a ordem das colunas: ${finalError.message}`)
        window.setTimeout(() => setToast(''), 4000)
        return
      }
    }

    setColumns(next)
  }

  async function createCard(title: string, discipline: string, dueStart: string, due: string) {
    const column = columns.find((item) => item.id === newCardColumn) ?? columns[0]
    if (!column) return
    let id: string = crypto.randomUUID()
    if (supabase && boardId) {
      const { data, error } = await supabase.from('cards').insert({ board_id: boardId, column_id: column.id, titulo: title, descricao: '', disciplina: discipline, tipo: 'trabalho', prioridade: 'media', data_inicio: dueStart || null, data_entrega: due || null, labels: [] }).select('id').single()
      if (error || !data) { setToast(`Não foi possível criar a demanda: ${error?.message ?? 'erro desconhecido'}`); return }
      id = data.id
    }
    setCards((current) => [...current, { id, title, description: '', discipline, type: 'trabalho', priority: 'media', dueStart, due, column: column.id, tasks: [], labels: [] }])
    setShowNew(false)
    setNewCardColumn(null)
    setToast('Nova demanda criada')
    window.setTimeout(() => setToast(''), 2400)
  }

  async function addColumn() {
    const title = window.prompt('Nome da nova coluna')
    if (!title?.trim()) return
    if (!supabase || !boardId) {
      setToast('O quadro ainda está carregando')
      return
    }
    const { data: lastColumn, error: positionError } = await supabase
      .from('columns')
      .select('posicao')
      .eq('board_id', boardId)
      .order('posicao', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (positionError) {
      setToast(`Não foi possível verificar a posição da coluna: ${positionError.message}`)
      return
    }
    const position = (lastColumn?.posicao ?? 0) + 1000
    const { data, error } = await supabase.from('columns').insert({ board_id: boardId, nome: title.trim(), posicao: position, cor: '#8b5cf6' }).select('id, nome, cor').single()
    if (error || !data) {
      setToast(`Não foi possível criar a coluna: ${error?.message ?? 'erro desconhecido'}`)
      return
    }
    setColumns((current) => [...current, { id: data.id, title: data.nome, color: data.cor }])
    setToast('Coluna criada')
    window.setTimeout(() => setToast(''), 2400)
  }

  async function saveCard(updated: Card) {
    if (supabase && boardId) {
      const { error } = await supabase.from('cards').update({ titulo: updated.title, descricao: updated.description, disciplina: updated.discipline, tipo: updated.type, prioridade: updated.priority, data_inicio: updated.dueStart || null, data_entrega: updated.due || null, column_id: updated.column, labels: updated.labels }).eq('id', updated.id).eq('board_id', boardId)
      if (error) {
        setToast(`Não foi possível salvar a demanda: ${error.message}`)
        return
      }
      await supabase.from('tasks').delete().eq('card_id', updated.id)
      if (updated.tasks.length) {
        const { error: tasksError } = await supabase.from('tasks').insert(updated.tasks.map((task) => ({ card_id: updated.id, titulo: task.title, concluida: task.done, tempo_segundos: task.elapsedSeconds, timer_iniciado_em: task.timerStartedAt })))
        if (tasksError) {
          setToast(`A demanda foi salva, mas as tarefas falharam: ${tasksError.message}`)
          return
        }
      }
    }
    setCards((current) => current.map((card) => card.id === updated.id ? updated : card))
    setSelected(updated)
    setToast('Alterações salvas')
    window.setTimeout(() => setToast(''), 2400)
  }

  function resizeSidebar(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startWidth = sidebarWidth
    const move = (moveEvent: PointerEvent) => setSidebarWidth(Math.min(360, Math.max(210, startWidth + moveEvent.clientX - startX)))
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  async function signOut() {
    if (!supabase) {
      setAuthenticated(false)
      return
    }
    const { error } = await supabase.auth.signOut()
    if (error) {
      setToast(`Não foi possível sair: ${error.message}`)
      window.setTimeout(() => setToast(''), 3000)
      return
    }
    setToast('Você saiu da conta')
    window.setTimeout(() => setToast(''), 2400)
  }

  const displayName = user?.user_metadata?.nome || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário'
  const displayEmail = user?.email || 'Sessão local'
  const initials = displayName.slice(0, 2).toUpperCase()

  if (!sessionReady) return <div className="auth-loading">Carregando sua sessão...</div>
  if (!authenticated) return <AuthScreen />

  return (
    <div className={`app ${dark ? 'dark' : ''} ${activeView === 'board' ? 'board-layout' : ''}`}>
      <aside className={`sidebar ${sidebar ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`} style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
        <div className="brand"><div className="brand-mark">U</div><div className="brand-copy"><strong>UGD</strong><small>Unisc Demandas</small></div><button className="icon-btn mobile-close" onClick={() => setSidebar(false)}><X size={18} /></button><button className="icon-btn sidebar-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? 'Abrir menu lateral' : 'Recolher menu lateral'}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button></div>
        <div className="workspace"><span className="workspace-dot" /> 2026/2 <ChevronDown size={15} /></div>
        <nav>
          <button className={activeView === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => { changeView('overview'); setSidebar(false) }}><LayoutDashboard size={18} /><span>Visão geral</span></button>
          <button className={activeView === 'board' ? 'nav-item active' : 'nav-item'} onClick={() => { changeView('board'); setSidebar(false) }}><Columns3 size={18} /><span>Kanban</span></button>
          <button className={activeView === 'calendar' ? 'nav-item active' : 'nav-item'} onClick={() => { changeView('calendar'); setSidebar(false) }}><CalendarDays size={18} /><span>Calendário</span></button>
          <button className="nav-item settings-nav-item" onClick={() => { setShowSettings(true); setSidebar(false) }}><Settings size={18} /><span>Configurações</span></button>
          <div className="nav-label">Quadros</div>
          <button className="nav-item active-board"><Columns3 size={18} /><span>Demandas 2026/2</span><MoreHorizontal size={16} className="push" /></button>
          <button className="nav-item" onClick={() => { const name = window.prompt('Nome do novo quadro'); if (name?.trim()) setToast(`Quadro "${name.trim()}" criado`) }}><Plus size={18} /><span>Novo quadro</span></button>
        </nav><MotivationCat /><div className="sidebar-user"><div className="avatar">{initials}</div><div className="sidebar-user-info"><strong>{displayName}</strong><small>{displayEmail}</small></div><button className="logout-btn" onClick={signOut}><LogOut size={15} /><span>Sair</span></button><span className="app-version">UGD v1.1.0</span></div><div className="sidebar-resize" onPointerDown={resizeSidebar} title="Arraste para ajustar a largura do menu" />
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => { setShowSettings(true); setSidebar(false) }}><Settings size={18} /><span>Configurações</span></button>
          <button className="nav-item"><CircleHelp size={18} /><span>Ajuda</span></button>
          <div className="profile"><div className="avatar">{initials}</div><div><strong>{displayName}</strong><small>{displayEmail}</small></div><button className="icon-btn push" onClick={signOut} title="Sair da conta" aria-label="Sair da conta"><LogOut size={17} /></button></div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setSidebar(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Quadros</span><span>/</span><strong>Demandas 2026/2</strong></div>
          <div className="top-actions"><button className="icon-btn"><Bell size={19} /></button><button className="icon-btn" onClick={() => setDark(!dark)}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button><div className="top-user"><div className="avatar small">{initials}</div><div><strong>{displayName}</strong><small>{displayEmail}</small></div><button className="icon-btn" onClick={signOut} title="Sair da conta" aria-label="Sair da conta"><LogOut size={17} /></button></div></div>
        </header>
        <section className={`content ${activeView}-content`}>
          {activeView !== 'board' && <div className="page-heading"><div><div className="eyebrow"><span className="status-dot" /> SEMESTRE 2026/2</div><h1>{activeView === 'overview' ? 'Visão geral' : 'Calendário'}</h1><p>{activeView === 'overview' ? 'Acompanhe o andamento do seu semestre em um só lugar.' : 'Demandas 2026/2 · organize suas entregas com clareza.'}</p></div><div className="heading-actions">{activeView === 'overview' && <button className="secondary-btn" onClick={() => changeView('board')}><Columns3 size={17} /> Abrir Kanban</button>}{activeView === 'calendar' && <button className="secondary-btn" onClick={() => changeView('board')}><Columns3 size={17} /> Ver Kanban</button>}<button className="primary-btn" onClick={() => setShowNew(true)}><Plus size={18} /> Nova demanda</button></div></div>}
          {activeView === 'overview' && <div className="stats"><div><span className="stat-icon purple"><Target size={17} /></span><div><strong>{cards.length}</strong><small>Demandas totais</small></div></div><button className="stat-card" onClick={() => { setCalendarMode('week'); changeView('calendar') }} title="Abrir calendário na visualização semanal"><span className="stat-icon orange"><Clock3 size={17} /></span><div><strong>{cards.filter((c) => daysUntil(c.due) <= 7 && daysUntil(c.due) >= 0).length}</strong><small>Próximos 7 dias</small></div></button><button className="stat-card" onClick={openCompletedCards} title="Mostrar cards com todas as tarefas concluídas"><span className="stat-icon green"><Check size={17} /></span><div><strong>{cards.filter((c) => c.tasks.length > 0 && c.tasks.every((task) => task.done)).length}</strong><small>Concluídas</small></div></button><div><span className="stat-icon blue"><Archive size={17} /></span><div><strong>{(() => { const tasks = cards.flatMap((card) => card.tasks); return tasks.length ? Math.round(tasks.filter((task) => task.done).length / tasks.length * 100) : 0 })()}%</strong><small>Progresso médio</small></div></div></div>}
          {activeView === 'board' && <div className="kanban-topbar"><div><strong>Demandas 2026/2</strong><span>Quadro Kanban</span></div><div className="kanban-filters"><div className="search"><Search size={16} /><input placeholder="Buscar demandas..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><select value={activeColumn} onChange={(e) => setActiveColumn(e.target.value)}><option value="all">Todas as colunas</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select><select value={priority} onChange={(e) => setPriority(e.target.value as 'all' | Priority)}><option value="all">Todas prioridades</option>{Object.entries(priorityLabels).slice().reverse().map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className={`filter-btn ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters((current) => !current)} aria-expanded={showFilters}><Filter size={16} /> Filtros</button></div></div>}
          {activeView === 'calendar' && <div className="toolbar"><div className="view-tabs"><button className="selected" onClick={() => changeView('calendar')}><CalendarDays size={16} /> Calendário</button><button onClick={() => changeView('board')}><Columns3 size={16} /> Kanban</button></div><div className="filters"><div className="search"><Search size={16} /><input placeholder="Buscar demandas..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><select value={activeColumn} onChange={(e) => setActiveColumn(e.target.value)}><option value="all">Todas as colunas</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select><select value={priority} onChange={(e) => setPriority(e.target.value as 'all' | Priority)}><option value="all">Todas prioridades</option>{Object.entries(priorityLabels).slice().reverse().map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className={`filter-btn ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters((current) => !current)} aria-expanded={showFilters}><Filter size={16} /> Filtros</button></div></div>}
          {showFilters && activeView !== 'overview' && <div className="advanced-filters"><label>Tipo<select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | CardType)}><option value="all">Todos os tipos</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Disciplina<select value={disciplineFilter} onChange={(e) => setDisciplineFilter(e.target.value)}><option value="all">Todas as disciplinas</option>{disciplines.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}</select></label><button className="clear-filters" onClick={clearFilters}>Limpar filtros</button></div>}
          {activeView === 'overview' && <Overview cards={cards} onSelect={setSelected} onOpenBoard={() => changeView('board')} onOpenWeek={() => { setCalendarMode('week'); changeView('calendar') }} />}
          {activeView === 'board' && <Board columns={columns} cards={filteredCards} onMove={moveCard} onSelect={setSelected} onEdit={setSelected} onDuplicate={duplicateCard} onDelete={deleteCard} onRenameColumn={renameColumn} onDeleteColumn={deleteColumn} onChangeColor={async (id, color) => { if (!supabase || !boardId) { setToast('Esta coluna ainda não está conectada ao banco'); window.setTimeout(() => setToast(''), 3000); return } const { error } = await supabase.from('columns').update({ cor: color }).eq('id', id).eq('board_id', boardId); if (error) { setToast(`Não foi possível salvar a cor: ${error.message}`); window.setTimeout(() => setToast(''), 4000); return } setColumns((current) => current.map((column) => column.id === id ? { ...column, color } : column)); setToast('Cor da coluna salva'); window.setTimeout(() => setToast(''), 2400) }} onAdd={(columnId) => { setNewCardColumn(columnId); setShowNew(true) }} onAddColumn={addColumn} onReorder={reorderColumn} />}
          {activeView === 'calendar' && <CalendarView cards={filteredCards} onSelect={setSelected} initialMode={calendarMode} />}
        </section>
      </main>
      {selected && <CardModal card={selected} onClose={() => setSelected(null)} onSave={saveCard} />}
      {showNew && <NewCardModal onClose={() => { setShowNew(false); setNewCardColumn(null) }} onCreate={createCard} />}
      {showSettings && <SettingsModal dark={dark} compactSidebar={sidebarCollapsed} onDarkChange={setDark} onCompactSidebarChange={setSidebarCollapsed} onClose={() => setShowSettings(false)} />}
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  )
}

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setLoading(true)
    setMessage('')
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { nome: name } } })
    setLoading(false)
    if (result.error) setMessage(result.error.message)
    else {
      if (mode === 'login') window.localStorage.setItem('ugd-login-success', 'true')
      setMessage(mode === 'signup' ? 'Cadastro criado. Verifique seu e-mail para continuar.' : '')
    }
  }

  return <div className="auth-page"><div className="auth-cat" aria-hidden="true"><img src={chiquinho} alt="" /></div><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><img src={chiquinho} alt="Chiquinho" /></div><div><strong>UGD</strong><small>Unisc Demandas</small></div></div><div className="eyebrow">{mode === 'login' ? 'BEM-VINDO DE VOLTA' : 'COMECE AGORA'}</div><h1>{mode === 'login' ? 'Entre no seu espaço.' : 'Crie sua conta.'}</h1><p className="auth-subtitle">Organize suas demandas acadêmicas com clareza.</p><form onSubmit={submit}>{mode === 'signup' && <label>Nome<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" /></label>}<label>E-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@unisc.br" /></label><label>Senha<input required minLength={6} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>{message && <div className="auth-message">{message}</div>}<button className="primary-btn auth-submit" disabled={loading}>{loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button></form><button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>{mode === 'login' ? 'Ainda não tenho uma conta' : 'Já tenho uma conta'}</button>{mode === 'login' && <button className="auth-forgot" onClick={async () => { if (!supabase || !email) { setMessage('Informe seu e-mail para recuperar a senha.'); return }; const { error } = await supabase.auth.resetPasswordForEmail(email); setMessage(error?.message ?? 'Link de recuperação enviado.') }}>Esqueci minha senha</button>}</div></div>
}

type CatVoiceOptions = {
  dur: number
  pitch: number[][]
  mouth: number[][]
  f1: number[][]
  f2: number[][]
  amp: number[][]
  breath?: number
  jitter?: number
  vib?: number
  scale?: number
  rough?: { rate: number; depth: number }
  at?: number
  vol?: number
}

let catAudioContext: AudioContext | null = null
let catMaster: GainNode | null = null
let catNoiseBuffer: AudioBuffer | null = null
let catGlottalWave: PeriodicWave | null = null

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min)

function getCatAudioContext() {
  if (!catAudioContext) catAudioContext = new AudioContext()
  if (catAudioContext.state === 'suspended') void catAudioContext.resume()
  return catAudioContext
}

function getCatMaster(context: AudioContext) {
  if (!catMaster) {
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = -16
    compressor.ratio.value = 4
    compressor.attack.value = 0.005
    compressor.release.value = 0.15
    catMaster = context.createGain()
    catMaster.gain.value = 0.7
    catMaster.connect(compressor).connect(context.destination)
  }
  return catMaster
}

function getCatNoise(context: AudioContext) {
  if (!catNoiseBuffer) {
    catNoiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const data = catNoiseBuffer.getChannelData(0)
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
  }
  return catNoiseBuffer
}

function getCatGlottalWave(context: AudioContext) {
  if (!catGlottalWave) {
    const real = new Float32Array(48)
    const imaginary = new Float32Array(48)
    for (let index = 1; index < imaginary.length; index += 1) imaginary[index] = 1 / Math.pow(index, 1.25)
    catGlottalWave = context.createPeriodicWave(real, imaginary)
  }
  return catGlottalWave
}

function rampCatParameter(parameter: AudioParam, points: number[][], start: number, duration: number, multiplier = 1) {
  parameter.cancelScheduledValues(0)
  parameter.setValueAtTime(points[0][1] * multiplier, start)
  for (let index = 1; index < points.length; index += 1) {
    parameter.linearRampToValueAtTime(points[index][1] * multiplier, start + points[index][0] * duration)
  }
}

function playCatVoice(options: CatVoiceOptions) {
  const context = getCatAudioContext()
  const start = context.currentTime + 0.03 + (options.at || 0)
  const output = getCatMaster(context)
  const oscillator = context.createOscillator()
  oscillator.setPeriodicWave(getCatGlottalWave(context))
  rampCatParameter(oscillator.frequency, options.pitch, start, options.dur)

  const jitter = options.jitter ?? 12
  for (let offset = 0; offset < options.dur; offset += 0.025) {
    oscillator.detune.setTargetAtTime(randomBetween(-jitter, jitter), start + offset, 0.008)
  }

  const vibrato = context.createOscillator()
  vibrato.frequency.value = randomBetween(5, 7)
  const vibratoGain = context.createGain()
  vibratoGain.gain.value = options.vib ?? 14
  vibrato.connect(vibratoGain).connect(oscillator.detune)

  const mix = context.createGain()
  oscillator.connect(mix)
  const noise = context.createBufferSource()
  noise.buffer = getCatNoise(context)
  noise.loop = true
  const highPass = context.createBiquadFilter()
  highPass.type = 'highpass'
  highPass.frequency.value = 900
  const breath = context.createGain()
  breath.gain.value = options.breath ?? 0.12
  noise.connect(highPass).connect(breath).connect(mix)

  const mouth = context.createBiquadFilter()
  mouth.type = 'lowpass'
  mouth.Q.value = 0.7
  rampCatParameter(mouth.frequency, options.mouth, start, options.dur)
  mix.connect(mouth)

  const formants = context.createGain()
  const scale = options.scale || 1
  const thirdFormant = [[0, 3900 * scale], [1, 3700 * scale]]
  ;[[options.f1, 3, 1], [options.f2, 5, 0.75], [thirdFormant, 6, 0.35]].forEach(([points, quality, gain]) => {
    const bandPass = context.createBiquadFilter()
    bandPass.type = 'bandpass'
    bandPass.Q.value = quality as number
    rampCatParameter(bandPass.frequency, points as number[][], start, options.dur)
    const formantGain = context.createGain()
    formantGain.gain.value = gain as number
    mouth.connect(bandPass).connect(formantGain).connect(formants)
  })
  const dry = context.createGain()
  dry.gain.value = 0.2
  mouth.connect(dry).connect(formants)

  let finalNode: AudioNode = formants
  let roughOscillator: OscillatorNode | null = null
  if (options.rough) {
    const roughGain = context.createGain()
    roughGain.gain.value = 1 - options.rough.depth / 2
    roughOscillator = context.createOscillator()
    roughOscillator.frequency.value = options.rough.rate
    const roughModulation = context.createGain()
    roughModulation.gain.value = options.rough.depth / 2
    roughOscillator.connect(roughModulation).connect(roughGain.gain)
    formants.connect(roughGain)
    finalNode = roughGain
  }

  const envelope = context.createGain()
  envelope.gain.value = 0
  rampCatParameter(envelope.gain, options.amp, start, options.dur, options.vol || 1)
  finalNode.connect(envelope).connect(output)

  const nodes: AudioScheduledSourceNode[] = [oscillator, vibrato, noise]
  if (roughOscillator) nodes.push(roughOscillator)
  nodes.forEach((node) => {
    node.start(start)
    node.stop(start + options.dur + 0.1)
  })
}

function playAdultCatMeow() {
  const scale = randomBetween(0.92, 1.08)
  const duration = randomBetween(0.75, 1)
  playCatVoice({
    dur: duration,
    pitch: [[0, 480 * scale], [0.22, 760 * scale], [0.55, 720 * scale], [1, 470 * scale]],
    mouth: [[0, 350], [0.15, 5500], [0.8, 3500], [1, 1200]],
    f1: [[0, 450], [0.3, 1050], [0.65, 900], [1, 500]],
    f2: [[0, 2500], [0.25, 2300], [0.6, 1600], [1, 950]],
    amp: [[0, 0], [0.07, 1], [0.6, 0.85], [0.85, 0.4], [1, 0]],
    breath: 0.1,
    vol: 1.6,
  })
}

function playKittenMeow() {
  const scale = randomBetween(0.95, 1.1)
  const duration = randomBetween(0.35, 0.5)
  playCatVoice({
    dur: duration,
    scale: 1.2,
    pitch: [[0, 950 * scale], [0.3, 1300 * scale], [1, 1000 * scale]],
    mouth: [[0, 600], [0.2, 7000], [1, 4000]],
    f1: [[0, 700], [0.35, 1300], [1, 900]],
    f2: [[0, 2900], [0.4, 2600], [1, 1900]],
    amp: [[0, 0], [0.12, 1], [0.7, 0.7], [1, 0]],
    breath: 0.22,
    jitter: 25,
    vol: 1.4,
  })
}

function playTrill() {
  const scale = randomBetween(0.92, 1.08)
  const duration = randomBetween(0.45, 0.6)
  playCatVoice({
    dur: duration,
    pitch: [[0, 420 * scale], [0.6, 560 * scale], [1, 660 * scale]],
    mouth: [[0, 900], [0.7, 1400], [1, 2200]],
    f1: [[0, 500], [1, 650]],
    f2: [[0, 1500], [1, 1900]],
    amp: [[0, 0], [0.1, 1], [0.8, 0.9], [1, 0]],
    rough: { rate: randomBetween(26, 32), depth: 1.6 },
    breath: 0.05,
    vol: 2.6,
  })
}

function playChatter() {
  let start = 0
  const count = Math.floor(randomBetween(6, 9))
  for (let index = 0; index < count; index += 1) {
    playCatVoice({
      at: start,
      dur: randomBetween(0.05, 0.075),
      pitch: [[0, 1150], [1, 850]],
      mouth: [[0, 2000], [0.3, 7000], [1, 2000]],
      f1: [[0, 800], [1, 700]],
      f2: [[0, 2700], [1, 2300]],
      amp: [[0, 0], [0.15, 1], [1, 0]],
      breath: 0.5,
      jitter: 30,
      vol: randomBetween(1, 1.6),
    })
    start += randomBetween(0.09, 0.13)
  }
}

const catVocalizations = [
  playAdultCatMeow,
  playKittenMeow,
  playChatter,
  playTrill,
  playTrill,
  playTrill,
]

function MotivationCat() {
  const phrases = [
    'Você consegue!',
    'Se organiza para estudar um pouquinho no final de semana!',
    'Um passo de cada vez.',
    'Seu esforço vai valer a pena!',
    'Bora vencer essa demanda!',
    'Você está indo muito bem!',
    'Pausa rápida e depois foco!',
    'Seu futuro agradece o esforço de hoje!',
    'Estudar um pouquinho já faz diferença!',
    'Você é capaz!',
    'Eu confio em você!',
    'Só se organizar e começar!',
    'Você não precisa fazer tudo de uma vez.',
    'Acredite mais em você.',
    'Você já superou muita coisa.',
    'Seu ritmo também é válido.',
    'Errar faz parte de aprender.',
    'Você merece reconhecer seu esforço.',
    'Comece pelo mais simples.',
    'Você tem mais força do que imagina.',
    'Um pequeno progresso ainda é progresso.',
    'Não se compare: cada pessoa tem seu tempo.',
    'Você está aprendendo, e isso já é incrível.',
    'Respira, organiza e vai.',
    'Seu melhor de hoje já é suficiente.',
    'Você pode pedir ajuda quando precisar.',
    'Confie no processo.',
    'Você não está atrasado: está no seu caminho.',
    'Sua dedicação importa.',
    'Tenha paciência com você.',
    'Você consegue superar esta etapa.',
    'Faça uma coisa de cada vez.',
    'Você tem motivos para se orgulhar.',
    'Seu esforço não passa despercebido.',
    'Você é importante, mesmo nos dias difíceis.',
    'Continue: você está mais perto do que pensa.',
    'Hoje é um bom dia para recomeçar.',
  ]
  const [phrase, setPhrase] = useState(phrases[0])
  const [speechVisible, setSpeechVisible] = useState(false)
  const [happy, setHappy] = useState(false)
  const [bigMeow, setBigMeow] = useState(false)
  const [clickLevel, setClickLevel] = useState(0)
  const clickStreak = useRef(0)
  const clickLevelRef = useRef(0)
  const streakTimer = useRef<number | null>(null)

  useEffect(() => {
    let hideTimer: number | null = null
    const timer = window.setInterval(() => {
      if (Math.random() > 0.4) return
      setPhrase((current) => {
        const options = phrases.filter((item) => item !== current)
        return options[Math.floor(Math.random() * options.length)]
      })
      setSpeechVisible(true)
      if (hideTimer) window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => setSpeechVisible(false), 5200)
    }, 5000)
    return () => {
      window.clearInterval(timer)
      if (hideTimer) window.clearTimeout(hideTimer)
    }
  }, [])

  useEffect(() => {
    if (clickLevel === 0) return
    const timer = window.setTimeout(() => {
      clickLevelRef.current = Math.max(0, clickLevelRef.current - 1)
      setClickLevel(clickLevelRef.current)
    }, 750)
    return () => window.clearTimeout(timer)
  }, [clickLevel])

  function meow() {
    clickLevelRef.current = Math.min(6, clickLevelRef.current + 1)
    const isSuperMeow = clickLevelRef.current === 6
    setClickLevel(clickLevelRef.current)
    clickStreak.current += 1
    if (streakTimer.current) window.clearTimeout(streakTimer.current)
    streakTimer.current = window.setTimeout(() => { clickStreak.current = 0 }, 850)
    const isBigMeow = clickStreak.current >= 3 || isSuperMeow
    catVocalizations[Math.floor(Math.random() * catVocalizations.length)]()
    setHappy(true)
    setBigMeow(isBigMeow)
    window.setTimeout(() => { setHappy(false); setBigMeow(false) }, isBigMeow ? 1200 : 700)
  }

  return <div className={`motivation-cat ${happy ? 'happy' : ''} ${bigMeow ? 'big-meow' : ''} cat-level-${clickLevel}`}><div className={`cat-speech ${speechVisible ? 'visible' : ''}`}>{phrase}</div><button className="cat-button" onClick={meow} aria-label="Fazer o Chiquinho miar"><img src={chiquinho} alt="Chiquinho, o gato" /></button></div>
}

function Overview({ cards, onSelect, onOpenBoard, onOpenWeek }: { cards: Card[]; onSelect: (card: Card) => void; onOpenBoard: () => void; onOpenWeek: () => void }) {
  const upcoming = [...cards].filter((card) => daysUntil(card.due) >= 0 && daysUntil(card.due) <= 7).sort((a, b) => a.due.localeCompare(b.due))
  const totalTasks = cards.reduce((total, card) => total + card.tasks.length, 0)
  const completedTasks = cards.reduce((total, card) => total + card.tasks.filter((task) => task.done).length, 0)
  const progress = totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0
  return <div className="overview"><div className="overview-grid"><section className="overview-panel focus-panel"><div className="panel-heading"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Seu semestre em foco</h2></div><button className="secondary-btn" onClick={onOpenBoard}>Ver todas <Columns3 size={15} /></button></div><div className="focus-progress"><div className="focus-ring"><strong>{progress}%</strong><small>concluído</small></div><div><h3>Você está indo bem!</h3><p>Continue avançando nas suas demandas para manter o ritmo.</p><div className="progress large"><span style={{ width: `${progress}%` }} /></div></div></div></section><section className="overview-panel"><div className="panel-heading"><div><span className="eyebrow">PRÓXIMAS ENTREGAS</span><h2>Fique de olho</h2></div><button className="overview-icon-button" onClick={onOpenWeek} title="Abrir calendário da semana" aria-label="Abrir calendário da semana"><Clock3 size={18} className="muted-icon" /></button></div><div className="upcoming-list">{upcoming.length === 0 ? <p className="empty-state">Nenhuma demanda nesta semana.</p> : upcoming.map((card) => <button className="upcoming-item" key={card.id} onClick={() => onSelect(card)}><span className={`upcoming-date ${card.priority}`}><strong>{new Date(`${card.due}T12:00:00`).getDate()}</strong><small>nov</small></span><span><strong>{card.title}</strong><small>{card.discipline}</small></span><ChevronDown size={16} className="rotate-chevron" /></button>)}</div></section></div><section className="overview-panel quick-panel"><div className="panel-heading"><div><span className="eyebrow">ATALHOS</span><h2>Continue de onde parou</h2></div></div><div className="quick-actions"><button onClick={onOpenBoard}><Columns3 size={20} /><span><strong>Organizar Kanban</strong><small>Veja suas colunas e mova demandas</small></span><ChevronDown size={17} className="rotate-chevron" /></button><button onClick={() => upcoming[0] && onSelect(upcoming[0])}><CalendarDays size={20} /><span><strong>Revisar próxima entrega</strong><small>{upcoming[0]?.title}</small></span><ChevronDown size={17} className="rotate-chevron" /></button></div></section></div>
}

function Board({ columns, cards, onMove, onSelect, onEdit, onDuplicate, onDelete, onRenameColumn, onDeleteColumn, onChangeColor, onAdd, onAddColumn, onReorder }: { columns: typeof defaultColumns; cards: Card[]; onMove: (id: string, column: string, targetIndex?: number) => void; onSelect: (card: Card) => void; onEdit: (card: Card) => void; onDuplicate: (card: Card) => void; onDelete: (id: string) => void; onRenameColumn: (id: string) => void; onDeleteColumn: (id: string) => void; onChangeColor: (id: string, color: string) => void; onAdd: (columnId: string) => void; onAddColumn: () => void; onReorder: (id: string, direction: 'up' | 'down') => void }) {
  const [openColumnMenu, setOpenColumnMenu] = useState<string | null>(null)
  const [draggingCard, setDraggingCard] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ columnId: string; index: number } | null>(null)
  return <div className="board">{columns.map((column, index) => {
    const columnCards = cards.filter((card) => card.column === column.id)
    return <div className={`kanban-column ${draggingCard ? 'drag-target-active' : ''}`} key={column.id} onDragOver={(event) => { event.preventDefault(); if (!draggingCard) return; const rect = event.currentTarget.getBoundingClientRect(); const cardsArea = event.currentTarget.querySelector('.cards') as HTMLElement | null; const cardElements = cardsArea ? Array.from(cardsArea.querySelectorAll('.card-item')) : []; let targetIndex = columnCards.length; const relativeY = event.clientY - rect.top; cardElements.forEach((element, cardIndex) => { if (relativeY < element.getBoundingClientRect().top - rect.top + element.getBoundingClientRect().height / 2 && targetIndex === columnCards.length) targetIndex = cardIndex }); setDropTarget({ columnId: column.id, index: targetIndex }) }} onDrop={(event) => { event.preventDefault(); if (draggingCard) onMove(draggingCard, column.id, dropTarget?.columnId === column.id ? dropTarget.index : columnCards.length); setDraggingCard(null); setDropTarget(null) }}><div className="column-color-band" style={{ background: column.color }} /><div className="column-heading"><div><strong>{column.title}</strong><span className="count">{columnCards.length}</span></div><div className="column-actions"><button className="icon-btn" onClick={() => onReorder(column.id, 'up')} disabled={index === 0} title="Mover coluna para a esquerda"><ArrowLeft size={14} /></button><button className="icon-btn" onClick={() => onReorder(column.id, 'down')} disabled={index === columns.length - 1} title="Mover coluna para a direita"><ArrowRight size={14} /></button><div className="card-menu-wrap"><button className="icon-btn" title="Opções da coluna" aria-expanded={openColumnMenu === column.id} onClick={() => setOpenColumnMenu((current) => current === column.id ? null : column.id)}><MoreHorizontal size={18} /></button>{openColumnMenu === column.id && <div className="card-menu column-menu"><span className="column-menu-label">Cor da coluna</span><div className="column-colors">{columnColors.map((color) => <button key={color} className={`column-color-option ${column.color === color ? 'selected' : ''}`} style={{ background: color }} onClick={() => onChangeColor(column.id, color)} title={`Usar cor ${color}`} aria-label={`Usar cor ${color}`} />)}</div><button onClick={() => { setOpenColumnMenu(null); onRenameColumn(column.id) }}>Renomear coluna</button><button className="danger" onClick={() => { setOpenColumnMenu(null); onDeleteColumn(column.id) }}>Excluir coluna</button></div>}</div></div></div><div className="cards">{columnCards.map((card, cardIndex) => <div key={card.id}>{dropTarget?.columnId === column.id && dropTarget.index === cardIndex && draggingCard !== card.id && <div className="card-drop-placeholder">Soltar aqui</div>}<CardItem card={card} onSelect={() => onSelect(card)} onMove={onMove} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} onDragStart={() => setDraggingCard(card.id)} onDragEnd={() => { setDraggingCard(null); setDropTarget(null) }} /></div>)}{dropTarget?.columnId === column.id && dropTarget.index === columnCards.length && <div className="card-drop-placeholder">Soltar aqui</div>}<button className="add-card" onClick={() => onAdd(column.id)}><Plus size={16} /> Adicionar demanda</button></div></div>
  })}<button className="add-column" onClick={onAddColumn}><Plus size={17} /> Adicionar coluna</button></div>
}

function CardItem({ card, onSelect, onMove, onEdit, onDuplicate, onDelete, onDragStart, onDragEnd }: { card: Card; onSelect: () => void; onMove: (id: string, column: string) => void; onEdit: (card: Card) => void; onDuplicate: (card: Card) => void; onDelete: (id: string) => void; onDragStart: () => void; onDragEnd: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const done = card.tasks.filter((task) => task.done).length
  const remaining = daysUntil(card.due)
  return <article className="card-item" draggable onDragStart={(event) => { event.stopPropagation(); onDragStart() }} onDragEnd={onDragEnd} onClick={onSelect}><div className="card-top"><span className={`type-chip ${card.type}`}>{typeLabels[card.type]}</span><div className="card-menu-wrap"><button className="icon-btn" aria-label="Opções da demanda" aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); setMenuOpen((current) => !current) }}><MoreHorizontal size={17} /></button>{menuOpen && <div className="card-menu" onClick={(event) => event.stopPropagation()}><button onClick={() => { setMenuOpen(false); onEdit(card) }}>Editar demanda</button><button onClick={() => { setMenuOpen(false); onDuplicate(card) }}>Duplicar demanda</button><button className="danger" onClick={() => { setMenuOpen(false); if (window.confirm('Excluir esta demanda?')) onDelete(card.id) }}>Excluir demanda</button></div>}</div></div><h3>{card.title}</h3>{card.discipline && <p className="discipline">{card.discipline}</p>}<div className="card-meta"><span className={`priority ${card.priority}`}><i /> {priorityLabels[card.priority]}</span>{card.due && <span className={`due ${remaining < 0 ? 'late' : remaining <= 2 ? 'soon' : ''}`}><Clock3 size={13} /> {card.dueStart && card.dueStart !== card.due ? `${new Date(`${card.dueStart}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ` : ''}{new Date(`${card.due}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>}</div>{card.tasks.length > 0 && <div className="progress-wrap"><div className="progress-label"><span>Progresso</span><span>{done}/{card.tasks.length}</span></div><div className="progress"><span style={{ width: `${done / card.tasks.length * 100}%` }} /></div></div>}<div className="card-footer"><div className="mini-avatar">PR</div><select value={card.column} onClick={(event) => event.stopPropagation()} onChange={(event) => { event.stopPropagation(); onMove(card.id, event.target.value) }} aria-label="Mover card"><option value="todo">A fazer</option><option value="doing">Em andamento</option><option value="review">Em revisão</option><option value="done">Concluído</option></select></div></article>
}

function SettingsModal({ dark, compactSidebar, onDarkChange, onCompactSidebarChange, onClose }: { dark: boolean; compactSidebar: boolean; onDarkChange: (value: boolean) => void; onCompactSidebarChange: (value: boolean) => void; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal settings-modal"><header className="settings-header"><div><span className="eyebrow">PREFERÊNCIAS</span><h2>Configurações</h2><p>Personalize a forma como o UGD funciona para você.</p></div><button className="icon-btn" onClick={onClose} aria-label="Fechar configurações"><X size={20} /></button></header><div className="settings-list"><label className="settings-option"><span><strong>Tema escuro</strong><small>Usar o tema grafite em toda a aplicação</small></span><input type="checkbox" checked={dark} onChange={(event) => onDarkChange(event.target.checked)} /></label><label className="settings-option"><span><strong>Menu lateral compacto</strong><small>Recolher o menu para liberar espaço na tela</small></span><input type="checkbox" checked={compactSidebar} onChange={(event) => onCompactSidebarChange(event.target.checked)} /></label></div><footer className="settings-footer"><button className="primary-btn" onClick={onClose}>Concluído</button></footer></div></div>
}

function CalendarView({ cards, onSelect, initialMode }: { cards: Card[]; onSelect: (card: Card) => void; initialMode: 'month' | 'week' | 'list' }) {
  const [month, setMonth] = useState(new Date(2026, 10, 1))
  const [mode, setMode] = useState<'month' | 'week' | 'list'>(initialMode)
  const [weekOffset, setWeekOffset] = useState(2)
  const monthName = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1)
  const moveCalendar = (amount: number) => {
    if (mode === 'week') {
      setWeekOffset((current) => current + amount)
      return
    }
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1))
    setWeekOffset(0)
  }
  const cardDate = (card: Card) => new Date(`${card.due}T12:00:00`)
  const datedCards = cards.filter((card) => card.due)
  const monthCards = datedCards.filter((card) => cardDate(card).getFullYear() === month.getFullYear() && cardDate(card).getMonth() === month.getMonth()).sort((a, b) => a.due.localeCompare(b.due))
  const weekStart = useMemo(() => {
    const anchor = new Date(month.getFullYear(), month.getMonth(), 1 + weekOffset * 7)
    const mondayOffset = (anchor.getDay() + 6) % 7
    anchor.setDate(anchor.getDate() - mondayOffset)
    return anchor
  }, [month, weekOffset])
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + index)
    return date
  })
  const weekMonthName = weekStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const isSameDay = (first: Date, second: Date) => first.toDateString() === second.toDateString()
  const [today] = useState(() => new Date())
  useEffect(() => {
    setMode(initialMode)
    if (initialMode === 'week') setWeekOffset(2)
  }, [initialMode])
  return <div className="calendar"><div className="calendar-header"><button onClick={() => moveCalendar(-1)} aria-label={mode === 'week' ? 'Semana anterior' : 'Mês anterior'}>‹</button><strong>{mode === 'week' ? weekMonthName : monthName}</strong><button onClick={() => moveCalendar(1)} aria-label={mode === 'week' ? 'Próxima semana' : 'Próximo mês'}>›</button><div className="calendar-modes"><button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>Mês</button><button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>Semana</button><button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>Lista</button></div></div>{mode === 'list' && <div className="calendar-list">{monthCards.length === 0 ? <p>Nenhuma entrega neste mês.</p> : monthCards.map((card) => <button className="calendar-list-item" key={card.id} onClick={() => onSelect(card)}><span className={`upcoming-date ${card.priority}`}><strong>{cardDate(card).getDate()}</strong><small>{cardDate(card).toLocaleDateString('pt-BR', { month: 'short' })}</small></span><span><strong>{card.title}</strong><small>{card.discipline}</small></span></button>)}</div>}{mode === 'week' && <div className="calendar-week"><div className="week-grid">{weekDays.map((date) => { const dayCards = datedCards.filter((card) => isSameDay(cardDate(card), date)).sort((a, b) => a.due.localeCompare(b.due)); return <section className={`week-day ${isSameDay(date, today) ? 'today' : ''}`} key={date.toISOString()}><header><span>{date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span><strong>{date.getDate()}</strong></header><div className="week-events">{dayCards.length === 0 ? <span className="week-empty">Sem entregas</span> : dayCards.map((card) => <button className={`week-event ${card.priority}`} key={card.id} onClick={() => onSelect(card)}><strong>{card.title}</strong><small>{card.discipline || typeLabels[card.type]}</small></button>)}</div></section> })}</div></div>}{mode === 'month' && <><div className="weekdays">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{Array.from({ length: firstDay }).map((_, index) => <span key={`empty-${index}`} />)}{days.map((day) => { const dayCards = datedCards.filter((card) => { const date = cardDate(card); return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth() && date.getDate() === day }); const date = new Date(month.getFullYear(), month.getMonth(), day); return <div className={`day ${isSameDay(date, today) ? 'today' : ''}`} key={day}><span>{day}</span>{dayCards.map((card) => <button className={`event ${card.priority}`} key={card.id} onClick={() => onSelect(card)}>{card.title}</button>)}</div> })}</div></>}</div>
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return `${hours > 0 ? `${hours}h ` : ''}${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function CardModal({ card, onClose, onSave }: { card: Card; onClose: () => void; onSave: (card: Card) => void }) {
  const [draft, setDraft] = useState(card)
  const [newTask, setNewTask] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [isDateRange, setIsDateRange] = useState(Boolean(card.dueStart && card.dueStart !== card.due))
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  function taskElapsed(task: Task) {
    return task.elapsedSeconds + (task.timerStartedAt ? Math.max(0, Math.floor((now - new Date(task.timerStartedAt).getTime()) / 1000)) : 0)
  }
  function persistTask(taskId: string, changes: Partial<Task>) {
    const updated = { ...draft, tasks: draft.tasks.map((task) => task.id === taskId ? { ...task, ...changes } : task) }
    setDraft(updated)
    onSave(updated)
  }
  function toggleTimer(task: Task) {
    if (task.timerStartedAt) {
      const elapsedSeconds = taskElapsed(task)
      persistTask(task.id, { elapsedSeconds, timerStartedAt: null })
    } else {
      persistTask(task.id, { timerStartedAt: new Date().toISOString() })
    }
  }
  function addTask() { if (!newTask.trim()) return; setDraft({ ...draft, tasks: [...draft.tasks, { id: crypto.randomUUID(), title: newTask.trim(), done: false, elapsedSeconds: 0, timerStartedAt: null }] }); setNewTask('') }
  const completed = draft.tasks.filter((task) => task.done).length
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal card-detail-modal"><header className="detail-header"><span className={`type-chip ${draft.type}`}>{typeLabels[draft.type]}</span><span className="detail-path">Demandas 2026/2 / {draft.title}</span><button className="icon-btn" onClick={onClose} aria-label="Fechar detalhe"><X size={20} /></button></header><div className="detail-grid"><section className="detail-left"><label className="detail-label">Título<input className="detail-title-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label><label>Descrição<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={6} placeholder="Adicione uma descrição..." /></label><div className="detail-labels">{draft.labels.map((label) => <span key={label}>{label}</span>)}</div></section><section className="detail-center"><div className="detail-section-heading"><div><span className="eyebrow">EXECUÇÃO</span><h2>Tarefas</h2></div><strong>{completed}/{draft.tasks.length}</strong></div><div className="detail-progress"><span style={{ width: `${draft.tasks.length ? completed / draft.tasks.length * 100 : 0}%` }} /></div>  <div className="detail-tasks">{draft.tasks.map((task) => <div className="task-row" key={task.id}><button className={`check ${task.done ? 'checked' : ''}`} onClick={() => setDraft({ ...draft, tasks: draft.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) })}>{task.done && <Check size={13} />}</button><span className={task.done ? 'completed' : ''}>{task.title}</span><span className="task-timer-value">{formatDuration(taskElapsed(task))}</span><button className="task-timer-btn" onClick={() => toggleTimer(task)} title={task.timerStartedAt ? 'Pausar timer' : 'Continuar timer'}>{task.timerStartedAt ? 'Pausar' : task.elapsedSeconds > 0 ? 'Continuar' : 'Iniciar'}</button><button className="icon-btn" onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter((item) => item.id !== task.id) })}><X size={14} /></button></div>)}</div><div className="add-task"><input placeholder="Adicionar tarefa..." value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} /><button className="secondary-btn" onClick={addTask}><Plus size={15} /> Adicionar</button></div><div className="activity"><div className="detail-section-heading"><div><span className="eyebrow">HISTÓRICO</span><h2>Atividade</h2></div></div><div className="activity-item"><span className="activity-dot" /><div><strong>Demanda criada</strong><small>Você adicionou esta demanda ao quadro</small></div></div><div className="activity-item"><span className="activity-dot purple-dot" /><div><strong>Última atualização</strong><small>Informações mantidas no quadro 2026/2</small></div></div></div></section><aside className="detail-right"><div className="detail-section-heading"><div><span className="eyebrow">DETALHES</span><h2>Informações</h2></div></div><label>Disciplina<input value={draft.discipline} onChange={(e) => setDraft({ ...draft, discipline: e.target.value })} /></label>  {!isDateRange && <label>Data de entrega<input type="date" value={draft.due} onChange={(e) => setDraft({ ...draft, dueStart: '', due: e.target.value })} /></label>}<button type="button" className={`date-toggle ${isDateRange ? 'active' : ''}`} onClick={() => { const next = !isDateRange; setIsDateRange(next); setDraft({ ...draft, dueStart: next ? (draft.dueStart || draft.due) : '', due: draft.due }) }} aria-pressed={isDateRange}><span className="date-toggle-indicator" /> Usar faixa de datas</button>{isDateRange && <div className="date-range"><label>De<input type="date" value={draft.dueStart || draft.due} onChange={(e) => setDraft({ ...draft, dueStart: e.target.value })} /></label><label>Até<input type="date" value={draft.due} min={draft.dueStart || undefined} onChange={(e) => setDraft({ ...draft, due: e.target.value })} /></label></div>}<label>Tipo<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CardType })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Prioridade<select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="detail-owner"><div className="mini-avatar">PR</div><div><strong>Responsável</strong><small>Pablo Renan</small></div></div></aside></div><footer className="detail-footer"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" onClick={() => onSave(draft)}>Salvar alterações</button></footer></div></div>
}

function NewCardModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, discipline: string, dueStart: string, due: string) => void }) {
  const [title, setTitle] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [isDateRange, setIsDateRange] = useState(false)
  const [dueStart, setDueStart] = useState('')
  const [due, setDue] = useState('')
  return <div className="modal-backdrop"><div className="modal small-modal"><div className="modal-header"><div><span className="eyebrow">NOVA DEMANDA</span><h2>O que precisa ser feito?</h2></div><button className="icon-btn" onClick={onClose}><X size={20} /></button></div><label>Título<input autoFocus placeholder="Ex.: Lista de exercícios 3" value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>Disciplina<input placeholder="Ex.: Estruturas de Dados" value={discipline} onChange={(e) => setDiscipline(e.target.value)} /></label>  <button type="button" className={`date-toggle ${isDateRange ? 'active' : ''}`} onClick={() => setIsDateRange((current) => !current)} aria-pressed={isDateRange}><span className="date-toggle-indicator" /> Usar faixa de datas</button>{isDateRange ? <div className="date-range"><label>De<input type="date" value={dueStart} onChange={(e) => setDueStart(e.target.value)} /></label><label>Até<input type="date" value={due} min={dueStart} onChange={(e) => setDue(e.target.value)} /></label></div> : <label>Data de entrega (opcional)<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>}<div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={!title.trim() || (isDateRange && (!dueStart || !due))} onClick={() => onCreate(title, discipline, isDateRange ? dueStart : '', due)}>Criar demanda</button></div></div></div>
}

export default App
