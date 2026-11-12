-- 0012: foto de perfil, observações nos cards e imagens coladas.
-- Migration ADITIVA: não apaga nem altera dados existentes. Pode ser executada mais de uma vez.
--
-- Cria:
--   * bucket privado `avatars`      → {usuario}/{arquivo}.webp       (só o próprio usuário lê e grava)
--   * bucket privado `card-images`  → {quadro}/{card}/{arquivo}.webp (membros do quadro leem; dono/editores gravam)
--   * tabela `notes` (observações), com o conteúdo em blocos JSON de texto e imagem (nunca HTML)
--
-- Os buckets são PRIVADOS: as imagens não têm link público. O app pede links temporários (1 hora)
-- e o Storage só os entrega para quem passa nas policies abaixo.
--
-- Para desfazer (as imagens enviadas precisam ser apagadas antes, pelo painel Storage):
--   drop table if exists public.notes;
--   drop function if exists public.valid_note_content(jsonb), public.storage_uuid_segment(text, integer), public.lock_note_owner();
--   drop policy if exists "ugd avatars read" on storage.objects;   -- e as demais "ugd ..." abaixo
--   delete from storage.buckets where id in ('avatars', 'card-images');

/* ------------------------------- Perfil ------------------------------- */

-- A tabela profiles existia, mas o papel `authenticated` nunca recebeu permissão nela.
grant select, insert, update on public.profiles to authenticated;

drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles for insert with check (id = auth.uid());

-- avatar_url guarda o CAMINHO no bucket privado (não uma URL pública).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path') then
    alter table public.profiles add constraint profiles_avatar_path
      check (avatar_url is null or avatar_url ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$') not valid;
  end if;
end $$;

/* ---------------------------- Observações ---------------------------- */

-- Conteúdo aceito: lista de blocos {type:'text', text} ou {type:'image', path, w, h}.
-- O caminho da imagem precisa ser um arquivo do bucket card-images: não há como apontar para fora.
create or replace function public.valid_note_content(content jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  block jsonb;
  images integer := 0;
begin
  if content is null or jsonb_typeof(content) <> 'array' then return false; end if;
  if jsonb_array_length(content) > 60 or octet_length(content::text) > 120000 then return false; end if;
  for block in select value from jsonb_array_elements(content) loop
    if jsonb_typeof(block) <> 'object' then return false; end if;
    if block->>'type' = 'text' then
      if jsonb_typeof(block->'text') <> 'string' then return false; end if;
    elsif block->>'type' = 'image' then
      images := images + 1;
      if coalesce(block->>'path', '') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$' then return false; end if;
    else
      return false;
    end if;
  end loop;
  return images <= 10;
end;
$$;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conteudo jsonb not null default '[]'::jsonb check (public.valid_note_content(conteudo)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_card_id_idx on public.notes (card_id, created_at desc);

-- Autor é sempre quem está logado; ao editar, não dá para trocar o card nem o autor.
create or replace function public.lock_note_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.author_id := auth.uid(); end if;
  else
    new.card_id := old.card_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.lock_note_owner() from public, anon, authenticated;

drop trigger if exists notes_lock_owner on public.notes;
create trigger notes_lock_owner before insert or update on public.notes
  for each row execute function public.lock_note_owner();

alter table public.notes enable row level security;
grant select, insert, update, delete on public.notes to authenticated;

drop policy if exists "members read notes" on public.notes;
create policy "members read notes" on public.notes for select using (
  exists (select 1 from public.cards c where c.id = card_id and public.is_board_member(c.board_id))
);

drop policy if exists "editors write own notes" on public.notes;
create policy "editors write own notes" on public.notes for insert with check (
  author_id = auth.uid()
  and exists (select 1 from public.cards c where c.id = card_id and public.board_role(c.board_id) in ('owner', 'editor'))
);

drop policy if exists "authors edit own notes" on public.notes;
create policy "authors edit own notes" on public.notes for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "authors or owners delete notes" on public.notes;
create policy "authors or owners delete notes" on public.notes for delete using (
  author_id = auth.uid()
  or exists (select 1 from public.cards c where c.id = card_id and public.board_role(c.board_id) = 'owner')
);

/* ------------------------------ Storage ------------------------------ */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 1048576, array['image/webp', 'image/jpeg', 'image/png']),
  ('card-images', 'card-images', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lê o N-ésimo trecho do caminho como uuid; qualquer coisa fora do formato vira null (e a policy nega).
create or replace function public.storage_uuid_segment(path text, segment_index integer)
returns uuid
language plpgsql
immutable
as $$
declare
  part text := split_part(path, '/', segment_index);
begin
  if part ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return part::uuid;
  end if;
  return null;
end;
$$;

-- Foto de perfil: cada usuário só enxerga e mexe na própria pasta. Até 5 arquivos (o app apaga a anterior).
drop policy if exists "ugd avatars read" on storage.objects;
create policy "ugd avatars read" on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and public.storage_uuid_segment(name, 1) = auth.uid()
);

drop policy if exists "ugd avatars insert" on storage.objects;
create policy "ugd avatars insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars'
  and public.storage_uuid_segment(name, 1) = auth.uid()
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'
  and (select count(*) from storage.objects o where o.bucket_id = 'avatars' and public.storage_uuid_segment(o.name, 1) = auth.uid()) < 5
);

drop policy if exists "ugd avatars delete" on storage.objects;
create policy "ugd avatars delete" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and public.storage_uuid_segment(name, 1) = auth.uid()
);

-- Imagens dos cards: pasta do quadro / pasta do card. Até 1000 imagens por quadro.
drop policy if exists "ugd card images read" on storage.objects;
create policy "ugd card images read" on storage.objects for select to authenticated using (
  bucket_id = 'card-images' and public.is_board_member(public.storage_uuid_segment(name, 1))
);

drop policy if exists "ugd card images insert" on storage.objects;
create policy "ugd card images insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'card-images'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'
  and public.board_role(public.storage_uuid_segment(name, 1)) in ('owner', 'editor')
  and exists (
    select 1 from public.cards c
    where c.id = public.storage_uuid_segment(name, 2) and c.board_id = public.storage_uuid_segment(name, 1)
  )
  and (select count(*) from storage.objects o where o.bucket_id = 'card-images' and public.storage_uuid_segment(o.name, 1) = public.storage_uuid_segment(objects.name, 1)) < 1000
);

drop policy if exists "ugd card images delete" on storage.objects;
create policy "ugd card images delete" on storage.objects for delete to authenticated using (
  bucket_id = 'card-images' and public.board_role(public.storage_uuid_segment(name, 1)) in ('owner', 'editor')
);

/* ------------------------------- Cotas ------------------------------- */

-- Mesma função da 0010/0011, agora também limitando observações (300 por card).
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
  elsif tg_table_name = 'disciplines' then
    select count(*) into total from public.disciplines where board_id = new.board_id;
    maximum := 60; what := 'disciplinas por quadro';
  elsif tg_table_name = 'notes' then
    select count(*) into total from public.notes where card_id = new.card_id;
    maximum := 300; what := 'observações por demanda';
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

drop trigger if exists notes_quota on public.notes;
create trigger notes_quota before insert on public.notes for each row execute function public.enforce_quota();

-- Conferência (opcional):
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('avatars', 'card-images');
--   select policyname from pg_policies where schemaname = 'storage' and policyname like 'ugd %';
