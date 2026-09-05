create or replace function private.close_beta_economy_on_release_reset()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.code='trainer_collection_1_0_beta_transition'
     and old.phase='freeze'
     and new.phase='update_required' then
    update public.redeem_codes set active=false where active=true;
    update public.admin_game_events set active=false where active=true;

    update public.players
    set equipped_booster_fx_id=null,
        equipped_economy_title_id=null;

    delete from public.notifications where type='store_gift';
    delete from public.trainer_store_gifts;

    -- Trainer frames/backgrounds are permanent release-preserved assets.
    delete from public.player_card_customizations;
    delete from public.player_museum_cards;
    delete from public.player_museum_progress;
    delete from public.player_luxury_rotation;
    delete from public.player_prestige;
    delete from public.player_economy_items;

    update public.player_shops
    set highlight_until=null,
        theme_style=case when theme_style in ('guild','classic','night') then theme_style else 'guild' end,
        updated_at=now();

    update public.market_listings
    set boosted_until=null,boost_tier=null,updated_at=now()
    where boosted_until is not null or boost_tier is not null;

    delete from private.economy_auction_bids;
    delete from public.economy_auctions;
    delete from public.guild_project_contributions;
    delete from public.guild_projects;
    delete from public.guild_upgrades;
    delete from public.economy_global_project_contributions;

    update public.economy_global_projects
    set contributed_coins=0,completed_at=null,
        active=case when code='build_indigo_league_v1' then true else active end;

    update public.economy_price_recommendations set active=false where active=true;
    update public.economy_alerts set resolved_at=now() where resolved_at is null;
  end if;
  return new;
end;
$function$;

with campaign as (
  select id from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  limit 1
), used_snapshot as (
  select id from private.release_reset_snapshots
  where campaign_id=(select id from campaign) and status='used'
  order by used_at desc nulls last,created_at desc
  limit 1
), snap_cosmetics as (
  select
    (row_data->>'player_id')::uuid as player_id,
    row_data->>'cosmetic_id' as cosmetic_id,
    (row_data->>'unlocked_at')::timestamptz as unlocked_at
  from private.release_reset_snapshot_rows
  where snapshot_id=(select id from used_snapshot)
    and table_name='player_cosmetics'
)
insert into public.player_cosmetics(player_id,cosmetic_id,unlocked_at)
select s.player_id,s.cosmetic_id,s.unlocked_at
from snap_cosmetics s
join public.players p on p.id=s.player_id
join public.cosmetic_definitions d on d.id=s.cosmetic_id
on conflict(player_id,cosmetic_id) do nothing;

with campaign as (
  select id from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  limit 1
), used_snapshot as (
  select id from private.release_reset_snapshots
  where campaign_id=(select id from campaign) and status='used'
  order by used_at desc nulls last,created_at desc
  limit 1
), snap_players as (
  select
    (row_data->>'id')::uuid as player_id,
    nullif(row_data->>'equipped_frame_id','') as equipped_frame_id,
    nullif(row_data->>'equipped_background_id','') as equipped_background_id
  from private.release_reset_snapshot_rows
  where snapshot_id=(select id from used_snapshot)
    and table_name='players'
)
update public.players p
set equipped_frame_id=s.equipped_frame_id,
    equipped_background_id=s.equipped_background_id
from snap_players s
where p.id=s.player_id
  and (
    p.equipped_frame_id is distinct from s.equipped_frame_id
    or p.equipped_background_id is distinct from s.equipped_background_id
  )
  and (s.equipped_frame_id is null or exists(
    select 1 from public.player_cosmetics pc
    where pc.player_id=p.id and pc.cosmetic_id=s.equipped_frame_id
  ))
  and (s.equipped_background_id is null or exists(
    select 1 from public.player_cosmetics pc
    where pc.player_id=p.id and pc.cosmetic_id=s.equipped_background_id
  ));
