create or replace function public.server_admin_create_redeem_code(
  p_actor_id uuid,
  p_code text,
  p_reward jsonb,
  p_max_total_uses integer default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_code text;
  v_row public.redeem_codes%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.admin_members where player_id=p_actor_id) then raise exception 'FORBIDDEN'; end if;

  v_code := upper(regexp_replace(trim(coalesce(p_code,'')),'\s+','','g'));
  if v_code !~ '^[A-Z0-9_-]{4,32}$' then raise exception 'INVALID_CODE'; end if;
  if p_reward is null or jsonb_typeof(p_reward) <> 'object' then raise exception 'INVALID_REWARD'; end if;
  if exists(
    select 1 from jsonb_object_keys(p_reward) k
    where k <> all(array['coins','diamonds','cardId','cardQuantity','lucky2xUses'])
  ) then raise exception 'INVALID_REWARD'; end if;
  if p_max_total_uses is not null and p_max_total_uses < 1 then raise exception 'INVALID_LIMIT'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'INVALID_EXPIRY'; end if;

  if greatest(0,coalesce((p_reward->>'coins')::bigint,0)) = 0
    and greatest(0,coalesce((p_reward->>'diamonds')::bigint,0)) = 0
    and greatest(0,coalesce((p_reward->>'lucky2xUses')::integer,0)) = 0
    and (nullif(p_reward->>'cardId','') is null or greatest(0,coalesce((p_reward->>'cardQuantity')::integer,0)) = 0)
  then raise exception 'EMPTY_REWARD'; end if;

  if coalesce((p_reward->>'coins')::bigint,0) < 0 or coalesce((p_reward->>'coins')::bigint,0) > 100000000
    or coalesce((p_reward->>'diamonds')::bigint,0) < 0 or coalesce((p_reward->>'diamonds')::bigint,0) > 1000000
    or coalesce((p_reward->>'cardQuantity')::integer,0) < 0 or coalesce((p_reward->>'cardQuantity')::integer,0) > 99
    or coalesce((p_reward->>'lucky2xUses')::integer,0) < 0 or coalesce((p_reward->>'lucky2xUses')::integer,0) > 10000
  then raise exception 'INVALID_REWARD'; end if;

  if nullif(p_reward->>'cardId','') is not null
    and not exists(select 1 from public.cards where id=p_reward->>'cardId')
  then raise exception 'CARD_NOT_FOUND'; end if;

  insert into public.redeem_codes(code,reward,max_total_uses,expires_at,created_by)
  values(v_code,p_reward,p_max_total_uses,p_expires_at,p_actor_id)
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,'code',v_row.code,'reward',v_row.reward,'active',v_row.active,
    'maxTotalUses',v_row.max_total_uses,'expiresAt',v_row.expires_at,'createdAt',v_row.created_at
  );
exception
  when unique_violation then raise exception 'CODE_ALREADY_EXISTS';
  when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_REWARD';
end;
$function$;
