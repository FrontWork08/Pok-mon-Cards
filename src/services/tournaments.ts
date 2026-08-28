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
    rewardCoins:Number(data?.rewardCoins??0),
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
  if(error) throw error;
  return data;
}
export async function leaveTournament(){
  const {data,error}=await supabase.rpc('leave_tournament');
  if(error) throw error;
  return data;
}
export function subscribeTournaments(onChange:()=>void){
  const channel=supabase.channel(`tournaments-live-${Date.now()}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'tournaments'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'tournament_entries'},onChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'tournament_matches'},onChange)
    .subscribe();
  return()=>{void supabase.removeChannel(channel);};
}
