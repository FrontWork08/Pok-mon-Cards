
create table if not exists public.trainer_journey_claims(
  player_id uuid not null references public.players(id) on delete cascade,
  step_id text not null,
  reward_coins bigint not null default 0,
  reward_diamonds integer not null default 0,
  claimed_at timestamptz not null default now(),
  primary key(player_id,step_id)
);

alter table public.trainer_journey_claims enable row level security;

drop policy if exists trainer_journey_claims_select_own on public.trainer_journey_claims;
create policy trainer_journey_claims_select_own
on public.trainer_journey_claims
for select
to authenticated
using (player_id=auth.uid());

create or replace function private.trainer_journey_step_state(
  p_player uuid,
  p_step text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_progress bigint:=0;
  v_target bigint:=1;
  v_coins bigint:=0;
  v_diamonds integer:=0;
  v_title text;
  v_description text;
  v_route text;
  v_phase text;
  v_sort integer;
begin
  case p_step
    when 'first_pack' then
      v_title:='Seu primeiro booster';
      v_description:='Abra um booster e comece sua coleção.';
      v_route:='/(tabs)/packs'; v_phase:='inicio'; v_sort:=10; v_target:=1; v_coins:=1000;
      select count(*) into v_progress from public.pack_openings where player_id=p_player;
    when 'collector_25' then
      v_title:='Primeira coleção';
      v_description:='Tenha 25 cartas únicas na Bag.';
      v_route:='/(tabs)/bag'; v_phase:='inicio'; v_sort:=20; v_target:=25; v_coins:=2500;
      select count(*) into v_progress from public.player_cards where player_id=p_player and quantity>0;
    when 'first_deck' then
      v_title:='Monte seu primeiro deck';
      v_description:='Crie um deck com pelo menos 3 cartas.';
      v_route:='/decks'; v_phase:='inicio'; v_sort:=30; v_target:=1; v_coins:=2500;
      select count(*) into v_progress
      from public.decks d
      where d.player_id=p_player
        and (select coalesce(sum(dc.quantity),0) from public.deck_cards dc where dc.deck_id=d.id)>=3;
    when 'first_battle' then
      v_title:='Entre na arena';
      v_description:='Conclua sua primeira batalha.';
      v_route:='/(tabs)/battles'; v_phase:='inicio'; v_sort:=40; v_target:=1; v_coins:=1500;
      select count(*) into v_progress from public.battles
      where status='completed' and (challenger_id=p_player or opponent_id=p_player);
    when 'first_win' then
      v_title:='Primeira vitória';
      v_description:='Vença sua primeira batalha.';
      v_route:='/(tabs)/battles'; v_phase:='inicio'; v_sort:=50; v_target:=1; v_coins:=2500;
      select battle_wins into v_progress from public.players where id=p_player;
    when 'first_trade' then
      v_title:='Negociador';
      v_description:='Conclua sua primeira troca com outro treinador.';
      v_route:='/(tabs)/trade'; v_phase:='inicio'; v_sort:=60; v_target:=1; v_coins:=2000;
      select count(*) into v_progress from public.trades
      where status='completed' and (sender_id=p_player or receiver_id=p_player);
    when 'first_friend' then
      v_title:='Rede de treinadores';
      v_description:='Tenha pelo menos um amigo aceito.';
      v_route:='/friends'; v_phase:='inicio'; v_sort:=70; v_target:=1; v_coins:=1000;
      select count(*) into v_progress from public.friendships
      where status='accepted' and (requester_id=p_player or addressee_id=p_player);
    when 'join_guild' then
      v_title:='Faça parte de uma guilda';
      v_description:='Entre em uma guilda e ajude sua equipe.';
      v_route:='/guilds'; v_phase:='inicio'; v_sort:=80; v_target:=1; v_coins:=3000;
      select count(*) into v_progress from public.guild_members where player_id=p_player;
    when 'pokedex_50' then
      v_title:='Explorador da Pokédex';
      v_description:='Descubra 50 espécies diferentes.';
      v_route:='/pokedex'; v_phase:='medio'; v_sort:=90; v_target:=50; v_coins:=5000;
      select count(distinct n) into v_progress
      from public.player_cards pc
      join public.cards c on c.id=pc.card_id
      cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
      where pc.player_id=p_player and pc.quantity>0;
    when 'wins_10' then
      v_title:='Competidor';
      v_description:='Conquiste 10 vitórias em batalha.';
      v_route:='/(tabs)/battles'; v_phase:='medio'; v_sort:=100; v_target:=10; v_coins:=5000;
      select battle_wins into v_progress from public.players where id=p_player;
    when 'complete_set' then
      v_title:='Colecionador de Set';
      v_description:='Complete pelo menos um set inteiro.';
      v_route:='/sets'; v_phase:='medio'; v_sort:=110; v_target:=1; v_coins:=10000; v_diamonds:=1;
      select count(*) into v_progress
      from (
        select c.set_id
        from public.player_cards pc
        join public.cards c on c.id=pc.card_id
        where pc.player_id=p_player and pc.quantity>0 and c.set_id is not null
        group by c.set_id
        having count(distinct c.id) >= (
          select count(*) from public.cards c2 where c2.set_id=c.set_id
        )
      ) completed;
    when 'achievements_10' then
      v_title:='Treinador reconhecido';
      v_description:='Desbloqueie 10 conquistas.';
      v_route:='/achievements'; v_phase:='medio'; v_sort:=120; v_target:=10; v_coins:=7500;
      select count(*) into v_progress from public.player_achievements
      where player_id=p_player and unlocked_at is not null;
    when 'kanto_complete' then
      v_title:='Mestre de Kanto';
      v_description:='Descubra todas as 151 espécies de Kanto.';
      v_route:='/pokedex'; v_phase:='longo'; v_sort:=130; v_target:=151; v_coins:=15000; v_diamonds:=2;
      select count(distinct n) into v_progress
      from public.player_cards pc
      join public.cards c on c.id=pc.card_id
      cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
      where pc.player_id=p_player and pc.quantity>0 and n between 1 and 151;
    when 'seasons_3' then
      v_title:='Veterano de temporadas';
      v_description:='Participe de 3 temporadas competitivas.';
      v_route:='/season'; v_phase:='longo'; v_sort:=140; v_target:=3; v_coins:=10000;
      select count(*) into v_progress from public.player_seasons
      where player_id=p_player and matches>0;
    when 'pokedex_250' then
      v_title:='Pesquisador Pokémon';
      v_description:='Descubra 250 espécies diferentes.';
      v_route:='/pokedex'; v_phase:='longo'; v_sort:=150; v_target:=250; v_coins:=20000; v_diamonds:=2;
      select count(distinct n) into v_progress
      from public.player_cards pc
      join public.cards c on c.id=pc.card_id
      cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
      where pc.player_id=p_player and pc.quantity>0;
    when 'wins_50' then
      v_title:='Veterano da Arena';
      v_description:='Conquiste 50 vitórias em batalha.';
      v_route:='/(tabs)/battles'; v_phase:='longo'; v_sort:=160; v_target:=50; v_coins:=25000; v_diamonds:=3;
      select battle_wins into v_progress from public.players where id=p_player;
    else
      raise exception 'UNKNOWN_JOURNEY_STEP';
  end case;

  return jsonb_build_object(
    'id',p_step,
    'title',v_title,
    'description',v_description,
    'route',v_route,
    'phase',v_phase,
    'sort',v_sort,
    'progress',coalesce(v_progress,0),
    'target',v_target,
    'completed',coalesce(v_progress,0)>=v_target,
    'rewardCoins',v_coins,
    'rewardDiamonds',v_diamonds
  );
end;
$function$;

create or replace function public.get_trainer_career()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_player uuid:=auth.uid();
  v_result jsonb;
  v_steps text[]:=array[
    'first_pack','collector_25','first_deck','first_battle','first_win','first_trade',
    'first_friend','join_guild','pokedex_50','wins_10','complete_set','achievements_10',
    'kanto_complete','seasons_3','pokedex_250','wins_50'
  ];
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  with journey as (
    select private.trainer_journey_step_state(v_player,step_id) as state
    from unnest(v_steps) step_id
  ),
  species as (
    select count(distinct n)::integer as count
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
    where pc.player_id=v_player and pc.quantity>0
  ),
  collection as (
    select
      count(*)::integer unique_cards,
      coalesce(sum(pc.quantity),0)::bigint total_copies,
      coalesce(sum(pc.quantity*coalesce(c.market_price_usd,0)),0)::numeric(14,2) value_usd
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=v_player and pc.quantity>0
  ),
  completed_sets as (
    select count(*)::integer as count
    from (
      select c.set_id
      from public.player_cards pc
      join public.cards c on c.id=pc.card_id
      where pc.player_id=v_player and pc.quantity>0 and c.set_id is not null
      group by c.set_id
      having count(distinct c.id) >= (select count(*) from public.cards c2 where c2.set_id=c.set_id)
    ) s
  ),
  social as (
    select
      (select count(*) from public.friendships
       where status='accepted' and (requester_id=v_player or addressee_id=v_player))::integer friends,
      (select count(*) from public.trades
       where status='completed' and (sender_id=v_player or receiver_id=v_player))::integer trades
  ),
  seasons_history as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.season_id,
      'name',x.name,
      'themeColor',x.theme_color,
      'startsAt',x.starts_at,
      'endsAt',x.ends_at,
      'points',x.points,
      'wins',x.wins,
      'losses',x.losses,
      'matches',x.matches,
      'bestStreak',x.best_streak,
      'rank',x.season_rank,
      'rewardClaimed',x.reward_claimed
    ) order by x.starts_at desc),'[]'::jsonb) as rows
    from (
      select
        ps.season_id,s.name,s.theme_color,s.starts_at,s.ends_at,
        ps.points,ps.wins,ps.losses,ps.matches,ps.best_streak,ps.reward_claimed,
        1+(select count(*) from public.player_seasons other
           where other.season_id=ps.season_id
             and (
               other.points>ps.points
               or (other.points=ps.points and other.wins>ps.wins)
               or (other.points=ps.points and other.wins=ps.wins and other.matches<ps.matches)
             )) as season_rank
      from public.player_seasons ps
      join public.seasons s on s.id=ps.season_id
      where ps.player_id=v_player
      order by s.starts_at desc
      limit 10
    ) x
  ),
  regions as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'generation',g.gen,
      'name',g.name,
      'owned',(
        select count(distinct n)
        from public.player_cards pc
        join public.cards c on c.id=pc.card_id
        cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
        where pc.player_id=v_player and pc.quantity>0 and n between g.min_no and g.max_no
      ),
      'target',g.max_no-g.min_no+1,
      'completed',(
        select count(distinct n)
        from public.player_cards pc
        join public.cards c on c.id=pc.card_id
        cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
        where pc.player_id=v_player and pc.quantity>0 and n between g.min_no and g.max_no
      ) >= g.max_no-g.min_no+1,
      'rewardClaimed',exists(
        select 1 from public.collection_milestone_claims cmc
        where cmc.player_id=v_player and cmc.milestone_kind='pokedex_gen' and cmc.milestone_key=g.gen::text
      )
    ) order by g.gen),'[]'::jsonb) as rows
    from (values
      (1,'Kanto',1,151),(2,'Johto',152,251),(3,'Hoenn',252,386),
      (4,'Sinnoh',387,493),(5,'Unova',494,649),(6,'Kalos',650,721),
      (7,'Alola',722,809),(8,'Galar',810,905),(9,'Paldea',906,1025)
    ) as g(gen,name,min_no,max_no)
  )
  select jsonb_build_object(
    'player',jsonb_build_object(
      'id',p.id,
      'username',p.username,
      'level',p.level,
      'xp',p.xp,
      'createdAt',p.created_at,
      'accountAgeDays',greatest(0,(current_date-p.created_at::date)),
      'battleRating',p.battle_rating,
      'battleWins',p.battle_wins,
      'battleLosses',p.battle_losses,
      'bestBattleStreak',p.best_battle_streak,
      'title',case when ad.id is null then null else jsonb_build_object('id',ad.id,'title',ad.title,'icon',ad.icon) end
    ),
    'collection',jsonb_build_object(
      'uniqueCards',(select unique_cards from collection),
      'totalCopies',(select total_copies from collection),
      'valueUsd',(select value_usd from collection),
      'species',(select count from species),
      'completedSets',(select count from completed_sets)
    ),
    'social',jsonb_build_object(
      'friends',(select friends from social),
      'completedTrades',(select trades from social),
      'guild',(
        select jsonb_build_object(
          'id',g.id,'name',g.name,'color',g.color,'role',gm.role,'level',g.level,'xp',g.xp
        )
        from public.guild_members gm join public.guilds g on g.id=gm.guild_id
        where gm.player_id=v_player limit 1
      )
    ),
    'achievements',jsonb_build_object(
      'unlocked',(select count(*) from public.player_achievements where player_id=v_player and unlocked_at is not null),
      'total',(select count(*) from public.achievement_definitions where active)
    ),
    'signatureCard',(
      select jsonb_build_object(
        'id',c.id,'name',c.pokemon_name,'setName',c.set_name,'rarity',c.rarity,
        'imageSmall',c.image_small,'imageLarge',c.image_large,'marketPriceUsd',c.market_price_usd,
        'gameTypes',c.game_types
      )
      from public.profile_showcase ps
      join public.cards c on c.id=ps.card_id
      where ps.player_id=v_player and ps.slot=1
    ),
    'journey',coalesce((
      select jsonb_agg(
        state || jsonb_build_object(
          'claimed',exists(
            select 1 from public.trainer_journey_claims claim
            where claim.player_id=v_player and claim.step_id=state->>'id'
          )
        )
        order by (state->>'sort')::integer
      )
      from journey
    ),'[]'::jsonb),
    'regions',(select rows from regions),
    'seasonHistory',(select rows from seasons_history),
    'careerScore',(
      least(2500,(select unique_cards from collection)*2)
      + least(2500,(select count from species)*5)
      + least(2000,p.battle_wins*20)
      + least(1000,(select trades from social)*25)
      + least(1000,(select friends from social)*20)
      + least(1000,(select count(*) from public.player_achievements where player_id=v_player and unlocked_at is not null)*50)
    )
  ) into v_result
  from public.players p
  left join public.achievement_definitions ad on ad.id=p.equipped_title_id
  where p.id=v_player;

  return v_result;
