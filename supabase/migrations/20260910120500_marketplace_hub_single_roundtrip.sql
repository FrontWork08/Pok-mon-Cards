create or replace function public.get_marketplace_hub_v2()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with me as (
  select auth.uid() as id
),
active_rows as materialized (
  select l.*
  from public.market_listings l
  where l.status='active'
  order by l.boosted_until desc nulls last,l.created_at desc
  limit 100
),
mine_rows as materialized (
  select l.*
  from public.market_listings l
  where l.seller_id=(select id from me)
  order by l.created_at desc
  limit 100
),
all_sellers as materialized (
  select distinct seller_id from active_rows
  union
  select distinct seller_id from mine_rows
  union
  select id from me where id is not null
),
seller_context as materialized (
  select
    p.id,p.username,p.profile_icon,p.avatar_path,p.avatar_updated_at,
    p.equipped_frame_id,p.equipped_background_id,
    s.name as shop_name,s.theme_style,s.highlight_until,
    g.id as guild_id,g.name as guild_name,g.color as guild_color
  from all_sellers x
  join public.players p on p.id=x.seller_id
  left join public.player_shops s on s.player_id=p.id
  left join public.guild_members gm on gm.player_id=p.id
  left join public.guilds g on g.id=gm.guild_id
),
active_json as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',l.id,'sellerId',l.seller_id,'buyerId',l.buyer_id,
      'sellerName',coalesce(sc.username,'Treinador'),'sellerIcon',coalesce(sc.profile_icon,'pokeball'),
      'sellerAvatarPath',sc.avatar_path,'sellerAvatarUpdatedAt',sc.avatar_updated_at,
      'sellerFrameId',sc.equipped_frame_id,'sellerBackgroundId',sc.equipped_background_id,
      'shopName',coalesce(sc.shop_name,coalesce(sc.username,'Trainer')||' Card Shop'),
      'shopTheme',coalesce(sc.theme_style,'guild'),
      'guild',case when sc.guild_id is null then null else jsonb_build_object('id',sc.guild_id,'name',sc.guild_name,'color',sc.guild_color) end,
      'card',jsonb_build_object('id',c.id,'name',coalesce(c.pokemon_name,'Carta'),'rarity',c.rarity,'image',coalesce(c.image_small,c.image_large),'marketPriceUsd',c.market_price_usd),
      'quantity',l.quantity,'price',l.unit_price_coins,'status',l.status,
      'boostedUntil',l.boosted_until,'boostTier',l.boost_tier,'shopHighlightUntil',sc.highlight_until,'createdAt',l.created_at
    ) order by l.boosted_until desc nulls last,l.created_at desc
  ),'[]'::jsonb) as value
  from active_rows l
  join public.cards c on c.id=l.card_id
  left join seller_context sc on sc.id=l.seller_id
),
mine_json as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',l.id,'sellerId',l.seller_id,'buyerId',l.buyer_id,
      'sellerName',coalesce(sc.username,'Treinador'),'sellerIcon',coalesce(sc.profile_icon,'pokeball'),
      'sellerAvatarPath',sc.avatar_path,'sellerAvatarUpdatedAt',sc.avatar_updated_at,
      'sellerFrameId',sc.equipped_frame_id,'sellerBackgroundId',sc.equipped_background_id,
      'shopName',coalesce(sc.shop_name,coalesce(sc.username,'Trainer')||' Card Shop'),
      'shopTheme',coalesce(sc.theme_style,'guild'),
      'guild',case when sc.guild_id is null then null else jsonb_build_object('id',sc.guild_id,'name',sc.guild_name,'color',sc.guild_color) end,
      'card',jsonb_build_object('id',c.id,'name',coalesce(c.pokemon_name,'Carta'),'rarity',c.rarity,'image',coalesce(c.image_small,c.image_large),'marketPriceUsd',c.market_price_usd),
      'quantity',l.quantity,'price',l.unit_price_coins,'status',l.status,
      'boostedUntil',l.boosted_until,'boostTier',l.boost_tier,'shopHighlightUntil',sc.highlight_until,'createdAt',l.created_at
    ) order by l.created_at desc
  ),'[]'::jsonb) as value
  from mine_rows l
  join public.cards c on c.id=l.card_id
  left join seller_context sc on sc.id=l.seller_id
),
my_shop as (
  select case when s.player_id is null then null else jsonb_build_object('name',s.name,'themeStyle',s.theme_style,'highlightUntil',s.highlight_until) end as value
  from me left join public.player_shops s on s.player_id=me.id
),
themes as (
  select coalesce(jsonb_agg(distinct e.metadata->>'themeStyle') filter(where nullif(e.metadata->>'themeStyle','') is not null),'[]'::jsonb) as value
  from me
  join public.player_economy_items pei on pei.player_id=me.id
  join public.economy_store_items e on e.id=pei.item_id and e.category='shop_theme'
)
select case
  when (select id from me) is null then null
  else jsonb_build_object(
    'myId',(select id from me),
    'myShop',(select value from my_shop),
    'ownedShopThemes',coalesce((select value from themes),'[]'::jsonb),
    'listings',(select value from active_json),
    'myListings',(select value from mine_json)
  )
end;
$function$;

grant execute on function public.get_marketplace_hub_v2() to authenticated;
revoke execute on function public.get_marketplace_hub_v2() from anon;