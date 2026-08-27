-- Fast Bag pagination, public showcase profiles, four fixed guilds and announcement replacement.

create table if not exists public.guilds (
  id text primary key,
  name text not null unique,
  color text not null,
  motto text not null,
  leader_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint guilds_fixed_id_check check (id in ('kanto','johto','hoenn','sinnoh')),
  constraint guilds_color_check check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists guilds_leader_id_unique
  on public.guilds(leader_id) where leader_id is not null;

create table if not exists public.guild_members (
  player_id uuid primary key references public.players(id) on delete cascade,
  guild_id text not null references public.guilds(id) on delete restrict,
  role text not null default 'member' check (role in ('leader','officer','member')),
  joined_at timestamptz not null default now()
);

create index if not exists guild_members_guild_id_idx on public.guild_members(guild_id);

create table if not exists public.guild_invites (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.guilds(id) on delete cascade,
  invited_player_id uuid not null references public.players(id) on delete cascade,
  invited_by uuid not null references public.players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists guild_invites_one_pending_idx
  on public.guild_invites(guild_id, invited_player_id) where status = 'pending';
create index if not exists guild_invites_player_idx on public.guild_invites(invited_player_id, status);
create index if not exists guild_invites_invited_by_idx on public.guild_invites(invited_by);

insert into public.guilds(id,name,color,motto)
values
  ('kanto','Guilda Kanto','#E63946','Coragem para iniciar qualquer jornada.'),
  ('johto','Guilda Johto','#F4B942','Tradição, lealdade e descobertas raras.'),
  ('hoenn','Guilda Hoenn','#2A9DDB','Aventura além de todos os horizontes.'),
  ('sinnoh','Guilda Sinnoh','#8B5CF6','Estratégia digna das maiores lendas.')
on conflict (id) do update set
  name = excluded.name,
  color = excluded.color,
  motto = excluded.motto;

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_invites enable row level security;

drop policy if exists guilds_read_authenticated on public.guilds;
create policy guilds_read_authenticated on public.guilds
for select to authenticated
using ((select auth.uid()) is not null);

drop policy if exists guild_members_read_authenticated on public.guild_members;
create policy guild_members_read_authenticated on public.guild_members
for select to authenticated
using ((select auth.uid()) is not null);

drop policy if exists guild_invites_read_involved on public.guild_invites;
create policy guild_invites_read_involved on public.guild_invites
for select to authenticated
using (
  (select auth.uid()) = invited_player_id
  or (select auth.uid()) = invited_by
  or exists (
    select 1 from public.guilds g
    where g.id = guild_invites.guild_id and g.leader_id = (select auth.uid())
  )
);

revoke all on public.guilds, public.guild_members, public.guild_invites from anon;
revoke insert, update, delete, truncate, references, trigger on public.guilds, public.guild_members, public.guild_invites from authenticated;
grant select on public.guilds, public.guild_members, public.guild_invites to authenticated;
grant all on public.guilds, public.guild_members, public.guild_invites to service_role;

create or replace function public.get_my_bag_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;

  with owned as (
    select pc.quantity, pc.favorite, pc.first_obtained_at, c.*
    from public.player_cards pc
    join public.cards c on c.id = pc.card_id
    where pc.player_id = v_actor and pc.quantity > 0
  ), most_valuable as (
    select * from owned
    order by market_price_usd desc nulls last, pokemon_name, id
    limit 1
  )
  select jsonb_build_object(
    'uniqueCards', (select count(*) from owned),
    'totalCards', (select coalesce(sum(quantity),0) from owned),
    'collectionValueUsd', (select coalesce(sum(quantity * coalesce(market_price_usd,0)),0)::numeric(14,2) from owned),
    'pricedCopies', (select coalesce(sum(quantity) filter (where market_price_usd is not null),0) from owned),
    'mostValuable', coalesce((
      select jsonb_build_object(
        'id', id, 'pokemon_name', pokemon_name, 'rarity', rarity,
        'image_small', image_small, 'market_price_usd', market_price_usd
      ) from most_valuable
    ), 'null'::jsonb),
    'types', coalesce((
      select jsonb_agg(t order by t)
      from (select distinct unnest(coalesce(types, array[]::text[])) t from owned) valueset
      where t is not null and t <> ''
    ), '[]'::jsonb),
    'rarities', coalesce((
      select jsonb_agg(rarity order by rarity)
      from (select distinct rarity from owned where rarity is not null and rarity <> '') r
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_my_bag_page(
  p_offset integer default 0,
  p_limit integer default 60,
  p_search text default null,
  p_set_query text default null,
  p_quick_filter text default 'all',
  p_type_filter text default null,
  p_rarity_filter text default null,
  p_generation integer default null,
  p_sort_mode text default 'recent'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_limit integer := greatest(1,least(coalesce(p_limit,60),100));
  v_search text := nullif(btrim(coalesce(p_search,'')),'');
  v_set text := nullif(btrim(coalesce(p_set_query,'')),'');
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if coalesce(p_quick_filter,'all') not in ('all','favorites','duplicates') then raise exception 'INVALID_FILTER'; end if;
  if coalesce(p_sort_mode,'recent') not in ('recent','value','name','quantity') then raise exception 'INVALID_SORT'; end if;
  if p_generation is not null and (p_generation < 1 or p_generation > 9) then raise exception 'INVALID_GENERATION'; end if;

  with filtered as (
    select
      pc.quantity, pc.favorite, pc.first_obtained_at,
      c.id, c.pokemon_name, c.pokedex_numbers, c.set_id, c.set_name,
      c.card_number, c.rarity, c.types, c.image_small, c.image_large,
      c.game_value, c.market_price_usd, c.market_price_low_usd,
      c.market_price_high_usd, c.market_price_variant,
      c.market_price_source, c.market_price_updated_at
    from public.player_cards pc
    join public.cards c on c.id = pc.card_id
    where pc.player_id = v_actor
      and pc.quantity > 0
      and (coalesce(p_quick_filter,'all') <> 'favorites' or pc.favorite)
      and (coalesce(p_quick_filter,'all') <> 'duplicates' or pc.quantity > 1)
      and (p_type_filter is null or p_type_filter = any(coalesce(c.types,array[]::text[])))
      and (p_rarity_filter is null or c.rarity = p_rarity_filter)
      and (v_set is null or c.set_name ilike '%' || v_set || '%' or c.set_id ilike '%' || v_set || '%')
      and (v_search is null
        or c.pokemon_name ilike '%' || v_search || '%'
        or c.set_name ilike '%' || v_search || '%'
        or coalesce(c.card_number,'') ilike '%' || v_search || '%')
      and (p_generation is null or case p_generation
        when 1 then coalesce(c.pokedex_numbers[1],0) between 1 and 151
        when 2 then coalesce(c.pokedex_numbers[1],0) between 152 and 251
        when 3 then coalesce(c.pokedex_numbers[1],0) between 252 and 386
        when 4 then coalesce(c.pokedex_numbers[1],0) between 387 and 493
        when 5 then coalesce(c.pokedex_numbers[1],0) between 494 and 649
        when 6 then coalesce(c.pokedex_numbers[1],0) between 650 and 721
        when 7 then coalesce(c.pokedex_numbers[1],0) between 722 and 809
        when 8 then coalesce(c.pokedex_numbers[1],0) between 810 and 905
        when 9 then coalesce(c.pokedex_numbers[1],0) between 906 and 1025
        else false end)
  ), ordered as (
    select * from filtered
    order by
      case when p_sort_mode = 'value' then market_price_usd end desc nulls last,
      case when p_sort_mode = 'name' then pokemon_name end asc,
      case when p_sort_mode = 'quantity' then quantity end desc,
      case when p_sort_mode = 'recent' then first_obtained_at end desc,
      id asc
    offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'totalFiltered', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'quantity', quantity,
        'favorite', favorite,
        'first_obtained_at', first_obtained_at,
        'cards', jsonb_build_object(
          'id', id, 'pokemon_name', pokemon_name, 'pokedex_numbers', pokedex_numbers,
          'set_id', set_id, 'set_name', set_name, 'card_number', card_number,
          'rarity', rarity, 'types', types, 'image_small', image_small,
          'image_large', image_large, 'game_value', game_value,
          'market_price_usd', market_price_usd,
          'market_price_low_usd', market_price_low_usd,
          'market_price_high_usd', market_price_high_usd,
          'market_price_variant', market_price_variant,
          'market_price_source', market_price_source,
          'market_price_updated_at', market_price_updated_at
        )
      ) order by
        case when p_sort_mode = 'value' then market_price_usd end desc nulls last,
        case when p_sort_mode = 'name' then pokemon_name end asc,
        case when p_sort_mode = 'quantity' then quantity end desc,
        case when p_sort_mode = 'recent' then first_obtained_at end desc,
        id asc) from ordered
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_public_player_profile(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;

  select jsonb_build_object(
    'player', jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'level', p.level,
      'battleWins', p.battle_wins,
      'battleLosses', p.battle_losses,
      'battleStreak', p.battle_streak,
      'battleRating', case when p.id = v_actor or p.show_battle_rating then p.battle_rating else null end,
      'showBattleRating', p.show_battle_rating,
      'equippedTitle', case when ad.id is null then null else jsonb_build_object('id',ad.id,'title',ad.title,'icon',ad.icon) end,
      'guild', case when g.id is null then null else jsonb_build_object(
        'id',g.id,'name',g.name,'color',g.color,'role',gm.role
      ) end
    ),
    'collection', jsonb_build_object(
      'uniqueCards', (select count(*) from public.player_cards pc where pc.player_id=p.id and pc.quantity>0),
      'totalCopies', (select coalesce(sum(pc.quantity),0) from public.player_cards pc where pc.player_id=p.id and pc.quantity>0),
      'totalValueUsd', (
        select coalesce(sum(pc.quantity * coalesce(c.market_price_usd,0)),0)::numeric(14,2)
        from public.player_cards pc join public.cards c on c.id=pc.card_id
        where pc.player_id=p.id and pc.quantity>0
      ),
      'rarestCards', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.rarity_tier desc, r."marketPriceUsd" desc nulls last, r.name)
        from (
          select c.id, c.pokemon_name as name, c.set_name as "setName", c.rarity,
            c.image_small as "imageSmall", c.image_large as "imageLarge",
            c.market_price_usd as "marketPriceUsd", pc.quantity,
            public.rarity_tier(c.rarity) as rarity_tier
          from public.player_cards pc join public.cards c on c.id=pc.card_id
          where pc.player_id=p.id and pc.quantity>0
          order by public.rarity_tier(c.rarity) desc,
                   c.market_price_usd desc nulls last, pc.quantity desc, c.pokemon_name
          limit 12
        ) r
      ), '[]'::jsonb)
    )
  ) into v_result
  from public.players p
  left join public.achievement_definitions ad on ad.id = p.equipped_title_id
  left join public.guild_members gm on gm.player_id = p.id
  left join public.guilds g on g.id = gm.guild_id
  where p.id = p_player_id and p.account_status <> 'banned';

  if v_result is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  return v_result;
end;
$$;

create or replace function public.get_friend_profile(p_friend_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select public.get_public_player_profile(p_friend_id); $$;

create or replace function public.get_guild_hub()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_week timestamptz := date_trunc('week', now());
  v_result jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;

  with guild_totals as (
    select g.id, g.name, g.color, g.motto, g.leader_id,
      leader.username as leader_username,
      count(distinct gm.player_id)::integer as member_count,
      coalesce(sum(pc.quantity * coalesce(c.market_price_usd,0)),0)::numeric(14,2) as collection_value_usd
    from public.guilds g
    left join public.players leader on leader.id = g.leader_id
    left join public.guild_members gm on gm.guild_id = g.id
    left join public.player_cards pc on pc.player_id = gm.player_id and pc.quantity > 0
    left join public.cards c on c.id = pc.card_id
    group by g.id, g.name, g.color, g.motto, g.leader_id, leader.username
  ), ranked as (
    select *, dense_rank() over(order by collection_value_usd desc, member_count desc, name) as guild_rank
    from guild_totals
  )
  select jsonb_build_object(
    'guilds', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'color', r.color,
      'motto', r.motto,
      'leaderId', r.leader_id,
      'leaderUsername', r.leader_username,
      'memberCount', r.member_count,
      'collectionValueUsd', r.collection_value_usd,
      'rank', r.guild_rank,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'username', p.username, 'level', p.level,
          'role', gm.role, 'joinedAt', gm.joined_at
        ) order by case gm.role when 'leader' then 0 when 'officer' then 1 else 2 end, p.username)
        from public.guild_members gm join public.players p on p.id=gm.player_id
        where gm.guild_id=r.id
      ), '[]'::jsonb),
      'missions', jsonb_build_array(
        jsonb_build_object(
          'id','collection_value','icon','diamond','title','Tesouro da Guilda',
          'description','Somar US$ 10.000 em cartas entre todos os membros.',
          'progress',least(r.collection_value_usd,10000),'target',10000,
          'completed',r.collection_value_usd >= 10000
        ),
        jsonb_build_object(
          'id','weekly_boosters','icon','cube','title','Caçadores de Boosters',
          'description','Abrir 25 boosters em conjunto nesta semana.',
          'progress',(select count(*) from public.pack_openings po join public.guild_members gm2 on gm2.player_id=po.player_id where gm2.guild_id=r.id and po.opened_at>=v_week),
          'target',25,
          'completed',(select count(*) from public.pack_openings po join public.guild_members gm2 on gm2.player_id=po.player_id where gm2.guild_id=r.id and po.opened_at>=v_week) >= 25
        ),
        jsonb_build_object(
          'id','weekly_wins','icon','trophy','title','Domínio da Arena',
          'description','Conquistar 10 vitórias válidas em batalha nesta semana.',
          'progress',(select count(*) from public.battles b join public.guild_members gm2 on gm2.player_id=b.winner_id where gm2.guild_id=r.id and b.status='completed' and coalesce(b.reward_eligible,true) and b.completed_at>=v_week),
          'target',10,
          'completed',(select count(*) from public.battles b join public.guild_members gm2 on gm2.player_id=b.winner_id where gm2.guild_id=r.id and b.status='completed' and coalesce(b.reward_eligible,true) and b.completed_at>=v_week) >= 10
        )
      )
    ) order by r.guild_rank, r.name) from ranked r), '[]'::jsonb),
    'myMembership', (
      select jsonb_build_object('guildId',gm.guild_id,'role',gm.role,'joinedAt',gm.joined_at)
      from public.guild_members gm where gm.player_id=v_actor
    ),
    'myInvites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',gi.id,'guildId',gi.guild_id,'guildName',g.name,'guildColor',g.color,
        'invitedBy',gi.invited_by,'invitedByUsername',p.username,'createdAt',gi.created_at
      ) order by gi.created_at desc)
      from public.guild_invites gi
      join public.guilds g on g.id=gi.guild_id
      join public.players p on p.id=gi.invited_by
      where gi.invited_player_id=v_actor and gi.status='pending'
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.guild_action(
  p_action text,
  p_guild_id text default null,
  p_target_id uuid default null,
  p_role text default null,
  p_invite_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_invite public.guild_invites%rowtype;
  v_old_leader uuid;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if p_action not in ('join','leave','invite','respond_accept','respond_decline','kick','set_role','admin_set_leader') then
    raise exception 'INVALID_GUILD_ACTION';
  end if;

  if p_action = 'join' then
    if not exists (select 1 from public.guilds where id=p_guild_id) then raise exception 'GUILD_NOT_FOUND'; end if;
    if exists (select 1 from public.guild_members where player_id=v_actor) then raise exception 'ALREADY_IN_GUILD'; end if;
    insert into public.guild_members(player_id,guild_id,role) values(v_actor,p_guild_id,'member');
    update public.guild_invites set status='accepted', responded_at=now()
      where invited_player_id=v_actor and guild_id=p_guild_id and status='pending';
    return jsonb_build_object('status','joined','guildId',p_guild_id);
  end if;

  if p_action = 'leave' then
    if exists (select 1 from public.guilds where leader_id=v_actor) then raise exception 'LEADER_CANNOT_LEAVE'; end if;
    delete from public.guild_members where player_id=v_actor;
    if not found then raise exception 'NOT_IN_GUILD'; end if;
    return jsonb_build_object('status','left');
  end if;

  if p_action = 'invite' then
    if p_target_id is null or p_target_id=v_actor then raise exception 'INVALID_TARGET'; end if;
    if not exists (select 1 from public.guilds where id=p_guild_id and leader_id=v_actor) then raise exception 'LEADER_ONLY'; end if;
    if exists (select 1 from public.guild_members where player_id=p_target_id) then raise exception 'TARGET_ALREADY_IN_GUILD'; end if;
    insert into public.guild_invites(guild_id,invited_player_id,invited_by)
    values(p_guild_id,p_target_id,v_actor)
    on conflict (guild_id,invited_player_id) where status='pending'
    do update set invited_by=excluded.invited_by, created_at=now();
    return jsonb_build_object('status','invited','targetId',p_target_id);
  end if;

  if p_action in ('respond_accept','respond_decline') then
    select * into v_invite from public.guild_invites
      where id=p_invite_id and invited_player_id=v_actor and status='pending'
      for update;
    if not found then raise exception 'INVITE_NOT_FOUND'; end if;
    if p_action='respond_decline' then
      update public.guild_invites set status='declined',responded_at=now() where id=v_invite.id;
      return jsonb_build_object('status','declined');
    end if;
    if exists (select 1 from public.guilds where leader_id=v_actor) then raise exception 'LEADER_CANNOT_MOVE'; end if;
    delete from public.guild_members where player_id=v_actor;
    insert into public.guild_members(player_id,guild_id,role) values(v_actor,v_invite.guild_id,'member');
    update public.guild_invites set status='accepted',responded_at=now() where id=v_invite.id;
    update public.guild_invites set status='cancelled',responded_at=now()
      where invited_player_id=v_actor and status='pending' and id<>v_invite.id;
    return jsonb_build_object('status','joined','guildId',v_invite.guild_id);
  end if;

  if p_action = 'kick' then
    if not exists (select 1 from public.guilds where id=p_guild_id and leader_id=v_actor) then raise exception 'LEADER_ONLY'; end if;
    if p_target_id is null or p_target_id=v_actor then raise exception 'INVALID_TARGET'; end if;
    delete from public.guild_members where player_id=p_target_id and guild_id=p_guild_id and role<>'leader';
    if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
    return jsonb_build_object('status','kicked','targetId',p_target_id);
  end if;

  if p_action = 'set_role' then
    if not exists (select 1 from public.guilds where id=p_guild_id and leader_id=v_actor) then raise exception 'LEADER_ONLY'; end if;
    if p_role not in ('officer','member') or p_target_id is null or p_target_id=v_actor then raise exception 'INVALID_ROLE_OR_TARGET'; end if;
    update public.guild_members set role=p_role where player_id=p_target_id and guild_id=p_guild_id and role<>'leader';
    if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
    return jsonb_build_object('status','role_updated','targetId',p_target_id,'role',p_role);
  end if;

  if p_action = 'admin_set_leader' then
    if not exists (select 1 from public.admin_members where player_id=v_actor) then raise exception 'FORBIDDEN'; end if;
    if not exists (select 1 from public.guilds where id=p_guild_id) then raise exception 'GUILD_NOT_FOUND'; end if;
    select leader_id into v_old_leader from public.guilds where id=p_guild_id for update;
    if p_target_id is null then
      update public.guilds set leader_id=null where id=p_guild_id;
      update public.guild_members set role='officer' where player_id=v_old_leader and guild_id=p_guild_id;
      return jsonb_build_object('status','leader_cleared','guildId',p_guild_id);
    end if;
    if not exists (select 1 from public.players where id=p_target_id and account_status<>'banned') then raise exception 'PLAYER_NOT_FOUND'; end if;
    update public.guilds set leader_id=null where leader_id=p_target_id and id<>p_guild_id;
    delete from public.guild_members where player_id=p_target_id;
    if v_old_leader is not null and v_old_leader<>p_target_id then
      update public.guild_members set role='officer' where player_id=v_old_leader and guild_id=p_guild_id;
    end if;
    insert into public.guild_members(player_id,guild_id,role)
      values(p_target_id,p_guild_id,'leader')
      on conflict(player_id) do update set guild_id=excluded.guild_id,role='leader',joined_at=now();
    update public.guilds set leader_id=p_target_id where id=p_guild_id;
    return jsonb_build_object('status','leader_set','guildId',p_guild_id,'leaderId',p_target_id);
  end if;

  raise exception 'INVALID_GUILD_ACTION';
end;
$$;

create or replace function public.server_admin_announce(
  p_actor_id uuid,
  p_title text,
  p_body text,
  p_severity text default 'info',
  p_duration_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.global_announcements%rowtype;
begin
  if not exists (select 1 from public.admin_members where player_id=p_actor_id)
    then raise exception 'FORBIDDEN'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 1 and 80
    or char_length(btrim(coalesce(p_body,''))) not between 1 and 500
    then raise exception 'INVALID_ANNOUNCEMENT'; end if;
  if p_severity not in ('info','warning','critical')
    then raise exception 'INVALID_SEVERITY'; end if;
  if p_duration_hours is null or p_duration_hours < 1 or p_duration_hours > 720
    then raise exception 'INVALID_DURATION'; end if;

  update public.global_announcements set active=false where active=true;
  insert into public.global_announcements(title,body,severity,ends_at,created_by)
  values(btrim(p_title),btrim(p_body),p_severity,now()+make_interval(hours=>p_duration_hours),p_actor_id)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- The existing test announcements should not reappear after this release.
update public.global_announcements set active=false where active=true;

revoke all on function public.get_my_bag_overview() from public, anon;
revoke all on function public.get_my_bag_page(integer,integer,text,text,text,text,text,integer,text) from public, anon;
revoke all on function public.get_public_player_profile(uuid) from public, anon;
revoke all on function public.get_friend_profile(uuid) from public, anon;
revoke all on function public.get_guild_hub() from public, anon;
revoke all on function public.guild_action(text,text,uuid,text,uuid) from public, anon;
grant execute on function public.get_my_bag_overview() to authenticated;
grant execute on function public.get_my_bag_page(integer,integer,text,text,text,text,text,integer,text) to authenticated;
grant execute on function public.get_public_player_profile(uuid) to authenticated;
grant execute on function public.get_friend_profile(uuid) to authenticated;
grant execute on function public.get_guild_hub() to authenticated;
grant execute on function public.guild_action(text,text,uuid,text,uuid) to authenticated;

revoke all on function public.server_admin_announce(uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.server_admin_announce(uuid,text,text,text,integer) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='guilds'
  ) then alter publication supabase_realtime add table public.guilds; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='guild_members'
  ) then alter publication supabase_realtime add table public.guild_members; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='guild_invites'
  ) then alter publication supabase_realtime add table public.guild_invites; end if;
end $$;
