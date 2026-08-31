create table if not exists public.trainer_store_gifts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.players(id) on delete cascade,
  recipient_id uuid not null references public.players(id) on delete cascade,
  item_id text not null references public.economy_store_items(id) on delete restrict,
  price_coins bigint not null check(price_coins>0),
  message text not null default '' check(char_length(message)<=180),
  created_at timestamptz not null default now(),
  check(sender_id<>recipient_id)
);

create index if not exists trainer_store_gifts_sender_created_idx
  on public.trainer_store_gifts(sender_id,created_at desc);
create index if not exists trainer_store_gifts_recipient_created_idx
  on public.trainer_store_gifts(recipient_id,created_at desc);
create index if not exists trainer_store_gifts_item_idx
  on public.trainer_store_gifts(item_id);

alter table public.trainer_store_gifts enable row level security;

drop policy if exists trainer_store_gifts_read_participants on public.trainer_store_gifts;
create policy trainer_store_gifts_read_participants
on public.trainer_store_gifts
for select
to authenticated
using ((select auth.uid())=sender_id or (select auth.uid())=recipient_id);

revoke insert,update,delete on public.trainer_store_gifts from public,anon,authenticated;
grant select on public.trainer_store_gifts to authenticated;

create or replace function public.gift_trainer_store_item(
  p_item_id text,
  p_recipient_id uuid,
  p_message text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_sender uuid:=auth.uid();
  v_item public.economy_store_items%rowtype;
  v_recipient_owned integer:=0;
  v_balance bigint;
  v_sender_name text;
  v_recipient_name text;
  v_message text:=left(trim(coalesce(p_message,'')),180);
  v_gift_id uuid;
  v_cosmetic_id text;
begin
  if v_sender is null then raise exception 'UNAUTHORIZED'; end if;
  if p_recipient_id is null or p_recipient_id=v_sender then raise exception 'INVALID_GIFT_RECIPIENT'; end if;

  if not exists(
    select 1
    from public.friendships f
    where f.status='accepted'
      and (
        (f.requester_id=v_sender and f.addressee_id=p_recipient_id)
        or
        (f.requester_id=p_recipient_id and f.addressee_id=v_sender)
      )
  ) then
    raise exception 'GIFT_RECIPIENT_NOT_FRIEND';
  end if;

  select username into v_sender_name
  from public.players
  where id=v_sender and account_status='active';
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;

  select username into v_recipient_name
  from public.players
  where id=p_recipient_id and account_status='active';
  if not found then raise exception 'GIFT_RECIPIENT_NOT_AVAILABLE'; end if;

  select *
  into v_item
  from public.economy_store_items
  where id=p_item_id
    and active=true
    and (limited_starts_at is null or limited_starts_at<=now())
    and (limited_ends_at is null or limited_ends_at>now());
  if not found then raise exception 'ITEM_NOT_AVAILABLE'; end if;

  if coalesce((v_item.metadata->>'notForDirectSale')::boolean,false) then
    raise exception 'ITEM_NOT_GIFTABLE';
  end if;

  if coalesce((v_item.metadata->>'luxuryOnly')::boolean,false)
     and not exists(
       select 1
       from private.current_luxury_rotation_ids(v_sender) x
       where x=v_item.id
     ) then
    raise exception 'ITEM_NOT_IN_LUXURY_ROTATION';
  end if;

  select coalesce(quantity,0)
  into v_recipient_owned
  from public.player_economy_items
  where player_id=p_recipient_id and item_id=v_item.id
  for update;
  if not found then v_recipient_owned:=0; end if;

  if v_recipient_owned>=v_item.max_purchases_per_player then
    raise exception 'GIFT_RECIPIENT_ALREADY_OWNS';
  end if;

  v_balance:=private.spend_player_coins(
    v_sender,
    v_item.price_coins,
    'store_gift',
    jsonb_build_object(
      'itemId',v_item.id,
      'category',v_item.category,
      'name',v_item.name,
      'recipientId',p_recipient_id,
      'recipientName',v_recipient_name
    )
  );

  insert into public.player_economy_items(player_id,item_id,quantity,purchased_at)
  values(p_recipient_id,v_item.id,1,now())
  on conflict(player_id,item_id)
  do update set
    quantity=public.player_economy_items.quantity+1,
    purchased_at=now();

  if v_item.category in ('profile_frame','profile_background') then
    v_cosmetic_id:=coalesce(v_item.metadata->>'cosmeticId',v_item.id);
    insert into public.player_cosmetics(player_id,cosmetic_id)
    values(p_recipient_id,v_cosmetic_id)
    on conflict(player_id,cosmetic_id) do nothing;
  end if;

  insert into public.trainer_store_gifts(
    sender_id,recipient_id,item_id,price_coins,message
  )
  values(
    v_sender,p_recipient_id,v_item.id,v_item.price_coins,v_message
  )
  returning id into v_gift_id;

  insert into public.notifications(
    player_id,type,title,body,metadata
  )
  values(
    p_recipient_id,
    'store_gift',
    '🎁 Você recebeu um presente!',
    case
      when v_message<>'' then '@'||v_sender_name||' enviou '||v_item.name||'. Recado: “'||v_message||'”'
      else '@'||v_sender_name||' enviou '||v_item.name||' para você.'
    end,
    jsonb_build_object(
      'route','/store',
      'giftId',v_gift_id,
      'senderId',v_sender,
      'senderName',v_sender_name,
      'itemId',v_item.id,
      'itemName',v_item.name,
      'itemIcon',v_item.icon,
      'itemRarity',v_item.rarity,
      'giftMessage',v_message,
      'type','store_gift'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'giftId',v_gift_id,
    'recipientId',p_recipient_id,
    'recipientName',v_recipient_name,
    'itemId',v_item.id,
    'itemName',v_item.name,
    'spentCoins',v_item.price_coins,
    'coins',v_balance,
    'message',v_message
  );
end;
$$;

revoke execute on function public.gift_trainer_store_item(text,uuid,text) from public,anon;
grant execute on function public.gift_trainer_store_item(text,uuid,text) to authenticated;
