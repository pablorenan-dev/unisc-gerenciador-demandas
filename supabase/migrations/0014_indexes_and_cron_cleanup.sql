-- 0014: manutenção do banco (índices e limpeza do histórico do pg_cron).
-- Migration ADITIVA: não apaga nem altera nenhum dado do app. Pode ser executada mais de uma vez.
-- Não muda nenhuma policy de acesso (RLS).
--
-- Para desfazer:
--   drop index if exists public.boards_owner_id_idx, public.notes_author_id_idx, public.telegram_link_codes_user_id_idx;
--   select cron.unschedule(jobid) from cron.job where jobname = 'ugd-cron-cleanup';
--   (os índices removidos na parte 2 podem ser recriados com os `create index` das migrations 0001 e 0011)

/* 1) Índices que faltavam ---------------------------------------------------------------- */

-- boards.owner_id é consultado o tempo todo: na policy de leitura (owner_id = auth.uid()),
-- na cota de quadros por conta, no resumo do Telegram e na exclusão de conta. Sem índice,
-- cada uma dessas consultas lê a tabela inteira, e isso cresce com o número de usuários.
create index if not exists boards_owner_id_idx on public.boards (owner_id);

-- Chaves estrangeiras para auth.users sem índice: excluir uma conta varria a tabela toda.
-- (As tabelas só existem depois da 0012 e da 0013; sem elas, este trecho não faz nada.)
do $$
begin
  if to_regclass('public.notes') is not null then
    create index if not exists notes_author_id_idx on public.notes (author_id);
  end if;
  if to_regclass('public.telegram_link_codes') is not null then
    create index if not exists telegram_link_codes_user_id_idx on public.telegram_link_codes (user_id);
  end if;
end $$;

/* 2) Índices redundantes ---------------------------------------------------------------- */
-- Cada índice custa um pouco em toda gravação. Estes não ajudam nenhuma consulta que outro
-- índice já não atenda (um índice em (a, b) também serve para buscar só por a).

drop index if exists public.cards_column_id_idx;       -- coberto por cards_column_position_idx (column_id, posicao)
drop index if exists public.tasks_card_id_idx;         -- coberto por tasks_card_position_idx (card_id, posicao)
drop index if exists public.columns_board_id_idx;      -- coberto pelo unique (board_id, posicao)
drop index if exists public.disciplines_board_id_idx;  -- coberto por disciplines_board_nome_key (board_id, ...)
drop index if exists public.tasks_due_date_idx;        -- tasks.data_limite nunca é usada pelo app
drop index if exists public.cards_dates_idx;           -- nenhuma consulta filtra por (data_inicio, data_entrega)

/* 3) Histórico do pg_cron ---------------------------------------------------------------- */
-- A 0013 roda uma tarefa por minuto (ler o bot) e outra a cada 10 minutos. O pg_cron grava uma
-- linha em cron.job_run_details a cada execução e NUNCA apaga: são ~1.600 linhas por dia,
-- mais de meio milhão por ano, ocupando o espaço do plano gratuito à toa.
-- Esta tarefa diária mantém só os últimos 3 dias (suficiente para investigar um problema).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ugd-cron-cleanup';
    perform cron.schedule(
      'ugd-cron-cleanup',
      '17 6 * * *', -- 06:17 UTC = 03:17 em Brasília
      $job$delete from cron.job_run_details where end_time < now() - interval '3 days'$job$
    );
    -- Primeira limpeza já, sem esperar a madrugada.
    delete from cron.job_run_details where end_time < now() - interval '3 days';
  end if;
end $$;

-- Conferência (opcional):
--   select jobname, schedule, active from cron.job where jobname like 'ugd-%';
--   select count(*) from cron.job_run_details;   -- deve cair para poucos milhares e ficar estável
--   select indexname from pg_indexes where schemaname = 'public' order by 1;
