-- Player Experience V2: goals, onboarding, post-battle explanations and gentler streaks.

create table if not exists public.player_goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  goal_type text not null check (goal_type in ('collection','pokemon','rank','battle','coins','custom')),
  title text not null check (char_length(title) between 1 and 80),
  target_value bigint not null default 1 check (target_value > 0),
  progress bigint not null default 0 check (progress >= 0),
  route text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_goals_player_status_updated_idx
  on public.player_goals(player_id, status, updated_at desc);

alter table public.player_goals enable row level security;

drop policy if exists "player_goals_select_own" on public.player_goals;
create policy "player_goals_select_own"
on public.player_goals for select
to authenticated
using ((select auth.uid()) = player_id);

drop policy if exists "player_goals_insert_own" on public.player_goals;
create policy "player_goals_insert_own"
on public.player_goals for insert
to authenticated
with check ((select auth.uid()) = player_id);

drop policy if exists "player_goals_update_own" on public.player_goals;
create policy "player_goals_update_own"
on public.player_goals for update
to authenticated
using ((select auth.uid()) = player_id)
with check ((select auth.uid()) = player_id);

drop policy if exists "player_goals_delete_own" on public.player_goals;
create policy "player_goals_delete_own"
on public.player_goals for delete
to authenticated
using ((select auth.uid()) = player_id);

revoke all on public.player_goals from public, anon;
grant select, insert, update, delete on public.player_goals to authenticated;

create or replace function public.get_my_goals()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := auth.uid();
  v_result jsonb;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', g.id,
      'goalType', g.goal_type,
      'title', g.title,
      'targetValue', g.target_value,
      'currentValue',
        case g.goal_type
          when 'collection' then (
            select count(*)::bigint
            from public.player_cards pc
            where pc.player_id=v_player and pc.quantity>0
          )
          when 'pokemon' then (
            case when exists(
              select 1
              from public.player_cards pc
              where pc.player_id=v_player
                and pc.quantity>0
                and pc.card_id = nullif(g.metadata->>'cardId','')
            ) then 1 else 0 end
          )
          when 'rank' then (
            select greatest(0, coalesce(p.battle_rating,0))::bigint
            from public.players p where p.id=v_player
          )
          when 'battle' then (
            select count(*)::bigint
            from public.battles b
            where b.winner_id=v_player and b.status='completed'
          )
          when 'coins' then (
            select greatest(0, coalesce(p.coins,0))::bigint
            from public.players p where p.id=v_player
          )
          else g.progress
        end,
      'route', g.route,
      'metadata', g.metadata,
      'status', g.status,
      'createdAt', g.created_at,
      'updatedAt', g.updated_at
    )
    order by
      case g.status when 'active' then 0 when 'completed' then 1 else 2 end,
      g.updated_at desc
  ), '[]'::jsonb)
  into v_result
  from public.player_goals g
  where g.player_id=v_player and g.status<>'archived';

  return v_result;
end;
$$;

revoke all on function public.get_my_goals() from public, anon;
grant execute on function public.get_my_goals() to authenticated;

create or replace function public.get_my_onboarding_progress()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := auth.uid();
  v_opened boolean;
  v_deck boolean;
  v_battle boolean;
  v_sale boolean;
  v_ranked boolean;
  v_done integer;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select exists(select 1 from public.pack_openings p where p.player_id=v_player)
    into v_opened;
  select exists(select 1 from public.decks d where d.player_id=v_player)
    into v_deck;
  select exists(
    select 1 from public.battles b
    where (b.challenger_id=v_player or b.opponent_id=v_player)
      and b.status='completed'
  ) into v_battle;
  select exists(
    select 1 from private.card_duplicate_sales s where s.player_id=v_player
  ) or exists(
    select 1 from public.market_listings m
    where m.seller_id=v_player and m.status='sold'
  ) into v_sale;
  select exists(
    select 1 from public.battles b
    where (b.challenger_id=v_player or b.opponent_id=v_player)
      and b.status='completed' and b.is_ranked=true
  ) into v_ranked;

  v_done := (v_opened::int + v_deck::int + v_battle::int + v_sale::int + v_ranked::int);

  return jsonb_build_object(
    'completed', v_done,
    'total', 5,
    'allDone', v_done=5,
    'steps', jsonb_build_array(
      jsonb_build_object('id','first_pack','title','Abra seu primeiro booster','description','Conheça a coleção começando por um pack.','done',v_opened,'route','/(tabs)/packs'),
      jsonb_build_object('id','first_deck','title','Monte seu primeiro deck','description','Escolha Pokémon para usar nas batalhas.','done',v_deck,'route','/decks'),
      jsonb_build_object('id','first_battle','title','Conclua uma batalha','description','Aprenda ataques, tipos e troca de Pokémon na prática.','done',v_battle,'route','/(tabs)/battles'),
      jsonb_build_object('id','first_sale','title','Use a economia uma vez','description','Venda uma duplicada ou conclua uma venda no mercado.','done',v_sale,'route','/sell-duplicates'),
      jsonb_build_object('id','first_ranked','title','Jogue sua primeira ranqueada','description','Entre no ranking quando estiver pronto.','done',v_ranked,'route','/(tabs)/battles')
    )
  );
