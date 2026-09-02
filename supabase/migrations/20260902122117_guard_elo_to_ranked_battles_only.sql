
do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='server_finish_battle_round'
  limit 1;

  if v_def is null then raise exception 'SERVER_FINISH_BATTLE_ROUND_NOT_FOUND'; end if;

  v_old := '    if v_reward then'||chr(10)||
           '      v_c_expected := 1 / (1 + power(10::numeric, (v_or - v_cr) / 400.0));';
  v_new := '    if v_reward and b.is_ranked then'||chr(10)||
           '      v_c_expected := 1 / (1 + power(10::numeric, (v_or - v_cr) / 400.0));';

  if strpos(v_def,v_new)>0 then
    return;
  end if;

  if strpos(v_def,v_old)=0 then raise exception 'RANKED_ELO_GUARD_ANCHOR_NOT_FOUND'; end if;

  execute replace(v_def,v_old,v_new);
end
$patch$;
