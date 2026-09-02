create or replace function public.server_get_battle_attack_state(
  p_actor_id uuid,
  p_battle_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  b public.battles%rowtype;
  v_card text;
  v_opponent_card text;
  v_attack text;
  v_opponent uuid;
  v_opponent_locked boolean;
  v_card_row public.cards%rowtype;
  v_opponent_card_row public.cards%rowtype;
begin
  select * into b from public.battles where id=p_battle_id;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;

  v_opponent:=case when p_actor_id=b.challenger_id then b.opponent_id else b.challenger_id end;

  select s.card_id into v_card
  from public.battle_selections s
  where s.battle_id=b.id and s.round_no=b.active_round and s.player_id=p_actor_id;

  select s.card_id into v_opponent_card
  from public.battle_selections s
  where s.battle_id=b.id and s.round_no=b.active_round and s.player_id=v_opponent;

  if v_card is not null then
    select * into v_card_row from public.cards where id=v_card;
  end if;

  if v_opponent_card is not null then
    select * into v_opponent_card_row from public.cards where id=v_opponent_card;
  end if;

  select a.attack_name into v_attack
  from private.battle_attack_choices a
  where a.battle_id=b.id and a.round_no=b.active_round and a.player_id=p_actor_id;

  select exists(
    select 1 from private.battle_attack_choices a
    where a.battle_id=b.id and a.round_no=b.active_round and a.player_id=v_opponent
  ) into v_opponent_locked;

  return jsonb_build_object(
    'required',b.mode='draft3' and b.status='revealing',
    'status',b.status,
    'round',b.active_round,
    'deadline',b.selection_deadline,
    'myCardId',v_card,
    'myCardName',v_card_row.pokemon_name,
    'myCardImage',v_card_row.image_small,
    'myPokedexNumber',case when coalesce(array_length(v_card_row.pokedex_numbers,1),0)>0 then v_card_row.pokedex_numbers[1] else null end,
    'myHp',v_card_row.tcg_data->>'hp',
    'opponentCardId',v_opponent_card,
    'opponentCardName',v_opponent_card_row.pokemon_name,
    'opponentCardImage',v_opponent_card_row.image_small,
    'opponentPokedexNumber',case when coalesce(array_length(v_opponent_card_row.pokedex_numbers,1),0)>0 then v_opponent_card_row.pokedex_numbers[1] else null end,
    'opponentHp',v_opponent_card_row.tcg_data->>'hp',
    'attacks',coalesce(v_card_row.tcg_data->'attacks','[]'::jsonb),
    'myAttackName',v_attack,
    'myLocked',v_attack is not null,
    'opponentLocked',v_opponent_locked
  );
end;
$$;

revoke all on function public.server_get_battle_attack_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_get_battle_attack_state(uuid,uuid) to service_role;
