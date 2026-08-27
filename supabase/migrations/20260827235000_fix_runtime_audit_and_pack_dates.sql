-- Runtime audit fixes: unique-card collection ranking, pack release dates,
-- and missing foreign-key indexes reported by the Supabase advisor.

alter table public.packs
  add column if not exists release_date date;

with source as (
  select content::jsonb as body
  from extensions.http_get(
    'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json'
  )
  where status = 200
),
set_rows as (
  select
    item ->> 'id' as set_id,
    nullif(item ->> 'releaseDate', '')::date as release_date
  from source,
  lateral jsonb_array_elements(body) item
)
update public.packs p
set release_date = s.release_date
from set_rows s
where p.set_id = s.set_id
  and s.release_date is not null
  and p.release_date is distinct from s.release_date;

create index if not exists admin_moderation_actions_admin_id_idx
  on public.admin_moderation_actions(admin_id);

create index if not exists player_favorite_packs_pack_id_idx
  on public.player_favorite_packs(pack_id);

create or replace function private.get_collection_value_leaderboard(
  p_limit integer default 100
)
returns table(
  global_rank bigint,
  player_id uuid,
  username text,
  collection_value_usd numeric,
  priced_card_copies bigint,
  total_card_copies bigint,
  price_coverage_pct numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select
      p.id as player_id,
      p.username,
      coalesce(sum(coalesce(c.market_price_usd, 0)), 0)::numeric(14,2) as collection_value_usd,
      count(pc.card_id) filter (where c.market_price_usd is not null)::bigint as priced_card_copies,
      count(pc.card_id)::bigint as total_card_copies
    from public.players p
    left join public.player_cards pc
      on pc.player_id = p.id and pc.quantity > 0
    left join public.cards c on c.id = pc.card_id
    group by p.id, p.username
  ),
  ranked as (
    select
      dense_rank() over (
        order by collection_value_usd desc, total_card_copies desc, username asc
      ) as global_rank,
      *,
      case
        when total_card_copies = 0 then 0::numeric
        else round((priced_card_copies::numeric / total_card_copies::numeric) * 100, 1)
      end as price_coverage_pct
    from totals
  )
  select
    global_rank, player_id, username, collection_value_usd,
    priced_card_copies, total_card_copies, price_coverage_pct
  from ranked
  where auth.uid() is not null
  order by global_rank, username
  limit greatest(1, least(coalesce(p_limit,100), 200));
$$;

revoke all on function private.get_collection_value_leaderboard(integer)
from public, anon, authenticated;
grant execute on function private.get_collection_value_leaderboard(integer)
to service_role;
