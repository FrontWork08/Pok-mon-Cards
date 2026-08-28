import { supabase } from '@/lib/supabase';

export type RankSnapshot = {
  battle: { rank:number; total:number; rating:number };
  collection: { rank:number; total:number; valueUsd:number };
};

export async function getMyRankSnapshot():Promise<RankSnapshot>{
  const {data,error}=await supabase.rpc('get_my_rank_snapshot');
  if(error) throw error;
  return {
    battle:{rank:Number(data?.battle?.rank??0),total:Number(data?.battle?.total??0),rating:Number(data?.battle?.rating??1000)},
    collection:{rank:Number(data?.collection?.rank??0),total:Number(data?.collection?.total??0),valueUsd:Number(data?.collection?.valueUsd??0)},
  };
}
