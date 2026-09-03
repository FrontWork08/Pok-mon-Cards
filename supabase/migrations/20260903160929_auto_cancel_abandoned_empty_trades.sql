
create or replace function public.server_abandon_trade(
  p_actor_id uuid,
  p_trade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_trade public.trades%rowtype;
  v_card_count integer;
begin
  select * into v_trade
  from public.trades
  where id=p_trade_id
  for update;

  if not found then
    return jsonb_build_object('cancelled',false,'reason','not_found');
  end if;

  if p_actor_id<>v_trade.sender_id and p_actor_id<>v_trade.receiver_id then
    raise exception 'NOT_TRADE_PARTICIPANT';
  end if;

  if v_trade.status<>'pending' then
    return jsonb_build_object('cancelled',false,'reason','not_pending','status',v_trade.status);
  end if;

  select count(*) into v_card_count
  from public.trade_cards
  where trade_id=p_trade_id;

  if v_card_count>0 or v_trade.sender_confirmed or v_trade.receiver_confirmed then
    return jsonb_build_object(
      'cancelled',false,
      'reason','has_negotiation',
      'cardRows',v_card_count,
      'senderConfirmed',v_trade.sender_confirmed,
      'receiverConfirmed',v_trade.receiver_confirmed
    );
  end if;

  update public.trades
  set status='cancelled',updated_at=now()
  where id=p_trade_id;

  return jsonb_build_object('cancelled',true,'reason','empty_abandoned');
end;
$function$;

create or replace function public.server_cleanup_abandoned_trades(
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  with cancelled as (
    update public.trades t
    set status='cancelled',updated_at=now()
    where t.status='pending'
      and t.sender_id=p_actor_id
      and not t.sender_confirmed
      and not t.receiver_confirmed
      and not exists (
        select 1
        from public.trade_cards tc
        where tc.trade_id=t.id
      )
    returning t.id
  )
  select count(*) into v_count from cancelled;

  return coalesce(v_count,0);
end;
$function$;

-- Clean up the historical stuck trades that are clearly abandoned.
update public.trades t
set status='cancelled',updated_at=now()
where t.status='pending'
  and not t.sender_confirmed
  and not t.receiver_confirmed
  and t.updated_at < now()-interval '24 hours'
  and not exists (
    select 1
    from public.trade_cards tc
    where tc.trade_id=t.id
  );

create or replace function public.server_create_trade(
  p_sender_id uuid,
  p_receiver_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_trade_id uuid;
begin
  if p_sender_id=p_receiver_id then
    raise exception 'INVALID_TRADE_PARTICIPANTS';
  end if;

  if not exists (select 1 from public.players where id=p_sender_id) then
    raise exception 'SENDER_NOT_FOUND';
  end if;

  if not exists (select 1 from public.players where id=p_receiver_id) then
    raise exception 'RECEIVER_NOT_FOUND';
  end if;

  -- Starting a new negotiation must not leave empty negotiations created
  -- by this sender stuck as "pending".
  perform public.server_cleanup_abandoned_trades(p_sender_id);

  select t.id
  into v_trade_id
  from public.trades t
  where t.status='pending'
    and (
      (t.sender_id=p_sender_id and t.receiver_id=p_receiver_id)
      or
      (t.sender_id=p_receiver_id and t.receiver_id=p_sender_id)
    )
  order by
    (select count(*) from public.trade_cards tc where tc.trade_id=t.id) desc,
    ((case when t.sender_confirmed then 1 else 0 end)+
     (case when t.receiver_confirmed then 1 else 0 end)) desc,
    t.updated_at desc
  limit 1;

  if v_trade_id is not null then
    return v_trade_id;
  end if;

  begin
    insert into public.trades(sender_id,receiver_id,status)
    values(p_sender_id,p_receiver_id,'pending')
    returning id into v_trade_id;
  exception
    when unique_violation then
      select t.id
      into v_trade_id
      from public.trades t
      where t.status='pending'
        and (
          (t.sender_id=p_sender_id and t.receiver_id=p_receiver_id)
          or
          (t.sender_id=p_receiver_id and t.receiver_id=p_sender_id)
        )
      order by t.updated_at desc
      limit 1;
  end;

  return v_trade_id;
end;
$function$;
