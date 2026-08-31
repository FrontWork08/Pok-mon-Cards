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

export type AdminEconomyHealth = {
  version: string;
  windowDays: number;
  windowStart?: string;
  releaseEpoch?: string;
  status: 'healthy' | 'watch' | 'critical';
  activePlayers: number;
  balances: { coins: number; diamonds: number };
  knownMint: {
    missions: number;
    battlePass: number;
    guild: number;
    duplicates: number;
    codes: number;
    milestones: number;
    total: number;
  };
  knownBurn: {
    packs: number;
    diamondExchange: number;
    marketFees: number;
    gymHealing: number;
    total: number;
  };
  burnToMintRatio: number | null;
  packPrices: {
    coinMin: number | null;
    coinMedian: number | null;
    coinMax: number | null;
    diamondMin: number | null;
    diamondMedian: number | null;
    diamondMax: number | null;
  };
  coverageNote: string;
};

export type AdminOverview = {
  generatedAt: string;
  users: { total: number; created24h: number; coinsInCirculation: number };
  catalog: { cards: number; cardsWithUsdPrice: number; ownedUniqueRows: number; ownedUniqueCards: number; ownedCardsWithUsdPrice: number; ownedPriceCoveragePct: number; ownedCardCopies: number; ownedMarketValueUsd: number };
  packs: { total: number; active: number; withPhysicalArt: number; openings: number; openings24h: number };
  social: { friendshipsAccepted: number; friendRequestsPending: number; messages: number; messages24h: number; unreadMessages: number };
  trades: { total: number; pending: number; completed: number };
  battles: { total: number; active: number; completed: number; cancelled: number; events: number };
  progression: { decks: number; dailyMissions: number; notifications: number; pendingPush: number; pushTokensEnabled: number };
  admin: { admins: number; coinGrants: number; coinGrants24h: number; coinsGrantedTotal: number };
  catalogRefresh?: Record<string, unknown>;
};

export type AdminPlayer = {
  id: string; username: string; level: number; coins: number; diamonds: number; created_at: string;
  account_status: 'active' | 'suspended' | 'banned';
  suspended_until: string | null; moderation_reason: string | null; warning_count: number;
};
export type AdminModerationAction = 'warn' | 'suspend' | 'ban' | 'restore';
export type CoinGrantResult = { targetId: string; username: string; amount: number; balanceBefore: number; balanceAfter: number };
export type CoinGrantBatchResult = { recipientCount: number; amountEach: number; totalGranted: number; recipients: CoinGrantResult[] };
export type DiamondGrantBatchResult = CoinGrantBatchResult;
export type CurrencyRemovalBatchResult = {
  recipientCount: number;
  amountEach: number;
  totalRemoved: number;
  recipients: CoinGrantResult[];
};
export type BattlePassVipGrantResult = { seasonId: string; recipientCount: number; recipients: Array<{ id: string; username: string }> };
export type AdminRedeemCode = { id: string; code: string; reward: { coins?: number; diamonds?: number; cardId?: string; cardQuantity?: number }; active: boolean; max_total_uses: number | null; expires_at: string | null; created_at: string; code_redemptions?: Array<{ count: number }> };
export type CoinGrantHistory = { id: string; target_id: string; amount: number; balance_before: number; balance_after: number; note: string | null; created_at: string; players?: { username?: string } | null };
export type AdminCurrencyAdjustmentHistory = CoinGrantHistory & { currency: 'coins' | 'diamonds' };
export type AdminGameEvent = { id: string; event_type: 'free_boosters' | 'double_xp' | 'rare_boost' | 'featured_set'; title: string; payload?: Record<string, unknown>; active: boolean; starts_at: string; ends_at: string; created_at: string };
export type GlobalAnnouncement = { id: string; title: string; body: string; severity: 'info' | 'warning' | 'critical'; starts_at: string; ends_at: string | null; created_at: string };
export type TesterTitleFriend = { id: string; username: string; level: number; hasTitle: boolean; grantedAt: string | null };
export type TesterTitleHub = {
  isOwner: boolean;
  title: { id: string; name: string; title: string; description: string; icon: string } | null;
  friends: TesterTitleFriend[];
};
export type TesterTitleGrantResult = { targetId: string; username: string; achievementId: string; title: string; icon?: string };