end;
$$;

revoke all on function public.get_my_onboarding_progress() from public, anon;
grant execute on function public.get_my_onboarding_progress() to authenticated;

create or replace function public.get_battle_postgame_insights(p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := auth.uid();
  v_battle public.battles%rowtype;
  v_is_challenger boolean;
  v_my_score integer;
  v_enemy_score integer;
  v_my_before integer;
  v_my_after integer;
  v_lost_rounds integer;
  v_won_rounds integer;
  v_rounds jsonb;
  v_reason text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_battle
  from public.battles
  where id=p_battle_id;

  if v_battle.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if v_player<>v_battle.challenger_id and v_player<>v_battle.opponent_id then
    raise exception 'NOT_BATTLE_PARTICIPANT';
  end if;

  v_is_challenger := v_player=v_battle.challenger_id;
  v_my_score := case when v_is_challenger then v_battle.challenger_score else v_battle.opponent_score end;
  v_enemy_score := case when v_is_challenger then v_battle.opponent_score else v_battle.challenger_score end;
  v_my_before := case when v_is_challenger then v_battle.challenger_rating_before else v_battle.opponent_rating_before end;
  v_my_after := case when v_is_challenger then v_battle.challenger_rating_after else v_battle.opponent_rating_after end;

  select count(*) filter (where r.winner_id=v_player),
         count(*) filter (where r.winner_id is not null and r.winner_id<>v_player)
  into v_won_rounds, v_lost_rounds
  from public.battle_rounds r
  where r.battle_id=p_battle_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'round', r.round_no,
      'won', r.winner_id=v_player,
      'myCardId', case when v_is_challenger then r.challenger_card_id else r.opponent_card_id end,
      'enemyCardId', case when v_is_challenger then r.opponent_card_id else r.challenger_card_id end,
      'myCardName', case when v_is_challenger then cc.pokemon_name else oc.pokemon_name end,
      'enemyCardName', case when v_is_challenger then oc.pokemon_name else cc.pokemon_name end,
      'myPower', case when v_is_challenger then r.challenger_power else r.opponent_power end,
      'enemyPower', case when v_is_challenger then r.opponent_power else r.challenger_power end,
      'myCombat', case when v_is_challenger then r.challenger_combat else r.opponent_combat end,
      'enemyCombat', case when v_is_challenger then r.opponent_combat else r.challenger_combat end
    )
    order by r.round_no
  ), '[]'::jsonb)
  into v_rounds
  from public.battle_rounds r
  left join public.cards cc on cc.id=r.challenger_card_id
  left join public.cards oc on oc.id=r.opponent_card_id
  where r.battle_id=p_battle_id;

  v_reason := case
    when v_battle.forfeited_by=v_player then 'A derrota ocorreu por desistência.'
    when v_battle.winner_id=v_player then 'Você venceu mais rodadas e executou melhor as decisões que chegaram ao servidor.'
    when v_lost_rounds>v_won_rounds then 'O adversário venceu mais rodadas. Revise os confrontos perdidos e compare tipo, velocidade, HP e escolha de golpes.'
    else 'O resultado foi decidido pelos turnos finais. Use o replay para identificar a decisão que mais mudou a batalha.'
  end;

  return jsonb_build_object(
    'battleId', v_battle.id,
    'won', v_battle.winner_id=v_player,
    'status', v_battle.status,
    'mode', v_battle.mode,
    'engineVersion', v_battle.engine_version,
    'myScore', v_my_score,
    'enemyScore', v_enemy_score,
    'ratingBefore', v_my_before,
    'ratingAfter', v_my_after,
    'ratingDelta', coalesce(v_my_after,0)-coalesce(v_my_before,0),
    'rewardEligible', v_battle.reward_eligible,
    'forfeited', v_battle.forfeited_by is not null,
    'reason', v_reason,
    'wonRounds', v_won_rounds,
    'lostRounds', v_lost_rounds,
    'rounds', v_rounds,
    'replayRoute', '/battle-replay/'||v_battle.id::text
  );
end;
$$;

revoke all on function public.get_battle_postgame_insights(uuid) from public, anon;
grant execute on function public.get_battle_postgame_insights(uuid) to authenticated;


create or replace function public.get_achievement_rarity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $rarity$
declare
  v_player uuid := auth.uid();
  v_total bigint;
  v_result jsonb;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select count(*) into v_total
  from public.players p
  where p.account_status='active';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'achievementId', d.id,
      'unlockCount', coalesce(x.unlock_count,0),
      'activePlayers', v_total,
      'percentage', case when v_total=0 then 0 else round((coalesce(x.unlock_count,0)::numeric * 100) / v_total, 2) end
    )
    order by d.sort_order, d.id
  ), '[]'::jsonb)
  into v_result
  from public.achievement_definitions d
  left join (
    select pa.achievement_id, count(*)::bigint as unlock_count
    from public.player_achievements pa
    where pa.unlocked_at is not null
    group by pa.achievement_id
  ) x on x.achievement_id=d.id
  where d.active=true;

  return v_result;
