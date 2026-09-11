import { existsSync, readFileSync } from 'node:fs';

const failures=[];
const requiredFiles=[
  'app/login.tsx',
  'app/(tabs)/index.tsx',
  'app/(tabs)/packs.tsx',
  'app/(tabs)/bag.tsx',
  'app/decks.tsx',
  'app/(tabs)/battles.tsx',
  'app/battle/[id].tsx',
  'app/(tabs)/trade.tsx',
  'app/marketplace.tsx',
  'app/guilds.tsx',
  'app/(tabs)/profile.tsx',
  'app/onboarding.tsx',
  'app/goals.tsx',
  'app/deck-coach.tsx',
  'app/card-compare.tsx',
  'app/battle-summary/[id].tsx',
  'app/battle-replay/[id].tsx',
];
for(const file of requiredFiles) if(!existsSync(file)) failures.push('Rota ausente: '+file);

const contracts={
  'src/services/auth.ts':['signIn','requestPasswordReset','updateRecoveredPassword','signOut','getCurrentSession'],
  'src/services/packs.ts':['listPacks','openPack','openLegendaryDiamondPack','exchangeCoinsForDiamonds'],
  'src/services/decks.ts':['getMyDecks','createDeck','setDeckCards','setDefaultDeck','getDeckBuilderPage'],
  'src/services/battles.ts':['createBattle','respondToBattle','forfeitBattle','getMyActiveBattle','getMyBattleHistory','subscribeToBattle'],
  'src/services/trades.ts':['getMyTrades','createTrade','setTradeCards','confirmTrade','cancelTrade','subscribeToTrade'],
  'src/services/marketplace.ts':['getMarketplaceHub','createMarketOffer','respondMarketOffer','cancelMarketOffer','subscribeMarketplace'],
  'src/services/guilds.ts':['getGuildHub','setGuildWarGymDefender','attackGuildWarGym','sendGuildChatMessage','subscribeToGuildChat'],
  'src/services/playerExperienceV2.ts':['getMyGoals','createPlayerGoal','getMyOnboardingProgress','getBattlePostgameInsights'],
};
for(const [file,names] of Object.entries(contracts)){
  if(!existsSync(file)){failures.push('Serviço ausente: '+file);continue;}
  const source=readFileSync(file,'utf8');
  for(const name of names){
    if(!new RegExp('export\\s+(?:async\\s+)?function\\s+'+name+'\\b').test(source)){
      failures.push(file+' perdeu contrato exportado: '+name);
    }
  }
}

const home=existsSync('app/(tabs)/index.tsx')?readFileSync('app/(tabs)/index.tsx','utf8'):'';
for(const route of ['/onboarding','/goals','/deck-coach','/card-compare','/inbox']){
  if(!home.includes(route)) failures.push('Home sem atalho esperado: '+route);
}

const battle=existsSync('app/battle/[id].tsx')?readFileSync('app/battle/[id].tsx','utf8'):'';
for(const route of ['battle-summary','battle-replay']){
  if(!battle.includes(route)) failures.push('Pós-batalha sem acesso a '+route);
}
if(!battle.includes('confirmForfeit')) failures.push('Batalha perdeu confirmação/regras de desistência.');

const auth=existsSync('src/services/auth.ts')?readFileSync('src/services/auth.ts','utf8'):'';
if(!auth.includes('requestPasswordReset')||!auth.includes('updateRecoveredPassword')) failures.push('Fluxo de recuperação de senha incompleto.');

if(failures.length){
  console.error('❌ Auditoria de jornada do jogador falhou:');
  for(const item of failures) console.error(' - '+item);
  process.exit(1);
}
console.log('✅ Jornada principal protegida: login → packs → bag/deck → batalha → trade/market → guilda → perfil/logout.');
console.log('✅ Onboarding, metas, coach, comparação, resumo e replay continuam navegáveis.');
