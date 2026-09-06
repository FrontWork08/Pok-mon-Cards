create or replace function public.server_set_adventure_battle_team(
  p_actor_id uuid,
  p_battle_id uuid,
  p_card_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  ctx public.adventure_battle_context%rowtype;
  v_required text;
  v_invalid integer;
begin
  select * into ctx
  from public.adventure_battle_context
  where battle_id=p_battle_id;

  if ctx.battle_id is null then
    return public.server_set_battle_team(p_actor_id,p_battle_id,p_card_ids);
  end if;

  if ctx.player_id<>p_actor_id then
    raise exception 'FORBIDDEN';
  end if;

  if ctx.kind='challenge' then
    select required_type into v_required
    from public.battle_challenges
    where id=ctx.ref_id and active=true;

    if v_required is not null then
      select count(*) into v_invalid
      from unnest(p_card_ids) cid
      left join public.cards c on c.id=cid
      where c.id is null
         or not exists(
           select 1
           from unnest(coalesce(c.game_types,c.types,'{}'::text[])) t
           where lower(t)=lower(v_required)
         );
      if v_invalid>0 then raise exception 'CHALLENGE_TEAM_TYPE_REQUIRED'; end if;
    end if;
  elsif ctx.kind='rogue' then
    select count(*) into v_invalid
    from unnest(p_card_ids) cid
    where not exists(
      select 1 from public.rogue_run_cards rr
      where rr.run_id=ctx.run_id and rr.card_id=cid
    );
    if v_invalid>0 then raise exception 'ROGUE_CARD_NOT_IN_RUN_POOL'; end if;
  end if;

  return public.server_set_battle_team(p_actor_id,p_battle_id,p_card_ids);
end;
$$;

grant execute on function public.server_set_adventure_battle_team(uuid,uuid,text[]) to authenticated;