export type AdminReleaseCampaignStatus = {
  id: string;
  code: string;
  title: string;
  target_version: string;
  release_date: string;
  phase: 'notice' | 'legacy_selection' | 'freeze' | 'update_required' | 'completed';
  active: boolean;
  reward_coins: number;
  reward_diamonds: number;
  legacy_card_limit: number;
  legacy_selection_enabled: boolean;
  economy_frozen: boolean;
  force_update: boolean;
  download_url: string | null;
  updated_at: string;
  selections: number;
  submissions: number;
};

export type AdminLegacyProgressStatus =
  | 'complete_confirmed'
  | 'complete_unconfirmed'
  | 'confirmed_partial'
  | 'in_progress'
  | 'not_started';

export type AdminLegacyProgressPlayer = {
  playerId: string;
  username: string;
  accountStatus: 'active' | 'suspended' | 'banned';
  selectedCount: number;
  manualCount: number;
  automaticCount: number;
  remainingCount: number;
  confirmed: boolean;
  confirmedAt: string | null;
  submissionSelectedCount: number | null;
  autoFilledCount: number;
  lastSelectedAt: string | null;
  status: AdminLegacyProgressStatus;
};

export type AdminLegacyProgress = {
  generatedAt: string;
  campaign: {
    id: string;
    phase: string;
    legacyCardLimit: number;
    legacySelectionEnabled: boolean;
    updatedAt: string;
  };
  summary: {
    totalPlayers: number;
    selectedTen: number;
    confirmedTen: number;
    tenAwaitingConfirmation: number;
    confirmedPartial: number;
    inProgress: number;
    notStarted: number;
    selectedCards: number;
    manualCards: number;
    automaticCards: number;
  };
  players: AdminLegacyProgressPlayer[];
};

export type AdminReleasePreflight = {
  ready: boolean;
  generatedAt: string;
  campaign: {
    id: string;
    phase: string;
    legacySelectionEnabled: boolean;
    legacyCardLimit: number;
    economyFrozen: boolean;
    forceUpdate: boolean;
  };
  counts: {
    players: number;
    admins: number;
    owners: number;
    activeTesters: number;
    guilds: number;
    guildMembers: number;
    selectedCards: number;
    confirmedAccounts: number;
    automaticCards: number;
    autoFilledAccounts: number;
    accountsAwaitingAutoFill: number;
  };
  issues: {
    selectedCardsNotOwned: number;
    submissionCountMismatch: number;
    playersOverCardLimit: number;
    legacyAutofillIncomplete: number;
    testersMissingAchievement: number;
    guildLeaderMismatch: number;
    ownerCountInvalid: number;
  };
};

export type AdminReleaseResetPreview = {
  readyToReset: boolean;
  campaign: {
    phase: string;
    legacyCardLimit: number;
    rewardCoinsPerVeteran: number;
    rewardDiamondsPerVeteran: number;
    economyFrozen: boolean;
    maintenanceEnabled: boolean;
  };
  preserve: {
    accounts: number;
    admins: number;
    activeTesters: number;
    guilds: number;
    guildMembers: number;
    friendships: number;
    settings: number;
    cosmetics: number;
    legacyCardRows: number;
    legacyCardCopies: number;
  };
  reset: {
    cardRowsRemoved: number;
    cardCopiesRemoved: number;
    decks: number;
    deckCards: number;
    achievementsExceptTester: number;
    dailyMissions: number;
    missionsV2: number;
    loginStreaks: number;
    playerSeasons: number;
    milestoneClaims: number;
    battlePassProgress: number;
    battlePassMissionProgress: number;
    battlePassClaims: number;
    guildWarPoints: number;
    guildWeeklyClaims: number;
    guildBoosterClaims: number;
    showcaseSlotsAtRisk: number;
  };
  economy: {
    coinsBefore: number;
    diamondsBefore: number;
    coinsAfterVeteranReward: number;
    diamondsAfterVeteranReward: number;
  };
  activeOperations: number;
  preflight: AdminReleasePreflight;
};

