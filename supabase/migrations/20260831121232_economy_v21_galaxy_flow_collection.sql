-- Economy 2.1 Galaxy Flow collection + marketplace/gym support.

alter table public.player_shops
  drop constraint if exists player_shops_theme_style_check;
alter table public.player_shops
  add constraint player_shops_theme_style_check
  check (theme_style = any(array[
    'guild'::text,'classic'::text,'night'::text,
    'royal'::text,'neon'::text,'master'::text,'celestial'::text,'galaxy'::text
  ]));

insert into public.cosmetic_definitions(
  id,kind,name,description,icon,primary_color,secondary_color,
  unlock_type,threshold,unlock_key,sort_order,active
) values
(
  'galaxy_frame_flow','frame','Galaxy Flow',
  'Moldura cósmica com fluxo de nebulosa e partículas estelares.',
  'planet','#8B5CFF','#55E6FF','coin_shop',0,null,230,true
),
(
  'galaxy_bg_nebula','background','Nebula Flow',
  'Background galáctico com corrente cósmica viva e estrelas em movimento.',
  'sparkles','#25134A','#071827','coin_shop',0,null,231,true
)
on conflict(id) do update set
  name=excluded.name,
  description=excluded.description,
  icon=excluded.icon,
  primary_color=excluded.primary_color,
  secondary_color=excluded.secondary_color,
  active=true;

insert into public.economy_store_items(
  id,category,name,description,icon,price_coins,rarity,active,metadata,sort_order
) values
(
  'galaxy_frame_flow','profile_frame','Galaxy Flow',
  'Moldura de perfil com fluxo de nebulosa, estrelas e aura cósmica.',
  'planet',650000,'legendary',true,
  '{"cosmeticId":"galaxy_frame_flow","effect":"galaxy","collection":"galaxy_flow"}'::jsonb,130
),
(
  'galaxy_bg_nebula','profile_background','Nebula Flow',
  'Background galáctico com nebulosa animada e correntes de luz.',
  'sparkles',900000,'legendary',true,
  '{"cosmeticId":"galaxy_bg_nebula","effect":"galaxy","collection":"galaxy_flow"}'::jsonb,131
),
(
  'galaxy_card_flow','card_style','Cosmic Card Flow',
  'Estilo de carta com borda galáctica, poeira estelar e fluxo cósmico.',
  'color-wand',750000,'legendary',true,
  '{"applyCost":200000,"effect":"galaxy","collection":"galaxy_flow"}'::jsonb,132
),
(
  'galaxy_deck_flow','deck_style','Cosmic Deck Flow',
  'Capa de deck com órbitas, nebulosa e aura estelar.',
  'albums',700000,'legendary',true,
  '{"applyCost":175000,"effect":"galaxy","collection":"galaxy_flow"}'::jsonb,133
),
(
  'galaxy_shop_flow','shop_theme','Galaxy Market',
  'Tema de loja com fluxo de galáxia, estrelas e brilho cósmico.',
  'storefront',1200000,'legendary',true,
  '{"themeStyle":"galaxy","effect":"galaxy","collection":"galaxy_flow"}'::jsonb,134
),
(
  'galaxy_fx_supernova','booster_fx','Supernova Flow',
  'Abertura de booster com nebulosa, estrelas, órbitas e explosão cósmica.',
  'flash',3000000,'legendary',true,
  '{"effect":"galaxy","collection":"galaxy_flow"}'::jsonb,135
),
(
  'galaxy_title_cosmic','title','Nascido das Estrelas',
  'Título cósmico da coleção Galaxy Flow.',
  'planet',1800000,'legendary',true,
  '{"effect":"galaxy","collection":"galaxy_flow"}'::jsonb,136
)
on conflict(id) do update set
  category=excluded.category,
  name=excluded.name,
  description=excluded.description,
  icon=excluded.icon,
  price_coins=excluded.price_coins,
  rarity=excluded.rarity,
  active=true,
  metadata=excluded.metadata,
  sort_order=excluded.sort_order;

update public.economy_store_items
set metadata = coalesce(metadata,'{}'::jsonb) || '{"effect":"flow"}'::jsonb
where category in ('profile_frame','profile_background','card_style','deck_style','shop_theme','booster_fx')
  and id not like 'galaxy_%'
  and coalesce(metadata->>'effect','')='';

create or replace function public.purchase_guild_war_gym_flare(p_gym_id uuid,p_flare text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_gym public.guild_war_gyms%rowtype;
  v_guild text;
  v_cost bigint;
  v_duration interval;
  v_balance bigint;
  v_until timestamptz;
  v_message text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select guild_id into v_guild from public.guild_members where player_id=v_player limit 1;
  if v_guild is null then raise exception 'NOT_IN_GUILD'; end if;

  select * into v_gym from public.guild_war_gyms where id=p_gym_id for update;
  if not found then raise exception 'GYM_NOT_FOUND'; end if;
  if v_gym.owner_guild_id is distinct from v_guild then raise exception 'GYM_NOT_OWNED_BY_GUILD'; end if;

  case p_flare
    when 'banner' then
      v_cost:=50000; v_duration:=interval '24 hours';
      v_message:='Bandeira da guilda instalada no ginásio.';
    when 'champion' then
      v_cost:=150000; v_duration:=interval '24 hours';
      v_message:='Efeito Champion ativado no ginásio.';
    when 'legendary' then
      v_cost:=400000; v_duration:=interval '48 hours';
      v_message:='Aura Lendária ativada no ginásio.';
    when 'galaxy' then
      v_cost:=750000; v_duration:=interval '48 hours';
      v_message:='Galaxy Flow ativado no ginásio.';
    else raise exception 'INVALID_GYM_FLARE';
  end case;

  v_balance:=private.spend_player_coins(
    v_player,v_cost,'guild_war_cosmetic',
    jsonb_build_object('gymId',p_gym_id,'warId',v_gym.war_id,'flare',p_flare,'effect',case when p_flare='galaxy' then 'galaxy' else 'flow' end),
    v_guild
  );

  v_until:=greatest(now(),coalesce(v_gym.flare_until,now()))+v_duration;
  update public.guild_war_gyms
  set flare_key=p_flare,flare_until=v_until,updated_at=now()
  where id=p_gym_id;

  insert into public.guild_war_gym_events(
    war_id,gym_id,event_type,actor_id,guild_id,message,metadata
  ) values(
    v_gym.war_id,p_gym_id,'cosmetic',v_player,v_guild,v_message,
    jsonb_build_object('flare',p_flare,'costCoins',v_cost,'until',v_until,'effect',case when p_flare='galaxy' then 'galaxy' else 'flow' end)
  );

  return jsonb_build_object(
    'ok',true,'gymId',p_gym_id,'flare',p_flare,'until',v_until,
    'spentCoins',v_cost,'coins',v_balance
  );
end;
$$;

revoke execute on function public.purchase_guild_war_gym_flare(uuid,text) from public, anon;
grant execute on function public.purchase_guild_war_gym_flare(uuid,text) to authenticated;
