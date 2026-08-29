create or replace function public.server_begin_release_freeze(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_finalize jsonb;
begin
  if not exists (
    select 1
    from public.admin_members a
    where a.player_id = p_actor_id
      and a.role = 'owner'
  ) then
    raise exception using errcode = 'P0001', message = 'OWNER_ONLY';
  end if;

  select *
  into v_campaign
  from public.release_campaigns
  where code = 'trainer_collection_1_0_beta_transition'
    and active = true
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'RELEASE_CAMPAIGN_NOT_FOUND';
  end if;

  if v_campaign.phase not in ('notice', 'legacy_selection', 'freeze') then
    raise exception using errcode = 'P0001', message = 'RELEASE_PHASE_LOCKED';
  end if;

  update public.release_campaigns
  set
    phase = 'freeze',
    legacy_selection_enabled = false,
    economy_frozen = true,
    updated_at = now()
  where id = v_campaign.id;

  select public.server_finalize_legacy_selections(p_actor_id)
  into v_finalize;

  return jsonb_build_object(
    'ok', true,
    'phase', 'freeze',
    'economyFrozen', true,
    'legacySelectionEnabled', false,
    'legacyFinalize', v_finalize
  );
end;
$$;

revoke all on function public.server_begin_release_freeze(uuid) from public, anon, authenticated;
grant execute on function public.server_begin_release_freeze(uuid) to service_role;

update public.release_campaigns
set
  body = 'A Beta continua funcionando normalmente até o lançamento. Na versão 1.0 sua conta será preservada, mas o progresso econômico será reiniciado para começar uma economia justa. Veteranos poderão manter até 10 cartas. Se não escolherem todas até a migração, o sistema completará automaticamente as vagas restantes com as cartas de maior valor de mercado da Bag.',
  updated_at = now()
where code = 'trainer_collection_1_0_beta_transition';
