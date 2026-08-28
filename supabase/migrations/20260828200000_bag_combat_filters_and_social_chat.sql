-- Bag combat sorting + global chat titles/profile social integration.

alter table public.global_chat_messages
  add column if not exists sender_title_id text,
  add column if not exists sender_title text,
  add column if not exists sender_title_icon text;

update public.global_chat_messages m
set sender_title_id=p.equipped_title_id,
    sender_title=d.title,
    sender_title_icon=d.icon
from public.players p
left join public.achievement_definitions d on d.id=p.equipped_title_id
where p.id=m.player_id
  and m.sender_title_id is null
  and p.equipped_title_id is not null;

create or replace function private.prepare_global_chat_message()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_username text;
  v_profile_icon text;
  v_title_id text;
  v_title text;
  v_title_icon text;
begin
  if v_uid is null or new.player_id is distinct from v_uid then
    raise exception 'FORBIDDEN';
  end if;

  new.body:=trim(coalesce(new.body,''));
  if char_length(new.body)<1 or char_length(new.body)>280 then
    raise exception 'INVALID_MESSAGE';
  end if;

  select p.username,p.profile_icon,p.equipped_title_id,d.title,d.icon
  into v_username,v_profile_icon,v_title_id,v_title,v_title_icon
  from public.players p
  left join public.achievement_definitions d on d.id=p.equipped_title_id
  where p.id=v_uid and p.account_status='active';

  if v_username is null then raise exception 'ACCOUNT_RESTRICTED'; end if;

  if exists(
    select 1 from public.global_chat_messages
    where player_id=v_uid
      and created_at>now()-interval '2 seconds'
  ) then
    raise exception 'CHAT_RATE_LIMIT';
  end if;

  new.sender_username:=v_username;
  new.sender_profile_icon:=coalesce(v_profile_icon,'pokeball');
  new.sender_title_id:=v_title_id;
  new.sender_title:=v_title;
  new.sender_title_icon:=v_title_icon;
  new.deleted_at:=null;
  return new;
end;
$$;

revoke all on function private.prepare_global_chat_message() from public,anon,authenticated;

create or replace function public.send_global_chat_message(p_body text)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_row public.global_chat_messages%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  insert into public.global_chat_messages(
    player_id,body,sender_username,sender_profile_icon
  )
  values(auth.uid(),trim(coalesce(p_body,'')),'','pokeball')
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,
    'playerId',v_row.player_id,
    'body',v_row.body,
    'createdAt',v_row.created_at,
    'username',v_row.sender_username,
    'profileIcon',v_row.sender_profile_icon,
    'titleId',v_row.sender_title_id,
    'title',v_row.sender_title,
    'titleIcon',v_row.sender_title_icon
  );
end;
$$;

revoke all on function public.send_global_chat_message(text) from public,anon,authenticated;
grant execute on function public.send_global_chat_message(text) to authenticated;

