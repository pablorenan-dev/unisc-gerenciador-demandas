create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  new_board_id uuid;
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''));

  insert into public.boards (nome, descricao, owner_id)
  values ('Demandas 2026/2', 'Demandas acadêmicas do segundo semestre', new.id)
  returning id into new_board_id;

  return new;
end;
$$;
