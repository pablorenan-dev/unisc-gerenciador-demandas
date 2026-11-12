import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Link, MemoryRouter, Navigate, Outlet, Route, Routes, useNavigate, useOutletContext } from 'react-router-dom'
import type { Api } from './lib/api'
import { AuthPage, ResetPasswordPage } from './features/auth/AuthPage'
import { OverviewView } from './features/overview/OverviewView'
import { BoardLayout } from './features/shell/BoardLayout'
import { StatePanel } from './features/shell/StatePanel'
import { Toasts } from './mascot/Companion'
import { AuthProvider, useAuth } from './state/auth'
import { useBoards, type BoardsState } from './state/board'

// Kanban (com a biblioteca de arraste) e Calendário só são baixados quando abertos.
const BoardView = lazy(() => import('./features/board/BoardView'))
const CalendarView = lazy(() => import('./features/calendar/CalendarView'))
const loadingView = <StatePanel mood="thinking" title="Abrindo…" busy />

/** Área logada: carrega os quadros do usuário e entrega para as rotas filhas. */
function Shell() {
  const { status, api, recovering } = useAuth()
  const navigate = useNavigate()

  // Chegou pelo link de recuperação: primeiro define a senha nova.
  useEffect(() => { if (recovering) navigate('/redefinir-senha', { replace: true }) }, [recovering, navigate])

  if (status === 'unconfigured') return <Centered><StatePanel mood="oops" title="O app não foi configurado." text="As variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não estão definidas neste build." /></Centered>
  if (status === 'loading') return <Centered><StatePanel mood="thinking" title="Abrindo sua sessão…" busy /></Centered>
  if (status === 'out' || !api) return <Navigate to="/login" replace />
  return <Boards api={api} />
}

function Boards({ api }: { api: Api }) {
  const boards = useBoards(api)
  if (boards.status === 'loading') return <Centered><StatePanel mood="thinking" title="Buscando seus quadros…" busy /></Centered>
  if (boards.status === 'error') return <Centered><StatePanel mood="oops" title="Não consegui carregar seus quadros." text="Verifique sua conexão. Seus dados continuam salvos." action={<button type="button" className="btn btn--primary" onClick={boards.retry}>Tentar de novo</button>} /></Centered>
  return <Outlet context={boards} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="app"><main className="main main--center">{children}</main></div>
}

function Home() {
  const boards = useOutletContext<BoardsState>()
  let last: string | null = null
  try { last = window.localStorage.getItem('ugd-last-board') } catch { /* ignora */ }
  const target = boards.boards.find((board) => board.id === last) ?? boards.boards[0]
  return target ? <Navigate to={`/q/${target.id}`} replace /> : null
}

function NotFound() {
  return (
    <Centered>
      <StatePanel pose="sentado" mood="curious" title="404: o Chiquinho sentou em cima desta página." text="O endereço não existe ou mudou de lugar." action={<Link className="btn btn--primary" to="/">Voltar para o início</Link>} />
    </Centered>
  )
}

export function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="q/:boardId" element={<BoardLayout />}>
            <Route index element={<OverviewView />} />
            <Route path="kanban" element={<Suspense fallback={loadingView}><BoardView /></Suspense>} />
            <Route path="calendario" element={<Suspense fallback={loadingView}><CalendarView /></Suspense>} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toasts />
    </>
  )
}

/** Se algo quebrar na renderização, o usuário vê uma saída em vez de uma tela em branco. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <Centered><StatePanel mood="oops" title="Eita, derrubei alguma coisa." text="Um erro inesperado aconteceu. Seus dados salvos continuam seguros." action={<button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>Recarregar</button>} /></Centered>
  }
}

/** `api` e `initialPath` existem para os testes; em produção o app usa o Supabase e a URL do navegador. */
export default function App({ api, initialPath }: { api?: Api; initialPath?: string }) {
  const routes = <ErrorBoundary><AuthProvider api={api}><AppRoutes /></AuthProvider></ErrorBoundary>
  return initialPath ? <MemoryRouter initialEntries={[initialPath]}>{routes}</MemoryRouter> : <BrowserRouter>{routes}</BrowserRouter>
}
