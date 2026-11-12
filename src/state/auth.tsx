import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createDemoApi, createSupabaseApi, type Api } from '../lib/api'
import { demoMode, supabase } from '../lib/supabase'

export type AuthUser = { id: string; email: string; name: string }

type AuthValue = {
  status: 'loading' | 'in' | 'out' | 'unconfigured'
  user: AuthUser | null
  api: Api | null
  /** Verdadeiro quando o usuário chegou pelo link de "esqueci minha senha". */
  recovering: boolean
  finishRecovery: () => void
  signOut: () => Promise<string | null>
}

const AuthContext = createContext<AuthValue | null>(null)

const demoUser: AuthUser = { id: 'demo', email: 'modo demonstração', name: 'Visitante' }
let demoApi: Api | null = null

type SessionUser = { id: string; email?: string; user_metadata?: { nome?: string; name?: string } }

function toUser(user: SessionUser): AuthUser {
  const email = user.email ?? ''
  return { id: user.id, email, name: user.user_metadata?.nome || user.user_metadata?.name || email.split('@')[0] || 'Você' }
}

export function AuthProvider({ children, api: injectedApi }: { children: ReactNode; api?: Api }) {
  const local = Boolean(injectedApi) || demoMode
  const [status, setStatus] = useState<AuthValue['status']>(local ? 'in' : supabase ? 'loading' : 'unconfigured')
  const [user, setUser] = useState<AuthUser | null>(local ? demoUser : null)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (local || !supabase) return
    // `onAuthStateChange` dispara também ao voltar para a aba e ao renovar o token.
    // Só trocamos o usuário quando o id muda, para não recarregar o quadro à toa.
    const apply = (next: SessionUser | null | undefined) => {
      setUser((current) => {
        if (!next) return null
        const mapped = toUser(next)
        return current && current.id === mapped.id && current.name === mapped.name && current.email === mapped.email ? current : mapped
      })
      setStatus(next ? 'in' : 'out')
    }
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      apply(session?.user)
    })
    return () => data.subscription.unsubscribe()
  }, [local])

  const userId = user?.id
  const api = useMemo<Api | null>(() => {
    if (injectedApi) return injectedApi
    if (!userId) return null
    if (demoMode) return (demoApi ??= createDemoApi())
    return supabase ? createSupabaseApi(supabase, userId) : null
  }, [injectedApi, userId])

  const value = useMemo<AuthValue>(() => ({
    status,
    user,
    api,
    recovering,
    finishRecovery: () => setRecovering(false),
    async signOut() {
      if (!supabase || local) return 'No modo demonstração não há conta para sair.'
      const { error } = await supabase.auth.signOut()
      return error ? 'Não foi possível sair. Tente novamente.' : null
    },
  }), [status, user, api, recovering, local])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return value
}
