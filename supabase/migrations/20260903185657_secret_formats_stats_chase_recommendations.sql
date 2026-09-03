
-- 7) Secret achievements.
alter table public.achievement_definitions add column if not exists secret boolean not null default false;

insert into public.achievement_definitions(id,name,title,description,icon,category,target,sort_order,active,secret)
values
 ('secret_immunity','???','Intocável','Vença após receber pelo menos um golpe que não teve efeito.','👻','special',1,920,true,true),
 ('secret_critical_ko','???','Golpe de Sorte','Conquiste um nocaute com um golpe crítico.','💥','special',1,921,true,true),
 ('secret_last_hp','???','Por Um Fio','Vença uma rodada terminando com exatamente 1 HP.','❤️‍🔥','special',1,922,true,true),
 ('secret_monotype','???','Especialista de Tipo','Vença um Draft 3 usando três Pokémon que compartilham pelo menos um tipo.','🎯','special',1,923,true,true)
on conflict(id) do update set secret=excluded.secret,active=true;

create or replace function private.refresh_secret_achievements(p_player uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  select count(*) into v_count
  from private.battle_game_turns t
  join public.battles b on b.id=t.battle_id
  where b.status='completed' and b.winner_id=p_player
    and (
      ((t.result->'firstMove'->>'targetId')::uuid=p_player and coalesce((t.result->'firstMove'->>'effectiveness')::numeric,1)=0)
      or ((t.result->'secondMove'->>'targetId')::uuid=p_player and coalesce((t.result->'secondMove'->>'effectiveness')::numeric,1)=0)
    );
  perform public.server_set_achievement_progress(p_player,'secret_immunity',v_count);

  select count(*) into v_count
  from private.battle_game_turns t
  where (
    (coalesce((t.result->'firstMove'->>'playerId')::uuid,'00000000-0000-0000-0000-000000000000')=p_player
      and coalesce((t.result->'firstMove'->>'critical')::boolean,false)
      and coalesce((t.result->'firstMove'->>'targetHpAfter')::integer,1)=0)
    or
    (coalesce((t.result->'secondMove'->>'playerId')::uuid,'00000000-0000-0000-0000-000000000000')=p_player
      and coalesce((t.result->'secondMove'->>'critical')::boolean,false)
      and coalesce((t.result->'secondMove'->>'targetHpAfter')::integer,1)=0)
  );
  perform public.server_set_achievement_progress(p_player,'secret_critical_ko',v_count);

  select count(*) into v_count
  from private.battle_game_turns t join public.battles b on b.id=t.battle_id
  where b.winner_id=p_player and coalesce((t.result->>'winnerId')::uuid,'00000000-0000-0000-0000-000000000000')=p_player
    and (
      ((t.result->'challenger'->>'playerId')::uuid=p_player and (t.result->'challenger'->>'remainingHp')::integer=1)
      or ((t.result->'opponent'->>'playerId')::uuid=p_player and (t.result->'opponent'->>'remainingHp')::integer=1)
    );
  perform public.server_set_achievement_progress(p_player,'secret_last_hp',v_count);

  select count(*) into v_count from (
    select b.id
    from public.battles b
    where b.status='completed' and b.mode='draft3' and b.winner_id=p_player
      and (
        select count(*) from (
          select typ
          from private.battle_game_fighters f
          cross join lateral unnest(f.types) typ
          where f.battle_id=b.id and f.player_id=p_player
          group by typ
          having count(distinct f.card_id)>=3
        ) shared
      )>0
  ) x;
  perform public.server_set_achievement_progress(p_player,'secret_monotype',v_count);
end;
$$;

CREATE OR REPLACE FUNCTION public.server_refresh_player_achievements(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.players%rowtype;
  v_count integer;
  v_creator boolean;
  v_epoch timestamptz:=private.release_progress_epoch();
begin
  select * into p from public.players where id=p_player_id;
  if p.id is null then return; end if;

  select exists(select 1 from public.admin_members a where a.player_id=p_player_id and a.role='owner') into v_creator;
  if v_creator then
    perform public.server_set_achievement_progress(p_player_id,'creator_owner',1);
  end if;

  select count(*) into v_count
  from public.battles b
  where b.status='completed'
    and b.winner_id=p_player_id
    and b.completed_at>=v_epoch
    and exists(
      select 1 from public.admin_members a
      where a.player_id=case when b.challenger_id=p_player_id then b.opponent_id else b.challenger_id end
    );
  perform public.server_set_achievement_progress(p_player_id,'beat_creator',v_count);

  perform public.server_set_achievement_progress(p_player_id,'first_win',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_10',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_50',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_100',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'streak_3',p.best_battle_streak);
  perform public.server_set_achievement_progress(p_player_id,'streak_5',p.best_battle_streak);
  perform public.server_set_achievement_progress(p_player_id,'streak_10',p.best_battle_streak);

  select count(*) into v_count
  from public.battles b
  where b.status='completed' and b.mode='draft3'
    and b.winner_id=p_player_id and b.completed_at>=v_epoch;
  perform public.server_set_achievement_progress(p_player_id,'draft_win',v_count);

  select count(*) into v_count
  from public.battles b
  where b.status='completed' and b.mode='draft3'
    and b.winner_id=p_player_id and b.completed_at>=v_epoch
    and (
      (b.challenger_id=p_player_id and b.challenger_score=3 and b.opponent_score=0)
      or (b.opponent_id=p_player_id and b.opponent_score=3 and b.challenger_score=0)
    );
  perform public.server_set_achievement_progress(p_player_id,'draft_perfect',v_count);

  select count(*) into v_count
  from public.player_cards pc
  where pc.player_id=p_player_id and pc.quantity>0;
  perform public.server_set_achievement_progress(p_player_id,'collector_100',v_count);
  perform public.server_set_achievement_progress(p_player_id,'collector_500',v_count);
  perform public.server_set_achievement_progress(p_player_id,'collector_1000',v_count);

  select count(*) into v_count
  from public.pack_openings po
  where po.player_id=p_player_id and po.opened_at>=v_epoch;
  perform public.server_set_achievement_progress(p_player_id,'packs_25',v_count);
  perform public.server_set_achievement_progress(p_player_id,'packs_100',v_count);
  perform public.server_set_achievement_progress(p_player_id,'packs_500',v_count);

  select count(*) into v_count
  from public.trades t
  where t.status::text='completed'
    and p_player_id in (t.sender_id,t.receiver_id)
    and t.updated_at>=v_epoch;
  perform public.server_set_achievement_progress(p_player_id,'trades_10',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc
  join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_151',v_count);

  select count(*) into v_count
  from (
    select c.set_id
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=p_player_id and pc.quantity>0
    group by c.set_id
    having count(*) >= (select count(*) from public.cards c2 where c2.set_id=c.set_id)
  ) completed_sets;
  perform public.server_set_achievement_progress(p_player_id,'set_complete_1',v_count);

  select count(*) into v_count
  from public.battles b
  where b.status='completed' and b.is_ranked
    and p_player_id in (b.challenger_id,b.opponent_id)
    and b.completed_at>=v_epoch;
  perform public.server_set_achievement_progress(p_player_id,'ranked_25',v_count);

  perform public.server_set_achievement_progress(p_player_id,'rank_starter',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_ace',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_veteran',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_elite',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_master',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_grand',p.battle_rating);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 1 and 151;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_1',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 152 and 251;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_2',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 252 and 386;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_3',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 387 and 493;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_4',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 494 and 649;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_5',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 650 and 721;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_6',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 722 and 809;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_7',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 810 and 905;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_8',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 906 and 1025;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_9',v_count);

  perform private.refresh_secret_achievements(p_player_id);

  if v_creator and p.equipped_title_id is null then
    update public.players set equipped_title_id='creator_owner' where id=p_player_id;
  end if;
end;
$function$
;

-- 8) Seasonal alternate battle formats. Standard stays default; formats can be enabled per season later without changing existing battles.
create table if not exists public.battle_formats(
  id text primary key,
  name text not null,
  description text not null,
  icon text not null default 'game-controller',
  rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  ranked_allowed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.battle_formats(id,name,description,icon,rules,active,ranked_allowed,sort_order)
values
 ('standard','Padrão','Sem restrições extras. Regras normais do game_v1.','game-controller','{}',true,true,0),
 ('kanto_only','Copa Kanto','Somente espécies #001–151.','map','{"pokedexMin":1,"pokedexMax":151}',true,false,10),
 ('no_legendaries','Sem Lendários','Exclui espécies lendárias/míticas listadas pelo formato.','shield','{"banSpecies":[144,145,146,150,151,243,244,245,249,250,251,377,378,379,380,381,382,383,384,385,386,480,481,482,483,484,485,486,487,488,489,490,491,492,493]}',true,false,20),
 ('little_cup','Little Cup','Pokémon com soma de base stats de até 450.','leaf','{"maxBaseStatTotal":450}',true,false,30),
 ('single_type','Tipo Puro','Somente Pokémon que possuem exatamente um tipo.','radio-button-on','{"maxTypeCount":1}',true,false,40)
on conflict(id) do update set name=excluded.name,description=excluded.description,rules=excluded.rules,active=excluded.active;

alter table public.battles add column if not exists format_id text not null default 'standard';
do $$ begin
  if not exists(select 1 from pg_constraint where conname='battles_format_id_fkey') then
    alter table public.battles add constraint battles_format_id_fkey foreign key(format_id) references public.battle_formats(id);
  end if;
end $$;

create or replace function private.battle_format_card_allowed(p_battle uuid,p_card text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_format text;v_rules jsonb;v_profile jsonb;v_species integer;v_bst integer;v_types text[];
begin
  select b.format_id into v_format from public.battles b where b.id=p_battle;
  v_format:=coalesce(v_format,'standard');
  select f.rules into v_rules from public.battle_formats f where f.id=v_format and f.active;
  if v_rules is null or v_rules='{}'::jsonb then return true; end if;
  v_profile:=private.battle_game_profile_for_card(p_card);
  if v_profile is null then return false; end if;
  v_species:=coalesce((v_profile->>'speciesId')::integer,(v_profile->>'pokemonId')::integer);
  v_types:=array(select jsonb_array_elements_text(coalesce(v_profile->'types','[]'::jsonb)));
  v_bst:=coalesce((v_profile->>'baseHp')::integer,0)+coalesce((v_profile->>'baseAttack')::integer,0)+coalesce((v_profile->>'baseDefense')::integer,0)+coalesce((v_profile->>'baseSpAttack')::integer,0)+coalesce((v_profile->>'baseSpDefense')::integer,0)+coalesce((v_profile->>'baseSpeed')::integer,0);
  if v_rules ? 'pokedexMin' and v_species<(v_rules->>'pokedexMin')::integer then return false; end if;
  if v_rules ? 'pokedexMax' and v_species>(v_rules->>'pokedexMax')::integer then return false; end if;
  if v_rules ? 'maxBaseStatTotal' and v_bst>(v_rules->>'maxBaseStatTotal')::integer then return false; end if;
  if v_rules ? 'maxTypeCount' and cardinality(v_types)>(v_rules->>'maxTypeCount')::integer then return false; end if;
  if v_rules ? 'banSpecies' and exists(select 1 from jsonb_array_elements_text(v_rules->'banSpecies') x where x::integer=v_species) then return false; end if;
  return true;
end;
$$;

create or replace function public.get_battle_formats()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'icon',icon,'rules',rules,'rankedAllowed',ranked_allowed) order by sort_order),'[]'::jsonb)
  from public.battle_formats where active;
$$;
revoke all on function public.get_battle_formats() from public,anon;
grant execute on function public.get_battle_formats() to authenticated,service_role;

create or replace function public.set_battle_format(p_battle_id uuid,p_format_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_b public.battles%rowtype;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_b from public.battles where id=p_battle_id for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if v_b.challenger_id<>v_actor then raise exception 'ONLY_CHALLENGER_CAN_SET_FORMAT'; end if;
  if v_b.status<>'invited' then raise exception 'FORMAT_LOCKED'; end if;
  if not exists(select 1 from public.battle_formats where id=p_format_id and active) then raise exception 'INVALID_FORMAT'; end if;
  update public.battles set format_id=p_format_id,updated_at=now() where id=p_battle_id;
  insert into public.battle_events(battle_id,event_type,payload) values(p_battle_id,'format_selected',jsonb_build_object('formatId',p_format_id));
  return jsonb_build_object('formatId',p_format_id);
end;
$$;
revoke all on function public.set_battle_format(uuid,text) from public,anon;
grant execute on function public.set_battle_format(uuid,text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.server_lock_battle_card(p_actor_id uuid, p_battle_id uuid, p_card_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.battles%rowtype;
  v_count integer;
  v_attack_phase jsonb;
  v_profile jsonb;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.status<>'selecting' then raise exception 'INVALID_STATUS'; end if;
  if b.selection_deadline is not null and now()>b.selection_deadline then raise exception 'SELECTION_EXPIRED'; end if;

  if not exists(
    select 1 from public.player_cards
    where player_id=p_actor_id and card_id=p_card_id and quantity>0
  ) then raise exception 'NOT_OWNED'; end if;
  if not private.battle_format_card_allowed(b.id,p_card_id) then raise exception 'CARD_NOT_ALLOWED_BY_FORMAT'; end if;

  if b.engine_version='game_v1' then
    v_profile:=private.battle_game_profile_for_card(p_card_id);
    if v_profile is null then
      raise exception 'GAME_PROFILE_UNAVAILABLE';
    end if;
  end if;

  if b.engine_version<>'game_v1' and not private.battle_card_rules_ready(p_card_id) then
    raise exception 'BATTLE_RULE_REVIEW_REQUIRED';
  end if;

  if exists(
    select 1 from public.battle_selections
    where battle_id=b.id and round_no=b.active_round and player_id=p_actor_id
  ) then raise exception 'ALREADY_LOCKED'; end if;

  if b.mode='draft3' then
    if not exists(
      select 1 from public.battle_draft_cards d
      where d.battle_id=b.id and d.player_id=p_actor_id and d.card_id=p_card_id
    ) then raise exception 'CARD_NOT_IN_DRAFT'; end if;

    if exists(
      select 1 from public.battle_selections s
      where s.battle_id=b.id and s.player_id=p_actor_id and s.card_id=p_card_id
    ) then raise exception 'CARD_ALREADY_USED'; end if;
  end if;

  insert into public.battle_selections(battle_id,round_no,player_id,card_id)
  values(b.id,b.active_round,p_actor_id,p_card_id);

  insert into public.battle_events(battle_id,event_type,payload)
  values(
    b.id,'card_locked',
    jsonb_build_object('playerId',p_actor_id,'round',b.active_round,'engineVersion',b.engine_version)
  );

  if b.is_bot_match then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  select * into b from public.battles where id=p_battle_id;

  select count(*) into v_count
  from public.battle_selections
  where battle_id=b.id and round_no=b.active_round;

  if b.engine_version='game_v1' and v_count=2 then
    v_attack_phase:=private.battle_game_init_fighters(b.id,b.active_round);
    if not coalesce((v_attack_phase->>'initialized')::boolean,false)
       and v_attack_phase ? 'unsupportedCardId'
    then
      raise exception 'GAME_PROFILE_UNAVAILABLE';
    end if;
  end if;

  if b.mode='draft3' and v_count=2 then
    v_attack_phase:=private.battle_start_attack_selection(b.id);

    if b.is_bot_match then
      perform private.ranked_bot_take_turn(b.id);
    end if;

    return jsonb_build_object(
      'locked',true,
      'bothLocked',true,
      'attackSelectionRequired',true,
      'round',b.active_round,
      'engineVersion',b.engine_version,
      'attackSelection',v_attack_phase
    );
  end if;

  return jsonb_build_object(
    'locked',true,
    'bothLocked',v_count=2,
    'attackSelectionRequired',false,
    'round',b.active_round,
    'engineVersion',b.engine_version
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.server_pick_battle_draft_card(p_actor_id uuid, p_battle_id uuid, p_card_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.battles%rowtype;
  v_player_pick integer;
  v_global_pick integer;
  v_next uuid;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.mode<>'draft3' or b.status<>'drafting' then raise exception 'INVALID_STATUS'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.draft_turn_id<>p_actor_id then raise exception 'NOT_YOUR_TURN'; end if;
  if b.selection_deadline is not null and now()>b.selection_deadline then raise exception 'SELECTION_EXPIRED'; end if;
  if not exists(
    select 1 from public.player_cards pc
    where pc.player_id=p_actor_id and pc.card_id=p_card_id and pc.quantity>0
  ) then raise exception 'NOT_OWNED'; end if;
  if not private.battle_format_card_allowed(b.id,p_card_id) then raise exception 'CARD_NOT_ALLOWED_BY_FORMAT'; end if;

  if not private.battle_card_rules_ready(p_card_id) then
    raise exception 'BATTLE_RULE_REVIEW_REQUIRED';
  end if;
  if exists(
    select 1 from public.battle_draft_cards d
    where d.battle_id=b.id and d.player_id=p_actor_id and d.card_id=p_card_id
  ) then raise exception 'CARD_ALREADY_DRAFTED'; end if;

  select count(*)+1 into v_player_pick
  from public.battle_draft_cards d
  where d.battle_id=b.id and d.player_id=p_actor_id;

  if v_player_pick>3 then raise exception 'DRAFT_COMPLETE_FOR_PLAYER'; end if;
  v_global_pick:=b.draft_pick_count+1;

  insert into public.battle_draft_cards(battle_id,player_id,card_id,pick_no,global_pick_no)
  values(b.id,p_actor_id,p_card_id,v_player_pick,v_global_pick);

  insert into public.battle_events(battle_id,event_type,payload)
  values(b.id,'draft_card_picked',jsonb_build_object(
    'playerId',p_actor_id,'cardId',p_card_id,'pickNo',v_player_pick,'globalPickNo',v_global_pick
  ));

  if v_global_pick=6 then
    update public.battles
    set status='selecting',draft_pick_count=6,draft_turn_id=null,
        active_round=1,
        selection_deadline=now()+make_interval(secs=>selection_seconds),
        updated_at=now()
    where id=b.id;

    insert into public.battle_events(battle_id,event_type,payload)
    values(b.id,'draft_completed',jsonb_build_object(
      'round',1,'selectionSeconds',b.selection_seconds
    ));

    if b.is_bot_match then perform private.ranked_bot_take_turn(b.id); end if;

    return jsonb_build_object('completed',true,'status','selecting','round',1);
  end if;

  v_next:=case when p_actor_id=b.challenger_id then b.opponent_id else b.challenger_id end;

  update public.battles
  set draft_pick_count=v_global_pick,draft_turn_id=v_next,
      selection_deadline=now()+make_interval(secs=>draft_seconds),updated_at=now()
  where id=b.id;

  if b.is_bot_match then perform private.ranked_bot_take_turn(b.id); end if;

  return jsonb_build_object(
    'completed',false,'pick',v_global_pick,'nextPlayerId',v_next
  );
end;
$function$
;
revoke all on function public.server_lock_battle_card(uuid,uuid,text) from public,anon;
revoke all on function public.server_pick_battle_draft_card(uuid,uuid,text) from public,anon;
grant execute on function public.server_lock_battle_card(uuid,uuid,text) to service_role;
grant execute on function public.server_pick_battle_draft_card(uuid,uuid,text) to service_role;

-- 9) Personal trainer stats.
create or replace function public.get_my_trainer_battle_stats()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=(select auth.uid());
begin
 if v_player is null then raise exception 'UNAUTHORIZED'; end if;
 return jsonb_build_object(
  'summary',(select jsonb_build_object('wins',battle_wins,'losses',battle_losses,'rating',battle_rating,'bestStreak',best_battle_streak) from public.players where id=v_player),
  'favoritePokemon',(
    select jsonb_build_object('cardId',f.card_id,'name',max(f.name),'rounds',count(*),'wins',count(*) filter(where br.winner_id=v_player))
    from private.battle_game_fighters f
    left join public.battle_rounds br on br.battle_id=f.battle_id and br.round_no=f.round_no
    where f.player_id=v_player group by f.card_id order by count(*) desc,count(*) filter(where br.winner_id=v_player) desc limit 1
  ),
  'moveStats',coalesce((
    with moves as (
      select coalesce(t.result->'firstMove',t.result->'secondMove') m from private.battle_game_turns t where false
      union all
      select t.result->'firstMove' from private.battle_game_turns t where t.result->'firstMove'->>'playerId'=v_player::text
      union all
      select t.result->'secondMove' from private.battle_game_turns t where t.result->'secondMove'->>'playerId'=v_player::text
    )
    select jsonb_build_object(
      'totalMoves',count(*),
      'criticalHits',count(*) filter(where coalesce((m->>'critical')::boolean,false)),
      'misses',count(*) filter(where coalesce((m->>'hit')::boolean,true)=false),
      'superEffective',count(*) filter(where coalesce((m->>'effectiveness')::numeric,1)>1),
      'immunitiesHit',count(*) filter(where coalesce((m->>'effectiveness')::numeric,1)=0),
      'knockouts',count(*) filter(where coalesce((m->>'targetHpAfter')::integer,1)=0),
      'topMove',(select x->>'move' from moves x group by x->>'move' order by count(*) desc limit 1)
    ) from moves
  ),'{}'::jsonb),
  'typePerformance',coalesce((
    select jsonb_agg(jsonb_build_object('type',x.type,'rounds',x.rounds,'wins',x.wins,'winRate',round(x.wins::numeric/greatest(x.rounds,1)*100,1)) order by x.rounds desc)
    from (
      select typ type,count(*) rounds,count(*) filter(where br.winner_id=v_player) wins
      from private.battle_game_fighters f
      cross join lateral unnest(f.types) typ
      left join public.battle_rounds br on br.battle_id=f.battle_id and br.round_no=f.round_no
      where f.player_id=v_player
      group by typ order by count(*) desc limit 18
    ) x
  ),'[]'::jsonb)
 );
end;
$$;
revoke all on function public.get_my_trainer_battle_stats() from public,anon;
grant execute on function public.get_my_trainer_battle_stats() to authenticated,service_role;

-- 10) Smart sell guidance.
create or replace function public.get_card_sell_guidance(p_card_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());
begin
 if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
 return (
   with active as (
     select unit_price_coins from public.market_listings where card_id=p_card_id and status='active'
   ), sold as (
     select unit_price_coins from public.market_listings where card_id=p_card_id and status='sold' and sold_at>=now()-interval '30 days'
   )
   select jsonb_build_object(
     'cardId',c.id,'marketPriceUsd',c.market_price_usd,
     'activeCount',(select count(*) from active),
     'lowestActiveCoins',(select min(unit_price_coins) from active),
     'averageActiveCoins',(select round(avg(unit_price_coins)) from active),
     'recentSalesCount',(select count(*) from sold),
     'recentSaleMinCoins',(select min(unit_price_coins) from sold),
     'recentSaleAvgCoins',(select round(avg(unit_price_coins)) from sold),
     'recentSaleMaxCoins',(select max(unit_price_coins) from sold),
     'suggestedCoins',coalesce((select round(avg(unit_price_coins)) from sold),(select min(unit_price_coins) from active),c.game_value)
   ) from public.cards c where c.id=p_card_id
 );
end;
$$;
revoke all on function public.get_card_sell_guidance(text) from public,anon;
grant execute on function public.get_card_sell_guidance(text) to authenticated,service_role;

-- 12) Card Chase hub: wishlist + live market availability + set/pack context.
create or replace function public.get_card_chase_hub()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=(select auth.uid());
begin
 if v_player is null then raise exception 'UNAUTHORIZED'; end if;
 return coalesce((
   select jsonb_agg(jsonb_build_object(
     'cardId',c.id,'name',c.pokemon_name,'setId',c.set_id,'setName',c.set_name,'image',c.image_small,'rarity',c.rarity,
     'marketPriceUsd',c.market_price_usd,'priority',w.priority,'notifyMarket',w.notify_market,
     'owned',exists(select 1 from public.player_cards pc where pc.player_id=v_player and pc.card_id=c.id and pc.quantity>0),
     'market',jsonb_build_object(
       'listingCount',(select count(*) from public.market_listings ml where ml.card_id=c.id and ml.status='active'),
       'lowestCoins',(select min(unit_price_coins) from public.market_listings ml where ml.card_id=c.id and ml.status='active')
     ),
     'packs',coalesce((
       select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'currency',p.currency,'price',p.price) order by p.price)
       from public.packs p where p.active and p.set_id=c.set_id
     ),'[]'::jsonb)
   ) order by w.priority desc,w.created_at)
   from public.card_wishlist w join public.cards c on c.id=w.card_id
   where w.player_id=v_player
 ),'[]'::jsonb);
end;
$$;
revoke all on function public.get_card_chase_hub() from public,anon;
grant execute on function public.get_card_chase_hub() to authenticated,service_role;

-- 13) Advisory recommendations only; never mutates decks or inventory.
create or replace function public.get_my_collection_recommendations()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=(select auth.uid());
begin
 if v_player is null then raise exception 'UNAUTHORIZED'; end if;
 return jsonb_build_object(
   'unusedStrongCards',coalesce((
     select jsonb_agg(jsonb_build_object('cardId',x.id,'name',x.pokemon_name,'image',x.image_small,'score',x.score,'types',x.game_types) order by x.score desc)
     from (
       select c.id,c.pokemon_name,c.image_small,c.game_types,
         (s->>'hp')::integer+(s->>'attack')::integer+(s->>'defense')::integer+(s->>'spAttack')::integer+(s->>'spDefense')::integer+(s->>'speed')::integer score
       from public.player_cards pc join public.cards c on c.id=pc.card_id
       cross join lateral private.battle_game_level50_stats(private.battle_game_profile_for_card(c.id)) s
       where pc.player_id=v_player and pc.quantity>0
         and not exists(select 1 from public.deck_cards dc join public.decks d on d.id=dc.deck_id where d.player_id=v_player and dc.card_id=c.id)
       order by score desc limit 8
     ) x
   ),'[]'::jsonb),
   'valuableDuplicates',coalesce((
     select jsonb_agg(jsonb_build_object('cardId',c.id,'name',c.pokemon_name,'image',c.image_small,'extraCopies',pc.quantity-1,'marketPriceUsd',c.market_price_usd) order by c.market_price_usd desc nulls last)
     from public.player_cards pc join public.cards c on c.id=pc.card_id
     where pc.player_id=v_player and pc.quantity>1 and not private.card_is_locked(v_player,c.id)
     limit 8
   ),'[]'::jsonb),
   'chaseAvailable',coalesce((
     select count(*) from public.card_wishlist w
     where w.player_id=v_player and exists(select 1 from public.market_listings ml where ml.card_id=w.card_id and ml.status='active')
   ),0)
 );
end;
$$;
revoke all on function public.get_my_collection_recommendations() from public,anon;
grant execute on function public.get_my_collection_recommendations() to authenticated,service_role;
