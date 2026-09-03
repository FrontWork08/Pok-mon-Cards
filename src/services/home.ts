import { supabase } from '@/lib/supabase';
import { getMissions } from '@/services/missions';
import { getGuildHub } from '@/services/guilds';
import { getTournamentHub } from '@/services/tournaments';

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


export type HomeContinueItem = {
  id: string;
  kind: 'battle' | 'trade' | 'activity';
  title: string;
  subtitle: string;
  route: string;
  priority: number;
  updatedAt: string;
};

export async function getHomeContinueItems(): Promise<HomeContinueItem[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];

  const [battleResult, tradeResult, notificationResult] = await Promise.all([
    supabase
      .from('battles')
      .select('id,status,mode,updated_at,challenger_id,opponent_id')
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .in('status', ['invited','drafting','selecting','revealing'])
      .order('updated_at', { ascending: false })
      .limit(1),
    supabase
      .from('trades')
      .select('id,status,updated_at,sender_id,receiver_id,trade_cards(id)')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq('status', 'pending')
      .order('updated_at', { ascending: false })
      .limit(1),
    supabase
      .from('notifications')
      .select('id,type,title,body,metadata,created_at')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const items: HomeContinueItem[] = [];

  const battle: any = battleResult.data?.[0];
  if (battle) {
    const statusLabel =
      battle.status === 'invited' ? 'Desafio aguardando resposta'
      : battle.status === 'drafting' ? 'Draft em andamento'
      : battle.status === 'selecting' ? 'Escolha seu Pokémon'
      : 'Escolha seu golpe';
    items.push({
      id: `battle:${battle.id}`,
      kind: 'battle',
      title: 'Continuar batalha',
      subtitle: statusLabel,
      route: `/battle/${battle.id}`,
      priority: 100,
      updatedAt: String(battle.updated_at ?? ''),
    });
  }

  const trade: any = tradeResult.data?.[0];
  if (trade) {
    const cardRows = Array.isArray(trade.trade_cards) ? trade.trade_cards.length : 0;
    items.push({
      id: `trade:${trade.id}`,
      kind: 'trade',
      title: 'Continuar troca',
      subtitle: cardRows ? `${cardRows} item(ns) já estão na negociação` : 'Negociação aguardando sua ação',
      route: `/trade/${trade.id}`,
      priority: 80,
      updatedAt: String(trade.updated_at ?? ''),
    });
  }

  const notification: any = notificationResult.data?.[0];
  if (notification) {
    items.push({
      id: `activity:${notification.id}`,
      kind: 'activity',
      title: String(notification.title ?? 'Nova atividade'),
      subtitle: String(notification.body ?? 'Você tem uma atividade nova.'),
      route: '/inbox',
      priority: 60,
      updatedAt: String(notification.created_at ?? ''),
    });
  }

  return items
    .sort((a, b) => b.priority - a.priority || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 3);
}


export type HomeProgressSnapshot = {
  mission: {
    id:string;
    title:string;
    progress:number;
    target:number;
    percent:number;
    claimable:boolean;
    route:string;
  } | null;
  claimableMissions:number;
  weeklyRank:{
    rank:number;
    total:number;
    weeklyValueUsd:number;
    rewardCoins:number;
    weekEnd:string;
  };
  guild:{
    joined:boolean;
    name:string|null;
    rank:number|null;
    claimableReward:boolean;
    boosterProgress:number;
    boosterTarget:number;
  };
  tournament:{
    status:string;
    joined:boolean;
    name:string;
    entries:number;
    maxPlayers:number;
    prizePoolCoins:number;
  } | null;
};

export async function getHomeProgressSnapshot():Promise<HomeProgressSnapshot>{
  const [missionsResult,guildResult,tournamentResult,weeklyResult] = await Promise.allSettled([
    getMissions(),
    getGuildHub(),
    getTournamentHub(),
    supabase.rpc('get_my_weekly_collection_rank'),
  ]);

  const missions = missionsResult.status==='fulfilled' ? missionsResult.value : [];
  const claimable = missions.filter((mission)=>!mission.claimed && mission.progress>=mission.target);
  const activeMissions = missions.filter((mission)=>!mission.claimed);
  const bestMission = [...activeMissions].sort((a,b)=>{
    const aDone=a.progress>=a.target?1:0;
    const bDone=b.progress>=b.target?1:0;
    if(aDone!==bDone)return bDone-aDone;
    const ap=Math.min(1,a.progress/Math.max(1,a.target));
    const bp=Math.min(1,b.progress/Math.max(1,b.target));
    return bp-ap;
  })[0] ?? null;

  const guildHub = guildResult.status==='fulfilled' ? guildResult.value : null;
  const membership = guildHub?.myMembership ?? null;
  const myGuild = membership ? guildHub?.guilds.find((guild)=>guild.id===membership.guildId) ?? null : null;

  const tournament = tournamentResult.status==='fulfilled' ? tournamentResult.value : null;
  const weeklyData = weeklyResult.status==='fulfilled' && !weeklyResult.value.error
    ? (weeklyResult.value.data ?? {})
    : {};

  return {
    mission: bestMission ? {
      id:bestMission.id,
      title:bestMission.title,
      progress:Number(bestMission.progress??0),
      target:Number(bestMission.target??0),
      percent:Math.min(100,Math.round(Number(bestMission.progress??0)/Math.max(1,Number(bestMission.target??1))*100)),
      claimable:!bestMission.claimed && Number(bestMission.progress??0)>=Number(bestMission.target??0),
      route:bestMission.action_route || '/missions',
    } : null,
    claimableMissions:claimable.length,
    weeklyRank:{
      rank:Number(weeklyData.rank??0),
      total:Number(weeklyData.total??0),
      weeklyValueUsd:Number(weeklyData.weeklyValueUsd??0),
      rewardCoins:Number(weeklyData.rewardCoins??0),
      weekEnd:String(weeklyData.weekEnd??''),
    },
    guild:{
      joined:Boolean(membership),
      name:myGuild?.name??null,
      rank:myGuild?.rank??null,
      claimableReward:Boolean(guildHub?.weeklyReward?.claimable),
      boosterProgress:Number(guildHub?.collectiveBooster?.progress??0),
      boosterTarget:Number(guildHub?.collectiveBooster?.target??40),
    },
    tournament:tournament ? {
      status:tournament.status,
      joined:tournament.joined,
      name:tournament.name,
      entries:tournament.entries.length,
      maxPlayers:tournament.maxPlayers,
      prizePoolCoins:tournament.prizePoolCoins,
    } : null,
  };
}
