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
  setLegacySelectionEnabled,
  type AdminAccess,
  type AdminPermission,
  type AdminGameEvent,
  type AdminModerationAction,
  type AdminOverview,
  type AdminPlayer,
  type AdminCurrencyAdjustmentHistory,
  type AdminRedeemCode,
  type GlobalAnnouncement,
  type TesterTitleHub,
  type AdminReleaseCampaignStatus,
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
      const [accessState, status, grants, events, guildState, codes, runtime, announcements, testerState, releaseState] = await Promise.all([
        getMyAdminAccess(),
        getAdminOverview(),
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

  const activeEventRemaining = useMemo(() => {
    if (!activeEvent) return '';
    const seconds = Math.max(0, Math.ceil((new Date(activeEvent.ends_at).getTime() - clock) / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes > 0
      ? String(minutes) + 'm ' + String(rest).padStart(2, '0') + 's'
      : String(rest) + 's';
  }, [activeEvent, clock]);

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
    if (codeCardId.trim() && Number(codeCardQuantity) > 0) {
      reward.cardId = codeCardId.trim();
      reward.cardQuantity = Number(codeCardQuantity);
    }
    if (!reward.coins && !reward.diamonds && !reward.cardId) {
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
      setNewCode(''); setCodeCoins(''); setCodeDiamonds(''); setCodeCardId('');
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

          {adminAccess?.isOwner && releaseStatus ? (
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

              <View style={styles.legacyAdminActions}>
                <Pressable
                  disabled={working}
                  onPress={confirmLegacySelectionToggle}
                  style={[styles.legacyToggleButton,{backgroundColor:releaseStatus.legacy_selection_enabled ? '#C74658' : colors.yellow,opacity:working?.55:1}]}
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
});
