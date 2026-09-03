import { supabase } from '@/lib/supabase';

export type TournamentPlayer = { id: string; username: string };
export type TournamentEntry = {
  playerId: string;
  username: string;
  seed: number | null;
  rating: number;
  joinedAt: string;
};
export type TournamentMatch = {
  id: string;
  round: number;
  slot: number;
  status: 'pending'|'ready'|'playing'|'completed';
  battleId: string | null;
  playerA: TournamentPlayer | null;
  playerB: TournamentPlayer | null;
  winnerId: string | null;
};
export type TournamentHub = {
  id: string;
  name: string;
  status: 'registration'|'active'|'completed'|'cancelled';
  registrationEndsAt: string;
  startsAt: string | null;
  endsAt: string;
  maxPlayers: number;
  entryFeeCoins: number;
  prizePoolCoins: number;
  rewardCoins: number;
  rewardDiamonds: number;
  winnerId: string | null;
  joined: boolean;
  entries: TournamentEntry[];
  matches: TournamentMatch[];
};

function normalize(data:any):TournamentHub{
  return {
    id:String(data?.id??''),
    name:String(data?.name??'Copa Trainer'),
    status:data?.status??'registration',
    registrationEndsAt:String(data?.registrationEndsAt??''),
    startsAt:data?.startsAt??null,
    endsAt:String(data?.endsAt??''),
    maxPlayers:Number(data?.maxPlayers??8),
    entryFeeCoins:Number(data?.entryFeeCoins??10000),
    prizePoolCoins:Number(data?.prizePoolCoins??data?.rewardCoins??0),
    rewardCoins:Number(data?.rewardCoins??data?.prizePoolCoins??0),
    rewardDiamonds:Number(data?.rewardDiamonds??0),
    winnerId:data?.winnerId??null,
    joined:Boolean(data?.joined),
    entries:Array.isArray(data?.entries)?data.entries.map((e:any)=>({
      ...e,seed:e.seed==null?null:Number(e.seed),rating:Number(e.rating??1000),
    })):[],
    matches:Array.isArray(data?.matches)?data.matches.map((m:any)=>({
      ...m,round:Number(m.round??1),slot:Number(m.slot??1),
    })):[],
  };
}

export async function getTournamentHub(){
  const {data,error}=await supabase.rpc('get_tournament_hub');
  if(error) throw error;
  return normalize(data);
}
export async function joinTournament(){
  const {data,error}=await supabase.rpc('join_tournament');
  if(error){
    if(error.message.includes('NOT_ENOUGH_COINS')) throw new Error('Coins insuficientes para pagar a taxa de inscrição da Copa Trainer.');
    if(error.message.includes('TOURNAMENT_FULL')) throw new Error('A Copa Trainer já está com todas as vagas preenchidas.');
    if(error.message.includes('REGISTRATION_CLOSED')) throw new Error('As inscrições desta Copa Trainer já foram encerradas.');
    throw error;
  }
  return data as { tournamentId:string; joined:boolean; entries:number; maxPlayers:number; entryFeeCoins:number; feeCharged:number; prizePoolCoins:number };
}
export async function leaveTournament(){
  const {data,error}=await supabase.rpc('leave_tournament');
  if(error){
    if(error.message.includes('NO_OPEN_TOURNAMENT')) throw new Error('Não há uma Copa Trainer com inscrições abertas para sair.');
    throw error;
  }
  return data as { tournamentId:string; joined:boolean; refundedCoins:number; prizePoolCoins:number };
}
export function subscribeTournaments(onChange:()=>void){
  const channel=supabase.channel(`tournaments-live-${Date.now()}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'tournaments'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'tournament_entries'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'tournament_matches'},onChange)
    .subscribe();
  return()=>{void supabase.removeChannel(channel);};
}
