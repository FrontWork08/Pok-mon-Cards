DO $do$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='server_lock_battle_card'
    and p.prokind='f'
  order by p.oid
  limit 1;

  if v_oid is null then
    raise exception 'server_lock_battle_card function not found';
  end if;

  v_def:=pg_get_functiondef(v_oid);
  v_old:=$old$  if b.engine_version='game_v1' and v_count=2 then
    v_attack_phase:=private.battle_game_init_fighters(b.id,b.active_round);
    if not coalesce((v_attack_phase->>'initialized')::boolean,false) then
      if v_attack_phase ? 'unsupportedCardId' then
        if not exists(
          select 1 from public.battle_selections s
          where s.battle_id=b.id and s.round_no=b.active_round
            and not private.battle_card_rules_ready(s.card_id)
        ) then
          update public.battles set engine_version='tcg_v6',updated_at=now() where id=b.id;
          b.engine_version:='tcg_v6';
        else
          raise exception 'GAME_PROFILE_UNAVAILABLE';
        end if;
      end if;
    end if;
  end if;$old$;

  v_new:=$new$  if b.engine_version='game_v1' and v_count=2 then
    v_attack_phase:=private.battle_game_init_fighters(b.id,b.active_round);
    if not coalesce((v_attack_phase->>'initialized')::boolean,false)
       and v_attack_phase ? 'unsupportedCardId'
    then
      raise exception 'GAME_PROFILE_UNAVAILABLE';
    end if;
  end if;$new$;

  if position(v_old in v_def)=0 then
    raise exception 'Expected second game_v1 fallback block not found';
  end if;

  execute replace(v_def,v_old,v_new);
end;
$do$;
