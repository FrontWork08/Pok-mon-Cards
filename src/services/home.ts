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
