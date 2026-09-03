import { supabase } from '@/lib/supabase';

export type BattleReplayTurn={
  round:number;
  turn:number;
  challengerMoveId:number|null;
  opponentMoveId:number|null;
  result:any;
  resolvedAt:string;
};
export type BattleReplay={
  battle:{id:string;mode:string;status:string;engineVersion:string;challengerId:string;opponentId:string;winnerId:string|null;challengerScore:number;opponentScore:number;createdAt:string;completedAt:string|null};
  players:Array<{id:string;username:string;profileIcon:string}>;
  turns:BattleReplayTurn[];
  events:Array<{id:number;type:string;payload:any;createdAt:string}>;
};
export async function getBattleReplay(battleId:string):Promise<BattleReplay>{
  const{data,error}=await supabase.rpc('get_battle_replay',{p_battle_id:battleId});
  if(error)throw error;
  return data as BattleReplay;
}
