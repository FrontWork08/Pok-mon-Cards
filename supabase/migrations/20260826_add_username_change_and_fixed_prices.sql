-- Stable USD collection values + case-insensitive unique usernames.
create unique index if not exists players_username_lower_unique
  on public.players (lower(username));

create or replace function public.server_change_username(
  p_player_id uuid,
  p_username text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
begin
  v_username := trim(regexp_replace(coalesce(p_username, ''), '\s+', ' ', 'g'));

  if char_length(v_username) < 3 or char_length(v_username) > 24 then
    raise exception 'USERNAME_LENGTH';
  end if;

  if v_username ~ '[[:cntrl:]]' then
    raise exception 'USERNAME_INVALID';
  end if;

  if exists (
    select 1
    from public.players p
    where lower(p.username) = lower(v_username)
      and p.id <> p_player_id
  ) then
    raise exception 'USERNAME_TAKEN';
  end if;

  update public.players
  set username = v_username
  where id = p_player_id;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  return v_username;
exception
  when unique_violation then raise exception 'USERNAME_TAKEN';
end;
$$;

revoke all on function public.server_change_username(uuid,text)
from public,anon,authenticated;
grant execute on function public.server_change_username(uuid,text)
to service_role;

create or replace function public.fixed_card_usd_price(
  p_game_value integer,
  p_rarity text,
  p_set_id text
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    greatest(
      0.08::numeric,
      least(
        499.99::numeric,
        0.08::numeric
        * power(greatest(coalesce(p_game_value,53),53)::numeric / 53.0, 1.9)
        * case
            when lower(coalesce(p_rarity,'')) ~ '(hyper|secret|special illustration|shiny ultra)' then 1.35
            when lower(coalesce(p_rarity,'')) ~ '(ultra|illustration|rainbow)' then 1.18
            when lower(coalesce(p_rarity,'')) ~ '(radiant|amazing|holo)' then 1.08
            when lower(coalesce(p_rarity,'')) = 'common' then 0.88
            when lower(coalesce(p_rarity,'')) = 'uncommon' then 0.94
            else 1.0
          end
        * case
            when lower(coalesce(p_set_id,'')) ~ '^(base|gym|neo)' then 3.20
            when lower(coalesce(p_set_id,'')) ~ '^ecard' then 2.50
            when lower(coalesce(p_set_id,'')) ~ '^ex[0-9]' then 1.70
            when lower(coalesce(p_set_id,'')) ~ '^(dp|pl|hgss|col|bw)' then 1.25
            else 1.0
          end
      )
    ), 2
  );
$$;

update public.cards
set market_price_usd = public.fixed_card_usd_price(game_value, rarity, set_id),
    market_price_low_usd = null,
    market_price_high_usd = null,
    market_price_variant = 'fixed',
    market_price_source = 'fixed_collection_v1',
    market_price_updated_at = '2026-08-26T00:00:00Z',
    market_price_data = jsonb_build_object(
      'mode','fixed',
      'version','v1',
      'snapshotDate','2026-08-26',
      'note','Stable in-game USD valuation; no runtime market refresh'
    );

create or replace function public.apply_fixed_card_usd_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.market_price_source is null
     or new.market_price_source <> 'fixed_collection_v1'
     or new.market_price_usd is null then
    new.market_price_usd := public.fixed_card_usd_price(new.game_value,new.rarity,new.set_id);
    new.market_price_low_usd := null;
    new.market_price_high_usd := null;
    new.market_price_variant := 'fixed';
    new.market_price_source := 'fixed_collection_v1';
    new.market_price_updated_at := now();
    new.market_price_data := jsonb_build_object(
      'mode','fixed',
      'version','v1',
      'note','Stable in-game USD valuation; no runtime market refresh'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists cards_apply_fixed_usd_price on public.cards;
create trigger cards_apply_fixed_usd_price
before insert or update of game_value, rarity, set_id on public.cards
for each row execute function public.apply_fixed_card_usd_price();

revoke all on function public.fixed_card_usd_price(integer,text,text) from anon,authenticated;
grant execute on function public.fixed_card_usd_price(integer,text,text) to service_role;
revoke all on function public.apply_fixed_card_usd_price() from public,anon,authenticated;
