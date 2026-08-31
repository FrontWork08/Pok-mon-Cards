create or replace function private.ensure_active_guild_project(p_guild_id text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_next integer; v_def public.guild_project_definitions%rowtype; v_target bigint;
begin
  select id into v_id from public.guild_projects where guild_id=p_guild_id and status='active' order by started_at desc limit 1;
  if v_id is not null then return v_id; end if;
  select coalesce(max(project_no),0)+1 into v_next from public.guild_projects where guild_id=p_guild_id;
  select * into v_def from public.guild_project_definitions where project_no=v_next;
  if found then
    insert into public.guild_projects(guild_id,project_no,name,description,target_coins,reward_metadata)
    values(p_guild_id,v_next,v_def.name,v_def.description,v_def.target_coins,v_def.reward_metadata) returning id into v_id;
  else
    v_target:=5000000+greatest(1,v_next-5)::bigint*1000000;
    insert into public.guild_projects(guild_id,project_no,name,description,target_coins,reward_metadata)
    values(p_guild_id,v_next,'Projeto de Prestígio #'||(v_next-5),
      'Projeto recorrente de endgame para continuar evoluindo o prestígio visual da guilda.',
      v_target,jsonb_build_object('upgradeKey','prestige','level',v_next-5,'decor','prestige_'||(v_next-5)))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.contribute_guild_project(p_amount bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_player uuid:=auth.uid();v_guild text;v_project public.guild_projects%rowtype;v_remaining bigint;
  v_spend bigint;v_balance bigint;v_completed boolean:=false;v_upgrade_key text;v_upgrade_level integer;v_next_id uuid;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if p_amount is null or p_amount<1000 or p_amount>5000000 then raise exception 'INVALID_CONTRIBUTION'; end if;
  select guild_id into v_guild from public.guild_members where player_id=v_player limit 1;
  if v_guild is null then raise exception 'NOT_IN_GUILD'; end if;
  v_next_id:=private.ensure_active_guild_project(v_guild);
  select * into v_project from public.guild_projects where id=v_next_id for update;
  if not found or v_project.status<>'active' then raise exception 'PROJECT_NOT_ACTIVE'; end if;
  v_remaining:=greatest(0,v_project.target_coins-v_project.contributed_coins);
  if v_remaining<=0 then raise exception 'PROJECT_ALREADY_COMPLETE'; end if;
  v_spend:=least(p_amount,v_remaining);
  v_balance:=private.spend_player_coins(v_player,v_spend,'guild_project',
    jsonb_build_object('projectId',v_project.id,'projectNo',v_project.project_no,'projectName',v_project.name),v_guild);
  insert into public.guild_project_contributions(project_id,guild_id,player_id,amount_coins)
  values(v_project.id,v_guild,v_player,v_spend);
  update public.guild_projects set contributed_coins=contributed_coins+v_spend where id=v_project.id
  returning contributed_coins>=target_coins into v_completed;
  update public.guilds set xp=xp+greatest(1,v_spend/100) where id=v_guild;
  if v_completed then
    update public.guild_projects set status='completed',completed_at=now() where id=v_project.id;
    v_upgrade_key:=coalesce(v_project.reward_metadata->>'upgradeKey','prestige');
    v_upgrade_level:=greatest(1,coalesce((v_project.reward_metadata->>'level')::integer,v_project.project_no));
    insert into public.guild_upgrades(guild_id,upgrade_key,level,updated_at)
    values(v_guild,v_upgrade_key,v_upgrade_level,now())
    on conflict(guild_id,upgrade_key) do update set level=greatest(public.guild_upgrades.level,excluded.level),updated_at=now();
    update public.guilds set level=greatest(level,1+(select count(*)/2 from public.guild_projects gp where gp.guild_id=v_guild and gp.status='completed')) where id=v_guild;
    v_next_id:=private.ensure_active_guild_project(v_guild);
  end if;
  return jsonb_build_object('ok',true,'guildId',v_guild,'projectId',v_project.id,'spentCoins',v_spend,'coins',v_balance,'completed',v_completed,'nextProjectId',case when v_completed then v_next_id else v_project.id end);
end;
$$;

create or replace function public.contribute_global_economy_project(p_project_id uuid,p_amount bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid();v_project public.economy_global_projects%rowtype;v_remaining bigint;v_spend bigint;v_balance bigint;v_completed boolean:=false;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if p_amount is null or p_amount<1000 or p_amount>5000000 then raise exception 'INVALID_CONTRIBUTION'; end if;
  select * into v_project from public.economy_global_projects
  where id=p_project_id and active=true and starts_at<=now() and (ends_at is null or ends_at>now()) for update;
  if not found then raise exception 'GLOBAL_PROJECT_NOT_ACTIVE'; end if;
  if v_project.completed_at is not null then raise exception 'GLOBAL_PROJECT_ALREADY_COMPLETE'; end if;
  v_remaining:=greatest(0,v_project.target_coins-v_project.contributed_coins);
  v_spend:=least(p_amount,v_remaining);
  if v_spend<=0 then raise exception 'GLOBAL_PROJECT_ALREADY_COMPLETE'; end if;
  v_balance:=private.spend_player_coins(v_player,v_spend,'global_project',jsonb_build_object('projectId',v_project.id,'code',v_project.code,'name',v_project.name));
  insert into public.economy_global_project_contributions(project_id,player_id,amount_coins,updated_at)
  values(v_project.id,v_player,v_spend,now())
  on conflict(project_id,player_id) do update set amount_coins=public.economy_global_project_contributions.amount_coins+excluded.amount_coins,updated_at=now();
  update public.economy_global_projects set contributed_coins=contributed_coins+v_spend where id=v_project.id
  returning contributed_coins>=target_coins into v_completed;
  if v_completed then
    update public.economy_global_projects set completed_at=now(),active=false where id=v_project.id;
    if v_project.reward_item_id is not null then
      insert into public.player_economy_items(player_id,item_id,quantity,purchased_at)
      select c.player_id,v_project.reward_item_id,1,now()
      from public.economy_global_project_contributions c where c.project_id=v_project.id and c.amount_coins>0
      on conflict(player_id,item_id) do nothing;
    end if;
  end if;
  return jsonb_build_object('ok',true,'projectId',v_project.id,'spentCoins',v_spend,'coins',v_balance,'completed',v_completed);
end;
$$;

grant execute on function public.contribute_guild_project(bigint) to authenticated;
grant execute on function public.contribute_global_economy_project(uuid,bigint) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.guild_projects; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.guild_project_contributions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.guild_upgrades; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.economy_global_projects; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.economy_global_project_contributions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.market_listings; exception when duplicate_object then null; end;
end $$;
alter table public.guild_projects replica identity full;
alter table public.guild_project_contributions replica identity full;
alter table public.guild_upgrades replica identity full;
alter table public.economy_global_projects replica identity full;
alter table public.economy_global_project_contributions replica identity full;
