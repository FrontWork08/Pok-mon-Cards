create or replace function private.update_mastery_for_battle(p_battle uuid,p_winner uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_key text;
  v_gain integer;
  v_kos integer;
begin
  for r in
    select distinct x.player_id,x.card_id,c.pokemon_name,c.pokedex_numbers
    from (
      select player_id,card_id from private.battle_team_members where battle_id=p_battle
      union
      select player_id,card_id from public.battle_selections where battle_id=p_battle
    ) x
    join public.cards c on c.id=x.card_id
    join public.players p on p.id=x.player_id and coalesce(p.is_bot,false)=false
  loop
    v_key:=coalesce(r.pokedex_numbers[1]::text,lower(coalesce(r.pokemon_name,r.card_id)));
    v_gain:=20+case when r.player_id=p_winner then 30 else 0 end;

    select count(*)::integer into v_kos
    from private.battle_game_turns t
    cross join lateral jsonb_array_elements(jsonb_build_array(t.result->'firstMove',t.result->'secondMove')) mv(move)
    where t.battle_id=p_battle
      and mv.move is not null
      and mv.move<> 'null'::jsonb
      and mv.move->>'playerId'=r.player_id::text
      and coalesce(nullif(mv.move->>'targetHpAfter','')::integer,-1)=0
      and (
        (t.result->'challenger'->>'playerId'=r.player_id::text and t.result->'challenger'->>'cardId'=r.card_id)
        or
        (t.result->'opponent'->>'playerId'=r.player_id::text and t.result->'opponent'->>'cardId'=r.card_id)
      );

    insert into public.pokemon_mastery(player_id,pokemon_key,pokemon_name,xp,level,battles,wins,kos)
    values(r.player_id,v_key,coalesce(r.pokemon_name,'Pokémon'),v_gain,1,1,case when r.player_id=p_winner then 1 else 0 end,coalesce(v_kos,0))
    on conflict(player_id,pokemon_key) do update set
      pokemon_name=excluded.pokemon_name,
      xp=public.pokemon_mastery.xp+excluded.xp,
      battles=public.pokemon_mastery.battles+1,
      wins=public.pokemon_mastery.wins+excluded.wins,
      kos=public.pokemon_mastery.kos+excluded.kos,
      level=least(100,1+floor(sqrt((public.pokemon_mastery.xp+excluded.xp)::numeric)/5)::integer),
      updated_at=now();
  end loop;
end;
$$;
