import { supabase } from '@/lib/supabase';

export type AdventureKind = 'journey'|'tower'|'elite'|'raid'|'rogue'|'challenge'|'champion'|'world_event';
export type AdventureAiStyle = 'balanced'|'aggressive'|'precise'|'tactical'|'defensive';

export type AdventureNode = {
  id:string;
  sort_order:number;
  title:string;
  subtitle:string;
  trainerName:string|null;
  kind:'route'|'rival'|'gym'|'elite'|'champion';
  types:string[];
  targetPower:number;
  aiStyle:AdventureAiStyle;
  rewardCoins:number;
  rewardDiamonds:number;
  badge:string|null;
  wins:number;
  attempts:number;
  stars:number;
  bestTurns:number|null;
  completedAt:string|null;
  unlocked:boolean;
};

export type KantoAdventure = {
  region:string;
  completed:number;
  total:number;
  stars:number;
  maxStars:number;
  nodes:AdventureNode[];
};

export type AdventureChallenge = {
  id:string;
  title:string;
  description:string;
  requiredType:string|null;
  targetPower:number;
  aiStyle:AdventureAiStyle;
  rewardCoins:number;
  rewardDiamonds:number;
  wins:number;
  attempts:number;
  stars:number;
  bestTurns:number|null;
};

export type AdventureHub = {
  version:string;
  kanto:KantoAdventure;
  tower:{floor:number;bestFloor:number};
  elite:{weekStart:string;stage:number;wins:number;attempts:number;completed:boolean;completedAt:string|null};
  raid:{hasGuild:boolean;guildId?:string;bossId?:string;name?:string;type?:string;maxHp?:number;currentHp?:number;endsAt?:string;defeated?:boolean;myDamage?:number;myAttempts?:number;myWins?:number;rank?:number};
  rogue:{active:boolean;runId?:string;floor:number;bestFloor?:number;wins?:number;cards:Array<{cardId:string;name:string;image:string|null;types:string[];position:number}>};
  mastery:{items:Array<{pokemonKey:string;pokemonName:string;xp:number;level:number;battles:number;wins:number;kos:number;updatedAt:string}>;total:number;maxLevel:number};
  records:{items:Array<{key:string;value:number;metadata:Record<string,unknown>;updatedAt:string}>};
  challenges:AdventureChallenge[];
  champion:{snapshotId:string;name:string;rating:number;capturedAt:string}|null;
  worldEvent:{id:string;title:string;description:string;type:string|null;targetPower:number;startsAt:string;endsAt:string}|null;
};

export type AdventureBattleLaunch = {
  battleId:string;
  mode:'team3';
  route:string;
  kind:AdventureKind;
  refId:string|null;
  targetPower:number;
  aiStyle:AdventureAiStyle;
};

export async function getAdventureHub():Promise<AdventureHub>{
  const {data,error}=await supabase.rpc('get_adventure_hub');
  if(error)throw error;
  return data as AdventureHub;
}

export async function getKantoAdventure():Promise<KantoAdventure>{
  const {data,error}=await supabase.rpc('get_kanto_adventure');
  if(error)throw error;
  return data as KantoAdventure;
}

export async function startAdventureBattle(kind:AdventureKind,refId?:string|null):Promise<AdventureBattleLaunch>{
  const {data,error}=await supabase.rpc('server_start_adventure_battle',{p_kind:kind,p_ref_id:refId??null});
  if(error)throw error;
  return data as AdventureBattleLaunch;
}

export async function getRogueRunState(){
  const {data,error}=await supabase.rpc('get_rogue_run_state');
  if(error)throw error;
  return data as AdventureHub['rogue'];
}

export async function getGuildRaidState(){
  const {data,error}=await supabase.rpc('get_guild_raid_state');
  if(error)throw error;
  return data as AdventureHub['raid'];
}

export async function getPokemonMastery(){
  const {data,error}=await supabase.rpc('get_pokemon_mastery');
  if(error)throw error;
  return data as AdventureHub['mastery'];
}

export async function getTrainerBattleRecords(){
  const {data,error}=await supabase.rpc('get_trainer_battle_records');
  if(error)throw error;
  return data as AdventureHub['records'];
}

export async function getAdventureBattleContext(battleId:string){
  const {data,error}=await supabase.rpc('get_adventure_battle_context',{p_battle_id:battleId});
  if(error)throw error;
  return data as null|{kind:AdventureKind;refId:string|null;runId:string|null;targetPower:number;aiStyle:AdventureAiStyle;finalized:boolean};
}
