import { useEffect, useMemo, useState } from 'react'
import type { Bucket } from '../lib/types'
import { useAuth } from './auth'

/**
 * Links temporários das imagens privadas. O Storage assina cada link por 1 hora; guardamos
 * por 50 minutos e renovamos antes de expirar. Imagens recém-enviadas usam a prévia local.
 */
const LIFETIME = 50 * 60 * 1000
const cache = new Map<string, { url: string; expires: number }>()
const keyOf = (bucket: Bucket, path: string) => `${bucket}:${path}`

const fresh = (bucket: Bucket, path: string) => {
  const entry = cache.get(keyOf(bucket, path))
  return entry && entry.expires > Date.now() ? entry.url : undefined
}

/** Registra a prévia local de uma imagem acabada de enviar, para não piscar enquanto o link é gerado. */
export function primeMedia(bucket: Bucket, path: string, url: string) {
  cache.set(keyOf(bucket, path), { url, expires: Date.now() + LIFETIME })
}

export function useMediaUrls(bucket: Bucket, paths: string[]): Record<string, string | undefined> {
  const { api } = useAuth()
  const key = paths.join('|')
  const [version, setVersion] = useState(0)

  // Renova os links periodicamente enquanto a tela estiver aberta.
  useEffect(() => {
    if (!paths.length) return
    const timer = window.setInterval(() => setVersion((value) => value + 1), 20 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const missing = key ? key.split('|').filter((path) => !fresh(bucket, path)) : []
    if (!api || !missing.length) return
    let active = true
    api.signedUrls(bucket, missing).then((urls) => {
      for (const [path, url] of Object.entries(urls)) cache.set(keyOf(bucket, path), { url, expires: Date.now() + LIFETIME })
      if (active) setVersion((value) => value + 1)
    }, () => { /* sem link: a tela mostra o espaço reservado */ })
    return () => { active = false }
  }, [api, bucket, key, version])

  return useMemo(() => {
    void version
    return Object.fromEntries(paths.map((path) => [path, fresh(bucket, path)]))
  }, [bucket, key, version]) // eslint-disable-line react-hooks/exhaustive-deps
}
