import { useState } from 'react'
import { friendlyError, supabase } from '../../lib/supabase'
import { Chiquinho } from '../../mascot/Chiquinho'
import { meow } from '../../mascot/voice'
import { useAuth } from '../../state/auth'
import { toast } from '../../state/feedback'
import { setPrefs, usePrefs, type Theme } from '../../state/prefs'
import { Dialog } from '../../ui/Dialog'

const themes: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Igual ao sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
]

/** Configurações: tudo que é "sobre mim e sobre o app", não sobre um quadro específico. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const prefs = usePrefs()
  const { user, api, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function changePassword(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase || password.length < 8) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) toast.error(friendlyError(error, 'Não foi possível trocar a senha.'))
    else { setPassword(''); toast.success('Senha alterada.') }
  }

  async function deleteAccount() {
    if (!api || confirmText !== 'EXCLUIR') return
    setDeleting(true)
    try {
      await api.deleteAccount()
      await signOut()
    } catch (error) {
      const missing = /delete_my_account|PGRST202|schema cache/i.test(`${(error as { code?: string }).code ?? ''} ${(error as Error).message}`)
      toast.error(missing ? 'A exclusão de conta ainda não foi ativada no servidor. Fale com o suporte.' : 'Não foi possível excluir a conta. Tente novamente.')
      setDeleting(false)
    }
  }

  return (
    <Dialog title="Configurações" eyebrow="Preferências" onClose={onClose} footer={<button type="button" className="btn btn--primary" onClick={onClose}>Concluído</button>}>
      <div className="settings">
        <section className="settings__section">
          <h3>Aparência</h3>
          <div className="segmented" role="radiogroup" aria-label="Tema">
            {themes.map((theme) => (
              <button key={theme.value} type="button" role="radio" aria-checked={prefs.theme === theme.value} className={prefs.theme === theme.value ? 'is-active' : ''} onClick={() => setPrefs({ theme: theme.value })}>{theme.label}</button>
            ))}
          </div>
        </section>

        <section className="settings__section">
          <h3>Chiquinho</h3>
          <label className="switch switch--row">
            <span><strong>Som</strong><small>Ele mia quando recebe carinho.</small></span>
            <input type="checkbox" checked={prefs.sound} onChange={(event) => { setPrefs({ sound: event.target.checked }); if (event.target.checked) meow('kitten') }} />
          </label>
          <label className="switch switch--row">
            <span><strong>Frases de incentivo</strong><small>De vez em quando ele comenta alguma coisa no cantinho da tela.</small></span>
            <input type="checkbox" checked={prefs.chatter} onChange={(event) => setPrefs({ chatter: event.target.checked })} />
          </label>
        </section>

        <section className="settings__section">
          <h3>Conta</h3>
          <p className="settings__who"><strong>{user?.name}</strong><span>{user?.email}</span></p>
          {supabase && (
            <form className="settings__inline" onSubmit={changePassword}>
              <label className="field"><span>Nova senha</span>
                <input className="input" type="password" autoComplete="new-password" minLength={8} placeholder="Mínimo de 8 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <button type="submit" className="btn" disabled={busy || password.length < 8}>{busy ? 'Salvando…' : 'Trocar senha'}</button>
            </form>
          )}
        </section>

        {supabase && (
          <section className="settings__section settings__section--danger">
            <h3>Excluir conta</h3>
            <p>Apaga sua conta e todos os seus quadros, demandas e tarefas, de forma permanente. Para confirmar, digite <strong>EXCLUIR</strong>.</p>
            <div className="settings__inline">
              <label className="field"><span className="sr-only">Digite EXCLUIR para confirmar</span>
                <input className="input" value={confirmText} placeholder="EXCLUIR" autoComplete="off" onChange={(event) => setConfirmText(event.target.value)} />
              </label>
              <button type="button" className="btn btn--danger" disabled={confirmText !== 'EXCLUIR' || deleting} onClick={() => void deleteAccount()}>{deleting ? 'Excluindo…' : 'Excluir minha conta'}</button>
            </div>
          </section>
        )}

        <section className="settings__section settings__about">
          <Chiquinho pose="sentado" size={96} alt="Chiquinho sentado igual gente no sofá" />
          <div>
            <h3>Sobre</h3>
            <p>UGD v{__APP_VERSION__}. O mascote é o Chiquinho, um gato de verdade, fotografado sentado desse jeito por conta própria.</p>
          </div>
        </section>
      </div>
    </Dialog>
  )
}

const shortcuts: [string, string][] = [
  ['N', 'Nova demanda'],
  ['/', 'Buscar demandas'],
  ['1  2  3', 'Visão geral, Kanban, Calendário'],
  ['Espaço', 'Pegar/soltar a demanda em foco (setas movem)'],
  ['Enter', 'Abrir a demanda em foco'],
  ['Esc', 'Fechar diálogo ou menu'],
  ['?', 'Mostrar estes atalhos'],
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Atalhos de teclado" size="sm" onClose={onClose}>
      <dl className="shortcuts">
        {shortcuts.map(([keys, text]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{text}</dd></div>)}
      </dl>
    </Dialog>
  )
}
