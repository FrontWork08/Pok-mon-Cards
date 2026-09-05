from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if text.count(old) < count:
        raise SystemExit(f"{path}: anchor not found: {old[:180]!r}")
    p.write_text(text.replace(old, new, count))


# Attack requests get one safe retry. expectedTurn prevents an ambiguous first
# request from accidentally selecting a move for the next turn.
for path, fn_name in [
    ('src/services/teamBattles.ts', 'chooseTeamBattleAttack'),
    ('src/services/battles.ts', 'chooseBattleAttack'),
]:
    p = Path(path)
    text = p.read_text()
    marker = "async function invoke(body: Record<string, unknown>) {"
    if marker not in text:
        raise SystemExit(f'{path}: invoke marker missing')

    # Insert retry helpers after invoke() only once, using the next exported declaration.
    if 'ATTACK_ACTION_TIMEOUT_MS' not in text:
        if path.endswith('teamBattles.ts'):
            anchor = "  return data?.data;\n}\n\nexport async function getTeamBattleState"
            repl = """  return data?.data;\n}\n\nconst ATTACK_ACTION_TIMEOUT_MS = 7000;\n\nfunction withAttackActionTimeout<T>(promise: Promise<T>) {\n  let timer: ReturnType<typeof setTimeout> | null = null;\n  const timeout = new Promise<never>((_, reject) => {\n    timer = setTimeout(() => reject(new Error('BATTLE_ACTION_REQUEST_TIMEOUT')), ATTACK_ACTION_TIMEOUT_MS);\n  });\n  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); }) as Promise<T>;\n}\n\nfunction isTransientAttackActionError(error: unknown) {\n  const message = String(error instanceof Error ? error.message : error ?? '').toLowerCase();\n  return message.includes('battle_action_request_timeout')\n    || message.includes('network')\n    || message.includes('failed to fetch')\n    || message.includes('fetch failed')\n    || message.includes('timeout')\n    || message.includes('timed out');\n}\n\nasync function invokeAttackWithRetry(body: Record<string, unknown>) {\n  const run = () => withAttackActionTimeout(invoke(body));\n  try {\n    return await run();\n  } catch (error) {\n    if (!isTransientAttackActionError(error)) throw error;\n    await new Promise((resolve) => setTimeout(resolve, 250));\n    try {\n      return await run();\n    } catch (retryError) {\n      if (isTransientAttackActionError(retryError)) {\n        throw new Error('A conexão com a batalha demorou. O estado será atualizado; tente o golpe novamente.');\n      }\n      throw retryError;\n    }\n  }\n}\n\nexport async function getTeamBattleState"""
        else:
            anchor = "  return data?.data;\n}\n\nasync function invokeTeam"
            repl = """  return data?.data;\n}\n\nconst ATTACK_ACTION_TIMEOUT_MS = 7000;\n\nfunction withAttackActionTimeout<T>(promise: Promise<T>) {\n  let timer: ReturnType<typeof setTimeout> | null = null;\n  const timeout = new Promise<never>((_, reject) => {\n    timer = setTimeout(() => reject(new Error('BATTLE_ACTION_REQUEST_TIMEOUT')), ATTACK_ACTION_TIMEOUT_MS);\n  });\n  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); }) as Promise<T>;\n}\n\nfunction isTransientAttackActionError(error: unknown) {\n  const message = String(error instanceof Error ? error.message : error ?? '').toLowerCase();\n  return message.includes('battle_action_request_timeout')\n    || message.includes('network')\n    || message.includes('failed to fetch')\n    || message.includes('fetch failed')\n    || message.includes('timeout')\n    || message.includes('timed out');\n}\n\nasync function invokeAttackWithRetry(body: Record<string, unknown>) {\n  const run = () => withAttackActionTimeout(invoke(body));\n  try {\n    return await run();\n  } catch (error) {\n    if (!isTransientAttackActionError(error)) throw error;\n    await new Promise((resolve) => setTimeout(resolve, 250));\n    try {\n      return await run();\n    } catch (retryError) {\n      if (isTransientAttackActionError(retryError)) {\n        throw new Error('A conexão com a batalha demorou. O estado será atualizado; tente o golpe novamente.');\n      }\n      throw retryError;\n    }\n  }\n}\n\nasync function invokeTeam"""
        replace(path, anchor, repl)

# Service signatures + expected turn.
replace(
    'src/services/teamBattles.ts',
    "export async function chooseTeamBattleAttack(battleId: string, attackName: string) {\n  return invoke({ action: 'attack', battleId, attackName });\n}",
    "export async function chooseTeamBattleAttack(battleId: string, attackName: string, expectedTurn?: number | null) {\n  return invokeAttackWithRetry({ action: 'attack', battleId, attackName, expectedTurn: expectedTurn ?? null });\n}",
)
replace(
    'src/services/battles.ts',
    "export async function chooseBattleAttack(battleId: string, attackName: string) {\n  return invoke({ action: 'attack', battleId, attackName });\n}",
    "export async function chooseBattleAttack(battleId: string, attackName: string, expectedTurn?: number | null) {\n  return invokeAttackWithRetry({ action: 'attack', battleId, attackName, expectedTurn: expectedTurn ?? null });\n}",
)

