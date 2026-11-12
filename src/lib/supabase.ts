import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** `null` quando as variáveis de ambiente não estão definidas. */
export const supabase = url && publishableKey ? createClient(url, publishableKey) : null

/**
 * Modo demonstração (dados em memória, sem login): só existe em desenvolvimento e em testes.
 * Um build de produção sem variáveis mostra uma tela de erro de configuração, nunca um app "falso".
 */
export const demoMode = !supabase && import.meta.env.DEV

const authMessages: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar. Veja sua caixa de entrada.'],
  [/user already registered/i, 'Já existe uma conta com este e-mail.'],
  [/password should be at least (\d+)/i, 'A senha é curta demais.'],
  [/weak.?password|password is too weak/i, 'Senha fraca. Use mais caracteres, misturando letras e números.'],
  [/rate limit|too many requests|security purposes/i, 'Muitas tentativas. Aguarde um pouco e tente de novo.'],
  [/unable to validate email|invalid email|invalid format/i, 'E-mail inválido.'],
  [/same.?password|different from the old/i, 'A nova senha precisa ser diferente da atual.'],
  [/session.*(missing|expired|not found)|jwt expired/i, 'Sua sessão expirou. Entre novamente.'],
  [/signups? not allowed|signup is disabled/i, 'O cadastro está desativado no momento.'],
  [/failed to fetch|network|load failed/i, 'Sem conexão com o servidor. Verifique sua internet.'],
]

/** Converte erros do Supabase em mensagens em português, sem expor detalhes internos. */
export function friendlyError(error: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  const message = typeof error === 'string' ? error : (error as { message?: string } | null)?.message ?? ''
  for (const [pattern, text] of authMessages) if (pattern.test(message)) return text
  return fallback
}
