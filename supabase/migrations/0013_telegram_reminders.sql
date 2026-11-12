-- 0013: lembretes de prazo pelo Telegram.
-- Migration ADITIVA. Pode ser executada mais de uma vez.
--
-- Como funciona (tudo dentro do Supabase, sem servidor extra):
--   * pg_cron roda duas tarefas: a cada minuto lê as mensagens novas do bot (para conectar contas)
--     e a cada 10 minutos envia o resumo diário de prazos de quem já passou do horário escolhido.
--   * pg_net faz as chamadas HTTP para a API do Telegram.
--   * O token do bot fica no Vault (cofre criptografado do Supabase), nunca no código nem no app.
--
-- DEPOIS de rodar esta migration, configure o bot (troque os valores; NÃO commite o token):
--   select vault.create_secret('123456:ABC-seu-token-do-BotFather', 'telegram_bot_token');
--   insert into public.app_settings (key, value) values
--     ('telegram_bot_username', 'NomeDoSeuBot'),            -- sem o @
--     ('site_url', 'https://seu-dominio.com.br')             -- opcional: link no fim da mensagem
--   on conflict (key) do update set value = excluded.value;
--
-- Para desfazer:
--   select cron.unschedule(jobid) from cron.job where jobname in ('ugd-telegram-poll', 'ugd-telegram-reminders');
--   drop table if exists public.telegram_links, public.telegram_link_codes, public.telegram_state, public.app_settings;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

/* ------------------------------- Tabelas ------------------------------- */
-- Nenhuma destas tabelas é acessível pela API: o app só usa as funções telegram_* abaixo.

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id bigint not null unique,
  username text,
  first_name text,
  enabled boolean not null default true,
  remind_hour smallint not null default 19 check (remind_hour between 0 and 23),
  days_ahead smallint not null default 2 check (days_ahead between 1 and 7),
  timezone text not null default 'America/Sao_Paulo',
  last_sent_on date,
  last_test_at timestamptz,
  linked_at timestamptz not null default now()
);

create table if not exists public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists public.telegram_state (
  id boolean primary key default true check (id),
  last_update_id bigint not null default 0,
  pending_request bigint,
  pending_since timestamptz
);
insert into public.telegram_state (id) values (true) on conflict do nothing;

alter table public.app_settings enable row level security;
alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.telegram_state enable row level security;
revoke all on public.app_settings, public.telegram_links, public.telegram_link_codes, public.telegram_state from anon, authenticated;

/* ------------------------------ Internas ------------------------------ */

