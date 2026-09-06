import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import {
  getMyAdminAccess,
  getAdminOverview,
  refreshAdminEconomyAdvisor,
  getAdminPlayers,
  getCurrencyAdjustmentHistory,
  getAdminEvents,
  getAdminRedeemCodes,
  grantCoinsBatch,
  grantDiamondsBatch,
  removeCoinsBatch,
  removeDiamondsBatch,
  grantBattlePassVip,
  getTesterTitleHub,
  grantTesterTitle,
  revokeTesterTitle,
  createRedeemCode,
  setAdminRedeemCodeActive,
  publishGlobalAnnouncement,
  getActiveGlobalAnnouncementsAdmin,
  stopGlobalAnnouncement,
  moderatePlayer,
  startFreeBoosters,
  stopFreeBoosters,
  startGameEvent,
  stopGameEvent,
  setMaintenanceMode,
  getAdminReleaseCampaignStatus,
  getAdminLegacyProgress,
  runAdminReleasePreflight,
  getAdminReleaseResetPreview,
  getAdminReleaseReadiness,
  beginAdminReleaseFreeze,
  createAdminReleaseSnapshot,
  executeAdminReleaseReset,
  getAdminReleaseSnapshotState,
  restoreAdminReleaseSnapshot,
  completeAdminRelease,
  setLegacySelectionEnabled,
  setReleaseDownloadUrl,
  type AdminAccess,
  type AdminPermission,
  type AdminGameEvent,
  type AdminModerationAction,
  type AdminOverview,
  type AdminEconomyHealth,
  type AdminEconomyAdvisor,
  type AdminPlayer,
  type AdminCurrencyAdjustmentHistory,
  type AdminRedeemCode,
  type GlobalAnnouncement,
  type TesterTitleHub,
  type AdminReleaseCampaignStatus,
  type AdminLegacyProgress,
  type AdminReleasePreflight,
  type AdminReleaseResetPreview,
  type AdminReleaseReadiness,
  type AdminReleaseSnapshotState,
} from '@/services/admin';
import { formatUsd } from '@/services/market';
import { getMyProfile } from '@/services/player';
import { getMaintenanceStatus, type AppRuntimeStatus } from '@/services/maintenance';
import { adminSetGuildLeader, getGuildHub, type GuildHub } from '@/services/guilds';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getThemeVisual } from '@/theme/themeCatalog';

const QUICK_AMOUNTS = [1000, 5000, 10000, 50000, 100000];

