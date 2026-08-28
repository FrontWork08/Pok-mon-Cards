-- Allow signed administrative currency adjustments and add safe batch removal RPCs.
-- Negative audit amounts represent corrections/removals; positive amounts remain grants.

alter table public.admin_coin_adjustments
  drop constraint if exists admin_coin_adjustments_amount_check;
alter table public.admin_coin_adjustments
  add constraint admin_coin_adjustments_amount_check check (amount <> 0);

alter table public.admin_diamond_adjustments
  drop constraint if exists admin_diamond_adjustments_amount_check;
alter table public.admin_diamond_adjustments
  add constraint admin_diamond_adjustments_amount_check check (amount <> 0);

create or replace function public.server_admin_remove_coins_batch(
  p_actor_id uuid,
  p_target_ids uuid[],
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_targets uuid[];
  v_player record;
  v_after bigint;
  v_count integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.admin_members where player_id=p_actor_id) then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then raise exception 'INVALID_AMOUNT'; end if;

  select array_agg(distinct target_id order by target_id)
  into v_targets
  from unnest(coalesce(p_target_ids,'{}'::uuid[])) selected(target_id)
  where target_id is not null;

  if coalesce(cardinality(v_targets),0) < 1 or cardinality(v_targets) > 100 then raise exception 'INVALID_TARGETS'; end if;

  for v_player in
    select id,username,coins
    from public.players
    where id=any(v_targets)
    order by id
    for update
  loop
    if v_player.coins < p_amount then raise exception 'INSUFFICIENT_COINS:%', v_player.username; end if;

    update public.players
    set coins=coins-p_amount
    where id=v_player.id
    returning coins into v_after;

    insert into public.admin_coin_adjustments(admin_id,target_id,amount,balance_before,balance_after,note)
    values(
      p_actor_id,v_player.id,-p_amount,v_player.coins,v_after,
      nullif(left(trim(coalesce(p_note,'')),180),'')
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'targetId',v_player.id,'username',v_player.username,'amount',p_amount,
      'balanceBefore',v_player.coins,'balanceAfter',v_after
    ));
    v_count := v_count + 1;
  end loop;

  if v_count <> cardinality(v_targets) then raise exception 'PLAYER_NOT_FOUND'; end if;

  return jsonb_build_object(
    'recipientCount',v_count,'amountEach',p_amount,
    'totalRemoved',p_amount*v_count,'recipients',v_results
  );
end;
$$;

create or replace function public.server_admin_remove_diamonds_batch(
  p_actor_id uuid,
  p_target_ids uuid[],
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_targets uuid[];
  v_player record;
  v_after bigint;
  v_count integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.admin_members where player_id=p_actor_id) then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'INVALID_AMOUNT'; end if;

  select array_agg(distinct target_id order by target_id)
  into v_targets
  from unnest(coalesce(p_target_ids,'{}'::uuid[])) selected(target_id)
  where target_id is not null;

  if coalesce(cardinality(v_targets),0) < 1 or cardinality(v_targets) > 100 then raise exception 'INVALID_TARGETS'; end if;

  for v_player in
    select id,username,diamonds
    from public.players
    where id=any(v_targets)
    order by id
    for update
  loop
    if v_player.diamonds < p_amount then raise exception 'INSUFFICIENT_DIAMONDS:%', v_player.username; end if;

    update public.players
    set diamonds=diamonds-p_amount
    where id=v_player.id
    returning diamonds into v_after;

    insert into public.admin_diamond_adjustments(admin_id,target_id,amount,balance_before,balance_after,note)
    values(
      p_actor_id,v_player.id,-p_amount,v_player.diamonds,v_after,
      nullif(left(trim(coalesce(p_note,'')),180),'')
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'targetId',v_player.id,'username',v_player.username,'amount',p_amount,
      'balanceBefore',v_player.diamonds,'balanceAfter',v_after
    ));
    v_count := v_count + 1;
  end loop;

  if v_count <> cardinality(v_targets) then raise exception 'PLAYER_NOT_FOUND'; end if;

  return jsonb_build_object(
    'recipientCount',v_count,'amountEach',p_amount,
    'totalRemoved',p_amount*v_count,'recipients',v_results
  );
end;
$$;

revoke all on function public.server_admin_remove_coins_batch(uuid,uuid[],bigint,text) from public,anon,authenticated;
grant execute on function public.server_admin_remove_coins_batch(uuid,uuid[],bigint,text) to service_role;

revoke all on function public.server_admin_remove_diamonds_batch(uuid,uuid[],bigint,text) from public,anon,authenticated;
grant execute on function public.server_admin_remove_diamonds_batch(uuid,uuid[],bigint,text) to service_role;
