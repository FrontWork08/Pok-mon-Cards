import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

async function invokeAdmin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-action', { body });
  if (error) {
    throw await normalizeFunctionError(error, 'Não foi possível concluir a ação administrativa.');
  }
  if (data?.error) throw new Error(String(data.error));
  return data?.data;
}

export type AdminOverview = {
  generatedAt: string;
  users: {
    total: number;
    created24h: number;
    coinsInCirculation: number;
  };
  catalog: {
    cards: number;
    cardsWithUsdPrice: number;
    ownedUniqueRows: number;
    ownedUniqueCards: number;
    ownedCardsWithUsdPrice: number;
    ownedPriceCoveragePct: number;
    ownedCardCopies: number;
    ownedMarketValueUsd: number;
  };
  packs: {
    total: number;
    active: number;
    withPhysicalArt: number;
    openings: number;
    openings24h: number;
  };
  social: {
    friendshipsAccepted: number;
    friendRequestsPending: number;
    messages: number;
    messages24h: number;
    unreadMessages: number;
  };
  trades: {
    total: number;
    pending: number;
    completed: number;
  };
  battles: {
    total: number;
    active: number;
    completed: number;
    cancelled: number;
    events: number;
  };
  progression: {
    decks: number;
    dailyMissions: number;
    notifications: number;
    pendingPush: number;
    pushTokensEnabled: number;
  };
  admin: {
    admins: number;
    coinGrants: number;
    coinGrants24h: number;
    coinsGrantedTotal: number;
  };
  catalogRefresh?: Record<string, unknown>;
};

export type CoinGrantResult = {
  targetId: string;
  username: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
};

export type CoinGrantHistory = {
  id: string;
  target_id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  note: string | null;
  created_at: string;
  players?: { username?: string } | null;
};

export async function getAdminOverview() {
  return invokeAdmin({ action: 'overview' }) as Promise<AdminOverview>;
}

export async function grantCoins(targetId: string, amount: number, note?: string) {
  return invokeAdmin({
    action: 'grant_coins',
    targetId,
    amount,
    note: note?.trim() || null,
  }) as Promise<CoinGrantResult>;
}

export async function getCoinGrantHistory() {
  return invokeAdmin({ action: 'coin_history' }) as Promise<CoinGrantHistory[]>;
}
