create or replace function private.get_public_player_profile(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_result jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;

  select jsonb_build_object(
    'player',jsonb_build_object(
      'id',p.id,'username',p.username,'profileIcon',p.profile_icon,'avatarPath',p.avatar_path,'level',p.level,
      'battleWins',p.battle_wins,'battleLosses',p.battle_losses,'battleStreak',p.battle_streak,
      'battleRating',case when p.id=v_actor or p.show_battle_rating then p.battle_rating else null end,
      'showBattleRating',p.show_battle_rating,
      'equippedTitle',case when ad.id is null then null else jsonb_build_object('id',ad.id,'title',ad.title,'icon',ad.icon) end,
      'economyTitle',case when et.id is null then null else jsonb_build_object('id',et.id,'title',et.name,'icon',et.icon,'rarity',et.rarity) end,
      'prestige',jsonb_build_object(
        'level',coalesce(pp.prestige_level,0),
        'stars',greatest(0,coalesce(pp.prestige_level,0)-5),
        'totalSpentCoins',coalesce(pp.total_spent_coins,0)
      ),
      'guild',case when g.id is null then null else jsonb_build_object(
        'id',g.id,'name',g.name,'color',g.color,'role',gm.role,'level',g.level,'xp',g.xp
      ) end,
      'frame',case when frame.id is null then null else jsonb_build_object(
        'id',frame.id,'name',frame.name,'primaryColor',frame.primary_color,'secondaryColor',frame.secondary_color,'icon',frame.icon
      ) end,
      'background',case when bg.id is null then null else jsonb_build_object(
        'id',bg.id,'name',bg.name,'primaryColor',bg.primary_color,'secondaryColor',bg.secondary_color,'icon',bg.icon
      ) end
    ),
    'collection',jsonb_build_object(
      'uniqueCards',(select count(*) from public.player_cards pc where pc.player_id=p.id and pc.quantity>0),
      'totalCopies',(select coalesce(sum(pc.quantity),0) from public.player_cards pc where pc.player_id=p.id and pc.quantity>0),
      'totalValueUsd',(select coalesce(sum(pc.quantity*coalesce(c.market_price_usd,0)),0)::numeric(14,2)
        from public.player_cards pc join public.cards c on c.id=pc.card_id
        where pc.player_id=p.id and pc.quantity>0),
      'rarestCards',coalesce((
        select jsonb_agg(to_jsonb(r) order by r.rarity_tier desc,r."marketPriceUsd" desc nulls last,r.name)
        from (
          select c.id,c.pokemon_name name,c.set_name "setName",c.rarity,c.image_small "imageSmall",
            c.image_large "imageLarge",c.market_price_usd "marketPriceUsd",pc.quantity,
            public.rarity_tier(c.rarity) rarity_tier
          from public.player_cards pc join public.cards c on c.id=pc.card_id
          where pc.player_id=p.id and pc.quantity>0
          order by public.rarity_tier(c.rarity) desc,c.market_price_usd desc nulls last,
            pc.quantity desc,c.pokemon_name
          limit 12
        ) r
      ),'[]'::jsonb),
      'showcase',coalesce((
        select jsonb_agg(jsonb_build_object(
          'slot',s.slot,'id',c.id,'name',c.pokemon_name,'setName',c.set_name,
          'rarity',c.rarity,'imageSmall',c.image_small,'imageLarge',c.image_large,
          'marketPriceUsd',c.market_price_usd
        ) order by s.slot)
        from public.profile_showcase s join public.cards c on c.id=s.card_id
        where s.player_id=p.id
      ),'[]'::jsonb),
      'museum',jsonb_build_object(
        'level',coalesce(mp.level,0),
        'slots',3+coalesce(mp.level,0)*3,
        'cards',coalesce((
          select jsonb_agg(jsonb_build_object(
            'slot',m.slot,'id',c.id,'name',c.pokemon_name,'setName',c.set_name,
            'rarity',c.rarity,'imageSmall',c.image_small,'imageLarge',c.image_large,
            'marketPriceUsd',c.market_price_usd,
            'style',case when si.id is null then null else jsonb_build_object('id',si.id,'name',si.name,'icon',si.icon,'rarity',si.rarity) end
          ) order by m.slot)
          from public.player_museum_cards m
          join public.cards c on c.id=m.card_id
          left join public.player_card_customizations cs on cs.player_id=m.player_id and cs.card_id=m.card_id
          left join public.economy_store_items si on si.id=cs.style_item_id
          where m.player_id=p.id
        ),'[]'::jsonb)
      )
    )
  ) into v_result
  from public.players p
  left join public.achievement_definitions ad on ad.id=p.equipped_title_id
  left join public.economy_store_items et on et.id=p.equipped_economy_title_id
  left join public.player_prestige pp on pp.player_id=p.id
  left join public.player_museum_progress mp on mp.player_id=p.id
  left join public.guild_members gm on gm.player_id=p.id
  left join public.guilds g on g.id=gm.guild_id
  left join public.cosmetic_definitions frame on frame.id=p.equipped_frame_id
  left join public.cosmetic_definitions bg on bg.id=p.equipped_background_id
  where p.id=p_player_id and p.account_status<>'banned';

  if v_result is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  return v_result;
end;
$$;
