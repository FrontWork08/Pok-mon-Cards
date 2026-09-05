create or replace function private.ensure_active_tournament()
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
  v_number integer;
  v_release_frozen boolean := false;
begin
  select exists(
    select 1
    from public.release_campaigns c
    where c.code='trainer_collection_1_0_beta_transition'
      and c.active=true
      and (coalesce(c.economy_frozen,false) or c.phase in ('freeze','update_required'))
  ) into v_release_frozen;

  if v_release_frozen then
    update public.tournament_matches
    set status='cancelled', updated_at=now()
    where status not in ('completed','cancelled');

    update public.tournaments
    set status='cancelled', ends_at=coalesce(ends_at,now())
    where status not in ('completed','cancelled');

    return null;
  end if;

  update public.tournaments
  set status='cancelled'
  where status='registration' and registration_ends_at<=now()
    and (select count(*) from public.tournament_entries e where e.tournament_id=tournaments.id)<8;

  select id into v_id
  from public.tournaments
  where status in ('registration','active')
  order by created_at desc
  limit 1;

  if v_id is not null then
    update public.tournaments set reward_diamonds=0 where id=v_id and coalesce(reward_diamonds,0)<>0;
    return v_id;
  end if;

  select count(*)+1 into v_number from public.tournaments;

  insert into public.tournaments(
    name,status,registration_ends_at,starts_at,ends_at,
    entry_fee_coins,reward_coins,reward_diamonds
  )
  values(
    'Copa Trainer #'||v_number,
    'registration',
    now()+interval '24 hours',
    null,
    now()+interval '7 days',
    10000,
    0,
    0
  )
  returning id into v_id;

  return v_id;
end;
$function$;

select private.ensure_active_tournament();