create or replace function public.app_setting(setting_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$ select value from public.app_settings where key = setting_key $$;

create or replace function public.telegram_token()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  token text;
begin
  select decrypted_secret into token from vault.decrypted_secrets where name = 'telegram_bot_token' order by created_at desc limit 1;
  return nullif(btrim(token), '');
exception when others then
  return null;
end;
$$;

-- Envia uma mensagem de texto puro (sem parse_mode: títulos com < ou & não quebram nada).
create or replace function public.telegram_send(chat bigint, message text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  token text := public.telegram_token();
begin
  if token is null or chat is null or coalesce(message, '') = '' then return null; end if;
  return net.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    body := jsonb_build_object('chat_id', chat, 'text', left(message, 4000), 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 8000
  );
end;
$$;

/*
 * Resumo de prazos de um usuário: atrasadas, hoje e os próximos `days_ahead` dias.
 * "Concluída" segue a regra do app: está na última coluna do quadro (se houver mais de uma)
 * ou tem tarefas e todas foram feitas. Devolve null se não houver nada para avisar.
 */
create or replace function public.telegram_digest(target uuid, local_today date, days_ahead integer)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  item record;
  message text := '';
  section text := '';
  heading text;
  total integer := 0;
  late integer := 0;
  shown integer := 0;
  weekdays text[] := array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  site text := public.app_setting('site_url');
begin
  for item in
    with my_boards as (
      select b.id, b.nome from public.boards b
      where b.owner_id = target or exists (select 1 from public.board_members m where m.board_id = b.id and m.user_id = target)
    ), last_column as (
      select distinct on (c.board_id) c.board_id, c.id,
             count(*) over (partition by c.board_id) as columns_in_board
      from public.columns c join my_boards mb on mb.id = c.board_id
      order by c.board_id, c.posicao desc
    )
    select k.titulo, nullif(btrim(k.disciplina), '') as disciplina, k.data_entrega as due, (k.data_entrega - local_today) as days_left
    from public.cards k
    join my_boards mb on mb.id = k.board_id
    left join last_column lc on lc.board_id = k.board_id
    where k.data_entrega is not null
      and k.data_entrega <= local_today + days_ahead
      and not (lc.id is not null and lc.columns_in_board > 1 and k.column_id = lc.id)
      and not (exists (select 1 from public.tasks t where t.card_id = k.id)
               and not exists (select 1 from public.tasks t where t.card_id = k.id and not t.concluida))
    order by k.data_entrega, k.titulo
  loop
    total := total + 1;
    if item.days_left < 0 then
      late := late + 1;
      if late > 5 then continue; end if;
      heading := '⚠️ Atrasadas';
    elsif item.days_left = 0 then
      heading := '📌 Para hoje';
    elsif item.days_left = 1 then
      heading := '⏰ Amanhã (' || weekdays[extract(dow from item.due)::int + 1] || ', ' || to_char(item.due, 'DD/MM') || ')';
    else
      heading := '📅 ' || initcap(weekdays[extract(dow from item.due)::int + 1]) || ', ' || to_char(item.due, 'DD/MM') || ' (em ' || item.days_left || ' dias)';
    end if;
    shown := shown + 1;
    if shown > 15 then continue; end if;
    if heading <> section then
      message := message || case when message = '' then '' else E'\n' end || heading || E'\n';
      section := heading;
    end if;
    message := message || '• ' || left(item.titulo, 120)
      || coalesce(' (' || left(item.disciplina, 60) || ')', '')
      || case when item.days_left < 0 then ' — venceu ' || to_char(item.due, 'DD/MM') else '' end
      || E'\n';
  end loop;

  if total = 0 then return null; end if;
  if late > 5 then message := message || '… e mais ' || (late - 5) || ' atrasadas' || E'\n'; end if;
  if shown > 15 then message := message || '… e mais ' || (shown - 15) || ' demandas' || E'\n'; end if;
  return '🐱 Chiquinho passando pra lembrar:' || E'\n\n' || message
    || coalesce(E'\nAbrir o UGD: ' || site, '');
end;
$$;

-- Processa uma mensagem recebida pelo bot.
create or replace function public.telegram_handle_update(incoming jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  msg jsonb := incoming->'message';
  chat bigint;
  txt text;
  owner_id uuid;
  link public.telegram_links%rowtype;
  digest text;
  local_today date;
begin
  if msg is null or msg->'chat'->>'type' <> 'private' then return; end if;
  chat := (msg->'chat'->>'id')::bigint;
  txt := btrim(coalesce(msg->>'text', ''));

  if txt ~ '^/start [a-f0-9]{32}$' then
    delete from public.telegram_link_codes
     where code = split_part(txt, ' ', 2) and expires_at > now()
    returning user_id into owner_id;
    if owner_id is null then
      perform public.telegram_send(chat, 'Esse link de conexão expirou ou já foi usado. Gere outro no UGD: Configurações → Lembretes no Telegram.');
      return;
    end if;
    -- Um chat atende uma conta só: se estava ligado a outra, desliga de lá.
    delete from public.telegram_links where chat_id = chat and user_id <> owner_id;
    insert into public.telegram_links (user_id, chat_id, username, first_name)
    values (owner_id, chat, left(msg->'chat'->>'username', 64), left(msg->'chat'->>'first_name', 64))
    on conflict (user_id) do update
      set chat_id = excluded.chat_id, username = excluded.username, first_name = excluded.first_name,
          enabled = true, linked_at = now(), last_sent_on = null;
    select * into link from public.telegram_links where user_id = owner_id;
    perform public.telegram_send(chat,
      'Miau! Pronto, conectado ao UGD. 🐱' || E'\n\n'
      || 'Todo dia, a partir das ' || link.remind_hour || 'h, eu mando o que vence nos próximos ' || link.days_ahead || ' dias (e o que estiver atrasado).' || E'\n\n'
      || 'Comandos: /resumo para ver agora, /parar para desligar.');
  elsif txt in ('/parar', '/stop') then
    delete from public.telegram_links where chat_id = chat;
    perform public.telegram_send(chat, 'Lembretes desligados. Para voltar, conecte de novo pelo UGD.');
  elsif txt in ('/resumo', '/hoje') then
    select * into link from public.telegram_links where chat_id = chat;
    if not found then
      perform public.telegram_send(chat, 'Este chat não está conectado a nenhuma conta do UGD.');
      return;
    end if;
    local_today := (now() at time zone link.timezone)::date;
    digest := public.telegram_digest(link.user_id, local_today, link.days_ahead);
    perform public.telegram_send(chat, coalesce(digest, 'Nada vencendo nos próximos ' || link.days_ahead || ' dias. Pode deitar no sofá igual eu. 😸'));
  else
    perform public.telegram_send(chat, 'Oi! Eu sou o Chiquinho do UGD. Para receber lembretes, conecte sua conta pelo app: Configurações → Lembretes no Telegram.' || E'\n\n' || 'Comandos: /resumo, /parar.');
  end if;
end;
$$;

-- Lê as mensagens novas do bot (getUpdates). Roda a cada minuto pelo pg_cron.
-- O pg_net é assíncrono: cada execução processa a resposta da chamada anterior e dispara a próxima.
create or replace function public.telegram_poll()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  state public.telegram_state%rowtype;
  response record;
  payload jsonb;
  item jsonb;
  max_id bigint;
  last_id bigint;
  token text := public.telegram_token();
begin
  if token is null then return; end if;
  select * into state from public.telegram_state where id for update;
  last_id := state.last_update_id;

  if state.pending_request is not null then
    select status_code, content into response from net._http_response where id = state.pending_request;
    if not found then
      -- Resposta ainda não chegou: espera, a não ser que esteja travada há mais de 3 minutos.
      if state.pending_since > now() - interval '3 minutes' then return; end if;
    elsif response.status_code = 200 then
      begin
        payload := response.content::jsonb;
      exception when others then
        payload := null;
      end;
      max_id := last_id;
      for item in select value from jsonb_array_elements(coalesce(payload->'result', '[]'::jsonb)) loop
        max_id := greatest(max_id, (item->>'update_id')::bigint);
        begin
          perform public.telegram_handle_update(item);
        exception when others then
          raise warning 'telegram: falha ao processar update %: %', item->>'update_id', sqlerrm;
        end;
      end loop;
      last_id := max_id;
    end if;
  end if;

  update public.telegram_state
     set last_update_id = last_id,
         pending_request = net.http_get(
           url := 'https://api.telegram.org/bot' || token || '/getUpdates',
           params := jsonb_build_object('offset', (last_id + 1)::text, 'timeout', '0', 'allowed_updates', '["message"]'),
           timeout_milliseconds := 8000
         ),
         pending_since = now()
   where id;

  delete from public.telegram_link_codes where expires_at < now() - interval '1 day';
end;
$$;

-- Envia o resumo do dia para quem já passou do horário escolhido (no fuso de cada um). Uma vez por dia.
create or replace function public.telegram_send_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.telegram_links%rowtype;
  local_now timestamp;
  digest text;
begin
  if public.telegram_token() is null then return; end if;
  for link in select * from public.telegram_links where enabled loop
    begin
      local_now := now() at time zone link.timezone;
      continue when extract(hour from local_now) < link.remind_hour;
      continue when link.last_sent_on is not null and link.last_sent_on >= local_now::date;
      update public.telegram_links set last_sent_on = local_now::date where user_id = link.user_id;
      digest := public.telegram_digest(link.user_id, local_now::date, link.days_ahead);
      if digest is not null then perform public.telegram_send(link.chat_id, digest); end if;
    exception when others then
      raise warning 'telegram: falha no lembrete de %: %', link.user_id, sqlerrm;
    end;
  end loop;
end;
$$;

revoke execute on function public.app_setting(text), public.telegram_token(), public.telegram_send(bigint, text),
  public.telegram_digest(uuid, date, integer), public.telegram_handle_update(jsonb), public.telegram_poll(),
  public.telegram_send_reminders() from public, anon, authenticated;

/* ---------------------------- Para o app ---------------------------- */
-- Cada função age só sobre o usuário logado (auth.uid()); nenhuma recebe id de usuário.

create or replace function public.telegram_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  link public.telegram_links%rowtype;
begin
  if me is null then raise exception 'Não autenticado' using errcode = '28000'; end if;
  select * into link from public.telegram_links where user_id = me;
  return jsonb_build_object(
    'configured', public.telegram_token() is not null and public.app_setting('telegram_bot_username') is not null,
    'linked', found,
    'username', link.username,
    'firstName', link.first_name,
    'enabled', coalesce(link.enabled, true),
    'remindHour', coalesce(link.remind_hour, 19),
    'daysAhead', coalesce(link.days_ahead, 2),
    'timezone', coalesce(link.timezone, 'America/Sao_Paulo')
  );
end;
$$;

-- Gera um link de uso único (15 min) que abre o bot já com o código de conexão.
create or replace function public.telegram_connect()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  bot text := public.app_setting('telegram_bot_username');
  new_code text := replace(gen_random_uuid()::text, '-', '');
begin
  if me is null then raise exception 'Não autenticado' using errcode = '28000'; end if;
  if bot is null or public.telegram_token() is null then raise exception 'O bot do Telegram ainda não foi configurado' using errcode = 'P0001'; end if;
  delete from public.telegram_link_codes where user_id = me;
  insert into public.telegram_link_codes (code, user_id, expires_at) values (new_code, me, now() + interval '15 minutes');
  return jsonb_build_object('url', 'https://t.me/' || bot || '?start=' || new_code);
end;
$$;

create or replace function public.telegram_update_settings(p_enabled boolean, p_remind_hour integer, p_days_ahead integer, p_timezone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Não autenticado' using errcode = '28000'; end if;
  if p_remind_hour not between 0 and 23 or p_days_ahead not between 1 and 7 then raise exception 'Valores inválidos' using errcode = '22023'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'Fuso horário inválido' using errcode = '22023'; end if;
  update public.telegram_links
     set enabled = coalesce(p_enabled, enabled),
         remind_hour = p_remind_hour,
         days_ahead = p_days_ahead,
         -- Mudou o horário para mais tarde hoje? Permite receber de novo no novo horário.
         last_sent_on = case when p_remind_hour <> remind_hour then null else last_sent_on end,
         timezone = p_timezone
   where user_id = me;
end;
$$;

create or replace function public.telegram_disconnect()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  chat bigint;
begin
  if me is null then raise exception 'Não autenticado' using errcode = '28000'; end if;
  delete from public.telegram_links where user_id = me returning chat_id into chat;
  delete from public.telegram_link_codes where user_id = me;
  if chat is not null then perform public.telegram_send(chat, 'Lembretes desligados pelo app. Até mais! 🐱'); end if;
end;
$$;

-- Manda o resumo agora (ou um aviso de "nada vencendo"). No máximo uma vez por minuto.
create or replace function public.telegram_send_test()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  link public.telegram_links%rowtype;
  digest text;
begin
  if me is null then raise exception 'Não autenticado' using errcode = '28000'; end if;
  select * into link from public.telegram_links where user_id = me;
  if not found then raise exception 'Telegram não conectado' using errcode = 'P0002'; end if;
  if link.last_test_at > now() - interval '1 minute' then raise exception 'Aguarde um minuto para testar de novo' using errcode = 'P0003'; end if;
  update public.telegram_links set last_test_at = now() where user_id = me;
  digest := public.telegram_digest(me, (now() at time zone link.timezone)::date, link.days_ahead);
  perform public.telegram_send(link.chat_id, coalesce(digest, 'Teste do UGD: tudo certo por aqui! Nada vencendo nos próximos ' || link.days_ahead || ' dias. 😸'));
end;
$$;

revoke execute on function public.telegram_status(), public.telegram_connect(), public.telegram_update_settings(boolean, integer, integer, text),
  public.telegram_disconnect(), public.telegram_send_test() from public, anon;
grant execute on function public.telegram_status(), public.telegram_connect(), public.telegram_update_settings(boolean, integer, integer, text),
  public.telegram_disconnect(), public.telegram_send_test() to authenticated;

/* ----------------------------- Agendamento ----------------------------- */
-- Recria os agendamentos (rodar a migration de novo não duplica).

select cron.unschedule(jobid) from cron.job where jobname in ('ugd-telegram-poll', 'ugd-telegram-reminders');
select cron.schedule('ugd-telegram-poll', '* * * * *', 'select public.telegram_poll()');
select cron.schedule('ugd-telegram-reminders', '*/10 * * * *', 'select public.telegram_send_reminders()');

-- Conferência (opcional):
--   select jobname, schedule, active from cron.job where jobname like 'ugd-%';
--   select * from net._http_response order by created desc limit 5;   -- respostas do Telegram
