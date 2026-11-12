import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { imagePaths, isBlank, isUploading, toEditorBlocks, toStoredBlocks, type EditorBlock } from '../../lib/blocks'
import { prepareImage } from '../../lib/images'
import type { Note } from '../../lib/types'
import { Chiquinho } from '../../mascot/Chiquinho'
import { useAuth } from '../../state/auth'
import { toast } from '../../state/feedback'
import { primeMedia } from '../../state/media'
import { Avatar } from '../../ui/Avatar'
import { ConfirmDialog } from '../../ui/Dialog'
import { Menu, MenuItem } from '../../ui/Menu'
import { RichContent } from '../../ui/RichContent'
import { RichEditor } from '../../ui/RichEditor'

type Props = {
  boardId: string
  cardId: string
  /** Avisa a quantidade atual (para o contador no card do quadro). */
  onCount: (count: number) => void
  /** Avisa se há texto/imagem digitado e ainda não salvo (para confirmar ao fechar o card). */
  onDirty: (dirty: boolean) => void
}

const formatWhen = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')

/** Prévias locais das imagens recém-enviadas viram o link da imagem salva (sem piscar). */
function primeUploads(blocks: EditorBlock[]) {
  for (const block of blocks) if (block.type === 'image' && block.path && block.preview) primeMedia('card-images', block.path, block.preview)
}


