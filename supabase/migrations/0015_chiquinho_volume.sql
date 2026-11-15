-- 0015: volume do Chiquinho guardado no perfil (acompanha a conta em qualquer computador).
-- Migration ADITIVA: não apaga nem altera dados existentes. Pode ser executada mais de uma vez.
-- Não muda nenhuma policy: o perfil já é lido e gravado só pelo próprio usuário (0001 e 0012).
--
-- Para desfazer:
--   alter table public.profiles drop column if exists chiquinho_volume;

-- De 0 (mudo) a 100 (volume cheio, o comportamento de antes desta migration).
alter table public.profiles
  add column if not exists chiquinho_volume smallint not null default 100;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_chiquinho_volume_range') then
    alter table public.profiles add constraint profiles_chiquinho_volume_range
      check (chiquinho_volume between 0 and 100);
  end if;
end $$;
