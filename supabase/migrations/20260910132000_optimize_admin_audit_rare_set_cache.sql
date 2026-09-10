do $migration$
declare
  v_definition text;
  v_patched text;
  v_old text := E'with rare_sets as (\n    select c.set_id\n    from public.cards c\n    group by c.set_id\n    having count(*)>0\n       and count(*) filter(where public.rarity_tier(c.rarity)>=3)::numeric/count(*)>=0.80\n  )\n  select count(*)';
  v_new text := E'with rare_sets as (\n    select s.set_id\n    from private.pack_set_runtime_stats s\n    where s.total_cards>0\n      and s.rare_count::numeric/s.total_cards::numeric>=0.80\n  )\n  select count(*)';
begin
  select pg_get_functiondef('public.server_admin_account_audit(uuid,uuid,integer,integer)'::regprocedure)
  into v_definition;

  v_patched := replace(v_definition, v_old, v_new);
  if v_patched = v_definition then
    raise exception 'ADMIN_AUDIT_RARE_SET_PATCH_NOT_APPLIED';
  end if;

  execute v_patched;
end;
$migration$;
