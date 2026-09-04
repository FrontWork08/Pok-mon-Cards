import { existsSync, readFileSync } from 'node:fs';

const failures=[];
const read=(path)=>readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)failures.push(message);};

for(const path of ['app/team-battles.tsx','app/team-battle/[id].tsx','src/services/battles.ts','supabase/functions/battle-team-action/index.ts']){
  assert(existsSync(path),`Team3 ausente: ${path}`);
}

if(existsSync('src/services/battles.ts')){
  const service=read('src/services/battles.ts');
  for(const token of ["'team3'",'battle-team-action','setBattleTeam','getBattleTeamState','chooseBattleTeamAttack','chooseBattleTeamSwitch','resolveBattleTeamTimeout'])assert(service.includes(token),`Team3 service perdeu ${token}`);
}
if(existsSync('app/team-battle/[id].tsx')){
  const ui=read('app/team-battle/[id].tsx');
  for(const token of ['GOLPES','TROCAR','ESCOLHA O PRÓXIMO POKÉMON','CONFIRMAR TIME 3×3','myForcedSwitch','switchOptions','PixelBattleArena'])assert(ui.includes(token),`Team3 UI perdeu ${token}`);
  assert(ui.includes('maxTotal={3}')&&ui.includes('maxPerCard={1}'),'Team3 UI deixou de exigir exatamente 3 membros distintos no seletor.');
}
if(existsSync('app/team-battles.tsx')){
  const lobby=read('app/team-battles.tsx');
  assert(lobby.includes("createBattle(opponent.id,'team3','none'"),'Lobby Team3 deixou de criar somente batalha casual sem aposta.');
  assert(lobby.includes('A ranqueada continua nos modos atuais'),'Lobby Team3 perdeu aviso de isolamento da ranqueada.');
}
if(existsSync('src/components/TrainerNavigation.tsx')){
  const nav=read('src/components/TrainerNavigation.tsx');
  assert(nav.includes("href:'/team-battles'")&&nav.includes("label:'Equipe 3×3'"),'Menu do Treinador perdeu acesso ao Team3.');
}
if(existsSync('supabase/functions/battle-team-action/index.ts')){
  const edge=read('supabase/functions/battle-team-action/index.ts');
  for(const token of ['server_create_team_battle','server_set_battle_team','server_choose_battle_team_attack','server_choose_battle_team_switch','server_resolve_team_turn','server_timeout_team_battle'])assert(edge.includes(token),`Team3 Edge perdeu ${token}`);
  assert(edge.includes('route: `/team-battle/${battleId}`'),'Convite Team3 perdeu deep link dedicado.');
}

if(failures.length){console.error('\n❌ Auditoria Team 3×3 falhou:');failures.forEach(f=>console.error(' - '+f));process.exit(1);}
console.log('✅ Auditoria Team 3×3 passou.');
