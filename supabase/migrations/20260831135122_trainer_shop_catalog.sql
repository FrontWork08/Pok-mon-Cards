create or replace function public.get_trainer_shop_catalog()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_week date:=date_trunc('week',now())::date;
  v_live boolean;
  v_admin boolean;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  v_live:=private.economy_v2_live_for_players();
  v_admin:=exists(select 1 from public.admin_members a where a.player_id=v_player);

  insert into public.player_luxury_rotation(player_id,week_start,reroll_count)
  values(v_player,v_week,0)
  on conflict(player_id) do update
  set week_start=case
        when public.player_luxury_rotation.week_start<>v_week then v_week
        else public.player_luxury_rotation.week_start
      end,
      reroll_count=case
        when public.player_luxury_rotation.week_start<>v_week then 0
        else public.player_luxury_rotation.reroll_count
      end,
      updated_at=now();

  return jsonb_build_object(
    'live',v_live,
    'adminPreview',v_admin and not v_live,
    'wallet',(
      select jsonb_build_object(
        'coins',p.coins,
        'diamonds',p.diamonds,
        'level',p.level
      )
      from public.players p
      where p.id=v_player
    ),
    'equipped',(
      select jsonb_build_object(
        'frameId',p.equipped_frame_id,
        'backgroundId',p.equipped_background_id,
        'boosterFxId',p.equipped_booster_fx_id,
        'economyTitleId',p.equipped_economy_title_id
      )
      from public.players p
      where p.id=v_player
    ),
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',i.id,
          'category',i.category,
          'name',i.name,
          'description',i.description,
          'icon',i.icon,
          'priceCoins',i.price_coins,
          'rarity',i.rarity,
          'metadata',i.metadata,
          'owned',coalesce(pi.quantity,0)>0,
          'quantity',coalesce(pi.quantity,0),
          'maxPurchases',i.max_purchases_per_player
        )
        order by i.sort_order,i.category,i.price_coins,i.name
      )
      from public.economy_store_items i
      left join public.player_economy_items pi
        on pi.player_id=v_player and pi.item_id=i.id
      where i.active=true
        and coalesce((i.metadata->>'luxuryOnly')::boolean,false)=false
        and coalesce((i.metadata->>'notForDirectSale')::boolean,false)=false
        and (i.limited_starts_at is null or i.limited_starts_at<=now())
        and (i.limited_ends_at is null or i.limited_ends_at>now())
    ),'[]'::jsonb),
    'luxury',jsonb_build_object(
      'weekStart',v_week,
      'rerollCount',(
        select r.reroll_count
        from public.player_luxury_rotation r
        where r.player_id=v_player
      ),
      'items',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',i.id,
            'category',i.category,
            'name',i.name,
            'description',i.description,
            'icon',i.icon,
            'priceCoins',i.price_coins,
            'rarity',i.rarity,
            'metadata',i.metadata,
            'owned',coalesce(pi.quantity,0)>0,
            'quantity',coalesce(pi.quantity,0),
            'maxPurchases',i.max_purchases_per_player
          )
          order by i.price_coins,i.name
        )
        from private.current_luxury_rotation_ids(v_player) rid
        join public.economy_store_items i on i.id=rid
        left join public.player_economy_items pi
          on pi.player_id=v_player and pi.item_id=i.id
      ),'[]'::jsonb)
    ),
    'ownedCount',(
      select count(*)
      from public.player_economy_items pi
      where pi.player_id=v_player and pi.quantity>0
    )
  );
end;
$$;

revoke execute on function public.get_trainer_shop_catalog() from public,anon;
grant execute on function public.get_trainer_shop_catalog() to authenticated;
