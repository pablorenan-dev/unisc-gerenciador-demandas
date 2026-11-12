# UGD — Unisc Gerenciador de Demandas

SPA em português para organizar demandas acadêmicas em Kanban e calendário. O frontend fala diretamente com o Supabase; não há servidor próprio.

## Rodar localmente

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No SQL Editor, execute as migrations `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_create_default_board.sql`, `supabase/migrations/0003_cascade_column_deletion.sql`, `supabase/migrations/0004_fix_board_permissions.sql`, `supabase/migrations/0005_backfill_missing_columns.sql`, `supabase/migrations/0006_add_optional_delivery_period.sql`, `supabase/migrations/0007_add_more_priorities.sql` e `supabase/migrations/0008_add_study_types_and_task_timers.sql`, nesta ordem.
3. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Apenas a chave `anon`/publishable deve chegar ao navegador; nunca use `service_role`.
4. Em Authentication > URL Configuration, configure `Site URL` como `http://localhost:5173` e adicione `http://localhost:5173/**` às Redirect URLs.
5. Execute:

```bash
npm install
npm run dev
```

Os comandos de qualidade são `npm run build`, `npm run lint` e `npm run test`.

## Segurança e teste de isolamento

As policies RLS estão ativas em todas as tabelas. Para testar: crie usuários A e B, entre como A e crie um quadro; em uma janela anônima entre como B e confirme que o quadro não aparece. Tente consultar/alterar o UUID do quadro pelo client do Supabase: as operações devem retornar erro ou zero linhas. O frontend nunca substitui a autorização do banco.

## Deploy no Cloudflare Pages

1. Publique o repositório em GitHub e conecte-o no Cloudflare Pages.
2. Use `npm run build` como build command e `dist` como output directory.
3. Cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente de produção.
4. Adicione o subdomínio personalizado no Cloudflare Pages.
5. No Supabase, altere `Site URL` para o subdomínio final e inclua a URL local e a URL final nas Redirect URLs.
6. Configure fallback de SPA adicionando `public/_redirects` com `/* /index.html 200`.

## Fora do escopo atual

Convites e compartilhamento, notificações por e-mail, anexos, comentários, Google Calendar e PWA ficam preparados no modelo, mas não são implementados nesta base.
