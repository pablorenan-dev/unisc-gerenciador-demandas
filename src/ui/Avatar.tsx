import type { CSSProperties } from 'react'
import { useMediaUrls } from '../state/media'

/** Foto de perfil (bucket privado) ou, sem foto, as iniciais do nome. */
export function Avatar({ name, path, size = 38 }: { name: string; path: string | null | undefined; size?: number }) {
  const urls = useMediaUrls('avatars', path ? [path] : [])
  const url = path ? urls[path] : undefined
  const initials = name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <span className="avatar" style={{ '--avatar-size': `${size}px` } as CSSProperties} aria-hidden>
      {url ? <img src={url} alt="" width={size} height={size} draggable={false} /> : <span>{initials}</span>}
    </span>
  )
}
