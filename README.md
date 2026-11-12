# UGD — Demandas com o Chiquinho

Kanban e calendário para organizar trabalhos, provas e leituras da faculdade. O mascote é o Chiquinho, um gato de verdade (a foto é dele).

SPA em React + Vite + TypeScript. O frontend fala direto com o Supabase (Auth + Postgres); não há servidor próprio. A autorização é feita pela RLS do banco, nunca pelo frontend.

## Rodar localmente

```bash
npm install
npm run dev
```

- **Sem `.env`**: abre em **modo demonstração** (dados em memória, sem login). Só existe em desenvolvimento; um build de produção sem variáveis mostra uma tela de erro de configuração.
- **Com Supabase**: copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (use apenas a chave `anon`/publishable; nunca a `service_role`).

Comandos de qualidade: `npm run build`, `npm run lint`, `npm run test`.

## Banco de dados

Execute as migrations de `supabase/migrations/` em ordem, no SQL Editor do Supabase (`0001` a `0011`). Todas são aditivas.

A `0009_integrity_and_account_deletion.sql` adiciona:
- trigger que impede um card de apontar para a coluna de outro quadro;
- função `delete_my_account()` usada pelo botão "Excluir minha conta" (sem ela, o botão avisa que a função não está ativa);
- índices de ordenação.

A `0010_security_hardening.sql` fecha as funções auxiliares para visitantes sem login, fixa o autor do card em quem está logado, repete no banco os limites de tamanho dos campos e cria cotas por conta (50 quadros, 30 colunas por quadro, 2000 demandas por quadro, 200 tarefas por demanda).

A `0011_disciplines.sql` cria o cadastro de disciplinas por quadro (nome, ícone e cor), liga os cards a ele e converte os nomes já digitados em disciplinas. A coluna de texto antiga é mantida. Enquanto ela não for aplicada, o app continua funcionando com a disciplina em texto livre.

No painel do Supabase, em Authentication > URL Configuration:
- `Site URL`: a URL de produção;
- Redirect URLs: `http://localhost:5173/**` e `https://SEU-DOMINIO/**` (o link de recuperação de senha volta para `/redefinir-senha`).

## Deploy (Cloudflare Workers Static Assets)

`wrangler.json` publica a pasta `dist` com fallback de SPA. Build: `npm run build`. Cadastre as duas variáveis `VITE_*` no ambiente de build.

`public/_headers` define CSP, HSTS e demais cabeçalhos de segurança. Se o projeto Supabase usar domínio próprio (fora de `*.supabase.co`), ajuste o `connect-src` da CSP.

## Estrutura

```
src/
  lib/        tipos, datas, ordenação, resumo/filtros, acesso ao Supabase (api.ts)
  state/      sessão (auth), quadros e demandas com atualização otimista (board), preferências, avisos
  ui/         diálogo e menu acessíveis
  mascot/     Chiquinho (foto + adereços por humor), companheiro de canto, avisos, miado
  features/   auth, shell (barra superior, filtros), board (Kanban), card, overview, calendar, settings
  styles/     tokens.css (design tokens), base.css, app.css, mascot.css
```

Regras do design system: componentes usam só as variáveis de `styles/tokens.css`; o menor texto é 12px; todo estado de tela (vazio, carregando, erro, 404) é apresentado pelo Chiquinho.

## Segurança e teste de isolamento

Para conferir a RLS: crie os usuários A e B. Entre como A e copie a URL de um quadro (`/q/<id>`). Em uma janela anônima, entre como B e abra essa URL: deve aparecer "Não achei esse quadro". Pelo console, `supabase.from('cards').select()` como B não pode retornar cards de A.

## Atalhos

`N` nova demanda · `/` buscar · `1` `2` `3` trocar de visão · `Espaço` pegar/soltar card · `Enter` abrir card · `?` ajuda.
