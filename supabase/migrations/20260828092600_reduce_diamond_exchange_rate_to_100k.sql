create or replace function private.exchange_coins_for_diamonds(p_diamonds integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := auth.uid();
  v_rate bigint := 100000;
  v_cost bigint;
  v_coins bigint;
  v_diamonds integer;
begin
  if v_player is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_diamonds < 1 or p_diamonds > 20 then
    raise exception 'INVALID_DIAMOND_AMOUNT';
  end if;

  v_cost := v_rate * p_diamonds;

  select coins, diamonds
  into v_coins, v_diamonds
  from public.players
  where id = v_player
    and account_status = 'active'
  for update;

  if not found then
    raise exception 'PLAYER_NOT_AVAILABLE';
  end if;

  if v_coins < v_cost then
    raise exception 'NOT_ENOUGH_COINS';
  end if;

  update public.players
  set coins = coins - v_cost,
      diamonds = diamonds + p_diamonds
  where id = v_player
  returning coins, diamonds into v_coins, v_diamonds;

  insert into public.diamond_exchange_log(player_id, diamonds, coins_spent)
  values(v_player, p_diamonds, v_cost);

  return jsonb_build_object(
    'diamondsBought', p_diamonds,
    'coinsSpent', v_cost,
    'rate', v_rate,
    'coins', v_coins,
    'diamonds', v_diamonds
  );
end;
$$;
