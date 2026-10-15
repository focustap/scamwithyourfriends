-- Run as postgres in the Dashboard SQL Editor. No credentials belong in SQL.
-- Tables live outside the exposed public schema. RPCs are invoker-only and
-- executable solely by service_role (the Edge Function's internal DB identity).
begin;
create schema if not exists game_private;
revoke all on schema game_private from public, anon, authenticated;
grant usage on schema game_private to service_role;

create table game_private.ai_control (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  mode text not null default 'mock' check (mode in ('mock','live')),
  allow_live boolean not null default false,
  daily_tokens integer not null default 50000 check (daily_tokens between 1000 and 1000000),
  daily_requests integer not null default 1 check (daily_requests between 1 and 1000),
  per_minute integer not null default 6 check (per_minute between 1 and 12),
  concurrent_requests integer not null default 2 check (concurrent_requests between 1 and 2),
  output_tokens integer not null default 320 check (output_tokens between 180 and 400)
);
insert into game_private.ai_control(id) values(true);
create table game_private.ai_days (
  day date not null,
  mode text not null check (mode in ('mock','live')),
  tokens bigint not null default 0 check (tokens >= 0),
  requests integer not null default 0 check (requests >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  blocked boolean not null default false,
  primary key (day, mode)
);
create table game_private.ai_reservations (
  request_id uuid primary key,
  day date not null,
  mode text not null,
  payload_hash text not null check (length(payload_hash) = 64),
  reserved_tokens integer not null check (reserved_tokens > 0),
  charged_tokens integer not null check (charged_tokens >= 0),
  state text not null default 'reserved' check (state in ('reserved','settled','failed')),
  created_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz,
  foreign key (day, mode) references game_private.ai_days(day, mode)
);
create index ai_reservations_recent on game_private.ai_reservations(mode, created_at desc);
create index ai_reservations_inflight on game_private.ai_reservations(created_at) where state = 'reserved';
alter table game_private.ai_control enable row level security;
alter table game_private.ai_days enable row level security;
alter table game_private.ai_reservations enable row level security;
revoke all on all tables in schema game_private from public, anon, authenticated;
grant select, update on game_private.ai_control to service_role;
grant select, insert, update on game_private.ai_days, game_private.ai_reservations to service_role;

create function public.npc_usage_status() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  c game_private.ai_control%rowtype;
  d game_private.ai_days%rowtype;
  today date := (clock_timestamp() at time zone 'UTC')::date;
begin
  select * into strict c from game_private.ai_control where id = true;
  select * into d from game_private.ai_days where day = today and mode = c.mode;
  return jsonb_build_object('date', today, 'mode', c.mode, 'enabled', c.enabled,
    'liveAllowed', c.allow_live, 'tokens', coalesce(d.tokens,0), 'requests', coalesce(d.requests,0),
    'inputTokens', coalesce(d.input_tokens,0), 'outputTokens', coalesce(d.output_tokens,0),
    'tokenLimit', c.daily_tokens, 'requestLimit', c.daily_requests, 'outputLimit', c.output_tokens,
    'blocked', not c.enabled or (c.mode = 'live' and not c.allow_live) or coalesce(d.blocked,false)
      or coalesce(d.tokens,0) >= c.daily_tokens or coalesce(d.requests,0) >= c.daily_requests);
end $$;

create function public.npc_reserve(p_request_id uuid, p_tokens integer, p_payload_hash text, p_mode text, p_output_tokens integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  c game_private.ai_control%rowtype;
  d game_private.ai_days%rowtype;
  today date;
  recent integer;
  inflight integer;
begin
  -- One small locked control row serializes policy, rate, concurrency, day creation
  -- and all token/request updates across isolates and Node restarts.
  select * into strict c from game_private.ai_control where id = true for update;
  today := (clock_timestamp() at time zone 'UTC')::date;
  if not c.enabled or (c.mode = 'live' and not c.allow_live) then raise exception 'AI_DISABLED'; end if;
  if p_mode is distinct from c.mode then raise exception 'MODE_CHANGED'; end if;
  if p_request_id is null or p_tokens is null or p_tokens not between 1 and 32000
     or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
     or p_output_tokens is null or p_output_tokens not between 180 and c.output_tokens then raise exception 'INVALID_RESERVATION'; end if;
  if exists (select 1 from game_private.ai_reservations where request_id = p_request_id) then raise exception 'DUPLICATE_REQUEST'; end if;
  insert into game_private.ai_days(day,mode) values(today,c.mode) on conflict do nothing;
  select * into strict d from game_private.ai_days where day = today and mode = c.mode for update;
  if d.blocked or d.tokens + p_tokens > c.daily_tokens or d.requests >= c.daily_requests then raise exception 'DAILY_BUDGET'; end if;
  select count(*) into recent from game_private.ai_reservations
    where mode = c.mode and created_at > clock_timestamp() - interval '1 minute';
  -- Expired leases release concurrency only; tokens remain charged forever until
  -- known usage is settled. Provider timeout is 9s, below this 30s lease.
  select count(*) into inflight from game_private.ai_reservations
    where state = 'reserved' and created_at > clock_timestamp() - interval '30 seconds';
  if recent >= c.per_minute or inflight >= c.concurrent_requests then raise exception 'RATE_LIMIT'; end if;
  insert into game_private.ai_reservations(request_id,day,mode,payload_hash,reserved_tokens,charged_tokens)
    values(p_request_id,today,c.mode,p_payload_hash,p_tokens,p_tokens);
  update game_private.ai_days set tokens = tokens + p_tokens, requests = requests + 1 where day = today and mode = c.mode;
  return public.npc_usage_status();
end $$;

create function public.npc_settle(p_request_id uuid, p_input integer, p_output integer, p_total integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r game_private.ai_reservations%rowtype; actual integer;
begin
  perform 1 from game_private.ai_control where id = true for update;
  select * into strict r from game_private.ai_reservations where request_id = p_request_id for update;
  if r.state <> 'reserved' then return public.npc_usage_status(); end if;
  if p_input is null or p_output is null or p_total is null or p_input < 0 or p_output < 0
    or p_total < p_input::bigint + p_output::bigint or p_total > 1000000 then raise exception 'INVALID_USAGE'; end if;
  actual := p_total;
  update game_private.ai_days set tokens = tokens + actual - r.charged_tokens,
    input_tokens = input_tokens + p_input, output_tokens = output_tokens + p_output,
    blocked = blocked or actual > r.reserved_tokens where day = r.day and mode = r.mode;
  update game_private.ai_reservations set state = 'settled', charged_tokens = actual, settled_at = clock_timestamp() where request_id = r.request_id;
  return public.npc_usage_status();
end $$;

create function public.npc_fail(p_request_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from game_private.ai_control where id = true for update;
  update game_private.ai_reservations set state = 'failed', settled_at = clock_timestamp() where request_id = p_request_id and state = 'reserved';
  -- Deliberately retain the entire charged reservation on unknown usage.
  return public.npc_usage_status();
end $$;

revoke all on function public.npc_usage_status() from public, anon, authenticated;
revoke all on function public.npc_reserve(uuid,integer,text,text,integer) from public, anon, authenticated;
revoke all on function public.npc_settle(uuid,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.npc_fail(uuid) from public, anon, authenticated;
grant execute on function public.npc_usage_status(), public.npc_reserve(uuid,integer,text,text,integer),
  public.npc_settle(uuid,integer,integer,integer), public.npc_fail(uuid) to service_role;
commit;