export default function AdminScreen() {
  const router = useRouter();
  const { colors, themeName } = useAppTheme();
  const themeVisual = getThemeVisual(themeName);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [economyHealth, setEconomyHealth] = useState<AdminEconomyHealth | null>(null);
  const [economyAdvisor, setEconomyAdvisor] = useState<AdminEconomyAdvisor | null>(null);
  const [economyAdvisorLoading, setEconomyAdvisorLoading] = useState(false);
  const [adminAccess, setAdminAccessState] = useState<AdminAccess | null>(null);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [selfId, setSelfId] = useState('');
  const [history, setHistory] = useState<AdminCurrencyAdjustmentHistory[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [playerSearch, setPlayerSearch] = useState('');
  const [moderationSearch, setModerationSearch] = useState('');
  const [moderationTargetId, setModerationTargetId] = useState<string | null>(null);
  const [moderationReason, setModerationReason] = useState('');
  const [suspensionHours, setSuspensionHours] = useState('24');
  const [amount, setAmount] = useState('10000');
  const [diamondAmount, setDiamondAmount] = useState('25');
  const [removeCoinAmount, setRemoveCoinAmount] = useState('1000');
  const [removeDiamondAmount, setRemoveDiamondAmount] = useState('1');
  const [correctionNote, setCorrectionNote] = useState('');
  const [note, setNote] = useState('');
  const [adminCodes, setAdminCodes] = useState<AdminRedeemCode[]>([]);
  const [newCode, setNewCode] = useState('');
  const [codeCoins, setCodeCoins] = useState('');
  const [codeDiamonds, setCodeDiamonds] = useState('');
  const [codeLuckyUses, setCodeLuckyUses] = useState('');
  const [codeCardId, setCodeCardId] = useState('');
  const [codeCardQuantity, setCodeCardQuantity] = useState('1');
  const [codeMaxUses, setCodeMaxUses] = useState('');
  const [codeExpiresHours, setCodeExpiresHours] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementSeverity, setAnnouncementSeverity] = useState<'info' | 'warning' | 'critical'>('info');
  const [announcementHours, setAnnouncementHours] = useState('24');
  const [activeAnnouncement, setActiveAnnouncement] = useState<GlobalAnnouncement | null>(null);
  const [testerHub, setTesterHub] = useState<TesterTitleHub | null>(null);
  const [testerSearch, setTesterSearch] = useState('');
  const [testerNote, setTesterNote] = useState('');
  const [freeBoosterMinutes, setFreeBoosterMinutes] = useState('1');
  const [activeEvent, setActiveEvent] = useState<AdminGameEvent | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<AppRuntimeStatus | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<AdminReleaseCampaignStatus | null>(null);
  const [legacyProgress, setLegacyProgress] = useState<AdminLegacyProgress | null>(null);
  const [legacyProgressSearch, setLegacyProgressSearch] = useState('');
  const [legacyProgressFilter, setLegacyProgressFilter] = useState<'all' | 'complete' | 'incomplete' | 'not_started'>('all');
  const [legacyProgressLoading, setLegacyProgressLoading] = useState(false);
  const [releasePreflight, setReleasePreflight] = useState<AdminReleasePreflight | null>(null);
  const [releaseResetPreview, setReleaseResetPreview] = useState<AdminReleaseResetPreview | null>(null);
  const [releaseReadiness, setReleaseReadiness] = useState<AdminReleaseReadiness | null>(null);
  const [releaseSnapshotState, setReleaseSnapshotState] = useState<AdminReleaseSnapshotState | null>(null);
  const [releaseDangerPhrase, setReleaseDangerPhrase] = useState('');
  const [releaseDownloadUrl, setReleaseDownloadUrlInput] = useState('');
  const [maintenanceMessage, setMaintenanceMessage] = useState('Estamos aplicando uma atualização importante. O jogo voltará em breve.');
  const [gameEvents, setGameEvents] = useState<AdminGameEvent[]>([]);
  const [eventType, setEventType] = useState<'double_xp'|'rare_boost'|'featured_set'>('double_xp');
  const [eventTitle, setEventTitle] = useState('Double XP');
  const [eventMinutes, setEventMinutes] = useState('60');
  const [eventSetId, setEventSetId] = useState('');
  const [eventMultiplier, setEventMultiplier] = useState('1.5');
  const [guildHub, setGuildHub] = useState<GuildHub | null>(null);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [guildLeaderSearch, setGuildLeaderSearch] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncPlayers = useCallback(async () => {
    const [directory, self] = await Promise.all([getAdminPlayers(), getMyProfile()]);
    setPlayers(directory);
    setSelfId(self.id);
    setSelectedPlayerIds((current) => {
      const validIds = new Set(
        [...current].filter((id) => directory.some((player) => player.id === id)),
      );
      if (validIds.size === 0) {
        const initial = directory.find((player) => player.id === self.id) ?? directory[0];
        if (initial) validIds.add(initial.id);
      }
      return validIds;
    });
    setModerationTargetId((current) => {
      if (current && directory.some((player) => player.id === current)) return current;
      return directory.find((player) => player.id !== self.id)?.id ?? directory[0]?.id ?? null;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const accessState = await getMyAdminAccess();
      const canUseEconomyControl = accessState.isOwner || accessState.permissions.includes('economy_control');
      const [status, economyState, grants, events, guildState, codes, runtime, announcements, testerState, releaseState] = await Promise.all([
        getAdminOverview(),
        canUseEconomyControl ? refreshAdminEconomyAdvisor() : Promise.resolve(null),
        getCurrencyAdjustmentHistory(),
        getAdminEvents(),
        getGuildHub(),
        getAdminRedeemCodes(),
        getMaintenanceStatus(),
        getActiveGlobalAnnouncementsAdmin(),
        getTesterTitleHub(),
        getAdminReleaseCampaignStatus(),
        syncPlayers(),
      ]);
      setAdminAccessState(accessState);
      setOverview(status);
      setEconomyAdvisor(economyState);
      setEconomyHealth(economyState?.health ?? null);
      setHistory(grants);
      setActiveEvent(events.find((event) => event.event_type === 'free_boosters') ?? null);
      setGameEvents(events.filter((event) => event.event_type !== 'free_boosters'));
      setGuildHub(guildState);
      setAdminCodes(codes);
      setMaintenanceStatus(runtime);
      setMaintenanceMessage(runtime.maintenance_message);
      setActiveAnnouncement(announcements[0] ?? null);
      setTesterHub(testerState);
      setReleaseStatus(releaseState);
      setReleaseDownloadUrlInput(releaseState?.download_url ?? '');
      if (accessState.isOwner) {
        try {
          setLegacyProgress(await getAdminLegacyProgress());
        } catch {
          setLegacyProgress(null);
        }
      } else {
        setLegacyProgress(null);
      }
      setSelectedGuildId((current) => current ?? guildState.guilds[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Acesso administrativo indisponível.');
    } finally {
      setLoading(false);
    }
  }, [syncPlayers]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const refreshDirectory = () => {
      void syncPlayers().catch(() => {});
    };
    const channel = supabase
      .channel(`admin-player-directory-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players' },
        refreshDirectory,
      )
      .subscribe();
    const fallbackTimer = setInterval(refreshDirectory, 15000);

    return () => {
      clearInterval(fallbackTimer);
      void supabase.removeChannel(channel);
    };
  }, [syncPlayers]);

  useEffect(() => {
    const channel = supabase
      .channel(`admin-game-events-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_game_events' },
        () => { void load(); },
      )
      .subscribe();
    const clockTimer = setInterval(() => setClock(Date.now()), 1000);

    return () => {
      clearInterval(clockTimer);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!adminAccess?.isOwner) return;
    const timer = setInterval(() => {
      void getAdminLegacyProgress().then(setLegacyProgress).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [adminAccess?.isOwner]);

  useEffect(() => {
    if (!activeEvent) return;
    const delay = Math.max(0, new Date(activeEvent.ends_at).getTime() - Date.now()) + 250;
    const expiryTimer = setTimeout(() => { void load(); }, delay);
    return () => clearTimeout(expiryTimer);
  }, [activeEvent, load]);

  const hasAdminPermission = useCallback(
    (permission: AdminPermission) => Boolean(
      adminAccess?.isOwner || adminAccess?.permissions?.includes(permission)
    ),
    [adminAccess],
  );

  const amountNumber = useMemo(() => {
    const parsed = Number(amount.replace(/[^0-9]/g, ''));
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }, [amount]);
  const diamondAmountNumber = useMemo(() => Number(diamondAmount.replace(/[^0-9]/g, '')) || 0, [diamondAmount]);
  const removeCoinAmountNumber = useMemo(() => Number(removeCoinAmount.replace(/[^0-9]/g, '')) || 0, [removeCoinAmount]);
  const removeDiamondAmountNumber = useMemo(() => Number(removeDiamondAmount.replace(/[^0-9]/g, '')) || 0, [removeDiamondAmount]);

  const visiblePlayers = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) => player.username.toLowerCase().includes(query));
  }, [playerSearch, players]);

  const selectedPlayers = useMemo(
    () => players.filter((player) => selectedPlayerIds.has(player.id)),
    [players, selectedPlayerIds],
  );

  const visibleTesterFriends = useMemo(() => {
    const query = testerSearch.trim().toLowerCase();
    const friends = testerHub?.friends ?? [];
    if (!query) return friends;
    return friends.filter((friend) => friend.username.toLowerCase().includes(query));
  }, [testerHub, testerSearch]);

  const visibleModerationPlayers = useMemo(() => {
    const query = moderationSearch.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) => player.username.toLowerCase().includes(query));
  }, [moderationSearch, players]);

  const moderationTarget = useMemo(
    () => players.find((player) => player.id === moderationTargetId) ?? null,
    [moderationTargetId, players],
  );

  const selectedGuild = useMemo(
    () => guildHub?.guilds.find((guild) => guild.id === selectedGuildId) ?? null,
    [guildHub, selectedGuildId],
  );

  const visibleGuildLeaders = useMemo(() => {
    const query = guildLeaderSearch.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) => player.username.toLowerCase().includes(query));
  }, [guildLeaderSearch, players]);

  const visibleLegacyProgressPlayers = useMemo(() => {
    const rows = legacyProgress?.players ?? [];
    const query = legacyProgressSearch.trim().toLowerCase();
    const limit = legacyProgress?.campaign.legacyCardLimit ?? 10;

    return rows.filter((row) => {
      if (query && !row.username.toLowerCase().includes(query)) return false;
      if (legacyProgressFilter === 'complete') return limit > 0 && row.selectedCount >= limit;
      if (legacyProgressFilter === 'incomplete') return row.selectedCount > 0 && row.selectedCount < limit;
      if (legacyProgressFilter === 'not_started') return row.selectedCount === 0;
      return true;
    });
  }, [legacyProgress, legacyProgressFilter, legacyProgressSearch]);

  const activeEventRemaining = useMemo(() => {
    if (!activeEvent) return '';
    const seconds = Math.max(0, Math.ceil((new Date(activeEvent.ends_at).getTime() - clock) / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes > 0
      ? String(minutes) + 'm ' + String(rest).padStart(2, '0') + 's'
      : String(rest) + 's';
  }, [activeEvent, clock]);

  async function refreshEconomyAdvisor() {
    if (economyAdvisorLoading) return;
    if (!hasAdminPermission('economy_control')) {
      setError('Sua conta de admin não possui permissão para o Controle da Economia.');
      return;
    }
    try {
      setEconomyAdvisorLoading(true);
      setError(null);
      const next = await refreshAdminEconomyAdvisor();
      setEconomyAdvisor(next);
      setEconomyHealth(next.health);
      setNotice('Diagnóstico da Economy 2.0 atualizado. Sugestões continuam manuais e não alteram preços automaticamente.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar o diagnóstico econômico.');
    } finally {
      setEconomyAdvisorLoading(false);
    }
  }

  async function refreshLegacyProgress() {
    if (legacyProgressLoading || !adminAccess?.isOwner) return;
    try {
      setLegacyProgressLoading(true);
      setError(null);
      setLegacyProgress(await getAdminLegacyProgress());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar o acompanhamento do Legado.');
    } finally {
      setLegacyProgressLoading(false);
    }
  }

  async function activateGameEvent() {
    if (working) return;
    const minutes = Math.max(1, Math.min(10080, Number(eventMinutes.replace(/[^0-9]/g,'')) || 60));
    const multiplier = Math.max(1, Math.min(3, Number(eventMultiplier.replace(',', '.')) || 1.5));
    if (eventType === 'featured_set' && !eventSetId.trim()) {
      setError('Informe o ID do set para o Featured Set.');
      return;
    }
    try {
      setWorking(true);
      setError(null);
      await startGameEvent({
        eventType,
        title: eventTitle.trim() || (eventType === 'double_xp' ? 'Double XP' : eventType === 'rare_boost' ? 'Rare Boost' : 'Featured Set'),
        durationMinutes: minutes,
        payload: eventType === 'featured_set'
          ? { setId: eventSetId.trim(), multiplier }
          : eventType === 'rare_boost'
            ? { multiplier }
            : {},
      });
      setNotice('Evento ao vivo ativado.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar o evento.');
    } finally {
      setWorking(false);
    }
  }

  async function deactivateGameEvent(eventId: string) {
    if (working) return;
    try {
      setWorking(true);
      await stopGameEvent(eventId);
      setNotice('Evento encerrado.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível encerrar o evento.');
    } finally {
      setWorking(false);
    }
  }

  async function moderateSelected(action: AdminModerationAction) {
    if (!moderationTarget || working) return;
    const durationHours = action === 'suspend'
      ? Math.max(1, Number(suspensionHours.replace(/[^0-9]/g, '')) || 24)
      : null;

    const execute = async () => {
      try {
        setWorking(true);
        setError(null);
        await moderatePlayer(
          moderationTarget.id,
          action,
          moderationReason,
          durationHours,
        );
        setNotice(
          action === 'warn' ? `Aviso aplicado a @${moderationTarget.username}.` :
          action === 'suspend' ? `@${moderationTarget.username} suspenso por ${durationHours}h.` :
          action === 'ban' ? `@${moderationTarget.username} foi banido.` :
          `A conta de @${moderationTarget.username} foi restaurada.`,
        );
        setModerationReason('');
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível aplicar a moderação.');
      } finally {
        setWorking(false);
      }
    };

    if (action === 'ban' || action === 'suspend') {
      Alert.alert(
        action === 'ban' ? 'Confirmar banimento' : 'Confirmar suspensão',
        action === 'ban'
          ? `Banir @${moderationTarget.username}?`
          : `Suspender @${moderationTarget.username} por ${durationHours}h?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Confirmar', style: 'destructive', onPress: () => { void execute(); } },
        ],
      );
      return;
    }

    await execute();
  }

  async function sendCoins() {
    if (selectedPlayers.length < 1 || amountNumber < 1 || working) return;
    try {
      setWorking(true);
      setError(null);
      const result = await grantCoinsBatch(
        selectedPlayers.map((player) => player.id),
        amountNumber,
        note,
      );
      setNotice(
        'Adicionado 🪙 ' + result.amountEach.toLocaleString('pt-BR') +
        ' para ' + result.recipientCount.toLocaleString('pt-BR') +
        ' jogador(es). Total distribuído: 🪙 ' + result.totalGranted.toLocaleString('pt-BR') + '.',
      );
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível adicionar moedas.');
    } finally {
      setWorking(false);
    }
  }

  function confirmSendCoins() {
    if (selectedPlayers.length < 1 || amountNumber < 1 || working) return;
    const total = amountNumber * selectedPlayers.length;
    Alert.alert(
      'Confirmar crédito em grupo',
      'Adicionar 🪙 ' + amountNumber.toLocaleString('pt-BR') +
      ' para cada um dos ' + selectedPlayers.length.toLocaleString('pt-BR') +
      ' jogadores selecionados? Total: 🪙 ' + total.toLocaleString('pt-BR') + '.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Adicionar', onPress: () => { void sendCoins(); } },
      ],
    );
  }

  async function sendDiamonds() {
    if (selectedPlayers.length < 1 || diamondAmountNumber < 1 || working) return;
    try {
      setWorking(true); setError(null);
      const result = await grantDiamondsBatch(selectedPlayers.map((player) => player.id), diamondAmountNumber, note);
      setNotice(`Adicionado 💎 ${result.amountEach.toLocaleString('pt-BR')} para ${result.recipientCount} jogador(es).`);
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível adicionar Diamantes.');
    } finally { setWorking(false); }
  }

  function confirmSendDiamonds() {
    Alert.alert(
      'Confirmar Diamantes',
      `Adicionar 💎 ${diamondAmountNumber.toLocaleString('pt-BR')} para cada um dos ${selectedPlayers.length} jogadores selecionados?`,
      [{text:'Cancelar',style:'cancel'},{text:'Adicionar',onPress:()=>{void sendDiamonds();}}],
    );
  }

  async function removeSelectedCurrency(currency: 'coins' | 'diamonds') {
    const removeAmount = currency === 'coins' ? removeCoinAmountNumber : removeDiamondAmountNumber;
    if (selectedPlayers.length < 1 || removeAmount < 1 || working) return;
    if (correctionNote.trim().length < 3) {
      setError('Informe o motivo da correção para manter o histórico administrativo claro.');
      return;
    }
    try {
      setWorking(true);
      setError(null);
      const targetIds = selectedPlayers.map((player) => player.id);
      const result = currency === 'coins'
        ? await removeCoinsBatch(targetIds, removeAmount, correctionNote)
        : await removeDiamondsBatch(targetIds, removeAmount, correctionNote);
      const symbol = currency === 'coins' ? '🪙' : '💎';
      setNotice(`Retirado ${symbol} ${result.amountEach.toLocaleString('pt-BR')} de ${result.recipientCount.toLocaleString('pt-BR')} jogador(es). Correção registrada no histórico.`);
      setCorrectionNote('');
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (message.includes('INSUFFICIENT_COINS')) {
        setError('A correção não foi aplicada: pelo menos um jogador não possui Coins suficientes. Nenhum saldo foi alterado.');
      } else if (message.includes('INSUFFICIENT_DIAMONDS')) {
        setError('A correção não foi aplicada: pelo menos um jogador não possui Diamantes suficientes. Nenhum saldo foi alterado.');
      } else {
        setError(message || 'Não foi possível corrigir o saldo.');
      }
    } finally {
      setWorking(false);
    }
  }

  function confirmRemoveCurrency(currency: 'coins' | 'diamonds') {
    const removeAmount = currency === 'coins' ? removeCoinAmountNumber : removeDiamondAmountNumber;
    if (selectedPlayers.length < 1 || removeAmount < 1 || working) return;
    if (correctionNote.trim().length < 3) {
      setError('Informe o motivo da correção antes de retirar saldo.');
      return;
    }
    const symbol = currency === 'coins' ? '🪙' : '💎';
    const label = currency === 'coins' ? 'Coins' : 'Diamantes';
    const names = selectedPlayers.slice(0, 4).map((player) => `@${player.username}`).join(', ');
    const extra = selectedPlayers.length > 4 ? ` e mais ${selectedPlayers.length - 4}` : '';
    Alert.alert(
      `Retirar ${label}?`,
      `Retirar ${symbol} ${removeAmount.toLocaleString('pt-BR')} de cada jogador selecionado?\n\n${names}${extra}\n\nMotivo: ${correctionNote.trim()}\n\nA operação é atômica: se algum jogador não tiver saldo suficiente, ninguém será alterado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'RETIRAR SALDO', style: 'destructive', onPress: () => { void removeSelectedCurrency(currency); } },
      ],
    );
  }

  async function changeTesterTitle(targetId: string, grant: boolean) {
    if (working) return;
    try {
      setWorking(true);
      setError(null);
      const result = grant
        ? await grantTesterTitle(targetId, testerNote)
        : await revokeTesterTitle(targetId);
      setNotice(
        grant
          ? `${result.icon ?? '🧪'} Título "${result.title}" concedido a @${result.username}.`
          : `Título de tester revogado de @${result.username}.`,
      );
      if (grant) setTesterNote('');
      setTesterHub(await getTesterTitleHub());
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(
        message.includes('TARGET_MUST_BE_FRIEND')
          ? 'O título de tester só pode ser concedido a um amigo confirmado.'
          : message.includes('OWNER_ONLY')
            ? 'Somente o dono do jogo pode gerenciar títulos de tester.'
            : message || 'Não foi possível atualizar o título de tester.',
      );
    } finally {
      setWorking(false);
    }
  }

  function confirmRevokeTesterTitle(targetId: string, username: string) {
    if (working) return;
    Alert.alert(
      'Revogar título de tester?',
      `Remover o título exclusivo de @${username}? Se estiver equipado, ele será retirado do perfil.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'REVOGAR', style: 'destructive', onPress: () => { void changeTesterTitle(targetId, false); } },
      ],
    );
  }

  async function sendBattlePassVip() {
    if (selectedPlayers.length < 1 || working) return;
    try {
      setWorking(true);
      setError(null);
      const result = await grantBattlePassVip(selectedPlayers.map((player) => player.id), note);
      setNotice(`Passe VIP liberado gratuitamente para ${result.recipientCount.toLocaleString('pt-BR')} jogador(es).`);
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível liberar o Passe VIP.');
    } finally {
      setWorking(false);
    }
  }

  function confirmBattlePassVip() {
    if (selectedPlayers.length < 1 || working) return;
    Alert.alert(
      'Dar Passe VIP grátis?',
      `Liberar gratuitamente o VIP da temporada atual para ${selectedPlayers.length.toLocaleString('pt-BR')} jogador(es)? Nenhum Diamante será cobrado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'DAR VIP GRÁTIS', onPress: () => { void sendBattlePassVip(); } },
      ],
    );
  }

  async function createCode() {
    if (newCode.trim().length < 4 || working) return;
    const reward: AdminRedeemCode['reward'] = {};
    if (Number(codeCoins) > 0) reward.coins = Number(codeCoins);
    if (Number(codeDiamonds) > 0) reward.diamonds = Number(codeDiamonds);
    if (Number(codeLuckyUses) > 0) reward.lucky2xUses = Math.min(10000, Number(codeLuckyUses));
    if (codeCardId.trim() && Number(codeCardQuantity) > 0) {
      reward.cardId = codeCardId.trim();
      reward.cardQuantity = Number(codeCardQuantity);
    }
    if (!reward.coins && !reward.diamonds && !reward.cardId && !reward.lucky2xUses) {
      setError('Defina ao menos uma recompensa para o código.');
      return;
    }
    try {
      setWorking(true); setError(null);
      const created = await createRedeemCode({
        code:newCode,
        reward,
        maxTotalUses:Number(codeMaxUses)>0?Number(codeMaxUses):null,
        expiresHours:Number(codeExpiresHours)>0?Number(codeExpiresHours):null,
      });
      setNotice(`Código ${created.code} criado e pronto para resgate.`);
      setNewCode(''); setCodeCoins(''); setCodeDiamonds(''); setCodeLuckyUses(''); setCodeCardId('');
      setCodeCardQuantity('1'); setCodeMaxUses(''); setCodeExpiresHours('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar o código.');
    } finally { setWorking(false); }
  }

  async function toggleCode(item: AdminRedeemCode) {
    if (working) return;
    try { setWorking(true); await setAdminRedeemCodeActive(item.id,!item.active); await load(); }
    catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar o código.');}
    finally{setWorking(false);}
  }

  async function sendAnnouncement() {
    const hours = Number(announcementHours);
    if (!announcementTitle.trim() || !announcementBody.trim() || !Number.isInteger(hours) || hours < 1 || hours > 720 || working) return;
    try {
      setWorking(true);
      setError(null);
      const published = await publishGlobalAnnouncement(
        announcementTitle,
        announcementBody,
        announcementSeverity,
        hours,
      );
      setActiveAnnouncement(published);
      setAnnouncementTitle('');
      setAnnouncementBody('');
      setNotice('Anúncio global publicado. Cada conta verá este anúncio somente uma vez.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível publicar o anúncio.');
    } finally {
      setWorking(false);
    }
  }


  async function stopCurrentAnnouncement() {
    if (!activeAnnouncement || working) return;
    try {
      setWorking(true);
      setError(null);
      await stopGlobalAnnouncement(activeAnnouncement.id);
      setActiveAnnouncement(null);
      setNotice('Anúncio global encerrado. Ele não aparecerá mais para os jogadores.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível parar o anúncio global.');
    } finally {
      setWorking(false);
    }
  }

  function confirmStopAnnouncement() {
    if (!activeAnnouncement || working) return;
    Alert.alert(
      'Parar anúncio global?',
      `Encerrar "${activeAnnouncement.title}" agora? O anúncio deixará de aparecer imediatamente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'PARAR ANÚNCIO',
          style: 'destructive',
          onPress: () => { void stopCurrentAnnouncement(); },
        },
      ],
    );
  }

  async function applyMaintenanceMode(enabled: boolean) {
    if (working) return;
    const message = maintenanceMessage.trim();
    if (enabled && !message) {
      setError('Digite a mensagem que será mostrada durante a manutenção.');
      return;
    }
    try {
      setWorking(true);
      setError(null);
      const next = await setMaintenanceMode(enabled, message);
      setMaintenanceStatus(next);
      setMaintenanceMessage(next.maintenance_message);
      setNotice(
        enabled
          ? 'Modo manutenção ativado. As atividades dos jogadores foram pausadas.'
          : 'Modo manutenção encerrado. O jogo foi liberado para todos.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível alterar o modo manutenção.');
    } finally {
      setWorking(false);
    }
  }

  function confirmMaintenanceMode() {
    Alert.alert(
      'Pausar o aplicativo?',
      'Jogadores comuns serão bloqueados imediatamente. Packs, batalhas, trocas, chat, mercado e outras atividades também serão recusadas no servidor.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'ATIVAR MANUTENÇÃO',
          style: 'destructive',
          onPress: () => { void applyMaintenanceMode(true); },
        },
      ],
    );
  }

  async function activateFreeBoosters() {
    const minutes = Number(freeBoosterMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440 || working) return;
    try {
      setWorking(true);
      setError(null);
      const event = await startFreeBoosters(minutes);
      setActiveEvent(event);
      setClock(Date.now());
      setNotice(
        'Admin Abuse ativado: boosters de Coins grátis e boosters de Diamantes com 50% OFF por ' +
        minutes.toLocaleString('pt-BR') + ' minuto(s).',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ativar o Admin Abuse.');
    } finally {
      setWorking(false);
    }
  }

  async function chooseGuildLeader(targetId: string | null) {
    if (!selectedGuild || working) return;
    try {
      setWorking(true);
      setError(null);
      await adminSetGuildLeader(selectedGuild.id, targetId);
      setNotice(targetId ? `Chefe da ${selectedGuild.name} atualizado.` : `A ${selectedGuild.name} ficou sem chefe.`);
      const next = await getGuildHub();
      setGuildHub(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar o chefe da guilda.');
    } finally {
      setWorking(false);
    }
  }

  async function deactivateFreeBoosters() {
    if (working) return;
    try {
      setWorking(true);
      setError(null);
      await stopFreeBoosters();
      setActiveEvent(null);
      setNotice('Admin Abuse encerrado. Os preços normais já voltaram.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível encerrar a promoção.');
    } finally {
      setWorking(false);
    }
  }


  async function applyLegacySelection(enabled: boolean) {
    if (working || !adminAccess?.isOwner) return;
    try {
      setWorking(true);
      setError(null);
      const result = await setLegacySelectionEnabled(enabled);
      setReleaseStatus(result);
      setNotice(
        enabled
          ? `Escolha de legado liberada: cada veterano pode salvar e confirmar até ${result.legacy_card_limit} cartas.`
          : 'Escolha de legado pausada. Seleções confirmadas continuam protegidas e a economia NÃO foi congelada.',
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(
        message.includes('OWNER_ONLY')
          ? 'Somente o dono do jogo pode alterar a fase de legado.'
          : message.includes('RELEASE_PHASE_LOCKED')
            ? 'A campanha já avançou para uma fase que não permite reabrir a seleção.'
            : message || 'Não foi possível alterar a seleção de legado.',
      );
    } finally {
      setWorking(false);
    }
  }

  function confirmLegacySelectionToggle() {
    if (!releaseStatus || working || !adminAccess?.isOwner) return;
    const enabled = !releaseStatus.legacy_selection_enabled;
    Alert.alert(
      enabled ? 'Liberar escolha das cartas?' : 'Pausar escolha das cartas?',
      enabled
        ? `Isso abrirá a tela de Legado Beta para os jogadores. Cada conta poderá escolher até ${releaseStatus.legacy_card_limit} cartas. O reset e o congelamento da economia NÃO serão executados.`
        : 'Isso impedirá novas alterações enquanto estiver pausado. Cartas já confirmadas continuarão protegidas e o reset NÃO será executado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: enabled ? 'LIBERAR ESCOLHA' : 'PAUSAR ESCOLHA',
          style: enabled ? 'default' : 'destructive',
          onPress: () => { void applyLegacySelection(enabled); },
        },
      ],
    );
  }


  async function runReleasePreflightCheck() {
    if (working || !adminAccess?.isOwner) return;
    try {
      setWorking(true);
      setError(null);
      const result = await runAdminReleasePreflight();
      setReleasePreflight(result);
      setNotice(
        result.ready
          ? 'Pré-check da transição concluído: nenhuma inconsistência crítica encontrada.'
          : 'Pré-check concluído com pendências. O reset não deve ser executado enquanto houver alertas.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível executar o pré-check da transição.');
    } finally {
      setWorking(false);
    }
  }


  async function loadReleaseResetPreview() {
    if (working || !adminAccess?.isOwner) return;
    try {
      setWorking(true);
      setError(null);
      const result = await getAdminReleaseResetPreview();
      setReleaseResetPreview(result);
      setNotice(
        result.readyToReset
          ? 'Impacto calculado. O ambiente está tecnicamente pronto para o reset, mas nenhuma alteração foi executada.'
          : 'Impacto calculado em modo somente leitura. O reset continua bloqueado até o freeze e o pré-check final.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível calcular o impacto do reset.');
    } finally {
      setWorking(false);
    }
  }


  async function loadReleaseReadiness() {
    if (working || !adminAccess?.isOwner) return;
    try {
      setWorking(true);
      setError(null);
      const result = await getAdminReleaseReadiness();
      setReleaseReadiness(result);
      setReleaseResetPreview(result.preview);
      setReleasePreflight(result.preview.preflight);
      setNotice(
        result.readyToReset
          ? 'Checklist 1.0 concluído: todas as travas técnicas estão prontas. Nenhum reset foi executado.'
          : 'Checklist 1.0 atualizado. As pendências continuam bloqueando qualquer reset.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar o checklist da 1.0.');
    } finally {
      setWorking(false);
    }
  }


  async function refreshReleaseSafetyState() {
    const [status, readiness, snapshot, runtime] = await Promise.all([
      getAdminReleaseCampaignStatus(),
      getAdminReleaseReadiness(),
      getAdminReleaseSnapshotState(),
      getMaintenanceStatus(),
    ]);
    setReleaseStatus(status);
    setReleaseReadiness(readiness);
    setReleaseResetPreview(readiness.preview);
    setReleasePreflight(readiness.preview.preflight);
    setReleaseSnapshotState(snapshot);
    setMaintenanceStatus(runtime);
    return { status, readiness, snapshot, runtime };
  }

  function confirmBeginReleaseFreeze() {
    if (working || !adminAccess?.isOwner) return;
    Alert.alert(
      'Iniciar freeze da migração?',
      'Isso ativa manutenção, encerra operações pendentes, devolve cartas do marketplace e completa automaticamente as vagas de Legado com as cartas de maior valor. Ainda NÃO executa o reset.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'INICIAR FREEZE', style: 'destructive', onPress: () => { void beginReleaseFreeze(); } },
      ],
    );
  }

  async function beginReleaseFreeze() {
    try {
      setWorking(true);
      setError(null);
      await beginAdminReleaseFreeze();
      await refreshReleaseSafetyState();
      setNotice('Freeze concluído. Operações foram encerradas e o Legado automático foi finalizado. O reset ainda NÃO foi executado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar o freeze.');
    } finally {
      setWorking(false);
    }
  }

  async function prepareReleaseSnapshot() {
    if (working || !adminAccess?.isOwner) return;
    try {
      setWorking(true);
      setError(null);
      await createAdminReleaseSnapshot();
      await refreshReleaseSafetyState();
      setNotice('Snapshot privado preparado. Agora o reset só poderá rodar se todas as travas continuarem verdes.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar o snapshot de segurança.');
    } finally {
      setWorking(false);
    }
  }

  function confirmExecuteReleaseReset() {
    if (working || !releaseReadiness?.readyToReset || !releaseReadiness.snapshotId) return;
    if (releaseDangerPhrase.trim().toUpperCase() !== 'RESETAR 1.0') {
      setError('Digite RESETAR 1.0 exatamente para liberar o reset.');
      return;
    }
    Alert.alert(
      'Executar reset 1.0 agora?',
      'Esta ação reinicia economia, progressão, decks e coleção não preservada. Contas, Admin/Tester, guildas e cartas de Legado permanecem. Um snapshot privado já precisa estar preparado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'EXECUTAR RESET', style: 'destructive', onPress: () => { void executeReleaseResetNow(); } },
      ],
    );
  }

  async function executeReleaseResetNow() {
    const snapshotId = releaseReadiness?.snapshotId;
    if (!snapshotId) return;
    try {
      setWorking(true);
      setError(null);
      await executeAdminReleaseReset(snapshotId, 'RESETAR 1.0');
      setReleaseDangerPhrase('');
      await refreshReleaseSafetyState();
      setNotice('Reset 1.0 executado com snapshot preservado. A manutenção continua ativa para você conferir o resultado antes de liberar os jogadores.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'O reset foi bloqueado por uma trava de segurança.');
    } finally {
      setWorking(false);
    }
  }

  function confirmRestoreRelease() {
    const snapshotId = releaseSnapshotState?.usedSnapshotId;
    if (working || !snapshotId) return;
    if (releaseDangerPhrase.trim().toUpperCase() !== 'RESTAURAR 1.0') {
      setError('Digite RESTAURAR 1.0 exatamente para liberar a restauração.');
      return;
    }
    Alert.alert(
      'Restaurar snapshot anterior?',
      'Isso desfaz o reset usando o backup privado e mantém o jogo em manutenção/freeze para uma nova tentativa.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'RESTAURAR', style: 'destructive', onPress: () => { void restoreReleaseNow(snapshotId); } },
      ],
    );
  }

  async function restoreReleaseNow(snapshotId: string) {
    try {
      setWorking(true);
      setError(null);
      await restoreAdminReleaseSnapshot(snapshotId, 'RESTAURAR 1.0');
      setReleaseDangerPhrase('');
      await refreshReleaseSafetyState();
      setNotice('Snapshot restaurado. O ambiente voltou ao freeze e continua em manutenção.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível restaurar o snapshot.');
    } finally {
      setWorking(false);
    }
  }

  function confirmCompleteRelease() {
    if (working || releaseStatus?.phase !== 'update_required') return;
    if (releaseDangerPhrase.trim().toUpperCase() !== 'CONCLUIR 1.0') {
      setError('Digite CONCLUIR 1.0 exatamente para liberar os jogadores.');
      return;
    }
    Alert.alert(
      'Concluir lançamento 1.0?',
      'Use somente depois de conferir contas, Legado e saldos. O servidor valida novamente os invariantes, tira a manutenção e reabre a economia.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'CONCLUIR E LIBERAR', onPress: () => { void completeReleaseNow(); } },
      ],
    );
  }

  async function completeReleaseNow() {
    try {
      setWorking(true);
      setError(null);
      await completeAdminRelease('CONCLUIR 1.0');
      setReleaseDangerPhrase('');
      await refreshReleaseSafetyState();
      setNotice('Trainer Collection 1.0 concluída: manutenção encerrada e economia liberada. A atualização 1.0.1 continua obrigatória para clientes antigos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A conclusão foi bloqueada porque uma validação final falhou.');
    } finally {
      setWorking(false);
    }
  }


  async function saveReleaseDownloadUrl() {
    if (working || !adminAccess?.isOwner) return;
    const value = releaseDownloadUrl.trim();
    if (!value) {
      setError('Cole a URL HTTPS do APK 1.0 antes de salvar.');
      return;
    }
    try {
      setWorking(true);
      setError(null);
      const result = await setReleaseDownloadUrl(value);
      setReleaseStatus(result);
      setReleaseDownloadUrlInput(result.download_url ?? value);
      setReleaseReadiness(null);
      setNotice('Link do APK atual salvo. Isso não inicia freeze nem reset.');
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(
        message.includes('INVALID_RELEASE_DOWNLOAD_URL')
          ? 'Use uma URL HTTPS oficial do Expo/GitHub que aponte para um arquivo .apk.'
          : message || 'Não foi possível salvar o link do APK 1.0.',
      );
    } finally {
      setWorking(false);
    }
  }


  async function importReleaseDownloadUrlFromSite() {
    if (working || !adminAccess?.isOwner) return;
    try {
      setWorking(true);
      setError(null);
      const response = await fetch(
        `https://pokemon-cards-frontwork.expo.app/download/release.json?t=${Date.now()}`,
      );
      if (!response.ok) throw new Error('RELEASE_METADATA_UNAVAILABLE');
      const release = await response.json() as {
        version?: string;
        downloadUrl?: string;
        status?: string;
      };
      if (
        release.status !== 'ready'
        || release.version !== releaseStatus?.target_version
        || typeof release.downloadUrl !== 'string'
        || !release.downloadUrl.trim()
      ) {
        throw new Error('RELEASE_METADATA_NOT_READY');
      }
      setReleaseDownloadUrlInput(release.downloadUrl.trim());
      setNotice(`APK ${release.version ?? releaseStatus?.target_version ?? 'atual'} encontrado no site oficial. Revise a URL e toque em SALVAR APK.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(
        message.includes('NOT_READY')
          ? `O site ainda não publicou o APK ${releaseStatus?.target_version ?? 'atual'} esperado. Gere/valide o build Android primeiro.`
          : 'Não foi possível importar o metadata do APK agora.',
      );
    } finally {
      setWorking(false);
    }
  }


  return (
    <Screen title="Admin Command Center" subtitle="Controle privado de usuários, economia, eventos, segurança e saúde da Trainer Collection.">
      <View style={styles.topRow}>
        <Pressable
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => goBackOrHome(router)}
        >
          <Ionicons name="arrow-back" size={18} color={colors.text} />
          <Text style={[styles.backText, { color: colors.text }]}>Perfil</Text>
        </Pressable>

        <Pressable
          style={[styles.refreshButton, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
          onPress={load}
        >
          <Ionicons name="refresh" size={17} color={colors.yellow} />
          <Text style={[styles.refreshText, { color: colors.yellow }]}>ATUALIZAR STATUS</Text>
        </Pressable>
      </View>

      {notice ? (
        <View style={[styles.notice, { backgroundColor: '#142C23', borderColor: '#4A9B70' }]}>
          <Ionicons name="checkmark-circle" size={20} color="#65D894" />
          <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
          <Pressable onPress={() => setNotice(null)}><Ionicons name="close" size={18} color={colors.muted} /></Pressable>
        </View>
      ) : null}

      {error ? (
        <View style={styles.error}>
          <Ionicons name="shield-outline" size={20} color="#FF9FAF" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      {!loading && overview ? (
        <>
          <View style={[styles.adminHero, { backgroundColor: colors.accentSoft, borderColor: maintenanceStatus?.maintenance_enabled ? '#FF6475' : colors.accent }]}>
            <View style={[styles.adminHeroGlow,{backgroundColor:maintenanceStatus?.maintenance_enabled ? '#FF6475' : colors.accent}]} />
            <Image source={{uri:themeVisual.image}} resizeMode="contain" style={styles.adminHeroPokemon}/>
            <View style={[styles.adminIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="shield-checkmark" size={27} color={colors.yellow} />
            </View>
            <View style={styles.adminHeroCopy}>
              <Text style={[styles.heroKicker, { color: colors.yellow }]}>TRAINER COLLECTION CONTROL ROOM</Text>
              <Text style={[styles.heroTitle, { color: colors.text }]}>{maintenanceStatus?.maintenance_enabled ? 'Aplicativo em manutenção' : 'Controle privado ativado'}</Text>
              <Text style={[styles.heroText, { color: colors.muted }]}>
                Economia, moderação, eventos e operações críticas ficam centralizadas neste painel com histórico administrativo.
              </Text>
              <View style={styles.adminHeroStats}>
                <View style={[styles.adminHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.adminHeroStatValue,{color:colors.text}]}>{overview.users.total.toLocaleString('pt-BR')}</Text><Text style={[styles.adminHeroStatLabel,{color:colors.muted}]}>USUÁRIOS</Text></View>
                <View style={[styles.adminHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.adminHeroStatValue,{color:colors.text}]}>{overview.battles.active.toLocaleString('pt-BR')}</Text><Text style={[styles.adminHeroStatLabel,{color:colors.muted}]}>BATALHAS ATIVAS</Text></View>
                <View style={[styles.adminHeroStat,{backgroundColor:colors.surface,borderColor:maintenanceStatus?.maintenance_enabled ? '#FF6475' : '#2F9E68'}]}><Text style={[styles.adminHeroStatValue,{color:maintenanceStatus?.maintenance_enabled ? '#FF8290' : '#65D894'}]}>{maintenanceStatus?.maintenance_enabled ? 'PAUSADO' : 'ONLINE'}</Text><Text style={[styles.adminHeroStatLabel,{color:colors.muted}]}>RUNTIME</Text></View>
              </View>
            </View>
          </View>

          {adminAccess?.isOwner ? (
            <Pressable onPress={()=>router.push('/admin-gamepasses')} style={[styles.notice,{backgroundColor:'#241D3B',borderColor:'#9B7BFF'}]}>
              <Ionicons name="flash" size={20} color="#CBBEFF"/>
              <View style={{flex:1}}><Text style={[styles.historyUser,{color:colors.text}]}>GAMEPASS AUTO BOOSTER • VENDAS MANUAIS</Text><Text style={[styles.historyMeta,{color:colors.muted}]}>Ative ou remova a gamepass somente depois de confirmar diretamente o pagamento em dinheiro real.</Text></View>
              <Ionicons name="chevron-forward" size={18} color="#CBBEFF"/>
            </Pressable>
          ) : null}

          {adminAccess?.isOwner ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir laboratório 3D interno"
              onPress={()=>router.push('/admin-3d-lab')}
              style={[styles.notice,{backgroundColor:'#102A33',borderColor:'#50D7F0'}]}
            >
              <Ionicons name="cube" size={21} color="#7FEAFF"/>
              <View style={{flex:1}}>
                <Text style={[styles.historyUser,{color:colors.text}]}>3D LAB • TESTE INTERNO</Text>
                <Text style={[styles.historyMeta,{color:colors.muted}]}>Pikachu #25 • Charizard #6 • Gyarados #130 • ataque, dano, KO, vitória, troca, cache e stress de 100 ciclos. Somente owner.</Text>
              </View>
              <View style={{alignItems:'flex-end',gap:4}}>
                <View style={{borderRadius:999,borderWidth:1,borderColor:'#50D7F0',backgroundColor:'#133846',paddingHorizontal:7,paddingVertical:3}}>
                  <Text style={{color:'#9AF0FF',fontSize:7,fontWeight:'900',letterSpacing:.5}}>NÃO LIBERADO</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#7FEAFF"/>
              </View>
            </Pressable>
          ) : null}

          {adminAccess?.isOwner && releaseStatus && !['completed'].includes(releaseStatus.phase) ? (
            <View style={[styles.legacyAdminPanel,{backgroundColor:colors.surface,borderColor:releaseStatus.legacy_selection_enabled ? '#65D894' : colors.border}]}>
              <View style={styles.legacyAdminHeader}>
                <View style={[styles.legacyAdminIcon,{backgroundColor:releaseStatus.legacy_selection_enabled ? '#153426' : colors.accentSoft}]}>
                  <Ionicons name="albums" size={23} color={releaseStatus.legacy_selection_enabled ? '#65D894' : colors.yellow}/>
                </View>
                <View style={{flex:1,minWidth:190}}>
                  <Text style={[styles.legacyAdminKicker,{color:colors.yellow}]}>TRANSIÇÃO BETA → 1.0</Text>
                  <Text style={[styles.legacyAdminTitle,{color:colors.text}]}>Escolha das {releaseStatus.legacy_card_limit} cartas</Text>
                  <Text style={[styles.legacyAdminText,{color:colors.muted}]}>
                    {releaseStatus.legacy_selection_enabled
                      ? 'A seleção está aberta. Jogadores podem salvar e confirmar o próprio legado.'
                      : releaseStatus.phase === 'legacy_selection'
                        ? 'A seleção está pausada. Confirmações existentes permanecem protegidas.'
                        : 'A seleção ainda não foi liberada. A economia Beta continua normal.'}
                  </Text>
                </View>
                <View style={[styles.legacyStateBadge,{backgroundColor:releaseStatus.legacy_selection_enabled ? '#173A2F' : colors.surfaceAlt,borderColor:releaseStatus.legacy_selection_enabled ? '#2F9E68' : colors.border}]}>
                  <Text style={[styles.legacyStateText,{color:releaseStatus.legacy_selection_enabled ? '#9CEFC1' : colors.muted}]}>{releaseStatus.legacy_selection_enabled ? 'ABERTA' : 'FECHADA'}</Text>
                </View>
              </View>

              <View style={styles.legacyAdminStats}>
                <View style={[styles.legacyAdminStat,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.legacyAdminValue,{color:colors.text}]}>{releaseStatus.selections.toLocaleString('pt-BR')}</Text><Text style={[styles.legacyAdminLabel,{color:colors.muted}]}>CARTAS SALVAS</Text></View>
                <View style={[styles.legacyAdminStat,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.legacyAdminValue,{color:'#65D894'}]}>{releaseStatus.submissions.toLocaleString('pt-BR')}</Text><Text style={[styles.legacyAdminLabel,{color:colors.muted}]}>CONTAS CONFIRMADAS</Text></View>
                <View style={[styles.legacyAdminStat,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.legacyAdminValue,{color:colors.yellow}]}>{releaseStatus.phase.toUpperCase()}</Text><Text style={[styles.legacyAdminLabel,{color:colors.muted}]}>FASE</Text></View>
              </View>

              <View style={[styles.preflightBox,{backgroundColor:colors.surfaceAlt,borderColor:releasePreflight ? (releasePreflight.ready ? '#2F9E68' : '#A84250') : colors.border}]}>
                <View style={styles.preflightHeader}>
                  <View style={[styles.preflightIcon,{backgroundColor:releasePreflight?.ready ? '#153426' : releasePreflight ? '#351A24' : colors.accentSoft}]}>
                    <Ionicons name={releasePreflight?.ready ? 'checkmark-done' : releasePreflight ? 'warning' : 'shield-outline'} size={20} color={releasePreflight?.ready ? '#65D894' : releasePreflight ? '#FF8A9A' : colors.yellow}/>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={[styles.preflightTitle,{color:colors.text}]}>{releasePreflight ? (releasePreflight.ready ? 'PRÉ-CHECK APROVADO' : 'PRÉ-CHECK COM PENDÊNCIAS') : 'AUDITORIA PRÉ-RESET'}</Text>
                    <Text style={[styles.preflightText,{color:colors.muted}]}>{releasePreflight ? `${releasePreflight.counts.players} contas • ${releasePreflight.counts.confirmedAccounts} legados confirmados • ${releasePreflight.counts.automaticCards} cartas automáticas • ${releasePreflight.counts.accountsAwaitingAutoFill} conta(s) ainda com vagas` : 'Verifica cartas, preenchimento automático, owner, Tester e liderança de guildas sem alterar nenhum dado.'}</Text>
                  </View>
                  <Pressable disabled={working} onPress={() => { void runReleasePreflightCheck(); }} style={[styles.preflightButton,{backgroundColor:colors.accentSoft,borderColor:colors.accent,opacity: working ? .55 : 1}]}>
                    <Ionicons name="scan" size={16} color={colors.accent}/>
                    <Text style={[styles.preflightButtonText,{color:colors.accent}]}>EXECUTAR</Text>
                  </Pressable>
                </View>
                {releasePreflight ? (
                  <View style={styles.issueGrid}>
                    {[
                      ['CARTAS AUSENTES',releasePreflight.issues.selectedCardsNotOwned],
                      ['CONTAGEM DIVERGENTE',releasePreflight.issues.submissionCountMismatch],
                      ['ACIMA DO LIMITE',releasePreflight.issues.playersOverCardLimit],
                      ['AUTO INCOMPLETO',releasePreflight.issues.legacyAutofillIncomplete],
                      ['TESTER INCONSISTENTE',releasePreflight.issues.testersMissingAchievement],
                      ['LÍDER DE GUILDA',releasePreflight.issues.guildLeaderMismatch],
                      ['OWNER',releasePreflight.issues.ownerCountInvalid],
                    ].map(([label,value]) => (
                      <View key={String(label)} style={[styles.issueItem,{borderColor:Number(value) ? '#A84250' : colors.border}]}>
                        <Text style={[styles.issueValue,{color:Number(value) ? '#FF8A9A' : '#65D894'}]}>{Number(value)}</Text>
                        <Text style={[styles.issueLabel,{color:colors.muted}]}>{String(label)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={[styles.releaseChecklist,{backgroundColor:colors.surfaceAlt,borderColor:releaseReadiness?.readyToReset ? '#2F9E68' : colors.border}]}>
                <View style={styles.resetPreviewHead}>
                  <View style={[styles.resetPreviewIcon,{backgroundColor:colors.accentSoft}]}>
                    <Ionicons name="checkmark-done-outline" size={20} color={colors.yellow}/>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={[styles.resetPreviewTitle,{color:colors.text}]}>CHECKLIST DE LANÇAMENTO 1.0</Text>
                    <Text style={[styles.resetPreviewText,{color:colors.muted}]}>Mostra as travas obrigatórias sem executar freeze, snapshot ou reset.</Text>
                  </View>
                  <Pressable disabled={working} onPress={() => { void loadReleaseReadiness(); }} style={[styles.preflightButton,{backgroundColor:colors.accentSoft,borderColor:colors.accent,opacity:working ? .55 : 1}]}>
                    <Ionicons name="refresh" size={16} color={colors.accent}/>
                    <Text style={[styles.preflightButtonText,{color:colors.accent}]}>ATUALIZAR</Text>
                  </Pressable>
                </View>

                <View style={[styles.releaseUrlBox,{borderColor:releaseStatus?.download_url ? '#2F9E68' : colors.border}]}>
                  <View style={{flex:1,minWidth:210}}>
                    <Text style={[styles.releaseUrlLabel,{color:colors.muted}]}>URL OFICIAL DO APK ATUAL</Text>
                    <TextInput
                      value={releaseDownloadUrl}
                      onChangeText={setReleaseDownloadUrlInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="https://expo.dev/.../TrainerCollection.apk"
                      placeholderTextColor={colors.muted}
                      style={[styles.releaseUrlInput,{color:colors.text,backgroundColor:colors.surface,borderColor:colors.border}]}
                    />
                    <Text style={[styles.releaseUrlHint,{color:colors.muted}]}>Aceita somente HTTPS oficial do Expo/GitHub terminando em .apk. Salvar o link não executa a migração.</Text>
                  </View>
                  <View style={styles.releaseUrlActions}>
                    <Pressable
                      disabled={working}
                      onPress={() => { void importReleaseDownloadUrlFromSite(); }}
                      style={[styles.releaseUrlImportButton,{backgroundColor:colors.accentSoft,borderColor:colors.accent,opacity:working ? .55 : 1}]}
                    >
                      <Ionicons name="cloud-download-outline" size={16} color={colors.accent}/>
                      <Text style={[styles.releaseUrlImportText,{color:colors.accent}]}>IMPORTAR DO SITE</Text>
                    </Pressable>
                    <Pressable
                      disabled={working}
                      onPress={() => { void saveReleaseDownloadUrl(); }}
                      style={[styles.releaseUrlButton,{backgroundColor:colors.yellow,opacity:working ? .55 : 1}]}
                    >
                      <Ionicons name="link" size={16} color="#07111F"/>
                      <Text style={styles.releaseUrlButtonText}>SALVAR APK</Text>
                    </Pressable>
                  </View>
                </View>

                {releaseReadiness ? (
                  <>
                    <View style={styles.checklistGrid}>
                      {[
                        ['APK / LINK',releaseReadiness.downloadUrlReady,'Link da versão 1.0 configurado'],
                        ['FREEZE',releaseReadiness.economyFrozen,'Economia congelada'],
                        ['MANUTENÇÃO',releaseReadiness.maintenanceEnabled,'Jogadores bloqueados'],
                        ['PRÉ-CHECK',releaseReadiness.preflightReady,'Auditoria aprovada'],
                        ['AUTO LEGADO',releaseReadiness.accountsAwaitingAutoFill === 0,`${releaseReadiness.accountsAwaitingAutoFill} conta(s) com vagas`],
                        ['FILAS',releaseReadiness.activeOperations === 0,`${releaseReadiness.activeOperations} operação(ões) ativa(s)`],
                        ['SNAPSHOT',releaseReadiness.snapshotPrepared,'Backup privado preparado'],
                      ].map(([label,ok,hint]) => (
                        <View key={String(label)} style={[styles.checklistItem,{borderColor:Boolean(ok) ? '#2F9E68' : colors.border}]}>
                          <View style={[styles.checklistDot,{backgroundColor:Boolean(ok) ? '#65D894' : '#66758A'}]}/>
                          <View style={{flex:1}}>
                            <Text style={[styles.checklistLabel,{color:colors.text}]}>{String(label)}</Text>
                            <Text style={[styles.checklistHint,{color:colors.muted}]}>{String(hint)}</Text>
                          </View>
                          <Ionicons name={Boolean(ok) ? 'checkmark-circle' : 'lock-closed'} size={16} color={Boolean(ok) ? '#65D894' : colors.muted}/>
                        </View>
                      ))}
                    </View>
                    <View style={[styles.resetReadyBadge,{backgroundColor:releaseReadiness.readyToReset ? '#153426' : '#2C2730',borderColor:releaseReadiness.readyToReset ? '#2F9E68' : colors.border}]}>
                      <Ionicons name={releaseReadiness.readyToReset ? 'checkmark-circle' : 'shield-outline'} size={16} color={releaseReadiness.readyToReset ? '#65D894' : colors.muted}/>
                      <Text style={[styles.resetReadyText,{color:releaseReadiness.readyToReset ? '#9CEFC1' : colors.muted}]}>{releaseReadiness.readyToReset ? 'TODAS AS TRAVAS PRONTAS — RESET CONTINUA MANUAL E NÃO EXECUTADO' : `FASE ATUAL: ${releaseReadiness.phase.toUpperCase()} • RESET BLOQUEADO`}</Text>
                    </View>
                  </>
                ) : null}
              </View>

              <View style={[styles.releaseOpsPanel,{backgroundColor:colors.surfaceAlt,borderColor:releaseStatus.phase === 'completed' ? '#2F9E68' : '#8A6A2D'}]}>
                <View style={styles.releaseOpsHeader}>
                  <View style={[styles.resetPreviewIcon,{backgroundColor:releaseStatus.phase === 'completed' ? '#153426' : '#352B16'}]}>
                    <Ionicons name="shield-checkmark" size={20} color={releaseStatus.phase === 'completed' ? '#65D894' : colors.yellow}/>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={[styles.resetPreviewTitle,{color:colors.text}]}>OPERAÇÃO FINAL DO RESET</Text>
                    <Text style={[styles.resetPreviewText,{color:colors.muted}]}>Sequência protegida: freeze → snapshot → reset → conferência → conclusão. Nenhuma etapa destrutiva roda sem confirmação.</Text>
                  </View>
                </View>

                <View style={styles.releaseOpsSteps}>
                  <Pressable
                    disabled={working || !['notice','legacy_selection','freeze'].includes(releaseStatus.phase)}
                    onPress={confirmBeginReleaseFreeze}
                    style={[styles.releaseOpsButton,{borderColor:colors.yellow,backgroundColor:'#352B16',opacity:working || releaseStatus.phase === 'completed' || releaseStatus.phase === 'update_required' ? .45 : 1}]}
                  >
                    <Ionicons name="snow" size={17} color={colors.yellow}/>
                    <Text style={[styles.releaseOpsButtonText,{color:colors.yellow}]}>1. INICIAR FREEZE + AUTO LEGADO</Text>
                  </Pressable>

                  <Pressable
                    disabled={working || !releaseReadiness?.economyFrozen || !releaseReadiness?.maintenanceEnabled || releaseReadiness?.snapshotPrepared}
                    onPress={() => { void prepareReleaseSnapshot(); }}
                    style={[styles.releaseOpsButton,{borderColor:colors.accent,backgroundColor:colors.accentSoft,opacity:working || !releaseReadiness?.economyFrozen || releaseReadiness?.snapshotPrepared ? .45 : 1}]}
                  >
                    <Ionicons name="archive" size={17} color={colors.accent}/>
                    <Text style={[styles.releaseOpsButtonText,{color:colors.accent}]}>2. CRIAR SNAPSHOT PRIVADO</Text>
                  </Pressable>
                </View>

                <Text style={[styles.releaseConfirmHint,{color:colors.muted}]}>
                  Para resetar: RESETAR 1.0 • para desfazer: RESTAURAR 1.0 • para liberar após conferir: CONCLUIR 1.0
                </Text>
                <TextInput
                  value={releaseDangerPhrase}
                  onChangeText={setReleaseDangerPhrase}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="Digite a frase de confirmação"
                  placeholderTextColor={colors.muted}
                  style={[styles.releaseConfirmInput,{color:colors.text,backgroundColor:colors.surface,borderColor:colors.border}]}
                />

                <Pressable
                  disabled={working || !releaseReadiness?.readyToReset}
                  onPress={confirmExecuteReleaseReset}
                  style={[styles.releaseResetButton,{opacity:working || !releaseReadiness?.readyToReset ? .42 : 1}]}
                >
                  <Ionicons name="warning" size={18} color="#fff"/>
                  <Text style={styles.releaseResetButtonText}>3. EXECUTAR RESET 1.0</Text>
                </Pressable>

                {releaseStatus.phase === 'update_required' ? (
                  <View style={styles.releaseAfterResetRow}>
                    <Pressable
                      disabled={working || !releaseSnapshotState?.usedSnapshotId}
                      onPress={confirmRestoreRelease}
                      style={[styles.releaseRestoreButton,{opacity:working || !releaseSnapshotState?.usedSnapshotId ? .42 : 1}]}
                    >
                      <Ionicons name="arrow-undo" size={17} color="#FFD7DD"/>
                      <Text style={styles.releaseRestoreText}>RESTAURAR SNAPSHOT</Text>
                    </Pressable>
                    <Pressable
                      disabled={working}
                      onPress={confirmCompleteRelease}
                      style={[styles.releaseCompleteButton,{opacity:working ? .45 : 1}]}
                    >
                      <Ionicons name="rocket" size={17} color="#07111F"/>
                      <Text style={styles.releaseCompleteText}>4. CONCLUIR E LIBERAR</Text>
                    </Pressable>
                  </View>
                ) : null}

                {releaseStatus.phase === 'completed' ? (
                  <View style={styles.releaseCompletedBadge}>
                    <Ionicons name="checkmark-circle" size={18} color="#65D894"/>
                    <Text style={styles.releaseCompletedText}>LANÇAMENTO CONCLUÍDO • ECONOMIA E SERVIDOR LIBERADOS</Text>
                  </View>
                ) : null}
              </View>

              <View style={[styles.resetPreviewBox,{backgroundColor:colors.surfaceAlt,borderColor:releaseResetPreview?.readyToReset ? '#2F9E68' : colors.border}]}>
                <View style={styles.resetPreviewHead}>
                  <View style={[styles.resetPreviewIcon,{backgroundColor:colors.accentSoft}]}>
                    <Ionicons name="calculator" size={20} color={colors.yellow}/>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={[styles.resetPreviewTitle,{color:colors.text}]}>IMPACTO DO RESET 1.0</Text>
                    <Text style={[styles.resetPreviewText,{color:colors.muted}]}>
                      {releaseResetPreview
                        ? `${releaseResetPreview.preserve.accounts} contas preservadas • ${releaseResetPreview.preserve.legacyCardRows} cartas de Legado • ${releaseResetPreview.activeOperations} operação(ões) ainda ativa(s)`
                        : 'Calcula o que será preservado e reiniciado sem modificar nenhuma conta.'}
                    </Text>
                  </View>
                  <Pressable disabled={working} onPress={() => { void loadReleaseResetPreview(); }} style={[styles.preflightButton,{backgroundColor:colors.accentSoft,borderColor:colors.accent,opacity: working ? .55 : 1}]}>
                    <Ionicons name="calculator-outline" size={16} color={colors.accent}/>
                    <Text style={[styles.preflightButtonText,{color:colors.accent}]}>CALCULAR</Text>
                  </Pressable>
                </View>
                {releaseResetPreview ? (
                  <>
                    <View style={styles.resetPreviewGrid}>
                      <View style={[styles.resetPreviewMetric,{borderColor:colors.border}]}>
                        <Text style={[styles.resetPreviewValue,{color:'#65D894'}]}>{releaseResetPreview.preserve.legacyCardRows.toLocaleString('pt-BR')}</Text>
                        <Text style={[styles.resetPreviewLabel,{color:colors.muted}]}>CARTAS PRESERVADAS</Text>
                      </View>
                      <View style={[styles.resetPreviewMetric,{borderColor:colors.border}]}>
                        <Text style={[styles.resetPreviewValue,{color:'#FF8A9A'}]}>{releaseResetPreview.reset.cardRowsRemoved.toLocaleString('pt-BR')}</Text>
                        <Text style={[styles.resetPreviewLabel,{color:colors.muted}]}>CARTAS REMOVIDAS</Text>
                      </View>
                      <View style={[styles.resetPreviewMetric,{borderColor:colors.border}]}>
                        <Text style={[styles.resetPreviewValue,{color:colors.yellow}]}>{releaseResetPreview.reset.decks.toLocaleString('pt-BR')}</Text>
                        <Text style={[styles.resetPreviewLabel,{color:colors.muted}]}>DECKS REINICIADOS</Text>
                      </View>
                      <View style={[styles.resetPreviewMetric,{borderColor:colors.border}]}>
                        <Text style={[styles.resetPreviewValue,{color:colors.text}]}>{releaseResetPreview.reset.achievementsExceptTester.toLocaleString('pt-BR')}</Text>
                        <Text style={[styles.resetPreviewLabel,{color:colors.muted}]}>CONQUISTAS RESET</Text>
                      </View>
                    </View>
                    <View style={[styles.resetEconomyRow,{borderColor:colors.border}]}>
                      <Text style={[styles.resetEconomyText,{color:colors.muted}]}>Economia atual: 🪙 {releaseResetPreview.economy.coinsBefore.toLocaleString('pt-BR')} • 💎 {releaseResetPreview.economy.diamondsBefore.toLocaleString('pt-BR')}</Text>
                      <Text style={[styles.resetEconomyText,{color:colors.text}]}>Após recompensa veterana: 🪙 {releaseResetPreview.economy.coinsAfterVeteranReward.toLocaleString('pt-BR')} • 💎 {releaseResetPreview.economy.diamondsAfterVeteranReward.toLocaleString('pt-BR')}</Text>
                    </View>
                    <View style={[styles.resetReadyBadge,{backgroundColor:releaseResetPreview.readyToReset ? '#153426' : '#2C2730',borderColor:releaseResetPreview.readyToReset ? '#2F9E68' : colors.border}]}>
                      <Ionicons name={releaseResetPreview.readyToReset ? 'checkmark-circle' : 'lock-closed'} size={16} color={releaseResetPreview.readyToReset ? '#65D894' : colors.muted}/>
                      <Text style={[styles.resetReadyText,{color:releaseResetPreview.readyToReset ? '#9CEFC1' : colors.muted}]}>{releaseResetPreview.readyToReset ? 'PRONTO TECNICAMENTE — RESET AINDA NÃO EXECUTADO' : 'RESET BLOQUEADO — SOMENTE PREVIEW'}</Text>
                    </View>
                  </>
                ) : null}
              </View>

              <View style={[styles.legacyProgressBox,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                <View style={styles.legacyProgressHeader}>
                  <View style={[styles.legacyProgressIcon,{backgroundColor:colors.accentSoft}]}>
                    <Ionicons name="people-circle-outline" size={21} color={colors.yellow}/>
                  </View>
                  <View style={{flex:1,minWidth:190}}>
                    <Text style={[styles.legacyProgressTitle,{color:colors.text}]}>ACOMPANHAMENTO DAS 10 CARTAS</Text>
                    <Text style={[styles.legacyProgressText,{color:colors.muted}]}>
                      {legacyProgress
                        ? `Atualizado ${new Date(legacyProgress.generatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} • atualização automática a cada 15s`
                        : 'Carregando o progresso individual dos jogadores.'}
                    </Text>
                  </View>
                  <Pressable
                    disabled={legacyProgressLoading}
                    onPress={() => { void refreshLegacyProgress(); }}
                    style={[styles.legacyProgressRefresh,{borderColor:colors.border,backgroundColor:colors.surface,opacity: legacyProgressLoading ? .55 : 1}]}
                  >
                    {legacyProgressLoading
                      ? <ActivityIndicator size="small" color={colors.accent}/>
                      : <Ionicons name="refresh" size={16} color={colors.accent}/>}
                    <Text style={[styles.legacyProgressRefreshText,{color:colors.accent}]}>ATUALIZAR</Text>
                  </Pressable>
                </View>

                {legacyProgress ? (
                  <>
                    <View style={styles.legacyProgressSummary}>
                      {[
                        ['10/10 ESCOLHIDAS',legacyProgress.summary.selectedTen,'#65D894'],
                        ['10/10 CONFIRMADAS',legacyProgress.summary.confirmedTen,'#8CEFB5'],
                        ['INCOMPLETOS',legacyProgress.summary.confirmedPartial + legacyProgress.summary.inProgress,colors.yellow],
                        ['NÃO COMEÇARAM',legacyProgress.summary.notStarted,'#8A98AA'],
                      ].map(([label,value,tone])=>(
                        <View key={String(label)} style={[styles.legacyProgressMetric,{borderColor:colors.border,backgroundColor:colors.surface}]}>
                          <Text style={[styles.legacyProgressMetricValue,{color:String(tone)}]}>{Number(value).toLocaleString('pt-BR')}</Text>
                          <Text style={[styles.legacyProgressMetricLabel,{color:colors.muted}]}>{String(label)}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.legacyProgressControls}>
                      <View style={[styles.legacyProgressSearchWrap,{backgroundColor:colors.surface,borderColor:colors.border}]}>
                        <Ionicons name="search" size={15} color={colors.muted}/>
                        <TextInput
                          value={legacyProgressSearch}
                          onChangeText={setLegacyProgressSearch}
                          placeholder="Buscar nickname"
                          placeholderTextColor={colors.muted}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={[styles.legacyProgressSearch,{color:colors.text}]}
                        />
                      </View>
                      <View style={styles.legacyProgressFilters}>
                        {[
                          ['all','TODOS'],
                          ['complete','10/10'],
                          ['incomplete','INCOMPLETOS'],
                          ['not_started','NÃO COMEÇARAM'],
                        ].map(([id,label])=>(
                          <Pressable
                            key={id}
                            onPress={()=>setLegacyProgressFilter(id as 'all'|'complete'|'incomplete'|'not_started')}
                            style={[
                              styles.legacyProgressFilter,
                              {
                                backgroundColor:legacyProgressFilter===id?colors.accentSoft:colors.surface,
                                borderColor:legacyProgressFilter===id?colors.accent:colors.border,
                              },
                            ]}
                          >
                            <Text style={[styles.legacyProgressFilterText,{color:legacyProgressFilter===id?colors.accent:colors.muted}]}>{label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    <View style={styles.legacyProgressList}>
                      {visibleLegacyProgressPlayers.map((row)=>{
                        const complete = row.selectedCount >= legacyProgress.campaign.legacyCardLimit && legacyProgress.campaign.legacyCardLimit > 0;
                        const statusColor = row.status==='complete_confirmed'
                          ? '#65D894'
                          : row.status==='complete_unconfirmed'
                            ? '#FFD447'
                            : row.status==='confirmed_partial'
                              ? '#7EC8FF'
                              : row.status==='in_progress'
                                ? '#E8B75A'
                                : '#8491A3';
                        const statusLabel = row.status==='complete_confirmed'
                          ? '10/10 CONFIRMADO'
                          : row.status==='complete_unconfirmed'
                            ? '10/10 • FALTA CONFIRMAR'
                            : row.status==='confirmed_partial'
                              ? `CONFIRMOU ${row.selectedCount}/${legacyProgress.campaign.legacyCardLimit}`
                              : row.status==='in_progress'
                                ? `ESCOLHENDO ${row.selectedCount}/${legacyProgress.campaign.legacyCardLimit}`
                                : 'NÃO COMEÇOU';
                        return (
                          <Pressable
                            key={row.playerId}
                            onPress={()=>router.push(`/player/${row.playerId}`)}
                            style={[styles.legacyProgressRow,{backgroundColor:colors.surface,borderColor:complete?statusColor:colors.border}]}
                          >
                            <View style={[styles.legacyProgressAvatar,{backgroundColor:colors.accentSoft,borderColor:statusColor}]}>
                              <Text style={[styles.legacyProgressAvatarText,{color:colors.text}]}>{row.username.slice(0,2).toUpperCase()}</Text>
                            </View>
                            <View style={styles.legacyProgressPlayerCopy}>
                              <View style={styles.legacyProgressNameRow}>
                                <Text numberOfLines={1} style={[styles.legacyProgressName,{color:colors.text}]}>@{row.username}</Text>
                                {row.accountStatus!=='active' ? <Text style={[styles.legacyProgressAccount,{color:'#FF9FAF'}]}>{row.accountStatus.toUpperCase()}</Text> : null}
                              </View>
                              <Text style={[styles.legacyProgressMeta,{color:colors.muted}]}>
                                Manual {row.manualCount} • Auto {row.automaticCount}
                                {row.confirmedAt ? ` • confirmado ${new Date(row.confirmedAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}` : row.lastSelectedAt ? ` • última escolha ${new Date(row.lastSelectedAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}` : ''}
                              </Text>
                            </View>
                            <View style={styles.legacyProgressRight}>
                              <Text style={[styles.legacyProgressCount,{color:statusColor}]}>{row.selectedCount}/{legacyProgress.campaign.legacyCardLimit}</Text>
                              <View style={[styles.legacyProgressStatus,{backgroundColor:statusColor+'1C',borderColor:statusColor}]}>
                                <Text style={[styles.legacyProgressStatusText,{color:statusColor}]}>{statusLabel}</Text>
                              </View>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.muted}/>
                          </Pressable>
                        );
                      })}
                      {visibleLegacyProgressPlayers.length===0 ? (
                        <View style={[styles.legacyProgressEmpty,{borderColor:colors.border}]}>
                          <Ionicons name="search-outline" size={18} color={colors.muted}/>
                          <Text style={[styles.legacyProgressEmptyText,{color:colors.muted}]}>Nenhum jogador corresponde a este filtro.</Text>
                        </View>
                      ) : null}
                    </View>
                  </>
                ) : null}
              </View>

              <View style={styles.legacyAdminActions}>
                <Pressable
                  disabled={working}
                  onPress={confirmLegacySelectionToggle}
                  style={[styles.legacyToggleButton,{backgroundColor:releaseStatus.legacy_selection_enabled ? '#C74658' : colors.yellow,opacity: working ? .55 : 1}]}
                >
                  <Ionicons name={releaseStatus.legacy_selection_enabled ? 'pause' : 'play'} size={18} color={releaseStatus.legacy_selection_enabled ? '#fff' : '#07111F'}/>
                  <Text style={[styles.legacyToggleText,{color:releaseStatus.legacy_selection_enabled ? '#fff' : '#07111F'}]}>{releaseStatus.legacy_selection_enabled ? 'PAUSAR ESCOLHA' : 'LIBERAR ESCOLHA'}</Text>
                </Pressable>
                {releaseStatus.legacy_selection_enabled ? (
                  <Pressable onPress={() => router.push('/legacy-selection')} style={[styles.legacyPreviewButton,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                    <Ionicons name="eye" size={17} color={colors.accent}/>
                    <Text style={[styles.legacyPreviewText,{color:colors.text}]}>ABRIR MINHA TELA</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={[styles.legacySafety,{color:colors.muted}]}>Este controle não reseta contas, não distribui a recompensa e não congela a economia.</Text>
            </View>
          ) : null}

          {hasAdminPermission('audit_users') ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/admin-audit')}
            style={[styles.auditLaunch, { backgroundColor: colors.surface, borderColor: colors.yellow }]}
          >
            <View style={[styles.auditLaunchIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="analytics" size={23} color={colors.yellow} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.auditLaunchTitle, { color: colors.text }]}>Auditoria & Equipe Admin</Text>
              <Text style={[styles.auditLaunchText, { color: colors.muted }]}>
                Investigue contas, veja histórico de packs/economia e configure permissões dos admins de confiança.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.yellow} />
          </Pressable>
          ) : null}


          {hasAdminPermission('maintenance_manage') ? (
          <CollapsibleSection title="Modo Manutenção">
          <View
            style={[
              styles.grantPanel,
              {
                backgroundColor: colors.surface,
                borderColor: maintenanceStatus?.maintenance_enabled ? '#FF6475' : '#2F9E68',
              },
            ]}
          >
            <View style={styles.moderationHeader}>
              <View
                style={[
                  styles.moderationIcon,
                  { backgroundColor: maintenanceStatus?.maintenance_enabled ? '#351A24' : '#153426' },
                ]}
              >
                <Ionicons
                  name={maintenanceStatus?.maintenance_enabled ? 'warning' : 'shield-checkmark'}
                  size={23}
                  color={maintenanceStatus?.maintenance_enabled ? '#FF8290' : '#65D894'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moderationTitle, { color: colors.text }]}>
                  {maintenanceStatus?.maintenance_enabled ? 'APLICATIVO PAUSADO' : 'JOGO FUNCIONANDO'}
                </Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  {maintenanceStatus?.maintenance_enabled
                    ? 'Somente administradores continuam com acesso para corrigir e liberar o jogo.'
                    : 'Use este botão de emergência ao descobrir um bug grave ou iniciar uma atualização.'}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  maintenanceStatus?.maintenance_enabled ? styles.statusBanned : styles.statusActive,
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {maintenanceStatus?.maintenance_enabled ? 'PAUSADO' : 'ONLINE'}
                </Text>
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>MENSAGEM PARA OS JOGADORES</Text>
            <TextInput
              value={maintenanceMessage}
              onChangeText={setMaintenanceMessage}
              placeholder="Explique que o jogo está sendo atualizado"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={500}
              textAlignVertical="top"
              style={[
                styles.input,
                {
                  minHeight: 88,
                  paddingTop: 12,
                  color: colors.text,
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.border,
                },
              ]}
            />

            {maintenanceStatus?.enabled_at ? (
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                Pausado desde {new Date(maintenanceStatus.enabled_at).toLocaleString('pt-BR')}.
              </Text>
            ) : null}

            <Pressable
              disabled={working || (!maintenanceStatus?.maintenance_enabled && !maintenanceMessage.trim())}
              onPress={() => {
                if (maintenanceStatus?.maintenance_enabled) {
                  void applyMaintenanceMode(false);
                } else {
                  confirmMaintenanceMode();
                }
              }}
              style={[
                styles.grantButton,
                {
                  backgroundColor: maintenanceStatus?.maintenance_enabled ? '#C74658' : '#FFD447',
                  opacity: working ? 0.55 : 1,
                },
              ]}
            >
              <Ionicons
                name={maintenanceStatus?.maintenance_enabled ? 'play' : 'pause'}
                size={20}
                color={maintenanceStatus?.maintenance_enabled ? '#FFFFFF' : '#07111F'}
              />
              <Text
                style={[
                  styles.grantButtonText,
                  { color: maintenanceStatus?.maintenance_enabled ? '#FFFFFF' : '#07111F' },
                ]}
              >
                {maintenanceStatus?.maintenance_enabled ? 'LIBERAR APLICATIVO' : 'PAUSAR PARA ATUALIZAÇÃO'}
              </Text>
            </Pressable>
          </View>

                    </CollapsibleSection>
          ) : null}
          {hasAdminPermission('guilds_manage') ? (
          <CollapsibleSection title="Liderança das Guildas">
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: selectedGuild?.color ?? colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>ESCOLHA UMA DAS 4 GUILDAS</Text>
            <View style={styles.quickRow}>
              {(guildHub?.guilds ?? []).map((guild) => (
                <Pressable
                  key={guild.id}
                  onPress={() => setSelectedGuildId(guild.id)}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor: selectedGuildId === guild.id ? guild.color : colors.surfaceAlt,
                      borderColor: guild.color,
                    },
                  ]}
                >
                  <Text style={[styles.quickText, { color: selectedGuildId === guild.id ? '#fff' : colors.text }]}>
                    {guild.name.replace('Guilda ', '').toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {selectedGuild ? (
              <View style={[styles.notice, { backgroundColor: selectedGuild.color + '18', borderColor: selectedGuild.color }]}>
                <Ionicons name="shield" size={20} color={selectedGuild.color} />
                <Text style={[styles.noticeText, { color: colors.text }]}>
                  {selectedGuild.leaderUsername ? `Chefe atual: @${selectedGuild.leaderUsername}` : 'Nenhum chefe escolhido'}
                </Text>
              </View>
            ) : null}

            <TextInput
              value={guildLeaderSearch}
              onChangeText={setGuildLeaderSearch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Buscar jogador para nomear como chefe"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />

            <View style={styles.friendChips}>
              {visibleGuildLeaders.map((player) => {
                const current = selectedGuild?.leaderId === player.id;
                return (
                  <Pressable
                    key={player.id}
                    disabled={working}
                    onPress={() => { void chooseGuildLeader(player.id); }}
                    style={[
                      styles.friendChip,
                      {
                        backgroundColor: current ? (selectedGuild?.color ?? colors.accent) + '28' : colors.surfaceAlt,
                        borderColor: current ? selectedGuild?.color ?? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.friendChipText, { color: colors.text }]}>
                      @{player.username}{current ? ' • CHEFE' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {selectedGuild?.leaderId ? (
              <Pressable
                disabled={working}
                onPress={() => { void chooseGuildLeader(null); }}
                style={[styles.quickChip, { alignSelf: 'flex-start', backgroundColor: '#351A24', borderColor: '#683243' }]}
              >
                <Text style={[styles.quickText, { color: '#FF9FAF' }]}>REMOVER CHEFE ATUAL</Text>
              </Pressable>
            ) : null}
          </View>

                    </CollapsibleSection>
          ) : null}
          <CollapsibleSection title="Visão geral">
          <View style={styles.metricGrid}>
            <Metric icon="people" label="USUÁRIOS" value={overview.users.total} hint={`+${overview.users.created24h} em 24h`} />
            <Metric icon="wallet" label="MOEDAS EM CIRCULAÇÃO" value={overview.users.coinsInCirculation} coin />
            <Metric icon="albums" label="CARDS NO CATÁLOGO" value={overview.catalog.cards} />
            <Metric icon="cash" label="CARDS COM PREÇO USD" value={overview.catalog.cardsWithUsdPrice} hint={`${overview.catalog.ownedCardsWithUsdPrice}/${overview.catalog.ownedUniqueCards} cards possuídos • ${Number(overview.catalog.ownedPriceCoveragePct ?? 0).toFixed(0)}%`} />
            <Metric icon="layers" label="CÓPIAS EM CONTAS" value={overview.catalog.ownedCardCopies} />
            <Metric icon="diamond" label="VALOR GLOBAL DAS COLEÇÕES" valueText={formatUsd(overview.catalog.ownedMarketValueUsd)} />
          </View>

                    </CollapsibleSection>
          <CollapsibleSection title="Saúde da Economia 2.0">
            {economyHealth ? (
              <View style={[styles.economyHealthPanel,{backgroundColor:colors.surface,borderColor:economyHealth.status==='healthy'?'#2F9E68':economyHealth.status==='watch'?'#D9A441':'#A84250'}]}>
                <View style={styles.economyHealthHeader}>
                  <View style={[styles.economyHealthIcon,{backgroundColor:economyHealth.status==='healthy'?'#153426':economyHealth.status==='watch'?'#362B13':'#351A24'}]}>
                    <Ionicons name={economyHealth.status==='healthy'?'shield-checkmark':economyHealth.status==='watch'?'warning':'alert-circle'} size={22} color={economyHealth.status==='healthy'?'#65D894':economyHealth.status==='watch'?'#FFD447':'#FF8290'}/>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={[styles.economyHealthTitle,{color:colors.text}]}>Economy 2.1 • {economyHealth.status==='healthy'?'SAUDÁVEL':economyHealth.status==='watch'?'ATENÇÃO':'CRÍTICA'}</Text>
                    <Text style={[styles.economyHealthText,{color:colors.muted}]}>Janela móvel de {economyHealth.windowDays} dias • burn/mint conhecido {economyHealth.burnToMintRatio==null?'—':(economyHealth.burnToMintRatio*100).toFixed(1)+'%'} • média 🪙 {Number(economyHealth.coinsPerActivePlayer??0).toLocaleString('pt-BR')} por jogador ativo</Text>
                  </View>
                  <Pressable disabled={economyAdvisorLoading} onPress={()=>{void refreshEconomyAdvisor();}} style={[styles.economyRefreshButton,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
                    {economyAdvisorLoading?<ActivityIndicator size="small" color={colors.accent}/>:<Ionicons name="analytics" size={15} color={colors.accent}/>}
                    <Text style={[styles.economyRefreshText,{color:colors.accent}]}>REANALISAR</Text>
                  </Pressable>
                </View>
                <View style={styles.metricGrid}>
                  <Metric icon="wallet" label="COINS EM CIRCULAÇÃO" value={economyHealth.balances.coins} coin />
                  <Metric icon="arrow-up-circle" label="COINS CRIADAS" value={economyHealth.knownMint.total} hint="fontes conhecidas na janela" />
                  <Metric icon="flame" label="COINS REMOVIDAS" value={economyHealth.knownBurn.total} hint="packs + taxas + sinks permanentes" />
                  <Metric icon="cube" label="PACK MEDIANO" value={Number(economyHealth.packPrices.coinMedian??0)} coin />
                </View>
                <View style={[styles.economyFlowBox,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                  <Text style={[styles.economyFlowTitle,{color:colors.text}]}>FONTES • 7 DIAS</Text>
                  <Text style={[styles.economyFlowText,{color:colors.muted}]}>Missões 🪙 {economyHealth.knownMint.missions.toLocaleString('pt-BR')} • Passe 🪙 {economyHealth.knownMint.battlePass.toLocaleString('pt-BR')} • Guilda 🪙 {economyHealth.knownMint.guild.toLocaleString('pt-BR')} • Repetidas 🪙 {economyHealth.knownMint.duplicates.toLocaleString('pt-BR')} • Códigos 🪙 {economyHealth.knownMint.codes.toLocaleString('pt-BR')}</Text>
                  <Text style={[styles.economyFlowTitle,{color:colors.text,marginTop:7}]}>SUMIDOUROS • 7 DIAS</Text>
                  <Text style={[styles.economyFlowText,{color:colors.muted}]}>Packs 🪙 {economyHealth.knownBurn.packs.toLocaleString('pt-BR')} • Mercado 🪙 {economyHealth.knownBurn.marketFees.toLocaleString('pt-BR')} • Diamantes 🪙 {economyHealth.knownBurn.diamondExchange.toLocaleString('pt-BR')} • Ginásios 🪙 {economyHealth.knownBurn.gymHealing.toLocaleString('pt-BR')} • Permanentes 🪙 {Number(economyHealth.knownBurn.permanentSinks??0).toLocaleString('pt-BR')}</Text>
                </View>

                {Object.keys(economyHealth.sinkBreakdown??{}).length ? (
                  <View style={[styles.economyAdvisorBox,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                    <Text style={[styles.economyFlowTitle,{color:colors.text}]}>SINKS PERMANENTES MAIS USADOS</Text>
                    {Object.entries(economyHealth.sinkBreakdown).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,6).map(([key,value])=>(
                      <View key={key} style={styles.economyAdvisorRow}>
                        <Text style={[styles.economyAdvisorType,{color:colors.muted}]}>{key.replaceAll('_',' ').toUpperCase()}</Text>
                        <Text style={[styles.economyAdvisorValue,{color:colors.yellow}]}>🪙 {Number(value).toLocaleString('pt-BR')}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {(economyAdvisor?.alerts.length??0)>0 ? (
                  <View style={styles.economyAdvisorStack}>
                    {economyAdvisor!.alerts.map((alert)=>(
                      <View key={alert.id} style={[styles.economyAlert,{backgroundColor:alert.severity==='critical'?'#351A24':alert.severity==='watch'?'#362B13':colors.surfaceAlt,borderColor:alert.severity==='critical'?'#A84250':alert.severity==='watch'?'#D9A441':colors.border}]}>
                        <Ionicons name={alert.severity==='critical'?'alert-circle':alert.severity==='watch'?'warning':'information-circle'} size={17} color={alert.severity==='critical'?'#FF8290':alert.severity==='watch'?'#FFD447':colors.accent}/>
                        <Text style={[styles.economyAlertText,{color:colors.text}]}>{alert.message}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {(economyAdvisor?.recommendations.length??0)>0 ? (
                  <View style={[styles.economyAdvisorBox,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                    <View style={styles.economyAdviceHeader}><Ionicons name="bulb" size={17} color={colors.yellow}/><Text style={[styles.economyFlowTitle,{color:colors.text}]}>RECOMENDAÇÕES AUTOMÁTICAS • NÃO APLICADAS</Text></View>
                    {economyAdvisor!.recommendations.map((rec)=>(
                      <View key={rec.id} style={[styles.economyAdviceCard,{borderColor:colors.border}]}>
                        <Text style={[styles.economyAdvisorType,{color:colors.accent}]}>{rec.type.replaceAll('_',' ').toUpperCase()}</Text>
                        <Text style={[styles.economyFlowText,{color:colors.muted}]}>{rec.rationale}</Text>
                        {rec.suggestedValue!=null?<Text style={[styles.economyAdvisorValue,{color:colors.yellow}]}>Sugestão: {Number(rec.suggestedValue).toFixed(2)}×</Text>:null}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.economyHealthText,{color:'#65D894'}]}>Nenhum ajuste econômico recomendado neste momento.</Text>
                )}

                <View style={[styles.softCapStatus,{backgroundColor:economyHealth.softCap?.enabled?'#3B2313':'#153426',borderColor:economyHealth.softCap?.enabled?'#D97732':'#2F9E68'}]}>
                  <Ionicons name={economyHealth.softCap?.enabled?'speedometer':'shield-checkmark'} size={16} color={economyHealth.softCap?.enabled?'#FFD447':'#65D894'}/>
                  <Text style={[styles.economyHealthText,{color:economyHealth.softCap?.enabled?'#FFE4B8':'#9CEFC1',flex:1}]}>Soft cap: {economyHealth.softCap?.enabled?'ATIVO':'DESATIVADO'} • limite preparado 🪙 {Number(economyHealth.softCap?.dailyCoins??0).toLocaleString('pt-BR')} / dia. O sistema só recomenda revisão em inflação extrema; nunca ativa sozinho.</Text>
                </View>

                {releaseStatus?.phase!=='completed'?<Text style={[styles.economyHealthText,{color:colors.muted}]}>O indicador ainda inclui atividade do Beta. Depois do reset, a janela passa a respeitar o novo marco da economia 1.0.</Text>:null}
              </View>
            ) : (
              <Text style={[styles.emptyText,{color:colors.muted}]}>Monitor econômico indisponível.</Text>
            )}
          </CollapsibleSection>
          <CollapsibleSection title="Packs e atividade">
          <View style={styles.metricGrid}>
            <Metric icon="cube" label="PACKS ATIVOS" value={overview.packs.active} hint={`${overview.packs.withPhysicalArt} com packshot`} />
            <Metric icon="gift" label="PACKS ABERTOS" value={overview.packs.openings} hint={`${overview.packs.openings24h} em 24h`} />
            <Metric icon="chatbubble-ellipses" label="MENSAGENS" value={overview.social.messages} hint={`${overview.social.messages24h} em 24h`} />
            <Metric icon="people-circle" label="AMIZADES" value={overview.social.friendshipsAccepted} hint={`${overview.social.friendRequestsPending} pendentes`} />
            <Metric icon="swap-horizontal" label="TROCAS" value={overview.trades.total} hint={`${overview.trades.completed} concluídas`} />
            <Metric icon="game-controller" label="BATALHAS" value={overview.battles.total} hint={`${overview.battles.active} ativas • ${overview.battles.completed} concluídas`} />
          </View>

                    </CollapsibleSection>
          <CollapsibleSection title="Sistema">
          <View style={styles.metricGrid}>
            <Metric icon="albums-outline" label="DECKS" value={overview.progression.decks} />
            <Metric icon="today" label="MISSÕES DIÁRIAS" value={overview.progression.dailyMissions} />
            <Metric icon="notifications" label="NOTIFICAÇÕES" value={overview.progression.notifications} hint={`${overview.progression.pendingPush} push pendentes`} />
            <Metric icon="phone-portrait" label="PUSH TOKENS" value={overview.progression.pushTokensEnabled} />
            <Metric icon="document-text" label="EVENTOS DE BATALHA" value={overview.battles.events} />
            <Metric icon="construct" label="AÇÕES ADMIN" value={overview.admin.coinGrants} hint={`🪙 ${overview.admin.coinsGrantedTotal.toLocaleString('pt-BR')} concedidas`} />
          </View>

          <View style={[styles.marketPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.marketHeader}>
              <View style={[styles.marketIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="lock-closed" size={22} color={colors.yellow} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.marketTitle, { color: colors.text }]}>Tabela de valores fixa</Text>
                <Text style={[styles.marketText, { color: colors.muted }]}>
                  {overview.catalog.cardsWithUsdPrice.toLocaleString('pt-BR')} de {overview.catalog.cards.toLocaleString('pt-BR')} cards possuem preço em USD. O catálogo está sendo revisado por set com o snapshot do TCGplayer.
                </Text>
              </View>
            </View>
          </View>

                    </CollapsibleSection>
          {hasAdminPermission('announcements_manage') ? (
          <CollapsibleSection title="Anúncio global em tempo real">
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Cada anúncio aparece somente uma vez por conta. Você pode encerrá-lo antes do prazo pelo botão abaixo.
            </Text>

            {activeAnnouncement ? (
              <View style={[styles.moderationBox, { backgroundColor: colors.surfaceAlt, borderColor: '#FF8290' }]}>
                <View style={styles.moderationStatusRow}>
                  <Ionicons name="megaphone" size={19} color="#FF8290" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyUser, { color: colors.text }]}>
                      ATIVO: {activeAnnouncement.title}
                    </Text>
                    <Text style={[styles.historyMeta, { color: colors.muted }]}>
                      {activeAnnouncement.ends_at
                        ? `Programado até ${new Date(activeAnnouncement.ends_at).toLocaleString('pt-BR')}`
                        : 'Ativo até ser encerrado'}
                    </Text>
                  </View>
                </View>
                <Pressable
                  disabled={working}
                  onPress={confirmStopAnnouncement}
                  style={[
                    styles.grantButton,
                    { backgroundColor: '#C74658', opacity: working ? 0.6 : 1 },
                  ]}
                >
                  <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
                  <Text style={[styles.grantButtonText, { color: '#FFFFFF' }]}>
                    PARAR ANÚNCIO GLOBAL
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.notice, { backgroundColor: '#142C23', borderColor: '#4A9B70' }]}>
                <Ionicons name="checkmark-circle" size={18} color="#65D894" />
                <Text style={[styles.noticeText, { color: '#C7F4DA' }]}>Nenhum anúncio global ativo.</Text>
              </View>
            )}

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>TÍTULO</Text>
            <TextInput
              value={announcementTitle}
              onChangeText={setAnnouncementTitle}
              placeholder="Ex.: Manutenção concluída"
              placeholderTextColor={colors.muted}
              maxLength={80}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>MENSAGEM</Text>
            <TextInput
              value={announcementBody}
              onChangeText={setAnnouncementBody}
              placeholder="Mensagem que aparecerá para todos os jogadores"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={500}
              textAlignVertical="top"
              style={[styles.input, { minHeight: 96, paddingTop: 12, color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>IMPORTÂNCIA</Text>
            <View style={styles.quickRow}>
              {([
                { id: 'info', label: 'INFORMAÇÃO' },
                { id: 'warning', label: 'ATENÇÃO' },
                { id: 'critical', label: 'URGENTE' },
              ] as const).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setAnnouncementSeverity(item.id)}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor: announcementSeverity === item.id ? colors.yellow : colors.surfaceAlt,
                      borderColor: announcementSeverity === item.id ? colors.yellow : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.quickText, { color: announcementSeverity === item.id ? '#07111F' : colors.text }]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>DURAÇÃO</Text>
            <View style={styles.quickRow}>
              {[1, 6, 24, 72].map((hours) => (
                <Pressable
                  key={hours}
                  onPress={() => setAnnouncementHours(String(hours))}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor: Number(announcementHours) === hours ? colors.yellow : colors.surfaceAlt,
                      borderColor: Number(announcementHours) === hours ? colors.yellow : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.quickText, { color: Number(announcementHours) === hours ? '#07111F' : colors.text }]}>
                    {hours}H
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              disabled={!announcementTitle.trim() || !announcementBody.trim() || working}
              onPress={() => { void sendAnnouncement(); }}
              style={[
                styles.grantButton,
                {
                  backgroundColor: announcementTitle.trim() && announcementBody.trim() ? colors.yellow : colors.surfaceAlt,
                  opacity: working ? .75 : 1,
                },
              ]}
            >
              <Ionicons name="megaphone" size={20} color="#07111F" />
              <Text style={styles.grantButtonText}>PUBLICAR PARA TODOS</Text>
            </Pressable>
          </View>

                    </CollapsibleSection>
          ) : null}
          {hasAdminPermission('events_manage') ? (
          <CollapsibleSection title="Admin Abuse">
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {activeEvent ? (
              <View style={[styles.notice, { backgroundColor: '#142C23', borderColor: '#4A9B70' }]}>
                <Ionicons name="gift" size={20} color="#65D894" />
                <Text style={[styles.noticeText, { color: colors.text }]}>
                  ADMIN ABUSE ATIVO • 🪙 Coins grátis • 💎 Diamantes 50% OFF • termina em {activeEventRemaining}
                </Text>
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                Ative um período em que boosters de 🪙 Coins ficam grátis e boosters de 💎 Diamantes custam metade do preço. Valores ímpares de Diamantes são arredondados para cima.
              </Text>
            )}

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>DURAÇÃO DA PROMOÇÃO</Text>
            <View style={styles.quickRow}>
              {[1, 5, 10, 30, 60].map((minutes) => (
                <Pressable
                  key={minutes}
                  onPress={() => setFreeBoosterMinutes(String(minutes))}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor: Number(freeBoosterMinutes) === minutes ? colors.yellow : colors.surfaceAlt,
                      borderColor: Number(freeBoosterMinutes) === minutes ? colors.yellow : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.quickText, { color: Number(freeBoosterMinutes) === minutes ? '#07111F' : colors.text }]}>
                    {minutes}MIN
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={freeBoosterMinutes}
              onChangeText={(value) => setFreeBoosterMinutes(value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="Duração em minutos"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />

            <Pressable
              disabled={working || Number(freeBoosterMinutes) < 1}
              onPress={() => { void activateFreeBoosters(); }}
              style={[styles.grantButton, { backgroundColor: colors.yellow, opacity: working ? .75 : 1 }]}
            >
              <Ionicons name="flash" size={20} color="#07111F" />
              <Text style={styles.grantButtonText}>
                {activeEvent ? 'REINICIAR ADMIN ABUSE' : 'ATIVAR ADMIN ABUSE'}
              </Text>
            </Pressable>

            {activeEvent ? (
              <Pressable
                disabled={working}
                onPress={() => { void deactivateFreeBoosters(); }}
                style={[styles.grantButton, { backgroundColor: '#FF6B81', opacity: working ? .75 : 1 }]}
              >
                <Ionicons name="stop-circle" size={20} color="#07111F" />
                <Text style={styles.grantButtonText}>ENCERRAR AGORA</Text>
              </Pressable>
            ) : null}
          </View>

                    </CollapsibleSection>
          ) : null}
          {hasAdminPermission('moderate_users') ? (
          <CollapsibleSection title="Moderação de usuários">
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: '#A84250' }]}>
            <View style={styles.moderationHeader}>
              <View style={styles.moderationIcon}>
                <Ionicons name="shield-checkmark" size={22} color="#FF8D9B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moderationTitle, { color: colors.text }]}>Controle de contas</Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  Aplique advertência, suspensão temporária, banimento ou restaure uma conta.
                </Text>
              </View>
            </View>

            <TextInput
              value={moderationSearch}
              onChangeText={setModerationSearch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Buscar jogador para moderar"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />

            <View style={styles.friendChips}>
              {visibleModerationPlayers.slice(0, 20).map((player) => {
                const active = moderationTargetId === player.id;
                return (
                  <Pressable
                    key={`moderation-${player.id}`}
                    onPress={() => setModerationTargetId(player.id)}
                    style={[
                      styles.friendChip,
                      {
                        backgroundColor: active ? '#351A24' : colors.surfaceAlt,
                        borderColor: active ? '#FF6B81' : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.friendChipText, { color: active ? '#FFB2BD' : colors.text }]}>
                      @{player.username}{player.id === selfId ? ' (você)' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {moderationTarget ? (
              <View style={[styles.moderationBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <View style={styles.moderationStatusRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.moderationTargetName, { color: colors.text }]}>@{moderationTarget.username}</Text>
                    <Text style={[styles.emptyText, { color: colors.muted }]}>
                      Nível {moderationTarget.level} • {moderationTarget.warning_count ?? 0} aviso(s)
                    </Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    moderationTarget.account_status === 'banned'
                      ? styles.statusBanned
                      : moderationTarget.account_status === 'suspended'
                        ? styles.statusSuspended
                        : styles.statusActive,
                  ]}>
                    <Text style={styles.statusBadgeText}>
                      {moderationTarget.account_status === 'banned'
                        ? 'BANIDO'
                        : moderationTarget.account_status === 'suspended'
                          ? 'SUSPENSO'
                          : 'ATIVO'}
                    </Text>
                  </View>
                </View>

                {moderationTarget.suspended_until ? (
                  <Text style={[styles.emptyText, { color: '#FFB16A' }]}>
                    Suspenso até {new Date(moderationTarget.suspended_until).toLocaleString('pt-BR')}
                  </Text>
                ) : null}
                {moderationTarget.moderation_reason ? (
                  <Text style={[styles.emptyText, { color: colors.muted }]}>
                    Motivo atual: {moderationTarget.moderation_reason}
                  </Text>
                ) : null}

                <TextInput
                  value={moderationReason}
                  onChangeText={setModerationReason}
                  placeholder="Motivo da moderação"
                  placeholderTextColor={colors.muted}
                  maxLength={500}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
                />

                <View style={styles.suspensionRow}>
                  <TextInput
                    value={suspensionHours}
                    onChangeText={(value) => setSuspensionHours(value.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="Horas"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, styles.moderationHours, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
                  />
                  {[1, 6, 24, 72, 168].map((hours) => (
                    <Pressable
                      key={hours}
                      onPress={() => setSuspensionHours(String(hours))}
                      style={[
                        styles.quickChip,
                        {
                          backgroundColor: Number(suspensionHours) === hours ? '#3B2313' : colors.surface,
                          borderColor: Number(suspensionHours) === hours ? '#D97732' : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.quickText, { color: Number(suspensionHours) === hours ? '#FFB16A' : colors.text }]}>
                        {hours}H
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.moderationActions}>
                  <Pressable
                    disabled={working || moderationTarget.id === selfId}
                    onPress={() => { void moderateSelected('warn'); }}
                    style={[styles.moderationAction, styles.warnAction, (working || moderationTarget.id === selfId) && styles.disabledAction]}
                  >
                    <Ionicons name="warning" size={18} color="#FFD36B" />
                    <Text style={[styles.moderationActionText, { color: '#FFD36B' }]}>AVISAR</Text>
                  </Pressable>
                  <Pressable
                    disabled={working || moderationTarget.id === selfId}
                    onPress={() => { void moderateSelected('suspend'); }}
                    style={[styles.moderationAction, styles.suspendAction, (working || moderationTarget.id === selfId) && styles.disabledAction]}
                  >
                    <Ionicons name="time" size={18} color="#FFB16A" />
                    <Text style={[styles.moderationActionText, { color: '#FFB16A' }]}>SUSPENDER</Text>
                  </Pressable>
                  <Pressable
                    disabled={working || moderationTarget.id === selfId}
                    onPress={() => { void moderateSelected('ban'); }}
                    style={[styles.moderationAction, styles.banAction, (working || moderationTarget.id === selfId) && styles.disabledAction]}
                  >
                    <Ionicons name="ban" size={18} color="#FF8D9B" />
                    <Text style={[styles.moderationActionText, { color: '#FF8D9B' }]}>BANIR</Text>
                  </Pressable>
                  <Pressable
                    disabled={working || moderationTarget.id === selfId}
                    onPress={() => { void moderateSelected('restore'); }}
                    style={[styles.moderationAction, styles.restoreAction, (working || moderationTarget.id === selfId) && styles.disabledAction]}
                  >
                    <Ionicons name="refresh-circle" size={18} color="#6DDAA2" />
                    <Text style={[styles.moderationActionText, { color: '#6DDAA2' }]}>RESTAURAR</Text>
                  </Pressable>
                </View>

                {moderationTarget.id === selfId ? (
                  <Text style={[styles.emptyText, { color: '#FF9FAF' }]}>
                    Ações de moderação na própria conta estão bloqueadas.
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhum jogador selecionado.</Text>
            )}
          </View>

                    </CollapsibleSection>
          ) : null}
          {hasAdminPermission('events_manage') ? (
          <CollapsibleSection title="Eventos ao vivo">
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: '#9B7BFF' }]}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Crie eventos temporários que mudam a experiência do jogo em tempo real.
            </Text>
            <View style={styles.quickRow}>
              {([
                ['double_xp','DOUBLE XP'],
                ['rare_boost','RARE BOOST'],
                ['featured_set','FEATURED SET'],
              ] as const).map(([value,label]) => (
                <Pressable key={value} onPress={() => {
                  setEventType(value);
                  setEventTitle(value === 'double_xp' ? 'Double XP' : value === 'rare_boost' ? 'Rare Boost' : 'Featured Set');
                }} style={[styles.quickChip, { backgroundColor: eventType===value ? '#281F4C' : colors.surfaceAlt, borderColor: eventType===value ? '#9B7BFF' : colors.border }]}>
                  <Text style={[styles.quickText, { color: eventType===value ? '#CBBEFF' : colors.text }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput value={eventTitle} onChangeText={setEventTitle} placeholder="Nome do evento" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
            <View style={styles.formSplit}>
              <TextInput value={eventMinutes} onChangeText={(v)=>setEventMinutes(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder="Minutos" placeholderTextColor={colors.muted} style={[styles.input,{flexGrow:1,minWidth:120,color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
              {eventType !== 'double_xp' ? <TextInput value={eventMultiplier} onChangeText={setEventMultiplier} keyboardType="decimal-pad" placeholder="Multiplicador (1.5)" placeholderTextColor={colors.muted} style={[styles.input,{flexGrow:1,minWidth:150,color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/> : null}
            </View>
            {eventType === 'featured_set' ? <TextInput value={eventSetId} onChangeText={setEventSetId} autoCapitalize="none" placeholder="ID do set (ex.: sv3pt5)" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/> : null}
            <Pressable disabled={working} onPress={() => { void activateGameEvent(); }} style={[styles.grantButton,{backgroundColor:'#9B7BFF',opacity:working?.7:1}]}>
              <Ionicons name="sparkles" size={20} color="#07111F"/><Text style={styles.grantButtonText}>ATIVAR EVENTO</Text>
            </Pressable>
            {gameEvents.length ? <View style={styles.friendChips}>{gameEvents.map((event)=><View key={event.id} style={[styles.friendChip,{backgroundColor:colors.surfaceAlt,borderColor:'#9B7BFF'}]}><View style={{flex:1}}><Text style={[styles.friendChipText,{color:colors.text}]}>{event.title}</Text><Text style={[styles.emptyText,{color:colors.muted}]}>{event.event_type} • até {new Date(event.ends_at).toLocaleString('pt-BR')}</Text></View><Pressable onPress={()=>void deactivateGameEvent(event.id)}><Ionicons name="stop-circle" size={20} color="#FF8290"/></Pressable></View>)}</View> : null}
          </View>

                    </CollapsibleSection>
          ) : null}
          {hasAdminPermission('economy_grant') ? (
          <CollapsibleSection title="Adicionar moedas">
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>
              ESCOLHA UM OU MAIS JOGADORES • {selectedPlayers.length} DE {players.length}
            </Text>
            <TextInput
              value={playerSearch}
              onChangeText={setPlayerSearch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Buscar jogador pelo nome"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />
            <View style={styles.friendChips}>
              {visiblePlayers.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  {players.length === 0 ? 'Nenhum jogador disponível.' : 'Nenhum jogador encontrado.'}
                </Text>
              ) : visiblePlayers.map((player) => {
                const active = selectedPlayerIds.has(player.id);
                return (
                  <Pressable
                    key={player.id}
                    onPress={() => setSelectedPlayerIds((current) => {
                      const next = new Set(current);
                      if (next.has(player.id)) next.delete(player.id);
                      else next.add(player.id);
                      return next;
                    })}
                    style={[
                      styles.friendChip,
                      {
                        backgroundColor: active ? colors.accentSoft : colors.surfaceAlt,
                        borderColor: active ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.friendChipText, { color: colors.text }]}>
                      @{player.username}{player.id === selfId ? ' (você)' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.quickRow}>
              <Pressable
                onPress={() => setSelectedPlayerIds(new Set(visiblePlayers.map((player) => player.id)))}
                style={[styles.quickChip, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
              >
                <Text style={[styles.quickText, { color: colors.text }]}>SELECIONAR VISÍVEIS</Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedPlayerIds(new Set())}
                style={[styles.quickChip, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              >
                <Text style={[styles.quickText, { color: colors.text }]}>LIMPAR</Text>
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>VALOR PARA CADA JOGADOR</Text>
            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((quick) => (
                <Pressable
                  key={quick}
                  onPress={() => setAmount(String(quick))}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor: amountNumber === quick ? colors.yellow : colors.surfaceAlt,
                      borderColor: amountNumber === quick ? colors.yellow : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.quickText, { color: amountNumber === quick ? '#07111F' : colors.text }]}>
                    {quick >= 1000 ? `${quick / 1000}K` : quick}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={amount}
              onChangeText={(value) => setAmount(value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="Quantidade de moedas"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Observação opcional"
              placeholderTextColor={colors.muted}
              maxLength={180}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />

            <Pressable
              disabled={selectedPlayers.length < 1 || amountNumber < 1 || working}
              onPress={confirmSendCoins}
              style={[
                styles.grantButton,
                {
                  backgroundColor: selectedPlayers.length > 0 && amountNumber > 0 ? colors.yellow : colors.surfaceAlt,
                  opacity: working ? .75 : 1,
                },
              ]}
            >
              {working ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="add-circle" size={20} color="#07111F" />}
              <Text style={styles.grantButtonText}>
                {working ? 'ADICIONANDO...' : 'ADICIONAR PARA ' + selectedPlayers.length.toLocaleString('pt-BR') + ' JOGADOR(ES)'}
              </Text>
            </Pressable>
          </View>

                    </CollapsibleSection>
          ) : null}
          {hasAdminPermission('economy_grant') ? (
          <CollapsibleSection title="Adicionar Diamantes">
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: '#68D9FF' }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>
              MESMA SELEÇÃO MÚLTIPLA • {selectedPlayers.length} JOGADOR(ES)
            </Text>
            <TextInput value={playerSearch} onChangeText={setPlayerSearch} autoCapitalize="none" autoCorrect={false} placeholder="Buscar jogador pelo nome" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
            <View style={styles.friendChips}>{visiblePlayers.map((player)=>{const active=selectedPlayerIds.has(player.id);return <Pressable key={`diamond-${player.id}`} onPress={()=>setSelectedPlayerIds((current)=>{const next=new Set(current);if(next.has(player.id))next.delete(player.id);else next.add(player.id);return next;})} style={[styles.friendChip,{backgroundColor:active?'#163C55':colors.surfaceAlt,borderColor:active?'#68D9FF':colors.border}]}><Text style={[styles.friendChipText,{color:colors.text}]}>@{player.username}{active?' • ✓':''}</Text></Pressable>;})}</View>
            <View style={styles.quickRow}>{[1,5,10,25,50,100].map((quick)=><Pressable key={quick} onPress={()=>setDiamondAmount(String(quick))} style={[styles.quickChip,{backgroundColor:diamondAmountNumber===quick?'#68D9FF':colors.surfaceAlt,borderColor:diamondAmountNumber===quick?'#68D9FF':colors.border}]}><Text style={[styles.quickText,{color:diamondAmountNumber===quick?'#07111F':colors.text}]}>{quick}</Text></Pressable>)}</View>
            <TextInput value={diamondAmount} onChangeText={(value)=>setDiamondAmount(value.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder="Quantidade de Diamantes" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
            <Pressable disabled={selectedPlayers.length<1||diamondAmountNumber<1||working} onPress={confirmSendDiamonds} style={[styles.grantButton,{backgroundColor:selectedPlayers.length&&diamondAmountNumber?'#68D9FF':colors.surfaceAlt,opacity:working?.75:1}]}><Ionicons name="diamond" size={20} color="#07111F"/><Text style={styles.grantButtonText}>ADICIONAR DIAMANTES</Text></Pressable>
          </View>

                    </CollapsibleSection>
          ) : null}
          {hasAdminPermission('economy_remove') ? (
          <CollapsibleSection title="Correção de saldo">
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: '#A84250' }]}>
            <View style={styles.moderationHeader}>
              <View style={[styles.moderationIcon, { backgroundColor: '#351A24' }]}>
                <Ionicons name="remove-circle" size={23} color="#FF8290" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moderationTitle, { color: colors.text }]}>Retirar Coins ou Diamantes</Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  Use apenas para corrigir recompensa enviada por engano. Toda retirada fica registrada com saldo anterior, saldo final e motivo.
                </Text>
              </View>
            </View>

            <TextInput
              value={playerSearch}
              onChangeText={setPlayerSearch}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Buscar jogador pelo nome"
              placeholderTextColor={colors.muted}
              style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}
            />

            <View style={styles.friendChips}>
              {visiblePlayers.length === 0 ? (
                <Text style={[styles.emptyText,{color:colors.muted}]}>Nenhum jogador encontrado.</Text>
              ) : visiblePlayers.map((player)=>{
                const active=selectedPlayerIds.has(player.id);
                return (
                  <Pressable
                    key={`correction-${player.id}`}
                    onPress={()=>setSelectedPlayerIds((current)=>{
                      const next=new Set(current);
                      if(next.has(player.id))next.delete(player.id);else next.add(player.id);
                      return next;
                    })}
                    style={[styles.friendChip,{backgroundColor:active?'#351A24':colors.surfaceAlt,borderColor:active?'#FF8290':colors.border}]}
                  >
                    <Text style={[styles.friendChipText,{color:colors.text}]}>
                      @{player.username}{active ? ` • 🪙 ${Number(player.coins).toLocaleString('pt-BR')} • 💎 ${Number(player.diamonds).toLocaleString('pt-BR')} • ✓` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.correctionGrid}>
              <View style={[styles.correctionCard,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                <Text style={[styles.fieldLabel,{color:colors.muted}]}>RETIRAR COINS</Text>
                <View style={styles.quickRow}>
                  {[1000,5000,10000,50000,100000].map((quick)=>(
                    <Pressable key={`remove-coins-${quick}`} onPress={()=>setRemoveCoinAmount(String(quick))} style={[styles.quickChip,{backgroundColor:removeCoinAmountNumber===quick?'#351A24':colors.surface,borderColor:removeCoinAmountNumber===quick?'#FF8290':colors.border}]}>
                      <Text style={[styles.quickText,{color:removeCoinAmountNumber===quick?'#FFB2BC':colors.text}]}>{quick.toLocaleString('pt-BR')}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput value={removeCoinAmount} onChangeText={(value)=>setRemoveCoinAmount(value.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder="Quantidade de Coins" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surface,borderColor:colors.border}]}/>
                <Pressable disabled={selectedPlayers.length<1||removeCoinAmountNumber<1||working} onPress={()=>confirmRemoveCurrency('coins')} style={[styles.destructiveGrantButton,{opacity:selectedPlayers.length<1||removeCoinAmountNumber<1||working ? .45 : 1}]}>
                  <Ionicons name="remove-circle" size={19} color="#FFD7DD"/>
                  <Text style={styles.destructiveGrantText}>RETIRAR COINS</Text>
                </Pressable>
              </View>

              <View style={[styles.correctionCard,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                <Text style={[styles.fieldLabel,{color:colors.muted}]}>RETIRAR DIAMANTES</Text>
                <View style={styles.quickRow}>
                  {[1,5,10,25,50,100].map((quick)=>(
                    <Pressable key={`remove-diamonds-${quick}`} onPress={()=>setRemoveDiamondAmount(String(quick))} style={[styles.quickChip,{backgroundColor:removeDiamondAmountNumber===quick?'#351A24':colors.surface,borderColor:removeDiamondAmountNumber===quick?'#FF8290':colors.border}]}>
                      <Text style={[styles.quickText,{color:removeDiamondAmountNumber===quick?'#FFB2BC':colors.text}]}>{quick}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput value={removeDiamondAmount} onChangeText={(value)=>setRemoveDiamondAmount(value.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder="Quantidade de Diamantes" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surface,borderColor:colors.border}]}/>
                <Pressable disabled={selectedPlayers.length<1||removeDiamondAmountNumber<1||working} onPress={()=>confirmRemoveCurrency('diamonds')} style={[styles.destructiveGrantButton,{opacity:selectedPlayers.length<1||removeDiamondAmountNumber<1||working ? .45 : 1}]}>
                  <Ionicons name="diamond" size={18} color="#FFD7DD"/>
                  <Text style={styles.destructiveGrantText}>RETIRAR DIAMANTES</Text>
                </Pressable>
              </View>
            </View>

            <Text style={[styles.fieldLabel,{color:colors.muted}]}>MOTIVO DA CORREÇÃO • OBRIGATÓRIO</Text>
            <TextInput
              value={correctionNote}
              onChangeText={setCorrectionNote}
              placeholder="Ex.: recompensa duplicada enviada por engano"
              placeholderTextColor={colors.muted}
              maxLength={180}
              style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}
            />
            <Text style={[styles.emptyText,{color:colors.muted}]}>
              A retirada nunca deixa saldo negativo. Em seleção múltipla, se uma conta não tiver saldo suficiente, a operação inteira é cancelada.
            </Text>
          </View>

                    </CollapsibleSection>
          ) : null}
          {testerHub?.isOwner && adminAccess?.isOwner ? (
            <CollapsibleSection title="Títulos de Tester">
              <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: '#7D5CFF' }]}>
                <View style={styles.moderationHeader}>
                  <View style={[styles.moderationIcon, { backgroundColor: '#211B3A' }]}>
                    <Text style={styles.testerTitleEmoji}>{testerHub.title?.icon ?? '🧪'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.moderationTitle, { color: colors.text }]}>
                      {testerHub.title?.title ?? 'Tester Oficial'}
                    </Text>
                    <Text style={[styles.emptyText, { color: colors.muted }]}>
                      Exclusivo do dono. Só amigos confirmados podem receber este título e ele aparece em Conquistas e Títulos para ser equipado no perfil.
                    </Text>
                  </View>
                </View>

                <View style={[styles.testerPreview, { backgroundColor: colors.surfaceAlt, borderColor: '#7D5CFF' }]}>
                  <Text style={styles.testerPreviewIcon}>{testerHub.title?.icon ?? '🧪'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.testerPreviewName, { color: colors.text }]}>{testerHub.title?.title ?? 'Tester Oficial'}</Text>
                    <Text style={[styles.testerPreviewDesc, { color: colors.muted }]}>
                      {testerHub.title?.description ?? 'Título exclusivo para testers oficiais do jogo.'}
                    </Text>
                  </View>
                  <View style={styles.ownerOnlyBadge}><Ionicons name="lock-closed" size={12} color="#C9BCFF"/><Text style={styles.ownerOnlyText}>SÓ DONO</Text></View>
                </View>

                <TextInput
                  value={testerSearch}
                  onChangeText={setTesterSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Buscar entre seus amigos..."
                  placeholderTextColor={colors.muted}
                  style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}
                />

                <View style={styles.testerFriendsList}>
                  {visibleTesterFriends.length === 0 ? (
                    <View style={[styles.emptyHistory,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                      <Text style={[styles.emptyText,{color:colors.muted}]}>Nenhum amigo encontrado.</Text>
                    </View>
                  ) : visibleTesterFriends.map((friend)=>(
                    <View key={`tester-${friend.id}`} style={[styles.testerFriendRow,{backgroundColor:colors.surfaceAlt,borderColor:friend.hasTitle?'#7D5CFF':colors.border}]}>
                      <View style={[styles.testerAvatar,{backgroundColor:friend.hasTitle?'#2A2150':colors.surface}]}>
                        <Text style={styles.testerAvatarText}>{friend.username.slice(0,1).toUpperCase()}</Text>
                      </View>
                      <View style={{flex:1,minWidth:120}}>
                        <Text style={[styles.testerFriendName,{color:colors.text}]}>@{friend.username}</Text>
                        <Text style={[styles.testerFriendMeta,{color:friend.hasTitle?'#B8A9FF':colors.muted}]}>
                          Nível {friend.level} • {friend.hasTitle ? '🧪 TESTER ATIVO' : 'Sem título de tester'}
                        </Text>
                      </View>
                      {friend.hasTitle ? (
                        <Pressable
                          disabled={working}
                          onPress={()=>confirmRevokeTesterTitle(friend.id,friend.username)}
                          style={[styles.testerRevokeButton,{opacity:working ? .55 : 1}]}
                        >
                          <Ionicons name="close-circle" size={16} color="#FFB0BB"/>
                          <Text style={styles.testerRevokeText}>REVOGAR</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          disabled={working}
                          onPress={()=>{void changeTesterTitle(friend.id,true);}}
                          style={[styles.testerGrantButton,{opacity:working ? .55 : 1}]}
                        >
                          <Ionicons name="ribbon" size={16} color="#0B0B16"/>
                          <Text style={styles.testerGrantText}>CONCEDER</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>

                <TextInput
                  value={testerNote}
                  onChangeText={setTesterNote}
                  maxLength={180}
                  placeholder="Observação opcional sobre o tester"
                  placeholderTextColor={colors.muted}
                  style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}
                />
              </View>
            </CollapsibleSection>
          ) : null}
          {hasAdminPermission('battlepass_grant') ? (
          <CollapsibleSection title="VIP do Passe de Batalha">
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
            <View style={styles.moderationHeader}>
              <View style={[styles.moderationIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="ribbon" size={23} color={colors.yellow} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moderationTitle, { color: colors.text }]}>Conceder VIP sem cobrar Diamantes</Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>Escolha um ou mais jogadores. O acesso vale para a temporada atual e fica registrado no servidor.</Text>
              </View>
            </View>
            <TextInput value={playerSearch} onChangeText={setPlayerSearch} autoCapitalize="none" autoCorrect={false} placeholder="Buscar jogador pelo nome" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
            <View style={styles.friendChips}>
              {visiblePlayers.length === 0 ? <Text style={[styles.emptyText,{color:colors.muted}]}>Nenhum jogador encontrado.</Text> : visiblePlayers.map((player)=>{
                const active=selectedPlayerIds.has(player.id);
                return <Pressable key={`pass-vip-${player.id}`} onPress={()=>setSelectedPlayerIds((current)=>{
                  const next=new Set(current);
                  if(next.has(player.id)) next.delete(player.id); else next.add(player.id);
                  return next;
                })} style={[styles.friendChip,{backgroundColor:active?colors.accentSoft:colors.surfaceAlt,borderColor:active?colors.yellow:colors.border}]}>
                  <Text style={[styles.friendChipText,{color:colors.text}]}>@{player.username}{active?' • ✓':''}</Text>
                </Pressable>;
              })}
            </View>
            <TextInput value={note} onChangeText={setNote} placeholder="Motivo/observação opcional" placeholderTextColor={colors.muted} maxLength={180} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
            <Pressable disabled={selectedPlayers.length<1||working} onPress={confirmBattlePassVip} style={[styles.grantButton,{backgroundColor:selectedPlayers.length?colors.yellow:colors.surfaceAlt,opacity:working?.75:1}]}>
              {working?<ActivityIndicator size="small" color="#07111F"/>:<Ionicons name="diamond" size={20} color="#07111F"/>}
              <Text style={styles.grantButtonText}>DAR VIP GRÁTIS • {selectedPlayers.length} JOGADOR(ES)</Text>
            </Pressable>
          </View>

                    </CollapsibleSection>
          ) : null}
          {hasAdminPermission('codes_manage') ? (
          <CollapsibleSection title="Códigos de resgate">
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emptyText,{color:colors.muted}]}>Cada conta pode usar cada código uma única vez. A recompensa é aplicada e registrada pelo servidor.</Text>
            <View style={styles.formSplit}>
              <View style={styles.formField}><Text style={[styles.fieldLabel,{color:colors.muted}]}>CÓDIGO</Text><TextInput value={newCode} onChangeText={(value)=>setNewCode(value.toUpperCase().replace(/\s/g,''))} autoCapitalize="characters" maxLength={32} placeholder="LENDARIO-2026" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View>
              <Pressable onPress={()=>setNewCode(`TRAINER-${Math.random().toString(36).slice(2,8).toUpperCase()}`)} style={[styles.quickChip,{alignSelf:'flex-end',minHeight:48,justifyContent:'center',backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Text style={[styles.quickText,{color:colors.text}]}>GERAR NOME</Text></Pressable>
            </View>
            <View style={styles.formSplit}>
              <View style={styles.formField}><Text style={[styles.fieldLabel,{color:colors.muted}]}>COINS</Text><TextInput value={codeCoins} onChangeText={(v)=>setCodeCoins(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View>
              <View style={styles.formField}><Text style={[styles.fieldLabel,{color:colors.muted}]}>DIAMANTES</Text><TextInput value={codeDiamonds} onChangeText={(v)=>setCodeDiamonds(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View>
              <View style={styles.formField}><Text style={[styles.fieldLabel,{color:colors.muted}]}>2× LUCKY • ABERTURAS</Text><TextInput value={codeLuckyUses} onChangeText={(v)=>setCodeLuckyUses(v.replace(/[^0-9]/g,'').slice(0,5))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View>
            </View>
            <View style={styles.formSplit}>
              <View style={styles.formField}><Text style={[styles.fieldLabel,{color:colors.muted}]}>ID DA CARTA (OPCIONAL)</Text><TextInput value={codeCardId} onChangeText={setCodeCardId} autoCapitalize="none" placeholder="sv8-001" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View>
              <View style={styles.formFieldSmall}><Text style={[styles.fieldLabel,{color:colors.muted}]}>CÓPIAS</Text><TextInput value={codeCardQuantity} onChangeText={(v)=>setCodeCardQuantity(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View>
            </View>
            <View style={styles.formSplit}>
              <View style={styles.formField}><Text style={[styles.fieldLabel,{color:colors.muted}]}>LIMITE TOTAL (VAZIO = ILIMITADO)</Text><TextInput value={codeMaxUses} onChangeText={(v)=>setCodeMaxUses(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder="Sem limite" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View>
              <View style={styles.formField}><Text style={[styles.fieldLabel,{color:colors.muted}]}>EXPIRA EM HORAS</Text><TextInput value={codeExpiresHours} onChangeText={(v)=>setCodeExpiresHours(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder="Nunca" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View>
            </View>
            <Pressable disabled={newCode.length<4||working} onPress={()=>void createCode()} style={[styles.grantButton,{backgroundColor:newCode.length>=4?colors.yellow:colors.surfaceAlt}]}><Ionicons name="ticket" size={20} color="#07111F"/><Text style={styles.grantButtonText}>CRIAR CÓDIGO</Text></Pressable>
            <View style={styles.historyList}>{adminCodes.map((item)=>{const used=Number(item.code_redemptions?.[0]?.count??0);return <View key={item.id} style={[styles.historyRow,{backgroundColor:colors.surfaceAlt,borderColor:item.active?'#65D894':colors.border}]}><View style={{flex:1}}><Text style={[styles.historyUser,{color:colors.text}]}>{item.code}</Text><Text style={[styles.historyMeta,{color:colors.muted}]}>{rewardSummary(item.reward)} • {used} resgate(s){item.max_total_uses?`/${item.max_total_uses}`:''}</Text></View><Pressable disabled={working} onPress={()=>void toggleCode(item)} style={[styles.quickChip,{backgroundColor:item.active?'#15392A':'#351A24',borderColor:item.active?'#65D894':'#683243'}]}><Text style={[styles.quickText,{color:item.active?'#AEF0CC':'#FF9FAF'}]}>{item.active?'ATIVO':'DESATIVADO'}</Text></Pressable></View>;})}</View>
          </View>

                    </CollapsibleSection>
          ) : null}
          <CollapsibleSection title="Histórico administrativo">
          <View style={styles.historyList}>
            {history.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhum ajuste de Coins ou Diamantes ainda.</Text>
              </View>
            ) : history.map((item) => (
              <View key={item.id} style={[styles.historyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.historyUser, { color: colors.text }]}>
                    @{item.players?.username ?? 'Treinador'}
                  </Text>
                  <Text style={[styles.historyMeta, { color: colors.muted }]}>
                    {new Date(item.created_at).toLocaleString('pt-BR')}
                    {item.note ? ` • ${item.note}` : ''}
                  </Text>
                </View>
                <View style={styles.historyValueWrap}>
                  <Text style={[styles.historyValue, { color: Number(item.amount) < 0 ? '#FF8290' : item.currency === 'diamonds' ? '#68D9FF' : colors.yellow }]}>
                    {Number(item.amount) < 0 ? '−' : '+'}{item.currency === 'diamonds' ? '💎' : '🪙'} {Math.abs(Number(item.amount)).toLocaleString('pt-BR')}
                  </Text>
                  <Text style={[styles.historyBalance, { color: colors.muted }]}>
                    saldo {Number(item.balance_after).toLocaleString('pt-BR')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          </CollapsibleSection>
        </>
      ) : null}
    </Screen>
  );
}

function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.collapsibleSection}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={[styles.collapsibleHeader, { backgroundColor: colors.surface, borderColor: expanded ? colors.accent : colors.border }]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <View style={[styles.collapsibleChevron, { backgroundColor: expanded ? colors.accentSoft : colors.surfaceAlt }]}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={expanded ? colors.yellow : colors.muted} />
        </View>
      </Pressable>
      {expanded ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

function rewardSummary(reward: AdminRedeemCode['reward']) {
  const parts:string[]=[];
  if(Number(reward.coins)>0)parts.push(`🪙 ${Number(reward.coins).toLocaleString('pt-BR')}`);
  if(Number(reward.diamonds)>0)parts.push(`💎 ${Number(reward.diamonds).toLocaleString('pt-BR')}`);
  if(reward.cardId)parts.push(`🃏 ${reward.cardQuantity??1}× ${reward.cardId}`);
  if(Number(reward.lucky2xUses)>0)parts.push(`✨ 2× Lucky ${Number(reward.lucky2xUses)} abertura(s)`);
  return parts.join(' • ');
}

function Metric({
  icon,
  label,
  value,
  valueText,
  hint,
  coin,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: number;
  valueText?: string;
  hint?: string;
  coin?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.metricValue, { color: colors.text }]}>
        {valueText ?? `${coin ? '🪙 ' : ''}${Number(value ?? 0).toLocaleString('pt-BR')}`}
      </Text>
      {hint ? <Text style={[styles.metricHint, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  backButton: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { fontSize: 11, fontWeight: '900' },
  refreshButton: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  refreshText: { fontSize: 9, fontWeight: '900', letterSpacing: .5 },
  notice: { borderRadius: 15, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  noticeText: { flex: 1, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  error: { borderRadius: 15, borderWidth: 1, borderColor: '#683243', backgroundColor: '#351A24', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 11, fontWeight: '700' },
  adminHero: { borderRadius: 28, borderWidth: 1, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center', overflow:'hidden', position:'relative', minHeight:185 },
  adminHeroGlow:{position:'absolute',right:-75,top:-95,width:290,height:290,borderRadius:999,opacity:.13},
  adminHeroPokemon:{position:'absolute',right:-24,bottom:-46,width:205,height:220,opacity:.18,transform:[{rotate:'6deg'}]},
  adminHeroCopy:{flex:1,zIndex:2,paddingRight:72},
  adminHeroStats:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:13},
  adminHeroStat:{minWidth:84,borderRadius:13,borderWidth:1,paddingHorizontal:10,paddingVertical:8},
  adminHeroStatValue:{fontSize:14,fontWeight:'900'},
  adminHeroStatLabel:{fontSize:7,fontWeight:'900',letterSpacing:.55,marginTop:1},
  auditLaunch: { minHeight: 78, borderRadius: 19, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  auditLaunchIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  auditLaunchTitle: { fontSize: 14, fontWeight: '900' },
  auditLaunchText: { fontSize: 9, lineHeight: 14, marginTop: 3 },
  adminIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', zIndex:2 },
  legacyAdminPanel:{borderRadius:24,borderWidth:1,padding:15,gap:12},
  legacyAdminHeader:{flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},
  legacyAdminIcon:{width:48,height:48,borderRadius:15,alignItems:'center',justifyContent:'center'},
  legacyAdminKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.1},
  legacyAdminTitle:{fontSize:17,fontWeight:'900',marginTop:2},
  legacyAdminText:{fontSize:9,lineHeight:14,marginTop:3},
  legacyStateBadge:{borderRadius:999,borderWidth:1,paddingHorizontal:10,paddingVertical:7},
  legacyStateText:{fontSize:7,fontWeight:'900',letterSpacing:.55},
  legacyAdminStats:{flexDirection:'row',flexWrap:'wrap',gap:7},
  legacyAdminStat:{flexGrow:1,flexBasis:120,minWidth:105,borderRadius:13,borderWidth:1,paddingHorizontal:10,paddingVertical:9},
  legacyAdminValue:{fontSize:15,fontWeight:'900'},
  legacyAdminLabel:{fontSize:7,fontWeight:'900',letterSpacing:.55,marginTop:2},
  legacyAdminActions:{flexDirection:'row',flexWrap:'wrap',gap:8},
  legacyToggleButton:{minHeight:45,borderRadius:13,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
  legacyToggleText:{fontSize:8,fontWeight:'900'},
  legacyPreviewButton:{minHeight:45,borderRadius:13,borderWidth:1,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
  legacyPreviewText:{fontSize:8,fontWeight:'900'},
  legacySafety:{fontSize:8,lineHeight:12},
  legacyProgressBox:{borderRadius:17,borderWidth:1,padding:11,gap:10},
  legacyProgressHeader:{flexDirection:'row',alignItems:'center',gap:9,flexWrap:'wrap'},
  legacyProgressIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},
  legacyProgressTitle:{fontSize:10,fontWeight:'900',letterSpacing:.45},
  legacyProgressText:{fontSize:7,lineHeight:11,marginTop:2},
  legacyProgressRefresh:{minHeight:38,borderRadius:11,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
  legacyProgressRefreshText:{fontSize:7,fontWeight:'900'},
  legacyProgressSummary:{flexDirection:'row',flexWrap:'wrap',gap:6},
  legacyProgressMetric:{flexGrow:1,flexBasis:115,minWidth:105,borderRadius:11,borderWidth:1,paddingHorizontal:9,paddingVertical:8},
  legacyProgressMetricValue:{fontSize:15,fontWeight:'900'},
  legacyProgressMetricLabel:{fontSize:6,fontWeight:'900',letterSpacing:.45,marginTop:2},
  legacyProgressControls:{gap:7},
  legacyProgressSearchWrap:{minHeight:42,borderRadius:12,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:7},
  legacyProgressSearch:{flex:1,minHeight:40,fontSize:10,fontWeight:'800'},
  legacyProgressFilters:{flexDirection:'row',flexWrap:'wrap',gap:6},
  legacyProgressFilter:{minHeight:32,borderRadius:10,borderWidth:1,paddingHorizontal:9,alignItems:'center',justifyContent:'center'},
  legacyProgressFilterText:{fontSize:6.5,fontWeight:'900',letterSpacing:.35},
  legacyProgressList:{gap:6},
  legacyProgressRow:{minHeight:62,borderRadius:13,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:8},
  legacyProgressAvatar:{width:38,height:38,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},
  legacyProgressAvatarText:{fontSize:11,fontWeight:'900'},
  legacyProgressPlayerCopy:{flex:1,minWidth:120},
  legacyProgressNameRow:{flexDirection:'row',alignItems:'center',gap:6},
  legacyProgressName:{fontSize:10,fontWeight:'900',flexShrink:1},
  legacyProgressAccount:{fontSize:5.5,fontWeight:'900',letterSpacing:.35},
  legacyProgressMeta:{fontSize:6.5,lineHeight:10,marginTop:2},
  legacyProgressRight:{alignItems:'flex-end',gap:3},
  legacyProgressCount:{fontSize:12,fontWeight:'900'},
  legacyProgressStatus:{borderRadius:999,borderWidth:1,paddingHorizontal:6,paddingVertical:3},
  legacyProgressStatusText:{fontSize:5.5,fontWeight:'900',letterSpacing:.3},
  legacyProgressEmpty:{minHeight:48,borderRadius:12,borderWidth:1,borderStyle:'dashed',alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6,padding:9},
  legacyProgressEmptyText:{fontSize:7,fontWeight:'800'},
  preflightBox:{borderRadius:17,borderWidth:1,padding:11,gap:9},
  preflightHeader:{flexDirection:'row',alignItems:'center',gap:9,flexWrap:'wrap'},
  preflightIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},
  preflightTitle:{fontSize:10,fontWeight:'900',letterSpacing:.45},
  preflightText:{fontSize:8,lineHeight:12,marginTop:2},
  preflightButton:{minHeight:38,borderRadius:11,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:5},
  preflightButtonText:{fontSize:7,fontWeight:'900'},
  issueGrid:{flexDirection:'row',flexWrap:'wrap',gap:6},
  issueItem:{flexGrow:1,flexBasis:105,minWidth:95,borderRadius:11,borderWidth:1,paddingHorizontal:9,paddingVertical:7},
  issueValue:{fontSize:13,fontWeight:'900'},
  issueLabel:{fontSize:6,fontWeight:'900',letterSpacing:.45,marginTop:1},
  releaseChecklist:{borderRadius:17,borderWidth:1,padding:11,gap:9},
  checklistGrid:{flexDirection:'row',flexWrap:'wrap',gap:6},
  checklistItem:{flexGrow:1,flexBasis:190,minWidth:170,borderRadius:11,borderWidth:1,paddingHorizontal:9,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:7},
  checklistDot:{width:7,height:7,borderRadius:999},
  checklistLabel:{fontSize:8,fontWeight:'900',letterSpacing:.4},
  checklistHint:{fontSize:6.5,lineHeight:10,marginTop:1},
  releaseUrlBox:{borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',alignItems:'flex-end',gap:8,flexWrap:'wrap'},
  releaseUrlLabel:{fontSize:7,fontWeight:'900',letterSpacing:.6},
  releaseUrlInput:{minHeight:42,borderRadius:11,borderWidth:1,paddingHorizontal:10,fontSize:9,marginTop:5},
  releaseUrlHint:{fontSize:6.5,lineHeight:10,marginTop:4},
  releaseUrlActions:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},
  releaseUrlImportButton:{minHeight:42,borderRadius:11,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
  releaseUrlImportText:{fontSize:7,fontWeight:'900'},
  releaseUrlButton:{minHeight:42,borderRadius:11,paddingHorizontal:11,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
  releaseUrlButtonText:{fontSize:7,fontWeight:'900',color:'#07111F'},
  resetPreviewBox:{borderRadius:17,borderWidth:1,padding:11,gap:9},
  resetPreviewHead:{flexDirection:'row',alignItems:'center',gap:9,flexWrap:'wrap'},
  resetPreviewIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},
  resetPreviewTitle:{fontSize:10,fontWeight:'900',letterSpacing:.45},
  resetPreviewText:{fontSize:8,lineHeight:12,marginTop:2},
  resetPreviewGrid:{flexDirection:'row',flexWrap:'wrap',gap:6},
  resetPreviewMetric:{flexGrow:1,flexBasis:105,minWidth:95,borderRadius:11,borderWidth:1,paddingHorizontal:9,paddingVertical:8},
  resetPreviewValue:{fontSize:14,fontWeight:'900'},
  resetPreviewLabel:{fontSize:6,fontWeight:'900',letterSpacing:.45,marginTop:2},
  resetEconomyRow:{borderTopWidth:1,paddingTop:8,gap:3},
  resetEconomyText:{fontSize:8,fontWeight:'800'},
  resetReadyBadge:{borderRadius:12,borderWidth:1,paddingHorizontal:9,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:6},
  resetReadyText:{fontSize:7,fontWeight:'900',letterSpacing:.35},
  heroKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroTitle: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  heroText: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '900' },
  collapsibleSection: { gap: 8 },
  collapsibleHeader: { minHeight: 58, borderRadius: 19, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  collapsibleChevron: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  collapsibleBody: { gap: 10 },
  correctionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  testerTitleEmoji: { fontSize: 24 },
  testerPreview: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  testerPreviewIcon: { fontSize: 28 },
  testerPreviewName: { fontSize: 15, fontWeight: '900' },
  testerPreviewDesc: { fontSize: 9, lineHeight: 14, marginTop: 2 },
  ownerOnlyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: '#2A2150', paddingHorizontal: 8, paddingVertical: 5 },
  ownerOnlyText: { color: '#C9BCFF', fontSize: 7, fontWeight: '900', letterSpacing: .4 },
  testerFriendsList: { gap: 8 },
  testerFriendRow: { minHeight: 64, borderRadius: 15, borderWidth: 1, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  testerAvatar: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  testerAvatarText: { color: '#E7E2FF', fontSize: 16, fontWeight: '900' },
  testerFriendName: { fontSize: 12, fontWeight: '900' },
  testerFriendMeta: { fontSize: 8, fontWeight: '800', marginTop: 3 },
  testerGrantButton: { minHeight: 38, borderRadius: 11, backgroundColor: '#A995FF', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  testerGrantText: { color: '#0B0B16', fontSize: 8, fontWeight: '900' },
  testerRevokeButton: { minHeight: 38, borderRadius: 11, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#743344', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  testerRevokeText: { color: '#FFB0BB', fontSize: 8, fontWeight: '900' },
  correctionCard: { flexGrow: 1, flexBasis: 250, minWidth: 220, borderRadius: 16, borderWidth: 1, padding: 11, gap: 9 },
  destructiveGrantButton: { minHeight: 48, borderRadius: 13, backgroundColor: '#6B2634', borderWidth: 1, borderColor: '#A84250', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  destructiveGrantText: { color: '#FFD7DD', fontSize: 9, fontWeight: '900', letterSpacing: .3 },
  economyHealthPanel:{borderRadius:20,borderWidth:1,padding:13,gap:10},
  economyHealthHeader:{flexDirection:'row',alignItems:'center',gap:9},
  economyHealthIcon:{width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center'},
  economyHealthTitle:{fontSize:13,fontWeight:'900'},
  economyHealthText:{fontSize:8,lineHeight:13,marginTop:2},
  economyFlowBox:{borderRadius:14,borderWidth:1,padding:10},
  economyFlowTitle:{fontSize:7,fontWeight:'900',letterSpacing:.6},
  economyFlowText:{fontSize:8,lineHeight:13,marginTop:3},
  economyRefreshButton:{minHeight:37,borderRadius:11,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},
  economyRefreshText:{fontSize:6.5,fontWeight:'900'},
  economyAdvisorBox:{borderRadius:14,borderWidth:1,padding:10,gap:7},
  economyAdvisorRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  economyAdvisorType:{fontSize:6.5,fontWeight:'900',letterSpacing:.45,flex:1},
  economyAdvisorValue:{fontSize:7.5,fontWeight:'900'},
  economyAdvisorStack:{gap:6},
  economyAlert:{borderRadius:12,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:7},
  economyAlertText:{fontSize:8,lineHeight:12,fontWeight:'800',flex:1},
  economyAdviceHeader:{flexDirection:'row',alignItems:'center',gap:6},
  economyAdviceCard:{borderTopWidth:1,paddingTop:7,gap:3},
  softCapStatus:{borderRadius:12,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:7},
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: 155, minWidth: 145, borderRadius: 17, borderWidth: 1, padding: 12 },
  metricIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  metricLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .8 },
  metricValue: { fontSize: 17, fontWeight: '900', marginTop: 3 },
  metricHint: { fontSize: 8, marginTop: 4 },
  marketPanel: { borderRadius: 19, borderWidth: 1, padding: 14 },
  marketHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  marketIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  marketTitle: { fontSize: 15, fontWeight: '900' },
  marketText: { fontSize: 9, lineHeight: 14, marginTop: 2 },
  marketButton: { minHeight: 48, borderRadius: 14, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  marketButtonText: { color: '#07111F', fontSize: 10, fontWeight: '900', letterSpacing: .4 },
  grantPanel: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 10 },
  fieldLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  friendChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  friendChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  friendChipText: { fontSize: 10, fontWeight: '900' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  moderationHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moderationIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#351A24', alignItems: 'center', justifyContent: 'center' },
  moderationTitle: { fontSize: 15, fontWeight: '900', marginBottom: 2 },
  moderationBox: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 9 },
  moderationStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  moderationTargetName: { fontSize: 16, fontWeight: '900' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  statusActive: { backgroundColor: '#153426' },
  statusSuspended: { backgroundColor: '#3B2313' },
  statusBanned: { backgroundColor: '#351A24' },
  statusBadgeText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: .5 },
  suspensionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  moderationHours: { flexGrow: 0, minWidth: 92, width: 100 },
  moderationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moderationAction: { minHeight: 46, minWidth: 118, flexGrow: 1, borderRadius: 13, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  moderationActionText: { fontSize: 9, fontWeight: '900', letterSpacing: .35 },
  warnAction: { backgroundColor: '#362B13', borderColor: '#D9A441' },
  suspendAction: { backgroundColor: '#3B2313', borderColor: '#D97732' },
  banAction: { backgroundColor: '#351A24', borderColor: '#A84250' },
  restoreAction: { backgroundColor: '#153426', borderColor: '#2F9E68' },
  disabledAction: { opacity: .45 },
  formSplit: { flexDirection:'row', flexWrap:'wrap', gap:8 },
  formField: { flexGrow:1, flexBasis:180, minWidth:160, gap:5 },
  formFieldSmall: { flexGrow:1, flexBasis:90, minWidth:85, gap:5 },
  quickChip: { minWidth: 49, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' },
  quickText: { fontSize: 9, fontWeight: '900' },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, fontSize: 13 },
  grantButton: { minHeight: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  grantButtonText: { color: '#07111F', fontSize: 10, fontWeight: '900', letterSpacing: .3 },
  historyList: { gap: 7 },
  historyRow: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyUser: { fontSize: 13, fontWeight: '900' },
  historyMeta: { fontSize: 8, marginTop: 3 },
  historyValueWrap: { alignItems: 'flex-end' },
  historyValue: { fontSize: 11, fontWeight: '900' },
  historyBalance: { fontSize: 8, marginTop: 2 },
  emptyHistory: { borderRadius: 16, borderWidth: 1, padding: 18, alignItems: 'center' },
  emptyText: { fontSize: 10, lineHeight: 15 },
  releaseOpsPanel:{borderRadius:19,borderWidth:1,padding:13,gap:10},
  releaseOpsHeader:{flexDirection:'row',alignItems:'flex-start',gap:10},
  releaseOpsSteps:{flexDirection:'row',flexWrap:'wrap',gap:8},
  releaseOpsButton:{flexGrow:1,flexBasis:210,minHeight:46,borderRadius:13,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
  releaseOpsButtonText:{fontSize:8,fontWeight:'900',letterSpacing:.25,textAlign:'center'},
  releaseConfirmHint:{fontSize:8,lineHeight:13,fontWeight:'700'},
  releaseConfirmInput:{minHeight:46,borderRadius:13,borderWidth:1,paddingHorizontal:12,fontSize:12,fontWeight:'900',letterSpacing:.4},
  releaseResetButton:{minHeight:50,borderRadius:14,backgroundColor:'#8B2F3F',borderWidth:1,borderColor:'#C74B5D',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  releaseResetButtonText:{color:'#fff',fontSize:9,fontWeight:'900',letterSpacing:.4},
  releaseAfterResetRow:{flexDirection:'row',flexWrap:'wrap',gap:8},
  releaseRestoreButton:{flexGrow:1,flexBasis:180,minHeight:48,borderRadius:13,backgroundColor:'#4A2029',borderWidth:1,borderColor:'#8D4050',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
  releaseRestoreText:{color:'#FFD7DD',fontSize:8,fontWeight:'900'},
  releaseCompleteButton:{flexGrow:1,flexBasis:180,minHeight:48,borderRadius:13,backgroundColor:'#65D894',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
  releaseCompleteText:{color:'#07111F',fontSize:8,fontWeight:'900'},
  releaseCompletedBadge:{minHeight:45,borderRadius:13,backgroundColor:'#153426',borderWidth:1,borderColor:'#2F9E68',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:10},
  releaseCompletedText:{color:'#9CEFC1',fontSize:8,fontWeight:'900',textAlign:'center'},
});
