-- 0010: endurecimento de segurança.
-- Migration ADITIVA: não apaga nem altera dados existentes. Pode ser executada mais de uma vez.
-- As restrições usam NOT VALID: passam a valer para gravações novas, sem reprovar linhas antigas.

-- 1) Funções auxiliares da RLS deixam de ser chamáveis por visitantes sem login.
--    (No Postgres toda função nasce com EXECUTE para PUBLIC; revogar só de `anon` não basta.)
revoke execute on function public.is_board_member(uuid) from public, anon;
revoke execute on function public.board_role(uuid) from public, anon;
grant execute on function public.is_board_member(uuid) to authenticated;
grant execute on function public.board_role(uuid) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_board() from public, anon, authenticated;

-- 2) `created_by` é sempre quem está logado: o cliente não pode gravar um card em nome de outra pessoa.
create or replace function public.force_card_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists cards_force_author on public.cards;
create trigger cards_force_author
  before insert on public.cards
  for each row execute function public.force_card_author();

-- 3) Limites de tamanho também no banco (o formulário já limita, mas a API pode ser chamada direto).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_descricao_len') then
    alter table public.cards add constraint cards_descricao_len check (char_length(descricao) <= 5000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cards_disciplina_len') then
    alter table public.cards add constraint cards_disciplina_len check (char_length(disciplina) <= 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cards_labels_count') then
    alter table public.cards add constraint cards_labels_count check (cardinality(labels) <= 20) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'columns_cor_hex') then
    alter table public.columns add constraint columns_cor_hex check (cor ~ '^#[0-9a-fA-F]{3,8}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'boards_descricao_len') then
    alter table public.boards add constraint boards_descricao_len check (char_length(descricao) <= 1000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_nome_len') then
    alter table public.profiles add constraint profiles_nome_len check (char_length(nome) <= 120) not valid;
  end if;
end $$;

-- 4) Cotas por usuário: impedem que uma conta (ou um script com o token dela) encha o banco.
--    Os números são folgados para uso real; ajuste aqui se precisar.
create or replace function public.enforce_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
  maximum integer;
  what text;
begin
  if tg_table_name = 'boards' then
    select count(*) into total from public.boards where owner_id = new.owner_id;
    maximum := 50; what := 'quadros por conta';
  elsif tg_table_name = 'columns' then
    select count(*) into total from public.columns where board_id = new.board_id;
    maximum := 30; what := 'colunas por quadro';
  elsif tg_table_name = 'cards' then
    select count(*) into total from public.cards where board_id = new.board_id;
    maximum := 2000; what := 'demandas por quadro';
  elsif tg_table_name = 'tasks' then
    select count(*) into total from public.tasks where card_id = new.card_id;
    maximum := 200; what := 'tarefas por demanda';
  else
    return new;
  end if;
  if total >= maximum then
    raise exception 'Limite atingido: % %', maximum, what using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_quota() from public, anon, authenticated;

drop trigger if exists boards_quota on public.boards;
create trigger boards_quota before insert on public.boards for each row execute function public.enforce_quota();
drop trigger if exists columns_quota on public.columns;
create trigger columns_quota before insert on public.columns for each row execute function public.enforce_quota();
drop trigger if exists cards_quota on public.cards;
create trigger cards_quota before insert on public.cards for each row execute function public.enforce_quota();
drop trigger if exists tasks_quota on public.tasks;
create trigger tasks_quota before insert on public.tasks for each row execute function public.enforce_quota();

-- 5) O nome vindo do cadastro é cortado em 120 caracteres (antes era gravado sem limite).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  new_board_id uuid;
begin
  insert into public.profiles (id, nome)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'nome', ''), 120));

  insert into public.boards (nome, descricao, owner_id)
  values ('Demandas ' || to_char(now(), 'YYYY') || '/' || case when extract(month from now()) <= 6 then '1' else '2' end, '', new.id)
  returning id into new_board_id;

  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 6) Conferência: rode depois de aplicar. Todas as tabelas devem aparecer com rls = true.
--   select tablename, rowsecurity as rls from pg_tables where schemaname = 'public' order by 1;
--   select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 2;