# Screens pass the turn that the user actually saw when tapping. This makes a
# retry idempotent even if the original response was lost after the turn resolved.
replace(
    'app/team-battle/[id].tsx',
    "      await chooseTeamBattleAttack(battleId, value);\n      await refresh(true);",
    "      const result = await chooseTeamBattleAttack(battleId, value, Number(state?.turn ?? 0));\n      if (result?.state) setState(result.state as TeamBattleState);\n      await refresh(true);",
)
replace(
    'app/battle/[id].tsx',
    "      const result = await chooseBattleAttack(String(id), selectedAttackName);",
    "      const result = await chooseBattleAttack(String(id), selectedAttackName, Number(attackState?.turn ?? 0));",
)

# Team 3x3 Edge: stale/retried attacks can never leak into a newer turn.
team_edge = 'supabase/functions/team-battle-action/index.ts'
old_team_attack = '    if(body.action==="attack"){const {data:action,error}=await admin.rpc("server_choose_battle_team_attack",{p_actor_id:user.id,p_battle_id:body.battleId,p_attack_name:String(body.attackName??"")});if(error)throw error;let resolved=null;if(action?.bothActionsLocked){const result=await admin.rpc("server_resolve_team_turn",{p_battle_id:body.battleId});if(result.error)throw result.error;resolved=result.data}const bot=await driveBot(String(body.battleId));return json({data:{...action,resolved,bot}})}'
new_team_attack = '''    if(body.action==="attack"){
      const battleId=String(body.battleId);const expectedTurn=Number(body.expectedTurn??0);
      if(expectedTurn>0){const before=await state(battleId);if(before?.status!=="revealing"||Number(before?.turn??0)!==expectedTurn||before?.myLocked){return json({data:{recovered:true,staleTurn:Number(before?.turn??0)!==expectedTurn,state:before}})}}
      const {data:action,error}=await admin.rpc("server_choose_battle_team_attack",{p_actor_id:user.id,p_battle_id:battleId,p_attack_name:String(body.attackName??"")});
      if(error){const message=readableError(error);if(message.includes("ACTION_ALREADY_LOCKED")){return json({data:{recovered:true,state:await state(battleId)}})}throw error}
      let resolved=null;if(action?.bothActionsLocked){const result=await admin.rpc("server_resolve_team_turn",{p_battle_id:battleId});if(result.error)throw result.error;resolved=result.data}
      const bot=await driveBot(battleId);const after=await state(battleId);return json({data:{...action,resolved,bot,state:after}})
    }'''
replace(team_edge, old_team_attack, new_team_attack)

# Standard Game Boy Edge gets the same expected-turn guard and recovers a lost
# response without selecting the same button on the next turn.
standard_edge = 'supabase/functions/battle-action/index.ts'
old_standard_attack = '''    if (body.action === "attack") {
      const { data: attackResult, error } = await admin.rpc("server_choose_battle_attack", {
        p_actor_id: user.id,
        p_battle_id: body.battleId,
        p_attack_name: String(body.attackName ?? ""),
      });
      if (error) throw error;
      if (!attackResult?.bothAttacksLocked) return json({ data: attackResult });

      const { data: resolved, error: resolveError } = await admin.rpc("server_resolve_battle_round", {
        p_battle_id: body.battleId,
      });
      if (resolveError) throw resolveError;
      return json({ data: { ...attackResult, resolved } });
    }'''
new_standard_attack = '''    if (body.action === "attack") {
      const battleId = String(body.battleId);
      const expectedTurn = Number(body.expectedTurn ?? 0);
      if (expectedTurn > 0) {
        const { data: before, error: beforeError } = await admin.rpc("server_get_battle_attack_state", {
          p_actor_id: user.id,
          p_battle_id: battleId,
        });
        if (beforeError) throw beforeError;
        if (before?.status !== "revealing" || Number(before?.turn ?? 0) !== expectedTurn || before?.myLocked) {
          return json({ data: { recovered: true, staleTurn: Number(before?.turn ?? 0) !== expectedTurn, state: before } });
        }
      }

      const { data: attackResult, error } = await admin.rpc("server_choose_battle_attack", {
        p_actor_id: user.id,
        p_battle_id: battleId,
        p_attack_name: String(body.attackName ?? ""),
      });
      if (error) {
        const message = readableError(error);
        if (message.includes("ALREADY_ATTACK_LOCKED")) {
          const { data: current, error: currentError } = await admin.rpc("server_get_battle_attack_state", {
            p_actor_id: user.id,
            p_battle_id: battleId,
          });
          if (currentError) throw currentError;
          return json({ data: { recovered: true, state: current } });
        }
        throw error;
      }
      if (!attackResult?.bothAttacksLocked) return json({ data: attackResult });

      const { data: resolved, error: resolveError } = await admin.rpc("server_resolve_battle_round", {
        p_battle_id: battleId,
      });
      if (resolveError) throw resolveError;
      return json({ data: { ...attackResult, resolved } });
    }'''