end;
$rarity$;

revoke all on function public.get_achievement_rarity() from public, anon;
grant execute on function public.get_achievement_rarity() to authenticated;

alter table public.player_login_streaks
  add column if not exists streak_shields smallint not null default 2,
  add column if not exists streak_shield_month date not null default date_trunc('month', current_date)::date,
  add column if not exists last_shield_used_at timestamptz;

create or replace function private.claim_daily_login_for_player(p_player uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.player_login_streaks%rowtype;
  v_streak integer;
  v_day integer;
  v_coins bigint;
  v_diamonds integer;
  v_shields smallint;
  v_shield_used boolean := false;
  v_month date := date_trunc('month', current_date)::date;
begin
  if p_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.players p where p.id=p_player and p.account_status='active') then
    raise exception 'PLAYER_NOT_AVAILABLE';
  end if;

  insert into public.player_login_streaks(player_id)
  values(p_player)
  on conflict(player_id) do nothing;

  select * into v_row
  from public.player_login_streaks
  where player_id=p_player
  for update;

  if v_row.streak_shield_month<>v_month then
    update public.player_login_streaks
    set streak_shields=2, streak_shield_month=v_month, updated_at=now()
    where player_id=p_player;
    v_row.streak_shields := 2;
    v_row.streak_shield_month := v_month;
  end if;

  if v_row.last_claim_date = current_date then
    return jsonb_build_object(
      'claimed',false,'streak',v_row.current_streak,'bestStreak',v_row.best_streak,
      'coins',0,'diamonds',0,'nextClaimDate',current_date+1,
      'shieldUsed',false,'shieldsRemaining',v_row.streak_shields
    );
  end if;

  v_shields := v_row.streak_shields;

  if v_row.last_claim_date = current_date - 1 then
    v_streak := v_row.current_streak + 1;
  elsif v_row.last_claim_date = current_date - 2 and v_shields > 0 then
    v_streak := v_row.current_streak + 1;
    v_shields := v_shields - 1;
    v_shield_used := true;
  else
    v_streak := 1;
  end if;

  v_day := ((v_streak - 1) % 7) + 1;
  v_coins := case v_day
    when 1 then 1000 when 2 then 1500 when 3 then 2000 when 4 then 2500
    when 5 then 3000 when 6 then 4000 else 5000 end;
  v_diamonds := case when v_day=7 then 1 else 0 end;

  update public.player_login_streaks
  set current_streak=v_streak,
      best_streak=greatest(best_streak,v_streak),
      total_claims=total_claims+1,
      last_claim_date=current_date,
      streak_shields=v_shields,
      last_shield_used_at=case when v_shield_used then now() else last_shield_used_at end,
      updated_at=now()
  where player_id=p_player;

  update public.players
  set coins=coins+v_coins,
      diamonds=diamonds+v_diamonds,
      last_daily_claim_at=now()
  where id=p_player;

  perform public.server_queue_notification(
    p_player,'daily_streak','Sequência diária 🔥',
    'Dia '||v_day||' do ciclo: +'||v_coins||' Coins'||case when v_diamonds>0 then ' e +1 Diamante.' else '.' end||
      case when v_shield_used then ' Um Escudo de Sequência protegeu seu progresso.' else '' end,
    jsonb_build_object(
      'streak',v_streak,'cycleDay',v_day,'coins',v_coins,'diamonds',v_diamonds,
      'shieldUsed',v_shield_used,'shieldsRemaining',v_shields
    )
  );

  return jsonb_build_object(
    'claimed',true,'streak',v_streak,'bestStreak',greatest(v_row.best_streak,v_streak),
    'cycleDay',v_day,'coins',v_coins,'diamonds',v_diamonds,'nextClaimDate',current_date+1,
    'shieldUsed',v_shield_used,'shieldsRemaining',v_shields
  );
end;
$$;


insert into public.app_update_logs(id,version,title,summary,changes,published_at,active)
values(
  3,
  '1.2.1 • OTA 11/09',
  'Experiência do Treinador V2',
  'Uma atualização focada em orientar melhor cada jogador, explicar batalhas e tornar o progresso mais pessoal.',
  array[
    'Primeiros Passos agora acompanha automaticamente o tutorial real do jogador.',
    'Metas pessoais permitem acompanhar coleção, ELO, vitórias, Coins e objetivos próprios.',
    'Coach de Deck recomenda melhorias usando cartas que você já possui.',
    'Comparador mostra stats do modo Pokémon lado a lado.',
    'Fim de batalha ganhou resumo explicativo, ELO, replay e análise rodada por rodada.',
    'Conquistas desbloqueadas mostram a raridade global entre treinadores ativos.',
    'Sequência diária ganhou até dois Escudos de Sequência por mês para proteger um único dia perdido.',
    'Home recebeu carregamento visual mais suave e atalhos para as novas ferramentas.'
  ],
  now(),
  true
)
on conflict(id) do update set
  version=excluded.version,
  title=excluded.title,
  summary=excluded.summary,
  changes=excluded.changes,
  published_at=excluded.published_at,
  active=excluded.active;
