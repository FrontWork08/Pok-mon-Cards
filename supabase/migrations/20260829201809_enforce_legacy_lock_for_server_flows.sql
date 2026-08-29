create or replace function private.protect_confirmed_legacy_card()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_locked boolean := false;
begin
  select exists (
    select 1
    from public.release_campaign_legacy_selections s
    join public.release_campaign_legacy_submissions sub
      on sub.campaign_id = s.campaign_id
     and sub.player_id = s.player_id
    join public.release_campaigns c
      on c.id = s.campaign_id
    where s.player_id = old.player_id
      and s.card_id = old.card_id
      and c.active = true
      and c.phase in ('legacy_selection', 'freeze')
  )
  into v_locked;

  if not v_locked then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' or new.quantity < 1 then
    raise exception using errcode = 'P0001', message = 'LEGACY_CARD_LOCKED';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_confirmed_legacy_card() from public, anon, authenticated;