replace(standard_edge, old_standard_attack, new_standard_attack)

migration = r'''create or replace function public.server_process_expired_battles()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  b public.battles%rowtype;
  v_result jsonb;
  v_processed integer := 0;
begin
  for r in
    select id,challenger_id
    from public.battles
    where status='invited'
      and created_at <= now() - interval '15 minutes'
    order by created_at asc
    limit 50
  loop
    begin
      perform public.server_cancel_battle(r.challenger_id,r.id);
      v_processed:=v_processed+1;
    exception when others then
      begin
        insert into public.battle_events(battle_id,event_type,payload)
        values(r.id,'worker_error',jsonb_build_object('message',sqlerrm,'stage','expire_invite'));
      exception when others then null;
      end;
    end;
  end loop;

  for r in
    select id
    from public.battles
    where status in ('drafting','selecting','revealing')
      and selection_deadline is not null
      and selection_deadline<=now()
    order by selection_deadline asc
    limit 50
  loop
    begin
      select * into b from public.battles where id=r.id;

      if b.mode='team3' then
        v_result:=public.server_timeout_team_battle(b.challenger_id,b.id);
      else
        v_result:=public.server_timeout_battle(b.challenger_id,b.id);
        select * into b from public.battles where id=r.id;

        if coalesce((v_result->>'resolveReady')::boolean,false) then
          perform public.server_resolve_battle_round(b.id);
        end if;
      end if;

      v_processed:=v_processed+1;
    exception when others then
      begin
        insert into public.battle_events(battle_id,event_type,payload)
        values(r.id,'worker_error',jsonb_build_object('message',sqlerrm,'stage','battle_timeout','mode',b.mode));
      exception when others then null;
      end;
    end;
  end loop;

  return v_processed;
end;
$function$;

create or replace function private.dispatch_push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.server_dispatch_push_notifications();
  return null;
end;
$function$;

revoke all on function private.dispatch_push_on_notification_insert() from public, anon, authenticated;
grant execute on function private.dispatch_push_on_notification_insert() to service_role;

drop trigger if exists trg_notifications_fast_push on public.notifications;
create trigger trg_notifications_fast_push
after insert on public.notifications
for each statement
execute function private.dispatch_push_on_notification_insert();
'''
Path('supabase/migrations/20260904235639_fix_team3_attack_timeout_and_fast_notifications.sql').write_text(migration)

Path('scripts/battle-reliability-audit.mjs').write_text(r'''import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260904235639_fix_team3_attack_timeout_and_fast_notifications.sql', 'utf8');
const teamEdge = fs.readFileSync('supabase/functions/team-battle-action/index.ts', 'utf8');
const battleEdge = fs.readFileSync('supabase/functions/battle-action/index.ts', 'utf8');
const teamService = fs.readFileSync('src/services/teamBattles.ts', 'utf8');
const battleService = fs.readFileSync('src/services/battles.ts', 'utf8');
const teamScreen = fs.readFileSync('app/team-battle/[id].tsx', 'utf8');
const battleScreen = fs.readFileSync('app/battle/[id].tsx', 'utf8');

const missing = [];
for (const needle of ["if b.mode='team3'", 'server_timeout_team_battle', 'trg_notifications_fast_push', 'server_dispatch_push_notifications', 'for each statement']) {
  if (!migration.toLowerCase().includes(needle.toLowerCase())) missing.push(`migration:${needle}`);
}
for (const [name, source, needles] of [
  ['team edge', teamEdge, ['expectedTurn', 'ACTION_ALREADY_LOCKED', 'recovered:true', 'state:after']],
  ['battle edge', battleEdge, ['expectedTurn', 'ALREADY_ATTACK_LOCKED', 'recovered: true', 'server_get_battle_attack_state']],
  ['team service', teamService, ['ATTACK_ACTION_TIMEOUT_MS', 'invokeAttackWithRetry', 'expectedTurn']],
  ['battle service', battleService, ['ATTACK_ACTION_TIMEOUT_MS', 'invokeAttackWithRetry', 'expectedTurn']],
  ['team screen', teamScreen, ['chooseTeamBattleAttack(battleId, value, Number(state?.turn ?? 0))']],
  ['battle screen', battleScreen, ['chooseBattleAttack(String(id), selectedAttackName, Number(attackState?.turn ?? 0))']],
]) {
  for (const needle of needles) if (!source.includes(needle)) missing.push(`${name}:${needle}`);
}
if (missing.length) {
  console.error('❌ Battle reliability audit failed:', missing);
  process.exit(1);
}
console.log('✅ Battle attack retry/turn guards and immediate notification dispatch are wired.');
''')

package = Path('package.json')
text = package.read_text()
if 'battle-reliability-audit.mjs' not in text:
    old = ' && node scripts/team3-controls-audit.mjs"'
    new = ' && node scripts/team3-controls-audit.mjs && node scripts/battle-reliability-audit.mjs"'
    if old not in text:
        raise SystemExit('package verify anchor missing')
    package.write_text(text.replace(old, new, 1))