create or replace function private.get_my_bag_page(
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
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_result jsonb;
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_limit integer:=greatest(1,least(coalesce(p_limit,60),100));
  v_search text:=nullif(btrim(coalesce(p_search,'')),'');
  v_set text:=nullif(btrim(coalesce(p_set_query,'')),'');
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if coalesce(p_quick_filter,'all') not in ('all','favorites','duplicates') then raise exception 'INVALID_FILTER'; end if;
  if coalesce(p_sort_mode,'recent') not in ('recent','value','name','quantity','damage','hp') then raise exception 'INVALID_SORT'; end if;
  if p_generation is not null and (p_generation<1 or p_generation>9) then raise exception 'INVALID_GENERATION'; end if;

  with filtered as (
    select
      pc.quantity,pc.favorite,pc.first_obtained_at,
      c.id,c.pokemon_name,c.pokedex_numbers,c.set_id,c.set_name,
      c.card_number,c.rarity,c.types,c.image_small,c.image_large,
      c.game_value,c.market_price_usd,c.market_price_low_usd,
      c.market_price_high_usd,c.market_price_variant,
      c.market_price_source,c.market_price_updated_at,
      case when p_sort_mode in ('damage','hp') then
        greatest(
          10,
          least(
            1000,
            coalesce(
              nullif(regexp_replace(coalesce(c.tcg_data->>'hp',''),'[^0-9]','','g'),'')::numeric,
              50
            )
          )
        )
      else null end as battle_hp_sort,
      case when p_sort_mode='damage' then
        case
          when jsonb_typeof(c.tcg_data->'attacks')='array' then
            greatest(
              10,
              coalesce((
                select max(
                  coalesce(
                    nullif(substring(coalesce(a->>'damage','') from '([0-9]+)'), '')::integer,
                    0
                  )
                )
                from jsonb_array_elements(c.tcg_data->'attacks') a
              ),0)
            )
          else 10
        end
      else null end as battle_damage_sort
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=v_actor
      and pc.quantity>0
      and (coalesce(p_quick_filter,'all')<>'favorites' or pc.favorite)
      and (coalesce(p_quick_filter,'all')<>'duplicates' or pc.quantity>1)
      and (p_type_filter is null or p_type_filter=any(coalesce(c.types,array[]::text[])))
      and (p_rarity_filter is null or c.rarity=p_rarity_filter)
      and (v_set is null or c.set_name ilike '%'||v_set||'%' or c.set_id ilike '%'||v_set||'%')
      and (
        v_search is null
        or c.pokemon_name ilike '%'||v_search||'%'
        or c.set_name ilike '%'||v_search||'%'
        or coalesce(c.card_number,'') ilike '%'||v_search||'%'
      )
      and (
        p_generation is null
        or case p_generation
          when 1 then coalesce(c.pokedex_numbers[1],0) between 1 and 151
          when 2 then coalesce(c.pokedex_numbers[1],0) between 152 and 251
          when 3 then coalesce(c.pokedex_numbers[1],0) between 252 and 386
          when 4 then coalesce(c.pokedex_numbers[1],0) between 387 and 493
          when 5 then coalesce(c.pokedex_numbers[1],0) between 494 and 649
          when 6 then coalesce(c.pokedex_numbers[1],0) between 650 and 721
          when 7 then coalesce(c.pokedex_numbers[1],0) between 722 and 809
          when 8 then coalesce(c.pokedex_numbers[1],0) between 810 and 905
          when 9 then coalesce(c.pokedex_numbers[1],0) between 906 and 1025
          else false
        end
      )
  ),
  ordered as (
    select * from filtered
    order by
      case when p_sort_mode='damage' then battle_damage_sort end desc nulls last,
      case when p_sort_mode='damage' then battle_hp_sort end desc nulls last,
      case when p_sort_mode='hp' then battle_hp_sort end desc nulls last,
      case when p_sort_mode='value' then market_price_usd end desc nulls last,
      case when p_sort_mode='name' then pokemon_name end asc,
      case when p_sort_mode='quantity' then quantity end desc,
      case when p_sort_mode='recent' then first_obtained_at end desc,
      pokemon_name asc,
      id asc
    offset v_offset limit v_limit
  ),
  profiled as (
    select ordered.*,public.battle_card_profile(id) as battle_profile
    from ordered
  )
  select jsonb_build_object(
    'totalFiltered',(select count(*) from filtered),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'quantity',quantity,
        'favorite',favorite,
        'first_obtained_at',first_obtained_at,
        'cards',jsonb_build_object(
          'id',id,'pokemon_name',pokemon_name,'pokedex_numbers',pokedex_numbers,
          'set_id',set_id,'set_name',set_name,'card_number',card_number,
          'rarity',rarity,'types',types,'image_small',image_small,
          'image_large',image_large,'game_value',game_value,
          'battle_damage',(battle_profile->>'maxDamage')::numeric,
          'battle_profile',battle_profile,
          'market_price_usd',market_price_usd,
          'market_price_low_usd',market_price_low_usd,
          'market_price_high_usd',market_price_high_usd,
          'market_price_variant',market_price_variant,
          'market_price_source',market_price_source,
          'market_price_updated_at',market_price_updated_at
        )
      ) order by
        case when p_sort_mode='damage' then battle_damage_sort end desc nulls last,
        case when p_sort_mode='damage' then battle_hp_sort end desc nulls last,
        case when p_sort_mode='hp' then battle_hp_sort end desc nulls last,
        case when p_sort_mode='value' then market_price_usd end desc nulls last,
        case when p_sort_mode='name' then pokemon_name end asc,
        case when p_sort_mode='quantity' then quantity end desc,
        case when p_sort_mode='recent' then first_obtained_at end desc,
        pokemon_name asc,
        id asc)
      from profiled
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

update public.app_update_logs
set changes = case
  when 'Bag com ordenação por maior dano e maior HP; chat global agora mostra títulos e permite abrir perfis e adicionar amizade' = any(changes)
    then changes
  else array_append(changes,'Bag com ordenação por maior dano e maior HP; chat global agora mostra títulos e permite abrir perfis e adicionar amizade')
end
where version='0.1.1 • OTA 28/08';
