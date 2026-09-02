
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
  where n.nspname='public' and p.proname='server_forfeit_battle'
  limit 1;

  if v_def is null then raise exception 'SERVER_FORFEIT_BATTLE_NOT_FOUND'; end if;

  if strpos(v_def,'if b.is_ranked and v_reward then')=0 then
    v_old := '    v_reward := v_pair_count < 5;'||chr(10)||
             '    v_c_expected := 1/(1+power(10::numeric,(v_or-v_cr)/400.0));'||chr(10)||
             '    v_o_expected := 1-v_c_expected;'||chr(10)||
             '    v_cr_after := round(v_cr + 24*((case when v_winner=b.challenger_id then 1 else 0 end)-v_c_expected));'||chr(10)||
             '    v_or_after := round(v_or + 24*((case when v_winner=b.opponent_id then 1 else 0 end)-v_o_expected));'||chr(10)||chr(10)||
             '    update public.players'||chr(10)||
             '    set battle_rating=case when id=b.challenger_id then v_cr_after else v_or_after end'||chr(10)||
             '    where id in (b.challenger_id,b.opponent_id);';

    v_new := '    v_reward := v_pair_count < 5;'||chr(10)||
             '    if b.is_ranked and v_reward then'||chr(10)||
             '      v_c_expected := 1/(1+power(10::numeric,(v_or-v_cr)/400.0));'||chr(10)||
             '      v_o_expected := 1-v_c_expected;'||chr(10)||
             '      v_cr_after := round(v_cr + 24*((case when v_winner=b.challenger_id then 1 else 0 end)-v_c_expected));'||chr(10)||
             '      v_or_after := round(v_or + 24*((case when v_winner=b.opponent_id then 1 else 0 end)-v_o_expected));'||chr(10)||chr(10)||
             '      update public.players'||chr(10)||
             '      set battle_rating=case when id=b.challenger_id then v_cr_after else v_or_after end'||chr(10)||
             '      where id in (b.challenger_id,b.opponent_id);'||chr(10)||
             '    end if;';

    if strpos(v_def,v_old)=0 then raise exception 'FORFEIT_ELO_GUARD_ANCHOR_NOT_FOUND'; end if;
    v_def:=replace(v_def,v_old,v_new);
  end if;

  if strpos(v_def,'v_neutral := v_neutral or not b.is_ranked or not v_reward;')=0 then
    v_old := '  end if;'||chr(10)||chr(10)||
             '  if b.stake_type=''coins'' then';
    v_new := '  end if;'||chr(10)||chr(10)||
             '  v_neutral := v_neutral or not b.is_ranked or not v_reward;'||chr(10)||chr(10)||
             '  if b.stake_type=''coins'' then';

    if strpos(v_def,v_old)=0 then raise exception 'FORFEIT_NEUTRAL_STATUS_ANCHOR_NOT_FOUND'; end if;
    v_def:=replace(v_def,v_old,v_new);
  end if;

  v_old := '      ''O adversário desistiu antes de escolher uma carta. A vitória não alterou o ELO.''';
  v_new := '      ''A vitória por desistência não alterou o ELO.''';
  if strpos(v_def,v_old)>0 then
    v_def:=replace(v_def,v_old,v_new);
  end if;

  execute v_def;
end
$patch$;