export type AdminReleaseReadiness = {
  readyToReset: boolean;
  phase: string;
  targetVersion: string;
  downloadUrlReady: boolean;
  snapshotPrepared: boolean;
  preparedSnapshotCount: number;
  snapshotId: string | null;
  maintenanceEnabled: boolean;
  economyFrozen: boolean;
  legacySelectionEnabled: boolean;
  activeOperations: number;
  preflightReady: boolean;
  accountsAwaitingAutoFill: number;
  preview: AdminReleaseResetPreview;
};

export type AdminReleaseSnapshotState = {
  phase: string;
  preparedSnapshotId: string | null;
  preparedAt: string | null;
  usedSnapshotId: string | null;
  usedAt: string | null;
  restoredSnapshotId: string | null;
  restoredAt: string | null;
};

export type AdminPermission =
  | 'audit_users'
  | 'moderate_users'
  | 'economy_grant'
  | 'economy_remove'
  | 'battlepass_grant'
  | 'codes_manage'
  | 'announcements_manage'
  | 'events_manage'
  | 'maintenance_manage'
  | 'guilds_manage';

export const ADMIN_PERMISSION_OPTIONS: Array<{
  id: AdminPermission;
  label: string;
  description: string;
}> = [
  { id: 'audit_users', label: 'Auditar usuários', description: 'Ver dados da conta, economia, packs e sinais de abuso.' },
  { id: 'moderate_users', label: 'Moderação', description: 'Avisar, suspender, banir e restaurar usuários.' },
  { id: 'economy_grant', label: 'Dar saldo', description: 'Adicionar Coins e Diamantes.' },
  { id: 'economy_remove', label: 'Corrigir saldo', description: 'Retirar Coins e Diamantes com registro.' },
  { id: 'battlepass_grant', label: 'Passe VIP', description: 'Conceder o Passe VIP administrativo.' },
  { id: 'codes_manage', label: 'Códigos', description: 'Criar, ativar e desativar códigos.' },
  { id: 'announcements_manage', label: 'Anúncios', description: 'Publicar e encerrar anúncios globais.' },
  { id: 'events_manage', label: 'Eventos', description: 'Gerenciar Admin Abuse e eventos ao vivo.' },
  { id: 'maintenance_manage', label: 'Manutenção', description: 'Pausar e liberar o aplicativo.' },
  { id: 'guilds_manage', label: 'Guildas', description: 'Alterar liderança administrativa das guildas.' },
];

export type AdminAccess = {
  playerId: string;
  role: 'owner' | 'admin';
  isOwner: boolean;
  permissions: AdminPermission[];
};

export type AdminTeamMember = {
  playerId: string;
  username: string;
  role: 'owner' | 'admin';
  createdAt: string;
  permissions: AdminPermission[];
  permissionsUpdatedAt: string | null;
};

export type AdminAuditFlag = {
  severity: 'info' | 'medium' | 'high';
  code: string;
  title: string;
  detail: string;
};

