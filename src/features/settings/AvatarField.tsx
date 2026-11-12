import { useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { ImageError, prepareImage } from '../../lib/images'
import { useAuth } from '../../state/auth'
import { toast } from '../../state/feedback'
import { primeMedia } from '../../state/media'
import { Avatar } from '../../ui/Avatar'

/** Foto de perfil: recortada em quadrado, reduzida para 256px e guardada em bucket privado. */
export function AvatarField() {
  const { api, user, profile, setAvatarPath } = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const name = user?.name ?? ''

  if (profile === null) {
    return <p className="notes__status">A foto de perfil fica disponível depois que a migration 0012 for aplicada no Supabase.</p>
  }

  async function choose(file: File) {
    if (!api) return
    setBusy('upload')
    try {
      const image = await prepareImage(file, { maxSide: 256, square: true })
      const path = await api.setAvatar(image)
      if (typeof URL.createObjectURL === 'function') primeMedia('avatars', path, URL.createObjectURL(image.blob))
      setAvatarPath(path)
      toast.success('Foto de perfil atualizada.')
    } catch (error) {
      toast.error(error instanceof ImageError ? error.message : 'Não foi possível enviar a foto.')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!api) return
    setBusy('remove')
    try {
      await api.removeAvatar()
      setAvatarPath(null)
      toast.success('Foto removida.')
    } catch {
      toast.error('Não foi possível remover a foto.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="avatar-field">
      <Avatar name={name} path={profile?.avatarPath} size={72} />
      <div className="avatar-field__body">
        <div className="avatar-field__actions">
          <button type="button" className="btn btn--sm" onClick={() => input.current?.click()} disabled={busy !== null || profile === undefined}>
            <Camera size={16} aria-hidden /> {busy === 'upload' ? 'Enviando…' : profile?.avatarPath ? 'Trocar foto' : 'Enviar foto'}
          </button>
          {profile?.avatarPath && (
            <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => void remove()} disabled={busy !== null}>
              <Trash2 size={16} aria-hidden /> {busy === 'remove' ? 'Removendo…' : 'Remover'}
            </button>
          )}
        </div>
        <small>PNG, JPG ou WebP até 15 MB. A foto é recortada em quadrado e só você consegue vê-la.</small>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Escolher foto de perfil"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file) }} />
      </div>
    </div>
  )
}
