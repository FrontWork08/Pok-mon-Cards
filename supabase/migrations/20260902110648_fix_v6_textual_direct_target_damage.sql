
do $patch$
declare
  v_def text;
  v_old text := $old$
    v_match:=regexp_match(v_damage_text,'([0-9]+)');
    v_base:=case when v_match is null then 0 else v_match[1]::numeric end;
    v_raw:=v_base;
$old$;
  v_new text := $new$
    v_match:=regexp_match(v_damage_text,'([0-9]+)');
    v_base:=case when v_match is null then 0 else v_match[1]::numeric end;

    -- Some legal attacks store direct-target damage only in the effect text.
    -- In the isolated 1v1 duel, "1 of your opponent's Pokemon" may target
    -- the opponent's Active Pokemon, so fixed textual damage is valid.
    if v_match is null then
      v_match:=regexp_match(
        v_text,
        '^this attack does ([0-9]+) damage to (?:1|one) of your opponent''s pok[eé]mon\.'
      );
      if v_match is not null then
        v_base:=v_match[1]::numeric;
      end if;
    end if;

    v_raw:=v_base;
$new$;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='battle_v6_attack_plan'
  limit 1;

  if v_def is null then
    raise exception 'BATTLE_V6_ATTACK_PLAN_NOT_FOUND';
  end if;

  if strpos(v_def,v_new)>0 then
    return;
  end if;

  if strpos(v_def,v_old)=0 then
    raise exception 'BATTLE_V6_ATTACK_PLAN_PATCH_ANCHOR_NOT_FOUND';
  end if;

  execute replace(v_def,v_old,v_new);
end
$patch$;