export type AdminAccountAudit = {
  generatedAt: string;
  account: Record<string, any>;
  collection: Record<string, any>;
  packs: {
    total: number;
    last24h: number;
    maxPerMinute: number;
    legacySpecialPricingOpenings: number;
    adminAbuseEventOpenings: number;
    legacyPriceUnknownOpenings: number;
    unexplainedDiscountOpenings: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  packHistory: Array<Record<string, any>>;
  economy: Record<string, any>;
  activity: Record<string, any>;
  moderation: Array<Record<string, any>>;
  progression: Record<string, any>;
  social: Record<string, any>;
  flags: AdminAuditFlag[];
};

export async function getMyAdminAccess() {
  return invokeAdmin({ action: 'my_access' }) as Promise<AdminAccess>;
}

export async function getAdminTeam() {
  return invokeAdmin({ action: 'admin_team' }) as Promise<AdminTeamMember[]>;
}

export async function setAdminAccess(
  targetId: string,
  enabled: boolean,
  permissions: AdminPermission[] = [],
) {
  return invokeAdmin({ action: 'set_admin_access', targetId, enabled, permissions }) as Promise<{
    targetId: string;
    username: string;
    enabled: boolean;
    permissions: AdminPermission[];
    action: string;
  }>;
}

export async function getAdminAccountAudit(
  targetId: string,
  packOffset = 0,
  packLimit = 25,
) {
  return invokeAdmin({
    action: 'account_audit',
    targetId,
    packOffset,
    packLimit,
  }) as Promise<AdminAccountAudit>;
}

export async function getAdminEconomyHealth(): Promise<AdminEconomyHealth> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const actorId = auth.user?.id;
  if (!actorId) throw new Error('Usuário não autenticado.');
  const { data, error } = await supabase.rpc('server_get_economy_health', { p_actor_id: actorId });
  if (error) throw error;
  return data as AdminEconomyHealth;
}
export async function getAdminOverview() { return invokeAdmin({ action: 'overview' }) as Promise<AdminOverview>; }
export async function getAdminPlayers() { return invokeAdmin({ action: 'players' }) as Promise<AdminPlayer[]>; }
export async function moderatePlayer(targetId: string, moderationAction: AdminModerationAction, reason?: string, durationHours?: number | null) {
  return invokeAdmin({ action: 'moderate', targetId, moderationAction, reason: reason?.trim() || null, durationHours: durationHours ?? null });
}
export async function grantCoins(targetId: string, amount: number, note?: string) { return invokeAdmin({ action: 'grant_coins', targetId, amount, note: note?.trim() || null }) as Promise<CoinGrantResult>; }
export async function getCoinGrantHistory() { return invokeAdmin({ action: 'coin_history' }) as Promise<CoinGrantHistory[]>; }
export async function getCurrencyAdjustmentHistory() { return invokeAdmin({ action: 'currency_history' }) as Promise<AdminCurrencyAdjustmentHistory[]>; }
export async function grantCoinsBatch(targetIds: string[], amount: number, note?: string) { return invokeAdmin({ action: 'grant_coins_batch', targetIds, amount, note: note?.trim() || null }) as Promise<CoinGrantBatchResult>; }
export async function grantDiamondsBatch(targetIds: string[], amount: number, note?: string) { return invokeAdmin({ action: 'grant_diamonds_batch', targetIds, amount, note: note?.trim() || null }) as Promise<DiamondGrantBatchResult>; }
export async function removeCoinsBatch(targetIds: string[], amount: number, note?: string) { return invokeAdmin({ action: 'remove_coins_batch', targetIds, amount, note: note?.trim() || null }) as Promise<CurrencyRemovalBatchResult>; }
export async function removeDiamondsBatch(targetIds: string[], amount: number, note?: string) { return invokeAdmin({ action: 'remove_diamonds_batch', targetIds, amount, note: note?.trim() || null }) as Promise<CurrencyRemovalBatchResult>; }
export async function grantBattlePassVip(targetIds: string[], note?: string) { return invokeAdmin({ action: 'grant_battle_pass_vip', targetIds, note: note?.trim() || null }) as Promise<BattlePassVipGrantResult>; }
export async function createRedeemCode(input: { code: string; reward: AdminRedeemCode['reward']; maxTotalUses?: number | null; expiresHours?: number | null }) { return invokeAdmin({ action: 'create_redeem_code', code: input.code, reward: input.reward, maxTotalUses: input.maxTotalUses ?? null, expiresHours: input.expiresHours ?? null }) as Promise<AdminRedeemCode>; }
export async function getAdminRedeemCodes() { return invokeAdmin({ action: 'redeem_codes' }) as Promise<AdminRedeemCode[]>; }
export async function setAdminRedeemCodeActive(codeId: string, active: boolean) { return invokeAdmin({ action: 'set_redeem_code_active', codeId, active }) as Promise<AdminRedeemCode>; }
export async function publishGlobalAnnouncement(title: string, body: string, severity: GlobalAnnouncement['severity'], durationHours: number) { return invokeAdmin({ action: 'announce', title: title.trim(), body: body.trim(), severity, durationHours }) as Promise<GlobalAnnouncement>; }
export async function getActiveGlobalAnnouncementsAdmin() { return invokeAdmin({ action: 'announcements' }) as Promise<GlobalAnnouncement[]>; }
export async function stopGlobalAnnouncement(announcementId?: string | null) { return invokeAdmin({ action: 'stop_announcement', announcementId: announcementId ?? null }) as Promise<GlobalAnnouncement[]>; }
export async function getAdminEvents() { return invokeAdmin({ action: 'events' }) as Promise<AdminGameEvent[]>; }
export async function startGameEvent(input: { eventType: 'double_xp' | 'rare_boost' | 'featured_set'; title: string; durationMinutes: number; payload?: Record<string, unknown> }) { return invokeAdmin({ action: 'start_game_event', eventType: input.eventType, title: input.title.trim(), durationMinutes: input.durationMinutes, payload: input.payload ?? {} }) as Promise<AdminGameEvent>; }
export async function stopGameEvent(eventId: string) { return invokeAdmin({ action: 'stop_game_event', eventId }) as Promise<AdminGameEvent>; }
export async function startFreeBoosters(durationMinutes: number) { return invokeAdmin({ action: 'start_free_boosters', durationMinutes }) as Promise<AdminGameEvent>; }
export async function stopFreeBoosters() { return invokeAdmin({ action: 'stop_free_boosters' }) as Promise<AdminGameEvent | null>; }
export async function setMaintenanceMode(enabled: boolean, message: string) { return invokeAdmin({ action: 'set_maintenance', enabled, message: message.trim() }) as Promise<AppRuntimeStatus>; }

