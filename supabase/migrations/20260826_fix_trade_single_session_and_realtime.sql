-- Keep exactly one pending trade for each unordered player pair.
-- Prefer the trade that already has cards, then confirmations, then recent activity.
with ranked as (
  select
    t.id,
    row_number() over (
      partition by least(t.sender_id, t.receiver_id), greatest(t.sender_id, t.receiver_id)
      order by
        (select count(*) from public.trade_cards tc where tc.trade_id = t.id) desc,
        ((case when t.sender_confirmed then 1 else 0 end) +
         (case when t.receiver_confirmed then 1 else 0 end)) desc,
        t.updated_at desc,
        t.created_at desc
    ) as rn
  from public.trades t
  where t.status = 'pending'
)
update public.trades t
set status = 'cancelled',
    updated_at = now()
from ranked r
where t.id = r.id
  and r.rn > 1;

create unique index if not exists trades_one_pending_pair_idx
on public.trades (
  least(sender_id, receiver_id),
  greatest(sender_id, receiver_id)
)
where status = 'pending';

create or replace function public.server_create_trade(
  p_sender_id uuid,
  p_receiver_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade_id uuid;
begin
  if p_sender_id = p_receiver_id then
    raise exception 'INVALID_TRADE_PARTICIPANTS';
  end if;

  if not exists (select 1 from public.players where id = p_sender_id) then
    raise exception 'SENDER_NOT_FOUND';
  end if;

  if not exists (select 1 from public.players where id = p_receiver_id) then
    raise exception 'RECEIVER_NOT_FOUND';
  end if;

  select t.id
  into v_trade_id
  from public.trades t
  where t.status = 'pending'
    and (
      (t.sender_id = p_sender_id and t.receiver_id = p_receiver_id)
      or
      (t.sender_id = p_receiver_id and t.receiver_id = p_sender_id)
    )
  order by
    (select count(*) from public.trade_cards tc where tc.trade_id = t.id) desc,
    ((case when t.sender_confirmed then 1 else 0 end) +
     (case when t.receiver_confirmed then 1 else 0 end)) desc,
    t.updated_at desc
  limit 1;

  if v_trade_id is not null then
    return v_trade_id;
  end if;

  begin
    insert into public.trades (sender_id, receiver_id, status)
    values (p_sender_id, p_receiver_id, 'pending')
    returning id into v_trade_id;
  exception
    when unique_violation then
      select t.id
      into v_trade_id
      from public.trades t
      where t.status = 'pending'
        and (
          (t.sender_id = p_sender_id and t.receiver_id = p_receiver_id)
          or
          (t.sender_id = p_receiver_id and t.receiver_id = p_sender_id)
        )
      order by t.updated_at desc
      limit 1;
  end;

  return v_trade_id;
end;
$$;

revoke all on function public.server_create_trade(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.server_create_trade(uuid, uuid)
to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trades'
  ) then
    alter publication supabase_realtime add table public.trades;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trade_cards'
  ) then
    alter publication supabase_realtime add table public.trade_cards;
  end if;
end
$$;
