insert into public.columns (board_id, nome, posicao, cor)
select b.id, defaults.nome, defaults.posicao, defaults.cor
from public.boards b
cross join (
  values
    ('A fazer'::text, 1000, '#94a3b8'::text),
    ('Em andamento'::text, 2000, '#4f46e5'::text),
    ('Em revisão'::text, 3000, '#f59e0b'::text),
    ('Concluído'::text, 4000, '#10b981'::text)
) as defaults(nome, posicao, cor)
where not exists (
  select 1
  from public.columns existing
  where existing.board_id = b.id
);