export async function getAdminReleaseCampaignStatus() {
  return invokeAdmin({ action: 'release_campaign_status' }) as Promise<AdminReleaseCampaignStatus | null>;
}
export async function getAdminLegacyProgress() {
  return invokeAdmin({ action: 'release_legacy_progress' }) as Promise<AdminLegacyProgress>;
}
export async function runAdminReleasePreflight() {
  return invokeAdmin({ action: 'release_preflight' }) as Promise<AdminReleasePreflight>;
}
export async function getAdminReleaseResetPreview() {
  return invokeAdmin({ action: 'release_reset_preview' }) as Promise<AdminReleaseResetPreview>;
}
export async function getAdminReleaseReadiness() {
  return invokeAdmin({ action: 'release_readiness' }) as Promise<AdminReleaseReadiness>;
}

export async function beginAdminReleaseFreeze() {
  return invokeAdmin({ action: 'begin_release_freeze' }) as Promise<Record<string, any>>;
}
export async function createAdminReleaseSnapshot() {
  return invokeAdmin({ action: 'create_release_snapshot' }) as Promise<Record<string, any>>;
}
export async function executeAdminReleaseReset(snapshotId: string, confirmPhrase: string) {
  return invokeAdmin({ action: 'execute_release_reset', snapshotId, confirmPhrase }) as Promise<Record<string, any>>;
}
export async function getAdminReleaseSnapshotState() {
  return invokeAdmin({ action: 'release_snapshot_state' }) as Promise<AdminReleaseSnapshotState>;
}
export async function restoreAdminReleaseSnapshot(snapshotId: string, confirmPhrase: string) {
  return invokeAdmin({ action: 'restore_release_snapshot', snapshotId, confirmPhrase }) as Promise<Record<string, any>>;
}
export async function completeAdminRelease(confirmPhrase: string) {
  return invokeAdmin({ action: 'complete_release', confirmPhrase }) as Promise<Record<string, any>>;
}
export async function setLegacySelectionEnabled(enabled: boolean) {
  return invokeAdmin({ action: 'set_legacy_selection', enabled }) as Promise<AdminReleaseCampaignStatus>;
}
export async function setReleaseDownloadUrl(downloadUrl: string) {
  return invokeAdmin({ action: 'set_release_download_url', downloadUrl: downloadUrl.trim() }) as Promise<AdminReleaseCampaignStatus>;
}

export async function getTesterTitleHub() { return invokeAdmin({ action: 'tester_title_hub' }) as Promise<TesterTitleHub>; }
export async function grantTesterTitle(targetId: string, note?: string) { return invokeAdmin({ action: 'grant_tester_title', targetId, note: note?.trim() || null }) as Promise<TesterTitleGrantResult>; }
export async function revokeTesterTitle(targetId: string) { return invokeAdmin({ action: 'revoke_tester_title', targetId }) as Promise<TesterTitleGrantResult>; }
