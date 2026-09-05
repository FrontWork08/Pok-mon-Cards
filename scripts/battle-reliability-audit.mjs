import fs from 'node:fs';

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
