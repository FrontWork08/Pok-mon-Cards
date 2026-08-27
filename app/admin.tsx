import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import {
  getAdminOverview,
  getAdminPlayers,
  getCoinGrantHistory,
  getAdminEvents,
  getAdminRedeemCodes,
  grantCoinsBatch,
  grantDiamondsBatch,
  createRedeemCode,
  setAdminRedeemCodeActive,
  publishGlobalAnnouncement,
  startFreeBoosters,
  stopFreeBoosters,
  type AdminGameEvent,
  type AdminOverview,
  type AdminPlayer,
  type CoinGrantHistory,
  type AdminRedeemCode,
} from '@/services/admin';
import { formatUsd } from '@/services/market';
import { getMyProfile } from '@/services/player';
import { adminSetGuildLeader, getGuildHub, type GuildHub } from '@/services/guilds';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/ThemeProvider';

const QUICK_AMOUNTS = [1000, 5000, 10000, 50000, 100000];

export default function AdminScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [selfId, setSelfId] = useState('');
  const [history, setHistory] = useState<CoinGrantHistory[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [playerSearch, setPlayerSearch] = useState('');
  const [amount, setAmount] = useState('10000');
  const [diamondAmount, setDiamondAmount] = useState('25');
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
  const [freeBoosterMinutes, setFreeBoosterMinutes] = useState('1');
  const [activeEvent, setActiveEvent] = useState<AdminGameEvent | null>(null);
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
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [status, grants, events, guildState, codes] = await Promise.all([
        getAdminOverview(),
        getCoinGrantHistory(),
        getAdminEvents(),
        getGuildHub(),
        getAdminRedeemCodes(),
        syncPlayers(),
      ]);
      setOverview(status);
      setHistory(grants);
      setActiveEvent(events.find((event) => event.event_type === 'free_boosters') ?? null);
      setGuildHub(guildState);
      setAdminCodes(codes);
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
      .channel('admin-player-directory')
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
      .channel('admin-game-events')
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

  const amountNumber = useMemo(() => {
    const parsed = Number(amount.replace(/[^0-9]/g, ''));
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }, [amount]);
  const diamondAmountNumber = useMemo(() => Number(diamondAmount.replace(/[^0-9]/g, '')) || 0, [diamondAmount]);

  const visiblePlayers = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) => player.username.toLowerCase().includes(query));
  }, [playerSearch, players]);

  const selectedPlayers = useMemo(
    () => players.filter((player) => selectedPlayerIds.has(player.id)),
    [players, selectedPlayerIds],
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
      await publishGlobalAnnouncement(
        announcementTitle,
        announcementBody,
        announcementSeverity,
        hours,
      );
      setAnnouncementTitle('');
      setAnnouncementBody('');
      setNotice('Anúncio global publicado em tempo real para todos os jogadores.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível publicar o anúncio.');
    } finally {
      setWorking(false);
    }
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
        'Admin Abuse ativado: todos os boosters ficarão grátis por ' +
        minutes.toLocaleString('pt-BR') + ' minuto(s).',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ativar os boosters grátis.');
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


  return (
    <Screen title="Admin Center" subtitle="Painel privado de economia, usuários, mercado e saúde do jogo.">
      <View style={styles.topRow}>
        <Pressable
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.back()}
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
          <View style={[styles.adminHero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <View style={[styles.adminIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="shield-checkmark" size={27} color={colors.yellow} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroKicker, { color: colors.yellow }]}>ACESSO ADMINISTRATIVO</Text>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Controle privado ativado</Text>
              <Text style={[styles.heroText, { color: colors.muted }]}>
                Toda alteração de moedas é feita no servidor e registrada no histórico administrativo.
              </Text>
            </View>
          </View>

          <SectionTitle title="Liderança das Guildas" />
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

          <SectionTitle title="Visão geral" />
          <View style={styles.metricGrid}>
            <Metric icon="people" label="USUÁRIOS" value={overview.users.total} hint={`+${overview.users.created24h} em 24h`} />
            <Metric icon="wallet" label="MOEDAS EM CIRCULAÇÃO" value={overview.users.coinsInCirculation} coin />
            <Metric icon="albums" label="CARDS NO CATÁLOGO" value={overview.catalog.cards} />
            <Metric icon="cash" label="CARDS COM PREÇO USD" value={overview.catalog.cardsWithUsdPrice} hint={`${overview.catalog.ownedCardsWithUsdPrice}/${overview.catalog.ownedUniqueCards} cards possuídos • ${Number(overview.catalog.ownedPriceCoveragePct ?? 0).toFixed(0)}%`} />
            <Metric icon="layers" label="CÓPIAS EM CONTAS" value={overview.catalog.ownedCardCopies} />
            <Metric icon="diamond" label="VALOR GLOBAL DAS COLEÇÕES" valueText={formatUsd(overview.catalog.ownedMarketValueUsd)} />
          </View>

          <SectionTitle title="Packs e atividade" />
          <View style={styles.metricGrid}>
            <Metric icon="cube" label="PACKS ATIVOS" value={overview.packs.active} hint={`${overview.packs.withPhysicalArt} com packshot`} />
            <Metric icon="gift" label="PACKS ABERTOS" value={overview.packs.openings} hint={`${overview.packs.openings24h} em 24h`} />
            <Metric icon="chatbubble-ellipses" label="MENSAGENS" value={overview.social.messages} hint={`${overview.social.messages24h} em 24h`} />
            <Metric icon="people-circle" label="AMIZADES" value={overview.social.friendshipsAccepted} hint={`${overview.social.friendRequestsPending} pendentes`} />
            <Metric icon="swap-horizontal" label="TROCAS" value={overview.trades.total} hint={`${overview.trades.completed} concluídas`} />
            <Metric icon="game-controller" label="BATALHAS" value={overview.battles.total} hint={`${overview.battles.active} ativas • ${overview.battles.completed} concluídas`} />
          </View>

          <SectionTitle title="Sistema" />
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

          <SectionTitle title="Anúncio global em tempo real" />
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

          <SectionTitle title="Admin Abuse" />
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {activeEvent ? (
              <View style={[styles.notice, { backgroundColor: '#142C23', borderColor: '#4A9B70' }]}>
                <Ionicons name="gift" size={20} color="#65D894" />
                <Text style={[styles.noticeText, { color: colors.text }]}>
                  BOOSTERS GRÁTIS ATIVOS • preços voltam em {activeEventRemaining}
                </Text>
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                Ative um período em que todos os jogadores poderão abrir qualquer booster por 🪙 0.
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
                {activeEvent ? 'REINICIAR TEMPO GRÁTIS' : 'ATIVAR BOOSTERS GRÁTIS'}
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

          <SectionTitle title="Adicionar moedas" />
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

          <SectionTitle title="Adicionar Diamantes" />
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

          <SectionTitle title="Códigos de resgate" />
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

          <SectionTitle title="Histórico administrativo" />
          <View style={styles.historyList}>
            {history.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhuma concessão de moedas ainda.</Text>
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
                  <Text style={[styles.historyValue, { color: colors.yellow }]}>+🪙 {Number(item.amount).toLocaleString('pt-BR')}</Text>
                  <Text style={[styles.historyBalance, { color: colors.muted }]}>
                    saldo {Number(item.balance_after).toLocaleString('pt-BR')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function SectionTitle({ title }: { title: string }) {
  const { colors } = useAppTheme();
  return <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>;
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
  adminHero: { borderRadius: 22, borderWidth: 1, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' },
  adminIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  heroKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroTitle: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  heroText: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  sectionTitle: { fontSize: 19, fontWeight: '900', marginTop: 3 },
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
  grantPanel: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 10 },
  fieldLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  friendChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  friendChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  friendChipText: { fontSize: 10, fontWeight: '900' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
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
