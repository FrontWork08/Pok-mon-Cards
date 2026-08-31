create or replace function private.close_beta_economy_on_release_reset()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.code='trainer_collection_1_0_beta_transition'
     and old.phase='freeze'
     and new.phase='update_required' then
    update public.redeem_codes set active=false where active=true;
    update public.admin_game_events set active=false where active=true;

    update public.players
    set equipped_booster_fx_id=null,
        equipped_economy_title_id=null,
        equipped_frame_id=case
          when equipped_frame_id in (select id from public.cosmetic_definitions where unlock_type='coin_shop') then null
          else equipped_frame_id end,
        equipped_background_id=case
          when equipped_background_id in (select id from public.cosmetic_definitions where unlock_type='coin_shop') then null
          else equipped_background_id end;

    delete from public.notifications where type='store_gift';
    delete from public.trainer_store_gifts;

    delete from public.player_cosmetics
    where cosmetic_id in (select id from public.cosmetic_definitions where unlock_type='coin_shop');
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
$$;
