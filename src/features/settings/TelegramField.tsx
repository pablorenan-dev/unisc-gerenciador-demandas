import { useEffect, useState } from 'react'
import { ExternalLink, Send, Unlink } from 'lucide-react'
import { TelegramError } from '../../lib/api'
import type { TelegramSettings, TelegramStatus } from '../../lib/types'
import { useAuth } from '../../state/auth'
import { toast } from '../../state/feedback'

const hours = Array.from({ length: 24 }, (_, hour) => hour)
const daysOptions = [1, 2, 3, 5, 7]
const browserZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo' } catch { return 'America/Sao_Paulo' }
}
const message = (error: unknown, fallback: string) => (error instanceof TelegramError ? error.message : fallback)

/** Lembretes de prazo no Telegram: conectar a conta, escolher horário e antecedência. */
export function TelegramField() {
  const { api } = useAuth()
  const [status, setStatus] = useState<TelegramStatus | null | undefined>(undefined)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState<'connect' | 'test' | 'disconnect' | null>(null)

  useEffect(() => {
    if (!api) return
    let active = true
    api.telegramStatus().then((value) => { if (active) setStatus(value) }, () => { if (active) setStatus(null) })
    return () => { active = false }
  }, [api])

  // Depois de abrir o link, confere a cada 3 s se a pessoa já tocou em "Iniciar" no bot (por até 15 min).
  useEffect(() => {
    if (!api || !link) return
    const started = Date.now()
    const timer = window.setInterval(async () => {
      if (Date.now() - started > 15 * 60 * 1000) { setLink(null); return }
      try {
        const next = await api.telegramStatus()
        if (next?.linked) { setStatus(next); setLink(null); toast.success('Telegram conectado! O Chiquinho já mandou um oi por lá.') }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 3000)
    return () => window.clearInterval(timer)
  }, [api, link])

  if (status === undefined) return <p className="notes__status" role="status">Carregando…</p>
  if (status === null) return <p className="notes__status">Os lembretes no Telegram ficam disponíveis depois que a migration 0013 for aplicada no Supabase.</p>
  if (!status.configured) return <p className="notes__status">O bot do Telegram ainda não foi configurado no servidor (falta o token do @BotFather). O passo a passo está no README.</p>

  async function connect() {
    if (!api) return
    setBusy('connect')
    try { setLink(await api.telegramConnect()) } catch (error) { toast.error(message(error, 'Não foi possível gerar o link de conexão.')) } finally { setBusy(null) }
  }

  async function update(patch: Partial<TelegramSettings>) {
    if (!api || !status) return
    const next = { ...status, ...patch, timezone: browserZone() }
    const previous = status
    setStatus(next)
    try { await api.telegramUpdate(next) } catch (error) { setStatus(previous); toast.error(message(error, 'Não foi possível salvar os lembretes.')) }
  }

  async function test() {
    if (!api) return
    setBusy('test')
    try { await api.telegramTest(); toast.success('Resumo enviado. Confere no Telegram!') } catch (error) { toast.error(message(error, 'Não foi possível enviar a mensagem de teste.')) } finally { setBusy(null) }
  }

  async function disconnect() {
    if (!api || !status) return
    setBusy('disconnect')
    try { await api.telegramDisconnect(); setStatus({ ...status, linked: false, username: null, firstName: null }); toast.success('Telegram desconectado.') } catch (error) { toast.error(message(error, 'Não foi possível desconectar.')) } finally { setBusy(null) }
  }

  if (!status.linked) {
    return (
      <div className="telegram">
        <p className="settings__text">Receba no Telegram, todo dia no horário que escolher, o que vence nos próximos dias e o que está atrasado. Funciona mesmo com o UGD fechado.</p>
        {link ? (
          <div className="telegram__waiting" role="status">
            <a className="btn btn--primary" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden /> Abrir o bot no Telegram</a>
            <span>No Telegram, toque em <strong>Iniciar</strong>. Esta tela atualiza sozinha. O link vale por 15 minutos.</span>
          </div>
        ) : (
          <button type="button" className="btn btn--sm" onClick={() => void connect()} disabled={busy !== null}><Send size={16} aria-hidden /> {busy === 'connect' ? 'Gerando link…' : 'Conectar Telegram'}</button>
        )}
      </div>
    )
  }

  return (
    <div className="telegram">
      <p className="telegram__linked"><Send size={16} aria-hidden /> Conectado{status.username ? ` como @${status.username}` : status.firstName ? ` (${status.firstName})` : ''}</p>
      <label className="switch switch--row">
        <span><strong>Resumo diário de prazos</strong><small>Atrasadas, hoje e os próximos dias. Só chega se houver algo.</small></span>
        <input type="checkbox" checked={status.enabled} onChange={(event) => void update({ enabled: event.target.checked })} />
      </label>
      <div className="form__row">
        <label className="field"><span>Horário</span>
          <select className="select" value={status.remindHour} disabled={!status.enabled} onChange={(event) => void update({ remindHour: Number(event.target.value) })}>
            {hours.map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
          </select>
        </label>
        <label className="field"><span>Avisar com antecedência de</span>
          <select className="select" value={status.daysAhead} disabled={!status.enabled} onChange={(event) => void update({ daysAhead: Number(event.target.value) })}>
            {daysOptions.map((days) => <option key={days} value={days}>{days === 1 ? '1 dia (véspera)' : `${days} dias`}</option>)}
          </select>
        </label>
      </div>
      <div className="avatar-field__actions">
        <button type="button" className="btn btn--sm" onClick={() => void test()} disabled={busy !== null}><Send size={16} aria-hidden /> {busy === 'test' ? 'Enviando…' : 'Enviar resumo agora'}</button>
        <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => void disconnect()} disabled={busy !== null}><Unlink size={16} aria-hidden /> Desconectar</button>
      </div>
      <small className="telegram__privacy">Os títulos e as disciplinas das demandas com prazo próximo são enviados ao Telegram. No bot: /resumo mostra agora, /parar desliga.</small>
    </div>
  )
}
