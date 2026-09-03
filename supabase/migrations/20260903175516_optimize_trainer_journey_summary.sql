
create or replace function public.get_trainer_journey_summary()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with me as (
  select auth.uid() player_id
),
owned as materialized (
  select pc.card_id,c.pokedex_numbers,c.set_id
  from public.player_cards pc
  join public.cards c on c.id=pc.card_id
  where pc.player_id=(select player_id from me) and pc.quantity>0
),
species as materialized (
  select count(distinct n)::bigint all_species,
         count(distinct n) filter(where n between 1 and 151)::bigint kanto_species
  from owned o
  cross join lateral unnest(coalesce(o.pokedex_numbers,array[]::integer[])) n
),
completed_sets as materialized (
  select count(*)::bigint count
  from (
    select o.set_id
    from owned o
    where o.set_id is not null
    group by o.set_id
    having count(distinct o.card_id)>=(select count(*) from public.cards c2 where c2.set_id=o.set_id)
  ) x
),
metrics as materialized (
  select
    (select count(*) from public.pack_openings where player_id=(select player_id from me))::bigint packs,
    (select count(*) from owned)::bigint unique_cards,
    (select count(*) from public.decks d where d.player_id=(select player_id from me)
      and (select coalesce(sum(dc.quantity),0) from public.deck_cards dc where dc.deck_id=d.id)>=3)::bigint decks,
    (select count(*) from public.battles b where b.status='completed'
      and (b.challenger_id=(select player_id from me) or b.opponent_id=(select player_id from me)))::bigint battles,
    coalesce((select p.battle_wins from public.players p where p.id=(select player_id from me)),0)::bigint wins,
    (select count(*) from public.trades t where t.status='completed'
      and (t.sender_id=(select player_id from me) or t.receiver_id=(select player_id from me)))::bigint trades,
    (select count(*) from public.friendships f where f.status='accepted'
      and (f.requester_id=(select player_id from me) or f.addressee_id=(select player_id from me)))::bigint friends,
    (select count(*) from public.guild_members gm where gm.player_id=(select player_id from me))::bigint guilds,
    (select all_species from species)::bigint species,
    (select kanto_species from species)::bigint kanto,
    (select count from completed_sets)::bigint completed_sets,
    (select count(*) from public.player_achievements pa
      where pa.player_id=(select player_id from me) and pa.unlocked_at is not null)::bigint achievements,
    (select count(*) from public.player_seasons ps
      where ps.player_id=(select player_id from me) and ps.matches>0)::bigint seasons
),
definitions(id,title,description,route,phase,sort,target,reward_coins,reward_diamonds,metric_key) as (
  values
    ('first_pack','Seu primeiro booster','Abra um booster e comece sua coleção.','/(tabs)/packs','inicio',10,1,1000,0,'packs'),
    ('collector_25','Primeira coleção','Tenha 25 cartas únicas na Bag.','/(tabs)/bag','inicio',20,25,2500,0,'unique_cards'),
    ('first_deck','Monte seu primeiro deck','Crie um deck com pelo menos 3 cartas.','/decks','inicio',30,1,2500,0,'decks'),
    ('first_battle','Entre na arena','Conclua sua primeira batalha.','/(tabs)/battles','inicio',40,1,1500,0,'battles'),
    ('first_win','Primeira vitória','Vença sua primeira batalha.','/(tabs)/battles','inicio',50,1,2500,0,'wins'),
    ('first_trade','Negociador','Conclua sua primeira troca com outro treinador.','/(tabs)/trade','inicio',60,1,2000,0,'trades'),
    ('first_friend','Rede de treinadores','Tenha pelo menos um amigo aceito.','/friends','inicio',70,1,1000,0,'friends'),
    ('join_guild','Faça parte de uma guilda','Entre em uma guilda e ajude sua equipe.','/guilds','inicio',80,1,3000,0,'guilds'),
    ('pokedex_50','Explorador da Pokédex','Descubra 50 espécies diferentes.','/pokedex','medio',90,50,5000,0,'species'),
    ('wins_10','Competidor','Conquiste 10 vitórias em batalha.','/(tabs)/battles','medio',100,10,5000,0,'wins'),
    ('complete_set','Colecionador de Set','Complete pelo menos um set inteiro.','/sets','medio',110,1,10000,1,'completed_sets'),
    ('achievements_10','Treinador reconhecido','Desbloqueie 10 conquistas.','/achievements','medio',120,10,7500,0,'achievements'),
    ('kanto_complete','Mestre de Kanto','Descubra todas as 151 espécies de Kanto.','/pokedex','longo',130,151,15000,2,'kanto'),
    ('seasons_3','Veterano de temporadas','Participe de 3 temporadas competitivas.','/season','longo',140,3,10000,0,'seasons'),
    ('pokedex_250','Pesquisador Pokémon','Descubra 250 espécies diferentes.','/pokedex','longo',150,250,20000,2,'species'),
    ('wins_50','Veterano da Arena','Conquiste 50 vitórias em batalha.','/(tabs)/battles','longo',160,50,25000,3,'wins')
),
states as materialized (
  select
    d.*,
    case d.metric_key
      when 'packs' then m.packs
      when 'unique_cards' then m.unique_cards
      when 'decks' then m.decks
      when 'battles' then m.battles
      when 'wins' then m.wins
      when 'trades' then m.trades
      when 'friends' then m.friends
      when 'guilds' then m.guilds
      when 'species' then m.species
      when 'completed_sets' then m.completed_sets
      when 'achievements' then m.achievements
      when 'kanto' then m.kanto
      when 'seasons' then m.seasons
      else 0
    end::bigint progress,
    exists(
      select 1 from public.trainer_journey_claims c
      where c.player_id=(select player_id from me) and c.step_id=d.id
    ) claimed
  from definitions d
  cross join metrics m
),
annotated as materialized (
  select *,progress>=target completed
  from states
)
select case
  when (select player_id from me) is null then
    jsonb_build_object('total',0,'completed',0,'claimed',0,'claimable',0,'currentStep',null,'allClaimed',false)
  else jsonb_build_object(
    'total',(select count(*) from annotated),
    'completed',(select count(*) from annotated where completed),
    'claimed',(select count(*) from annotated where claimed),
    'claimable',(select count(*) from annotated where completed and not claimed),
    'allClaimed',(select count(*) from annotated where claimed)=(select count(*) from annotated),
    'currentStep',(
      select jsonb_build_object(
        'id',id,'title',title,'description',description,'route',route,'phase',phase,'sort',sort,
        'progress',progress,'target',target,'completed',completed,
        'rewardCoins',reward_coins,'rewardDiamonds',reward_diamonds
      )
      from annotated
      where not claimed
      order by sort
      limit 1
    )
  )
end;
$function$;

revoke all on function public.get_trainer_journey_summary() from public,anon;
grant execute on function public.get_trainer_journey_summary() to authenticated,service_role;