end;
$function$;

create or replace function public.claim_trainer_journey_step(p_step text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player uuid:=auth.uid();
  v_state jsonb;
  v_coins bigint;
  v_diamonds integer;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  v_state:=private.trainer_journey_step_state(v_player,p_step);
  if not coalesce((v_state->>'completed')::boolean,false) then
    raise exception 'JOURNEY_STEP_NOT_COMPLETE';
  end if;

  v_coins:=coalesce((v_state->>'rewardCoins')::bigint,0);
  v_diamonds:=coalesce((v_state->>'rewardDiamonds')::integer,0);

  insert into public.trainer_journey_claims(player_id,step_id,reward_coins,reward_diamonds)
  values(v_player,p_step,v_coins,v_diamonds)
  on conflict(player_id,step_id) do nothing;

  if not found then
    raise exception 'JOURNEY_STEP_ALREADY_CLAIMED';
  end if;

  update public.players
  set coins=coins+v_coins,
      diamonds=diamonds+v_diamonds
  where id=v_player;

  perform public.server_queue_notification(
    v_player,
    'trainer_journey',
    'Etapa da Jornada concluída',
    (v_state->>'title')||' • +'||v_coins||' Coins'||
      case when v_diamonds>0 then ' + '||v_diamonds||' Diamante(s)' else '' end,
    jsonb_build_object('stepId',p_step,'coins',v_coins,'diamonds',v_diamonds,'route','/career')
  );

  return v_state || jsonb_build_object('claimed',true);
end;
$function$;

revoke all on function public.get_trainer_career() from public;
grant execute on function public.get_trainer_career() to authenticated;
revoke all on function public.claim_trainer_journey_step(text) from public;
grant execute on function public.claim_trainer_journey_step(text) to authenticated;

create index if not exists trainer_journey_claims_player_claimed_idx
on public.trainer_journey_claims(player_id,claimed_at desc);

comment on function public.get_trainer_career() is
  'Unified Trainer Career snapshot: collection, battle, social, journey, regional Pokedex and season history.';