export function NotesSection({ boardId, cardId, onCount, onDirty }: Props) {
  const { api, user, profile } = useAuth()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [notes, setNotes] = useState<Note[]>([])
  const [draft, setDraft] = useState<EditorBlock[] | null>(null)
  const [editing, setEditing] = useState<{ id: string; blocks: EditorBlock[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<Note | null>(null)
  const [attempt, setAttempt] = useState(0)
  const onCountRef = useRef(onCount)
  useEffect(() => { onCountRef.current = onCount })

  useEffect(() => {
    if (!api) return
    let active = true
    api.listNotes(cardId).then(
      (list) => { if (active) { setNotes(list); setStatus('ready'); onCountRef.current(list.length) } },
      () => { if (active) setStatus('error') },
    )
    return () => { active = false }
  }, [api, cardId, attempt])

  const draftStored = draft ? toStoredBlocks(draft) : []
  const editStored = editing ? toStoredBlocks(editing.blocks) : []
  const dirty = Boolean((draft && (!isBlank(draftStored) || isUploading(draft))) || editing)
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])

  /**
   * Tudo o que foi enviado em cada rascunho ("novo" ou o id da observação em edição).
   * Ao salvar, cancelar ou sair do card, o que não ficou numa observação salva é apagado do Storage
   * (inclusive imagens coladas e depois removidas com o X).
   */
  const uploaded = useRef(new Map<string, Set<string>>())
  const discard = (scope: string, keep: string[] = []) => {
    const paths = [...(uploaded.current.get(scope) ?? [])].filter((path) => !keep.includes(path))
    uploaded.current.delete(scope)
    if (api && paths.length) void api.removeImages('card-images', paths).catch(() => {})
  }
  useEffect(() => {
    const scopes = uploaded.current
    return () => {
      const paths = [...scopes.values()].flatMap((set) => [...set])
      scopes.clear()
      if (api && paths.length) void api.removeImages('card-images', paths).catch(() => {})
    }
  }, [api])

  const uploadFor = (scope: string) => async (file: File) => {
    if (!api) throw new Error('sem sessão')
    const image = await prepareImage(file, { maxSide: 1600 })
    const path = await api.uploadCardImage(boardId, cardId, image)
    if (!uploaded.current.has(scope)) uploaded.current.set(scope, new Set())
    uploaded.current.get(scope)?.add(path)
    return { path, w: image.width, h: image.height }
  }

  async function createNote() {
    if (!api || !draft || saving || isUploading(draft) || isBlank(draftStored)) return
    setSaving(true)
    try {
      const note = await api.createNote(cardId, draftStored)
      primeUploads(draft)
      discard('novo', imagePaths(note.content))
      const next = [note, ...notes]
      setNotes(next)
      onCount(next.length)
      setDraft(null)
    } catch {
      toast.error('Não foi possível salvar a observação.')
    } finally {
      setSaving(false)
    }
  }

  function cancelDraft() {
    discard('novo')
    setDraft(null)
  }

  async function saveEdit() {
    if (!api || !editing || saving || isUploading(editing.blocks)) return
    const original = notes.find((note) => note.id === editing.id)
    if (!original) return
    if (isBlank(editStored)) { setRemoving(original); return }
    setSaving(true)
    try {
      const updated = await api.updateNote(editing.id, editStored)
      primeUploads(editing.blocks)
      const kept = imagePaths(updated.content)
      const dropped = imagePaths(original.content).filter((path) => !kept.includes(path))
      if (dropped.length) void api.removeImages('card-images', dropped).catch(() => {})
      discard(updated.id, kept)
      setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)))
      setEditing(null)
    } catch {
      toast.error('Não foi possível salvar a observação.')
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    if (editing) discard(editing.id)
    setEditing(null)
  }

  async function deleteNote(note: Note) {
    if (!api) return
    try {
      await api.deleteNote(note.id)
      const paths = imagePaths(note.content)
      if (paths.length) void api.removeImages('card-images', paths).catch(() => {})
      const next = notes.filter((item) => item.id !== note.id)
      setNotes(next)
      onCount(next.length)
      if (editing?.id === note.id) { discard(note.id); setEditing(null) }
      toast.success('Observação excluída.')
    } catch {
      toast.error('Não foi possível excluir a observação.')
    }
  }

  const userName = user?.name ?? ''

  return (
    <section className="notes" aria-label="Observações">
      <div className="tasks__heading"><h3>Observações</h3>{notes.length > 0 && <span className="tasks__total">{notes.length}</span>}</div>

      {draft ? (
        <div className="note-composer">
          <RichEditor value={draft} onChange={setDraft as React.Dispatch<React.SetStateAction<EditorBlock[]>>} upload={uploadFor('novo')} autoFocus label="Nova observação" placeholder="Escreva uma observação… cole prints e fotos com Ctrl+V" onSubmit={() => void createNote()} />
          <div className="note-composer__actions">
            <button type="button" className="btn btn--sm" onClick={cancelDraft}>Cancelar</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void createNote()} disabled={saving || isUploading(draft) || isBlank(draftStored)}>
              {isUploading(draft) ? 'Enviando imagem…' : saving ? 'Salvando…' : 'Salvar observação'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="note-composer__start" onClick={() => setDraft(toEditorBlocks([], 'novo'))}>
          <Avatar name={userName} path={profile?.avatarPath} size={28} />
          <span>Escreva uma observação ou cole um print…</span>
        </button>
      )}

      {status === 'loading' && <p className="notes__status" role="status">Carregando observações…</p>}
      {status === 'error' && <p className="notes__status">Não consegui carregar as observações. <button type="button" className="link" onClick={() => { setStatus('loading'); setAttempt((value) => value + 1) }}>Tentar de novo</button></p>}
      {status === 'ready' && notes.length === 0 && !draft && (
        <div className="notes__empty"><Chiquinho mood="curious" size={40} /><p>Anote aqui o que o professor falou, links, prints do enunciado…</p></div>
      )}

      <ol className="notes__list">
        {notes.map((note) => (
          <li key={note.id} className="note">
            <Avatar name={userName} path={note.authorId === user?.id ? profile?.avatarPath : null} size={28} />
            <div className="note__body">
              <div className="note__meta">
                <span>{formatWhen(note.createdAt)}{note.updatedAt.slice(0, 19) !== note.createdAt.slice(0, 19) && ' · editada'}</span>
                {editing?.id !== note.id && (
                  <Menu label="Opções da observação" trigger={<MoreHorizontal size={16} aria-hidden />} triggerClassName="icon-btn icon-btn--sm">
                    {(close) => <>
                      <MenuItem icon={<Pencil size={16} />} onSelect={() => { close(); setEditing({ id: note.id, blocks: toEditorBlocks(note.content, note.id) }) }}>Editar</MenuItem>
                      <MenuItem danger icon={<Trash2 size={16} />} onSelect={() => { close(); setRemoving(note) }}>Excluir</MenuItem>
                    </>}
                  </Menu>
                )}
              </div>
              {editing?.id === note.id ? (
                <div className="note-composer">
                  <RichEditor value={editing.blocks} onChange={(update) => setEditing((current) => current && { ...current, blocks: typeof update === 'function' ? update(current.blocks) : update })}
                    upload={uploadFor(note.id)} autoFocus label="Editar observação" onSubmit={() => void saveEdit()} />
                  <div className="note-composer__actions">
                    <button type="button" className="btn btn--sm" onClick={cancelEdit}>Cancelar</button>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => void saveEdit()} disabled={saving || isUploading(editing.blocks)}>{saving ? 'Salvando…' : 'Salvar'}</button>
                  </div>
                </div>
              ) : (
                <RichContent blocks={note.content} />
              )}
            </div>
          </li>
        ))}
      </ol>

      {removing && <ConfirmDialog danger title="Excluir esta observação?" text="O texto e as imagens dela serão apagados. Não dá para desfazer." confirmLabel="Excluir" onClose={() => setRemoving(null)} onConfirm={() => void deleteNote(removing)} />}
    </section>
  )
}
