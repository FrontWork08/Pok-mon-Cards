import { supabase } from '@/lib/supabase';

export type HomeDashboard = {
  profile: {
    id:string;
    username:string;
    coins:number;
    diamonds:number;
    profile_icon:string|null;
    avatar_path:string|null;
    avatar_updated_at:string|null;
    level:number;
    xp:number;
    battle_rating:number;
    last_daily_claim_at:string|null;
  };
  stats: {
    totalCards:number;
    species:number;
    completedTrades:number;
  };
};

export async function getHomeDashboard(): Promise<HomeDashboard> {
  const { data, error } = await supabase.rpc('get_home_dashboard');
  if (error) throw error;
  const value:any = data ?? {};
  return {
    profile: {
      id:String(value.profile?.id ?? ''),
      username:String(value.profile?.username ?? 'Trainer'),
      coins:Number(value.profile?.coins ?? 0),
      diamonds:Number(value.profile?.diamonds ?? 0),
      profile_icon:value.profile?.profile_icon ?? null,
      avatar_path:value.profile?.avatar_path ?? null,
      avatar_updated_at:value.profile?.avatar_updated_at ?? null,
      level:Number(value.profile?.level ?? 1),
      xp:Number(value.profile?.xp ?? 0),
      battle_rating:Number(value.profile?.battle_rating ?? 1000),
      last_daily_claim_at:value.profile?.last_daily_claim_at ?? null,
    },
    stats: {
      totalCards:Number(value.stats?.totalCards ?? 0),
      species:Number(value.stats?.species ?? 0),
      completedTrades:Number(value.stats?.completedTrades ?? 0),
    },
  };
}
