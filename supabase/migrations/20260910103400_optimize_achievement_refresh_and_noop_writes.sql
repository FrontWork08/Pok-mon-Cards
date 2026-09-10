create or replace function public.server_set_achievement_progress(p_player_id uuid, p_achievement_id text, p_progress integer)
returns void
language sql
security definer
set search_path to ''
as $function$
  insert into public.player_achievements(player_id, achievement_id, progress, unlocked_at, updated_at)
  select
    p_player_id,
    d.id,
    greatest(0, p_progress),
    case when p_progress >= d.target then now() else null end,
    now()
  from public.achievement_definitions d
  where d.id = p_achievement_id and d.active
  on conflict (player_id, achievement_id) do update set
    progress = greatest(public.player_achievements.progress, excluded.progress),
    unlocked_at = coalesce(public.player_achievements.unlocked_at, excluded.unlocked_at),
    updated_at = now()
  where excluded.progress > public.player_achievements.progress
     or (public.player_achievements.unlocked_at is null and excluded.unlocked_at is not null);
$function$;

create or replace function public.server_refresh_player_achievements(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p public.players%rowtype;
  v_creator boolean:=false;
  v_epoch timestamptz:=private.release_progress_epoch();
  v_beat_creator integer:=0;
  v_draft_win integer:=0;
  v_draft_perfect integer:=0;
  v_ranked integer:=0;
  v_unique_cards integer:=0;
  v_packs integer:=0;
  v_trades integer:=0;
  v_species integer:=0;
  v_gen1 integer:=0;
  v_gen2 integer:=0;
  v_gen3 integer:=0;
  v_gen4 integer:=0;
  v_gen5 integer:=0;
  v_gen6 integer:=0;
  v_gen7 integer:=0;
  v_gen8 integer:=0;
  v_gen9 integer:=0;
  v_completed_sets integer:=0;
begin
  select * into p from public.players where id=p_player_id;
  if p.id is null then return; end if;

  select exists(
    select 1 from public.admin_members a
    where a.player_id=p_player_id and a.role='owner'
  ) into v_creator;

  if v_creator then
    perform public.server_set_achievement_progress(p_player_id,'creator_owner',1);
  end if;

  select
    count(*) filter(
      where b.winner_id=p_player_id
        and exists(
          select 1 from public.admin_members a
          where a.player_id=case when b.challenger_id=p_player_id then b.opponent_id else b.challenger_id end
        )
    )::integer,
    count(*) filter(where b.mode='draft3' and b.winner_id=p_player_id)::integer,
    count(*) filter(
      where b.mode='draft3' and b.winner_id=p_player_id
        and (
          (b.challenger_id=p_player_id and b.challenger_score=3 and b.opponent_score=0)
          or (b.opponent_id=p_player_id and b.opponent_score=3 and b.challenger_score=0)
        )
    )::integer,
    count(*) filter(where b.is_ranked)::integer
  into v_beat_creator,v_draft_win,v_draft_perfect,v_ranked
  from public.battles b
  where b.status='completed'
    and b.completed_at>=v_epoch
    and (b.challenger_id=p_player_id or b.opponent_id=p_player_id);

  perform public.server_set_achievement_progress(p_player_id,'beat_creator',v_beat_creator);
  perform public.server_set_achievement_progress(p_player_id,'first_win',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_10',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_50',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_100',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'streak_3',p.best_battle_streak);
  perform public.server_set_achievement_progress(p_player_id,'streak_5',p.best_battle_streak);
  perform public.server_set_achievement_progress(p_player_id,'streak_10',p.best_battle_streak);
  perform public.server_set_achievement_progress(p_player_id,'draft_win',v_draft_win);
  perform public.server_set_achievement_progress(p_player_id,'draft_perfect',v_draft_perfect);

  select count(*)::integer into v_unique_cards
  from public.player_cards pc
  where pc.player_id=p_player_id and pc.quantity>0;
  perform public.server_set_achievement_progress(p_player_id,'collector_100',v_unique_cards);
  perform public.server_set_achievement_progress(p_player_id,'collector_500',v_unique_cards);
  perform public.server_set_achievement_progress(p_player_id,'collector_1000',v_unique_cards);

  select count(*)::integer into v_packs
  from public.pack_openings po
  where po.player_id=p_player_id and po.opened_at>=v_epoch;
  perform public.server_set_achievement_progress(p_player_id,'packs_25',v_packs);
  perform public.server_set_achievement_progress(p_player_id,'packs_100',v_packs);
  perform public.server_set_achievement_progress(p_player_id,'packs_500',v_packs);

  select count(*)::integer into v_trades
  from public.trades t
  where t.status::text='completed'
    and (t.sender_id=p_player_id or t.receiver_id=p_player_id)
    and t.updated_at>=v_epoch;
  perform public.server_set_achievement_progress(p_player_id,'trades_10',v_trades);

  select
    count(distinct n)::integer,
    count(distinct n) filter(where n between 1 and 151)::integer,
    count(distinct n) filter(where n between 152 and 251)::integer,
    count(distinct n) filter(where n between 252 and 386)::integer,
    count(distinct n) filter(where n between 387 and 493)::integer,
    count(distinct n) filter(where n between 494 and 649)::integer,
    count(distinct n) filter(where n between 650 and 721)::integer,
    count(distinct n) filter(where n between 722 and 809)::integer,
    count(distinct n) filter(where n between 810 and 905)::integer,
    count(distinct n) filter(where n between 906 and 1025)::integer
  into v_species,v_gen1,v_gen2,v_gen3,v_gen4,v_gen5,v_gen6,v_gen7,v_gen8,v_gen9
  from public.player_cards pc
  join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0;

  perform public.server_set_achievement_progress(p_player_id,'pokedex_151',v_species);
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_1',v_gen1);
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_2',v_gen2);
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_3',v_gen3);
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_4',v_gen4);
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_5',v_gen5);
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_6',v_gen6);
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_7',v_gen7);
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_8',v_gen8);
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_9',v_gen9);

  select count(*)::integer into v_completed_sets
  from (
    select c.set_id
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=p_player_id and pc.quantity>0
    group by c.set_id
    having count(*) >= (select count(*) from public.cards c2 where c2.set_id=c.set_id)
  ) completed_sets;
  perform public.server_set_achievement_progress(p_player_id,'set_complete_1',v_completed_sets);

  perform public.server_set_achievement_progress(p_player_id,'ranked_25',v_ranked);
  perform public.server_set_achievement_progress(p_player_id,'rank_starter',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_ace',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_veteran',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_elite',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_master',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_grand',p.battle_rating);

  perform private.refresh_secret_achievements(p_player_id);

  if v_creator and p.equipped_title_id is null then
    update public.players set equipped_title_id='creator_owner' where id=p_player_id;
  end if;
end;
$function$;
