import { supabase } from '@/lib/supabase';

async function actorId(){
  const{data,error}=await supabase.auth.getUser();
  if(error)throw error;
  if(!data.user)throw new Error('Usuário não autenticado.');
  return data.user.id;
}

export type EconomySnapshot={
  id:number;capturedAt:string;health:any;distribution:any;market:any;guardrails?:any;
};
export type AdminBattleLabStats={
  level:number;hp:number;attack:number;defense:number;spAttack:number;spDefense:number;speed:number;
};
export type AdminBattleLabCard={
  id:string;
  name:string;
  image:string|null;
  imageLarge:string|null;
  setName:string|null;
  rarity:string|null;
  gameTypes:string[];
  marketPriceUsd:number|null;
  gameValue:number|null;
  ability:string|null;
  stats:AdminBattleLabStats|null;
};
export type AdminBattleLabCatalogFilters={
  type?:string|null;
  set?:string|null;
  rarity?:string|null;
};
export async function captureEconomySnapshot(){
  const id=await actorId();
  const{data,error}=await supabase.rpc('server_capture_economy_snapshot',{p_actor_id:id});
  if(error)throw error;return data as EconomySnapshot;
}
export async function getEconomyTrend(limit=30){
  const id=await actorId();
  const{data,error}=await supabase.rpc('server_get_economy_trend',{p_actor_id:id,p_limit:limit});
  if(error)throw error;return data as {snapshots:EconomySnapshot[];openAlerts:any[];recommendations:any[];automaticChanges:boolean};
}
export async function getFreezeSimulation(){
  const id=await actorId();
  const{data,error}=await supabase.rpc('server_release_freeze_simulator',{p_actor_id:id});
  if(error)throw error;return data as any;
}
export async function getBattleLabMatchup(cardA:string,cardB:string,iterations=50){
  const{data,error}=await supabase.rpc('get_battle_lab_matchup',{p_card_a:cardA,p_card_b:cardB,p_iterations:iterations});
  if(error)throw error;return data as any;
}
export async function getAdminBattleLabMatrix(cardIds:string[],iterations=30){
  const{data,error}=await supabase.rpc('get_admin_battle_lab_matrix',{p_card_ids:cardIds,p_iterations:iterations});
  if(error)throw error;return data as any;
}
export async function getAdminBattleLabCatalog(search='',offset=0,limit=80,filters:AdminBattleLabCatalogFilters={}){
  const{data,error}=await supabase.rpc('get_admin_battle_lab_catalog',{
    p_search:search||null,
    p_offset:offset,
    p_limit:limit,
    p_type:filters.type||null,
    p_set:filters.set||null,
    p_rarity:filters.rarity||null,
  });
  if(error)throw error;
  const payload=(data??{}) as {items?:AdminBattleLabCard[];total?:number;offset?:number;limit?:number};
  return {items:Array.isArray(payload.items)?payload.items:[],total:Number(payload.total??0),offset:Number(payload.offset??offset),limit:Number(payload.limit??limit)};
}
export async function setBattleSpectatorEnabled(battleId:string,enabled:boolean){
  const{data,error}=await supabase.rpc('set_battle_spectator_enabled',{p_battle_id:battleId,p_enabled:enabled});
  if(error)throw error;return data as {battleId:string;spectatorEnabled:boolean};
}
export async function getBattleSpectatorState(battleId:string){
  const{data,error}=await supabase.rpc('get_battle_spectator_state',{p_battle_id:battleId});
  if(error)throw error;return data as any;
}
export async function getHallOfFame(){
  const{data,error}=await supabase.rpc('get_hall_of_fame');
  if(error)throw error;return data as any;
}
