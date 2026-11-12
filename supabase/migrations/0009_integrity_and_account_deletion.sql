-- 0009: integridade entre card e coluna + exclusão de conta (LGPD).
-- Migration ADITIVA: não apaga nem altera dados existentes. Pode ser executada mais de uma vez.
--
-- Para desfazer:
--   drop trigger if exists cards_column_same_board on public.cards;
--   drop function if exists public.ensure_card_column_same_board();
--   drop function if exists public.delete_my_account();

-- 1) Um card só pode apontar para uma coluna do MESMO quadro.
--    A RLS já valida o board_id; sem isto, um usuário conseguiria gravar em um card seu
--    o column_id de um quadro alheio (chaves estrangeiras não passam pela RLS).
create or replace function public.ensure_card_column_same_board()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.columns c
    where c.id = new.column_id and c.board_id = new.board_id
  ) then
    raise exception 'A coluna não pertence a este quadro' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists cards_column_same_board on public.cards;
create trigger cards_column_same_board
  before insert or update of column_id, board_id on public.cards
  for each row execute function public.ensure_card_column_same_board();

-- 2) Exclusão da própria conta. Só age sobre auth.uid(): não recebe parâmetro,
--    então não há como apagar a conta de outra pessoa.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  -- Quadros primeiro: cards.created_by é ON DELETE RESTRICT e bloquearia a remoção do usuário.
  delete from public.boards where owner_id = me;
  delete from public.board_members where user_id = me;
  delete from public.cards where created_by = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 3) Funções auxiliares de RLS não precisam ser chamáveis por visitantes anônimos.
revoke execute on function public.is_board_member(uuid) from anon;
revoke execute on function public.board_role(uuid) from anon;

-- 4) Ordenação estável das tarefas e das demandas dentro da coluna.
create index if not exists tasks_card_position_idx on public.tasks(card_id, posicao);
create index if not exists cards_column_position_idx on public.cards(column_id, posicao);
