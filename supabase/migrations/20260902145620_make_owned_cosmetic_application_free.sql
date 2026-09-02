create or replace function public.get_my_visual_style_options(p_surface text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if p_surface not in ('card','deck') then raise exception 'INVALID_STYLE_SURFACE'; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',i.id,
        'category',i.category,
        'name',i.name,
        'description',i.description,
        'icon',i.icon,
        'rarity',i.rarity,
        'effect',coalesce(i.metadata->>'effect','flow'),
        'universalTheme',coalesce(i.metadata->>'universalTheme','false')='true',
        'applyCost',0
      )
      order by
        case when coalesce(i.metadata->>'effect','')='galaxy' then 0 else 1 end,
        i.sort_order,i.price_coins,i.name
    )
    from public.player_economy_items pi
    join public.economy_store_items i on i.id=pi.item_id
    where pi.player_id=v_player
      and pi.quantity>0
      and i.active=true
      and (
        (p_surface='card' and (
          i.category='card_style'
          or (
            i.category in ('profile_frame','profile_background')
            and coalesce(i.metadata->>'cardCompatible','false')='true'
          )
        ))
        or
        (p_surface='deck' and (
          i.category='deck_style'
          or (
            i.category in ('profile_frame','profile_background')
            and coalesce(i.metadata->>'deckCompatible','false')='true'
          )
        ))
      )
  ),'[]'::jsonb);
end;
$$;

create or replace function public.apply_card_economy_style(p_card_id text,p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_item public.economy_store_items%rowtype;
  v_balance bigint;
  v_current text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  if not exists(
    select 1 from public.player_cards
    where player_id=v_player and card_id=p_card_id and quantity>0
  ) then raise exception 'CARD_NOT_OWNED'; end if;

  select i.* into v_item
  from public.economy_store_items i
  join public.player_economy_items pi
    on pi.item_id=i.id and pi.player_id=v_player and pi.quantity>0
  where i.id=p_item_id
    and i.active=true
    and (
      i.category='card_style'
      or (
        i.category in ('profile_frame','profile_background')
        and coalesce(i.metadata->>'cardCompatible','false')='true'
      )
    );
  if not found then raise exception 'STYLE_NOT_OWNED_OR_INCOMPATIBLE'; end if;

  select style_item_id into v_current
  from public.player_card_customizations
  where player_id=v_player and card_id=p_card_id;

  if v_current=v_item.id then
    select coins into v_balance from public.players where id=v_player;
    return jsonb_build_object(
      'ok',true,'cardId',p_card_id,'styleItemId',v_item.id,
      'spentCoins',0,'coins',v_balance,'alreadyApplied',true
    );
  end if;

  insert into public.player_card_customizations(player_id,card_id,style_item_id,applied_at)
  values(v_player,p_card_id,v_item.id,now())
  on conflict(player_id,card_id)
  do update set style_item_id=excluded.style_item_id,applied_at=now();

  select coins into v_balance from public.players where id=v_player;

  return jsonb_build_object(
    'ok',true,'cardId',p_card_id,'styleItemId',v_item.id,
    'spentCoins',0,'coins',v_balance,'alreadyApplied',false
  );
end;
$$;

create or replace function public.apply_deck_economy_style(p_deck_id uuid,p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_item public.economy_store_items%rowtype;
  v_balance bigint;
  v_current text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select style_item_id into v_current
  from public.decks
  where id=p_deck_id and player_id=v_player;
  if not found then raise exception 'DECK_NOT_OWNED'; end if;

  select i.* into v_item
  from public.economy_store_items i
  join public.player_economy_items pi
    on pi.item_id=i.id and pi.player_id=v_player and pi.quantity>0
  where i.id=p_item_id
    and i.active=true
    and (
      i.category='deck_style'
      or (
        i.category in ('profile_frame','profile_background')
        and coalesce(i.metadata->>'deckCompatible','false')='true'
      )
    );
  if not found then raise exception 'STYLE_NOT_OWNED_OR_INCOMPATIBLE'; end if;

  if v_current=v_item.id then
    select coins into v_balance from public.players where id=v_player;
    return jsonb_build_object(
      'ok',true,'deckId',p_deck_id,'styleItemId',v_item.id,
      'spentCoins',0,'coins',v_balance,'alreadyApplied',true
    );
  end if;

  update public.decks
  set style_item_id=v_item.id,updated_at=now()
  where id=p_deck_id and player_id=v_player;

  select coins into v_balance from public.players where id=v_player;

  return jsonb_build_object(
    'ok',true,'deckId',p_deck_id,'styleItemId',v_item.id,
    'spentCoins',0,'coins',v_balance,'alreadyApplied',false
  );
end;
$$;
