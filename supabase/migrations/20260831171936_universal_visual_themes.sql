-- Make premium profile identity themes reusable on cards and decks.
-- This fixes expensive banner/frame/background themes having only one meaningful use.

update public.economy_store_items
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
  'universalTheme', true,
  'cardCompatible', true,
  'deckCompatible', true,
  'applyCardCost',
    greatest(
      10000::bigint,
      least(
        175000::bigint,
        (round((price_coins::numeric * 0.15) / 5000.0) * 5000)::bigint
      )
    ),
  'applyDeckCost',
    greatest(
      10000::bigint,
      least(
        150000::bigint,
        (round((price_coins::numeric * 0.12) / 5000.0) * 5000)::bigint
      )
    )
)
where active=true
  and category in ('profile_frame','profile_background');

create or replace function public.apply_card_economy_style(p_card_id text,p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_item public.economy_store_items%rowtype;
  v_cost bigint;
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

  v_cost:=greatest(
    1,
    coalesce(
      (v_item.metadata->>'applyCardCost')::bigint,
      (v_item.metadata->>'applyCost')::bigint,
      15000
    )
  );

  v_balance:=private.spend_player_coins(
    v_player,v_cost,'card_customization',
    jsonb_build_object(
      'cardId',p_card_id,
      'styleItemId',v_item.id,
      'sourceCategory',v_item.category
    )
  );

  insert into public.player_card_customizations(player_id,card_id,style_item_id,applied_at)
  values(v_player,p_card_id,v_item.id,now())
  on conflict(player_id,card_id)
  do update set style_item_id=excluded.style_item_id,applied_at=now();

  return jsonb_build_object(
    'ok',true,'cardId',p_card_id,'styleItemId',v_item.id,
    'spentCoins',v_cost,'coins',v_balance,'alreadyApplied',false
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
  v_cost bigint;
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

  v_cost:=greatest(
    1,
    coalesce(
      (v_item.metadata->>'applyDeckCost')::bigint,
      (v_item.metadata->>'applyCost')::bigint,
      10000
    )
  );

  v_balance:=private.spend_player_coins(
    v_player,v_cost,'deck_customization',
    jsonb_build_object(
      'deckId',p_deck_id,
      'styleItemId',v_item.id,
      'sourceCategory',v_item.category
    )
  );

  update public.decks
  set style_item_id=v_item.id,updated_at=now()
  where id=p_deck_id and player_id=v_player;

  return jsonb_build_object(
    'ok',true,'deckId',p_deck_id,'styleItemId',v_item.id,
    'spentCoins',v_cost,'coins',v_balance,'alreadyApplied',false
  );
end;
$$;

create or replace function public.clear_card_economy_style(p_card_id text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_player uuid:=auth.uid();
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(
    select 1 from public.player_cards
    where player_id=v_player and card_id=p_card_id and quantity>0
  ) then raise exception 'CARD_NOT_OWNED'; end if;

  delete from public.player_card_customizations
  where player_id=v_player and card_id=p_card_id;

  return jsonb_build_object('ok',true,'cardId',p_card_id,'styleItemId',null);
end;
$$;

create or replace function public.clear_deck_economy_style(p_deck_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_player uuid:=auth.uid();
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  update public.decks
  set style_item_id=null,updated_at=now()
  where id=p_deck_id and player_id=v_player;
  if not found then raise exception 'DECK_NOT_OWNED'; end if;
  return jsonb_build_object('ok',true,'deckId',p_deck_id,'styleItemId',null);
end;
$$;

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
        'applyCost',
          case
            when p_surface='card' then greatest(
              1,
              coalesce(
                (i.metadata->>'applyCardCost')::bigint,
                (i.metadata->>'applyCost')::bigint,
                15000
              )
            )
            else greatest(
              1,
              coalesce(
                (i.metadata->>'applyDeckCost')::bigint,
                (i.metadata->>'applyCost')::bigint,
                10000
              )
            )
          end
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

revoke execute on function public.apply_card_economy_style(text,text) from public,anon;
revoke execute on function public.apply_deck_economy_style(uuid,text) from public,anon;
revoke execute on function public.clear_card_economy_style(text) from public,anon;
revoke execute on function public.clear_deck_economy_style(uuid) from public,anon;
revoke execute on function public.get_my_visual_style_options(text) from public,anon;

grant execute on function public.apply_card_economy_style(text,text) to authenticated;
grant execute on function public.apply_deck_economy_style(uuid,text) to authenticated;
grant execute on function public.clear_card_economy_style(text) to authenticated;
grant execute on function public.clear_deck_economy_style(uuid) to authenticated;
grant execute on function public.get_my_visual_style_options(text) to authenticated;
