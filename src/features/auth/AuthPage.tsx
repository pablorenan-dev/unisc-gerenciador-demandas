import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { friendlyError, supabase } from '../../lib/supabase'
import { Chiquinho } from '../../mascot/Chiquinho'
import { meow } from '../../mascot/voice'
import { useAuth } from '../../state/auth'
import type { Mood } from '../../state/feedback'

type Mode = 'login' | 'signup' | 'forgot'

const copy: Record<Mode, { eyebrow: string; title: string; submit: string }> = {
  login: { eyebrow: 'Bem-vindo de volta', title: 'Entre no seu espaço.', submit: 'Entrar' },
  signup: { eyebrow: 'Comece agora', title: 'Crie sua conta.', submit: 'Criar conta' },
  forgot: { eyebrow: 'Acontece', title: 'Recuperar a senha.', submit: 'Enviar link' },
}

export function AuthLayout({ mood, children }: { mood: Mood; children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__art">
        <button type="button" className="auth__cat" onClick={() => meow()} aria-label="Fazer o Chiquinho miar">
          <Chiquinho pose="sentado" mood={mood} size={300} alt="Chiquinho, um gato tigrado, sentado igual gente no sofá" />
        </button>
        <p className="auth__caption">Este é o Chiquinho. Ele senta assim mesmo.</p>
      </div>
      <main className="auth__card">
        <div className="brand brand--static"><Chiquinho size={40} /><span className="brand__name">UGD</span><span className="brand__tag">Demandas com o Chiquinho</span></div>
        {children}
      </main>
    </div>
  )
}

export function AuthPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  if (status === 'in') return <Navigate to="/" replace />

  const change = (next: Mode) => { setMode(next); setMessage(null) }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    setMessage(null)
    const origin = window.location.origin
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage({ kind: 'error', text: friendlyError(error, 'Não foi possível entrar.') })
      else navigate('/', { replace: true })
    } else if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { nome: name.trim() }, emailRedirectTo: origin } })
      if (error) setMessage({ kind: 'error', text: friendlyError(error, 'Não foi possível criar a conta.') })
      else if (data.session) navigate('/', { replace: true })
      else setMessage({ kind: 'ok', text: 'Quase lá! Enviamos um link de confirmação para o seu e-mail.' })
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/redefinir-senha` })
      // Mesma resposta exista ou não a conta: não revelamos quais e-mails estão cadastrados.
      if (error && /rate limit|too many|security purposes/i.test(error.message)) setMessage({ kind: 'error', text: friendlyError(error) })
      else setMessage({ kind: 'ok', text: 'Se existir uma conta com este e-mail, o link de recuperação está a caminho.' })
    }
    setBusy(false)
  }

  const text = copy[mode]
  return (
    <AuthLayout mood={message?.kind === 'error' ? 'worried' : message?.kind === 'ok' ? 'happy' : 'idle'}>
      <p className="eyebrow">{text.eyebrow}</p>
      <h1>{text.title}</h1>
      <p className="auth__lead">{mode === 'forgot' ? 'Informe seu e-mail e enviamos um link para criar uma senha nova.' : 'Organize trabalhos, provas e leituras, e chegue no fim de semana sabendo o que focar.'}</p>
      <form className="form" onSubmit={submit}>
        {mode === 'signup' && <label className="field"><span>Nome</span><input className="input" required maxLength={80} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Como quer ser chamado" /></label>}
        <label className="field"><span>E-mail</span><input className="input" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@email.com" /></label>
        {mode !== 'forgot' && (
          <label className="field"><span>Senha</span>
            <input className="input" required type="password" minLength={mode === 'signup' ? 8 : undefined} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'Mínimo de 8 caracteres' : 'Sua senha'} />
          </label>
        )}
        {message && <p className={`notice notice--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Aguarde…' : text.submit}</button>
      </form>
      <div className="auth__links">
        {mode === 'login' && <><button type="button" className="link" onClick={() => change('signup')}>Criar uma conta</button><button type="button" className="link" onClick={() => change('forgot')}>Esqueci minha senha</button></>}
        {mode !== 'login' && <button type="button" className="link" onClick={() => change('login')}>Já tenho conta, quero entrar</button>}
      </div>
    </AuthLayout>
  )
}

/** Destino do link de "esqueci minha senha": define a nova senha antes de entrar no app. */
export function ResetPasswordPage() {
  const { status, recovering, finishRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (status === 'loading') return <AuthLayout mood="thinking"><p className="auth__lead" role="status">Conferindo o link…</p></AuthLayout>
  if (status !== 'in') {
    return (
      <AuthLayout mood="worried">
        <h1>Link inválido ou expirado.</h1>
        <p className="auth__lead">Peça um novo link de recuperação na tela de entrada.</p>
        <button type="button" className="btn btn--primary btn--block" onClick={() => navigate('/login')}>Voltar para a entrada</button>
      </AuthLayout>
    )
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase || busy) return
    if (password !== again) { setError('As duas senhas não são iguais.'); return }
    setBusy(true)
    const { error: failure } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (failure) { setError(friendlyError(failure, 'Não foi possível salvar a nova senha.')); return }
    finishRecovery()
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout mood={error ? 'worried' : 'curious'}>
      <p className="eyebrow">{recovering ? 'Recuperação de senha' : 'Segurança'}</p>
      <h1>Crie uma senha nova.</h1>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Nova senha</span><input className="input" required type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} placeholder="Mínimo de 8 caracteres" /></label>
        <label className="field"><span>Repita a senha</span><input className="input" required type="password" minLength={8} autoComplete="new-password" value={again} onChange={(event) => { setAgain(event.target.value); setError('') }} /></label>
        {error && <p className="notice notice--error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
      </form>
    </AuthLayout>
  )
}
