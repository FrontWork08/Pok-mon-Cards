import type { AppRuntimeStatus } from '@/services/maintenance';
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

export type AdminPlayer = {
  id: string;
  username: string;
  level: number;
  created_at: string;
  account_status: 'active' | 'suspended' | 'banned';
  suspended_until: string | null;
  moderation_reason: string | null;
  warning_count: number;
};

export type AdminModerationAction = 'warn' | 'suspend' | 'ban' | 'restore';

export type CoinGrantResult = {
  targetId: string;
  username: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
};


export type CoinGrantBatchResult = {
  recipientCount: number;
  amountEach: number;
  totalGranted: number;
  recipients: CoinGrantResult[];
};

export type DiamondGrantBatchResult = CoinGrantBatchResult;

export type AdminRedeemCode = {
  id: string;
  code: string;
  reward: { coins?: number; diamonds?: number; cardId?: string; cardQuantity?: number };
  active: boolean;
  max_total_uses: number | null;
  expires_at: string | null;
  created_at: string;
  code_redemptions?: Array<{ count: number }>;
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


export type AdminGameEvent = {
  id: string;
  event_type: 'free_boosters' | 'double_xp' | 'rare_boost' | 'featured_set';
  title: string;
  payload?: Record<string, unknown>;
  active: boolean;
  starts_at: string;
  ends_at: string;
  created_at: string;
};

export type GlobalAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

export async function getAdminOverview() {
  return invokeAdmin({ action: 'overview' }) as Promise<AdminOverview>;
}

export async function getAdminPlayers() {
  return invokeAdmin({ action: 'players' }) as Promise<AdminPlayer[]>;
}

export async function moderatePlayer(
  targetId: string,
  moderationAction: AdminModerationAction,
  reason?: string,
  durationHours?: number | null,
) {
  return invokeAdmin({
    action: 'moderate',
    targetId,
    moderationAction,
    reason: reason?.trim() || null,
    durationHours: durationHours ?? null,
  });
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

export async function grantCoinsBatch(targetIds: string[], amount: number, note?: string) {
  return invokeAdmin({
    action: 'grant_coins_batch',
    targetIds,
    amount,
    note: note?.trim() || null,
  }) as Promise<CoinGrantBatchResult>;
}

export async function grantDiamondsBatch(targetIds: string[], amount: number, note?: string) {
  return invokeAdmin({
    action: 'grant_diamonds_batch',
    targetIds,
    amount,
    note: note?.trim() || null,
  }) as Promise<DiamondGrantBatchResult>;
}

export async function createRedeemCode(input: {
  code: string;
  reward: AdminRedeemCode['reward'];
  maxTotalUses?: number | null;
  expiresHours?: number | null;
}) {
  return invokeAdmin({
    action: 'create_redeem_code',
    code: input.code,
    reward: input.reward,
    maxTotalUses: input.maxTotalUses ?? null,
    expiresHours: input.expiresHours ?? null,
  }) as Promise<AdminRedeemCode>;
}

export async function getAdminRedeemCodes() {
  return invokeAdmin({ action: 'redeem_codes' }) as Promise<AdminRedeemCode[]>;
}

export async function setAdminRedeemCodeActive(codeId: string, active: boolean) {
  return invokeAdmin({ action: 'set_redeem_code_active', codeId, active }) as Promise<AdminRedeemCode>;
}

export async function publishGlobalAnnouncement(
  title: string,
  body: string,
  severity: GlobalAnnouncement['severity'],
  durationHours: number,
) {
  return invokeAdmin({
    action: 'announce',
    title: title.trim(),
    body: body.trim(),
    severity,
    durationHours,
  }) as Promise<GlobalAnnouncement>;
}

export async function getAdminEvents() {
  return invokeAdmin({ action: 'events' }) as Promise<AdminGameEvent[]>;
}

export async function startGameEvent(input: {
  eventType: 'double_xp' | 'rare_boost' | 'featured_set';
  title: string;
  durationMinutes: number;
  payload?: Record<string, unknown>;
}) {
  return invokeAdmin({
    action: 'start_game_event',
    eventType: input.eventType,
    title: input.title.trim(),
    durationMinutes: input.durationMinutes,
    payload: input.payload ?? {},
  }) as Promise<AdminGameEvent>;
}

export async function stopGameEvent(eventId: string) {
  return invokeAdmin({ action: 'stop_game_event', eventId }) as Promise<AdminGameEvent>;
}

export async function startFreeBoosters(durationMinutes: number) {
  return invokeAdmin({
    action: 'start_free_boosters',
    durationMinutes,
  }) as Promise<AdminGameEvent>;
}

export async function stopFreeBoosters() {
  return invokeAdmin({ action: 'stop_free_boosters' }) as Promise<AdminGameEvent | null>;
}


export async function setMaintenanceMode(enabled: boolean, message: string) {
  return invokeAdmin({
    action: 'set_maintenance',
    enabled,
    message: message.trim(),
  }) as Promise<AppRuntimeStatus>;
}
