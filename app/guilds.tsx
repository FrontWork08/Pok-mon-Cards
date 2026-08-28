import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import {
  getGuildHub,
  claimGuildWeeklyReward,
  inviteToGuild,
  joinGuild,
  kickGuildMember,
  leaveGuild,
  respondGuildInvite,
  setGuildMemberRole,
  subscribeToGuilds,
  type Guild,
  type GuildMember,
  type GuildHub,
  type GuildWeeklyReward,
} from '@/services/guilds';
import { findPlayers } from '@/services/player';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function GuildsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [hub, setHub] = useState<GuildHub | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const next = await getGuildHub();
      setHub(next);
      setSelectedId((current) => current ?? next.myMembership?.guildId ?? next.guilds[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as guildas.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    void load();
    const unsubscribe = subscribeToGuilds(() => {
      if (!active) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (active) void load(true);
      }, 120);
    });

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [load]));

  const selected = useMemo(() => hub?.guilds.find((guild) => guild.id === selectedId) ?? null, [hub, selectedId]);
  const myMembership = hub?.myMembership ?? null;
  const isLeader = Boolean(selected && myMembership?.guildId === selected.id && myMembership.role === 'leader');

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    try {
      setWorking(key);
      setError(null);
      await action();
      setNotice(success);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setWorking(null);
    }
  }

  async function searchPlayers() {
    if (search.trim().length < 2) return;
    try {
      setSearching(true);
      const players = await findPlayers(search);
      const memberIds = new Set(hub?.guilds.flatMap((guild) => guild.members.map((member) => member.id)) ?? []);
      setResults(players.filter((player) => !memberIds.has(player.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível buscar treinadores.');
    } finally {
      setSearching(false);
    }
  }

  function confirmLeave() {
    Alert.alert('Sair da guilda?', 'Você poderá entrar em outra guilda depois.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void run('leave', leaveGuild, 'Você saiu da guilda.') },
    ]);
  }

  async function collectWeeklyReward() {
    if (working) return;
    try {
      setWorking('weekly-reward');
      setError(null);
      const reward = await claimGuildWeeklyReward();
      setNotice(`Recompensa semanal: 🪙 ${reward.coins.toLocaleString('pt-BR')}${reward.diamonds ? ` + 💎 ${reward.diamonds}` : ''} por ${reward.completedMissions} missão(ões) coletiva(s).`);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível coletar a recompensa semanal.');
    } finally {
      setWorking(null);
    }
  }

  function confirmKick(member: GuildMember) {
    if (!selected) return;
    Alert.alert('Expulsar membro?', `@${member.username} será removido da guilda.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Expulsar', style: 'destructive', onPress: () => void run(`kick:${member.id}`, () => kickGuildMember(selected.id, member.id), 'Membro removido.') },
    ]);
  }

  return (
    <Screen title="Guildas Pokémon" subtitle="Quatro equipes fixas, missões coletivas e ranking pelo valor total das cartas.">
      <View style={styles.topRow}>
        <Pressable style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.back()}><Ionicons name="arrow-back" size={18} color={colors.text} /><Text style={[styles.backText, { color: colors.text }]}>Voltar</Text></Pressable>
        <Pressable style={[styles.refresh, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]} onPress={() => void load()}><Ionicons name="refresh" size={17} color={colors.yellow} /><Text style={[styles.refreshText, { color: colors.yellow }]}>ATUALIZAR</Text></Pressable>
      </View>

      {notice ? <Pressable onPress={() => setNotice(null)} style={[styles.notice, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}><Ionicons name="checkmark-circle" size={19} color={colors.yellow} /><Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text><Ionicons name="close" size={18} color={colors.muted} /></Pressable> : null}
      {error ? <Pressable onPress={() => setError(null)} style={styles.error}><Ionicons name="alert-circle" size={19} color="#FF9FAF" /><Text style={styles.errorText}>{error}</Text><Ionicons name="close" size={18} color="#FF9FAF" /></Pressable> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      {(hub?.myInvites.length ?? 0) > 0 ? <View style={styles.invites}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Convites recebidos</Text>
        {hub!.myInvites.map((invite) => <View key={invite.id} style={[styles.invite, { backgroundColor: colors.surface, borderColor: invite.guildColor }]}>
          <View style={[styles.guildDot, { backgroundColor: invite.guildColor }]} />
          <View style={{ flex: 1 }}><Text style={[styles.inviteTitle, { color: colors.text }]}>{invite.guildName}</Text><Text style={[styles.inviteMeta, { color: colors.muted }]}>Convite de @{invite.invitedByUsername}</Text></View>
          <Pressable disabled={working === invite.id} style={[styles.decline, { borderColor: colors.border }]} onPress={() => void run(invite.id, () => respondGuildInvite(invite.id, false), 'Convite recusado.')}><Ionicons name="close" size={17} color="#FF9FAF" /></Pressable>
          <Pressable disabled={working === invite.id} style={[styles.accept, { backgroundColor: invite.guildColor }]} onPress={() => void run(invite.id, () => respondGuildInvite(invite.id, true), 'Você entrou na guilda!')}><Text style={styles.acceptText}>ENTRAR</Text></Pressable>
        </View>)}
      </View> : null}

      <View style={styles.rankingHead}><View><Text style={[styles.sectionTitle, { color: colors.text }]}>Ranking das Guildas</Text><Text style={[styles.sectionHint, { color: colors.muted }]}>Soma do valor de todas as cartas dos membros.</Text></View><Ionicons name="podium" size={25} color={colors.yellow} /></View>
      <View style={styles.guildGrid}>
        {(hub?.guilds ?? []).map((guild) => {
          const active = selectedId === guild.id;
          const mine = myMembership?.guildId === guild.id;
          return <Pressable key={guild.id} onPress={() => setSelectedId(guild.id)} style={[styles.guildCard, { backgroundColor: active ? guild.color + '20' : colors.surface, borderColor: active || mine ? guild.color : colors.border }]}>
            <View style={[styles.rankBubble, { backgroundColor: guild.color }]}><Text style={styles.rankText}>#{guild.rank}</Text></View>
            <View style={{ flex: 1 }}><Text style={[styles.guildName, { color: colors.text }]}>{guild.name}{mine ? ' • SUA' : ''}</Text><Text numberOfLines={1} style={[styles.motto, { color: colors.muted }]}>{guild.motto}</Text><Text style={[styles.guildLevel, { color: guild.color }]}>NÍVEL {guild.level} • {guild.xp.toLocaleString('pt-BR')} XP</Text></View>
            <View style={styles.guildValue}><Text style={[styles.value, { color: guild.color }]}>{formatUsd(guild.collectionValueUsd)}</Text><Text style={[styles.membersCount, { color: colors.muted }]}>{guild.memberCount} membro(s)</Text></View>
          </Pressable>;
        })}
      </View>

      {selected ? <GuildDetail
        guild={selected}
        myGuildId={myMembership?.guildId ?? null}
        myRole={myMembership?.role ?? null}
        working={working}
        weeklyReward={myMembership?.guildId === selected.id ? hub?.weeklyReward ?? null : null}
        onClaimWeeklyReward={() => { void collectWeeklyReward(); }}
        onJoin={() => void run('join', () => joinGuild(selected.id), `Você entrou na ${selected.name}!`)}
        onLeave={confirmLeave}
        onOpenPlayer={(id) => router.push(`/player/${id}`)}
        onKick={confirmKick}
        onSetRole={(member, role) => void run(`role:${member.id}`, () => setGuildMemberRole(selected.id, member.id, role), 'Cargo atualizado.')}
      /> : null}

      {isLeader ? <View style={[styles.managePanel, { backgroundColor: colors.surface, borderColor: selected?.color ?? colors.border }]}>
        <View style={styles.manageHeader}><View style={[styles.manageIcon, { backgroundColor: selected!.color + '22' }]}><Ionicons name="person-add" size={20} color={selected!.color} /></View><View style={{ flex: 1 }}><Text style={[styles.manageTitle, { color: colors.text }]}>Convidar treinador</Text><Text style={[styles.manageText, { color: colors.muted }]}>Somente você, como chefe, pode convidar e administrar membros.</Text></View></View>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Ionicons name="search" size={18} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} onSubmitEditing={searchPlayers} placeholder="Buscar por nickname..." placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.searchInput, { color: colors.text }]} /><Pressable onPress={() => void searchPlayers()} style={[styles.searchButton, { backgroundColor: selected!.color }]}><Text style={styles.searchText}>{searching ? '...' : 'BUSCAR'}</Text></Pressable></View>
        {results.map((player) => <View key={player.id} style={[styles.searchResult, { borderColor: colors.border }]}><Pressable style={{ flex: 1 }} onPress={() => router.push(`/player/${player.id}`)}><Text style={[styles.memberName, { color: colors.text }]}>@{player.username}</Text><Text style={[styles.memberMeta, { color: colors.muted }]}>Nível {player.level}</Text></Pressable><Pressable disabled={working === `invite:${player.id}`} onPress={() => void run(`invite:${player.id}`, () => inviteToGuild(selected!.id, player.id), 'Convite enviado.')} style={[styles.inviteButton, { backgroundColor: selected!.color }]}><Ionicons name="send" size={14} color="#fff" /><Text style={styles.inviteButtonText}>CONVIDAR</Text></Pressable></View>)}
      </View> : null}
    </Screen>
  );
}

function GuildDetail({
  guild, myGuildId, myRole, working, weeklyReward, onClaimWeeklyReward, onJoin, onLeave, onOpenPlayer, onKick, onSetRole,
}: {
  guild: Guild;
  myGuildId: string | null;
  myRole: 'leader' | 'officer' | 'member' | null;
  working: string | null;
  weeklyReward: GuildWeeklyReward | null;
  onClaimWeeklyReward: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onOpenPlayer: (id: string) => void;
  onKick: (member: GuildMember) => void;
  onSetRole: (member: GuildMember, role: 'officer' | 'member') => void;
}) {
  const { colors } = useAppTheme();
  const mine = myGuildId === guild.id;
  const leader = mine && myRole === 'leader';
  return <View style={[styles.detail, { backgroundColor: colors.surface, borderColor: guild.color }]}>
    <View style={styles.detailHeader}><View style={[styles.shield, { backgroundColor: guild.color }]}><Ionicons name="shield" size={27} color="#fff" /></View><View style={{ flex: 1 }}><Text style={[styles.detailName, { color: colors.text }]}>{guild.name}</Text><Text style={[styles.detailMotto, { color: colors.muted }]}>{guild.motto}</Text><Text style={[styles.leader, { color: guild.color }]}>{guild.leaderUsername ? `Chefe: @${guild.leaderUsername}` : 'Chefe ainda não escolhido pelo dono'}</Text><Text style={[styles.guildLevel, { color: guild.color }]}>Nível {guild.level} • {guild.xp.toLocaleString('pt-BR')} XP coletiva</Text><View style={[styles.guildXpTrack, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.guildXpFill, { width: `${Math.min(100, (guild.xp % 500) / 5)}%`, backgroundColor: guild.color }]} /></View></View>{!myGuildId ? <Pressable disabled={working === 'join'} onPress={onJoin} style={[styles.join, { backgroundColor: guild.color }]}><Text style={styles.joinText}>{working === 'join' ? 'ENTRANDO...' : 'ENTRAR LIVREMENTE'}</Text></Pressable> : mine && !leader ? <Pressable onPress={onLeave} style={[styles.leave, { borderColor: '#C64E5A' }]}><Text style={styles.leaveText}>SAIR</Text></Pressable> : null}</View>

    <View style={styles.subHeader}><Text style={[styles.subTitle, { color: colors.text }]}>Missões da guilda</Text><Text style={[styles.subMeta, { color: colors.muted }]}>reiniciam semanalmente</Text></View>
    <View style={styles.missions}>{guild.missions.map((mission) => {
      const percent = Math.min(100, mission.target ? mission.progress / mission.target * 100 : 0);
      return <View key={mission.id} style={[styles.mission, { backgroundColor: colors.surfaceAlt, borderColor: mission.completed ? guild.color : colors.border }]}><View style={styles.missionTop}><Ionicons name={(mission.icon || 'flag') as keyof typeof Ionicons.glyphMap} size={19} color={mission.completed ? guild.color : colors.muted} /><View style={{ flex: 1 }}><Text style={[styles.missionTitle, { color: colors.text }]}>{mission.title}</Text><Text style={[styles.missionText, { color: colors.muted }]}>{mission.description}</Text></View><Text style={[styles.progressText, { color: mission.completed ? guild.color : colors.text }]}>{Math.floor(mission.progress).toLocaleString('pt-BR')} / {mission.target.toLocaleString('pt-BR')}</Text></View><View style={[styles.track, { backgroundColor: colors.surface }]}><View style={[styles.fill, { backgroundColor: guild.color, width: `${percent}%` }]} /></View></View>;
    })}</View>

    {mine && weeklyReward ? <View style={[styles.weeklyReward, { backgroundColor: colors.surfaceAlt, borderColor: weeklyReward.claimable ? guild.color : colors.border }]}>
      <View style={styles.weeklyRewardTop}>
        <View style={[styles.weeklyRewardIcon, { backgroundColor: guild.color + '25' }]}><Ionicons name="gift" size={22} color={guild.color} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.weeklyRewardTitle, { color: colors.text }]}>Recompensa semanal da Guilda</Text>
          <Text style={[styles.weeklyRewardText, { color: colors.muted }]}>
            {weeklyReward.completedMissions}/3 objetivos concluídos • prêmio atual: 🪙 {weeklyReward.coins.toLocaleString('pt-BR')}{weeklyReward.diamonds ? ` + 💎 ${weeklyReward.diamonds}` : ''}
          </Text>
        </View>
      </View>
      <Pressable
        disabled={!weeklyReward.claimable || working === 'weekly-reward'}
        onPress={onClaimWeeklyReward}
        style={[
          styles.weeklyRewardButton,
          { backgroundColor: weeklyReward.claimable ? guild.color : colors.surface },
          (!weeklyReward.claimable || working === 'weekly-reward') && { opacity: .55 },
        ]}
      >
        {working === 'weekly-reward' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={weeklyReward.claimed ? 'checkmark-circle' : 'gift'} size={17} color="#fff" />}
        <Text style={styles.weeklyRewardButtonText}>
          {weeklyReward.claimed ? 'RECOMPENSA JÁ COLETADA' : weeklyReward.claimable ? 'COLETAR RECOMPENSA' : 'CONCLUA UMA MISSÃO'}
        </Text>
      </Pressable>
    </View> : null}

    <View style={styles.subHeader}><Text style={[styles.subTitle, { color: colors.text }]}>Membros</Text><Text style={[styles.subMeta, { color: colors.muted }]}>{guild.members.length}</Text></View>
    <View style={styles.memberList}>{guild.members.length === 0 ? <Text style={[styles.noMembers, { color: colors.muted }]}>Nenhum membro ainda. Seja o primeiro a entrar.</Text> : guild.members.map((member) => <View key={member.id} style={[styles.memberRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Pressable style={styles.memberIdentity} onPress={() => onOpenPlayer(member.id)}><View style={[styles.memberAvatar, { backgroundColor: guild.color + '25' }]}><Text style={[styles.memberAvatarText, { color: guild.color }]}>{member.username.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={[styles.memberName, { color: colors.text }]}>@{member.username}</Text><Text style={[styles.memberMeta, { color: colors.muted }]}>Nível {member.level} • {member.role === 'leader' ? 'Chefe' : member.role === 'officer' ? 'Oficial' : 'Membro'}</Text></View></Pressable>{leader && member.role !== 'leader' ? <View style={styles.memberActions}><Pressable disabled={working === `role:${member.id}`} onPress={() => onSetRole(member, member.role === 'officer' ? 'member' : 'officer')} style={[styles.roleButton, { borderColor: guild.color }]}><Text style={[styles.roleText, { color: guild.color }]}>{member.role === 'officer' ? 'MEMBRO' : 'OFICIAL'}</Text></Pressable><Pressable disabled={working === `kick:${member.id}`} onPress={() => onKick(member)} style={styles.kick}><Ionicons name="person-remove" size={16} color="#FF9FAF" /></Pressable></View> : <Ionicons name="chevron-forward" size={17} color={colors.muted} />}</View>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  back: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { fontSize: 11, fontWeight: '900' },
  refresh: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  refreshText: { fontSize: 9, fontWeight: '900' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, borderWidth: 1, padding: 12 },
  noticeText: { flex: 1, fontSize: 11, fontWeight: '800' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243', padding: 12 },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 11, fontWeight: '700' },
  invites: { gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  sectionHint: { fontSize: 9, marginTop: 2 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 17, borderWidth: 1, padding: 11 },
  guildDot: { width: 13, height: 38, borderRadius: 999 },
  inviteTitle: { fontSize: 13, fontWeight: '900' },
  inviteMeta: { fontSize: 9, marginTop: 2 },
  decline: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1 },
  accept: { minHeight: 37, paddingHorizontal: 11, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  acceptText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  rankingHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  guildGrid: { gap: 8 },
  guildCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, padding: 11 },
  rankBubble: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  guildName: { fontSize: 14, fontWeight: '900' },
  motto: { fontSize: 8, marginTop: 3 },
  guildLevel: { fontSize: 8, fontWeight: '900', marginTop: 4, letterSpacing: .4 },
  guildXpTrack: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 7 },
  guildXpFill: { height: '100%', borderRadius: 999 },
  guildValue: { alignItems: 'flex-end' },
  value: { fontSize: 12, fontWeight: '900' },
  membersCount: { fontSize: 8, marginTop: 3 },
  detail: { borderRadius: 23, borderWidth: 1, padding: 15, gap: 14 },
  detailHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 11 },
  shield: { width: 53, height: 53, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  detailName: { fontSize: 21, fontWeight: '900' },
  detailMotto: { fontSize: 9, marginTop: 2 },
  leader: { fontSize: 9, fontWeight: '900', marginTop: 4 },
  join: { minHeight: 43, paddingHorizontal: 13, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  joinText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  leave: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  leaveText: { color: '#FF8A8A', fontSize: 8, fontWeight: '900' },
  subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subTitle: { fontSize: 16, fontWeight: '900' },
  subMeta: { fontSize: 8, fontWeight: '800' },
  missions: { gap: 7 },
  weeklyReward: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 10 },
  weeklyRewardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weeklyRewardIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  weeklyRewardTitle: { fontSize: 12, fontWeight: '900' },
  weeklyRewardText: { fontSize: 8, lineHeight: 12, marginTop: 3 },
  weeklyRewardButton: { minHeight: 43, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  weeklyRewardButtonText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  mission: { borderRadius: 15, borderWidth: 1, padding: 11 },
  missionTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  missionTitle: { fontSize: 11, fontWeight: '900' },
  missionText: { fontSize: 8, marginTop: 2 },
  progressText: { fontSize: 8, fontWeight: '900' },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 9 },
  fill: { height: '100%', borderRadius: 999 },
  memberList: { gap: 7 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, borderWidth: 1, padding: 9 },
  memberIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  memberAvatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontSize: 16, fontWeight: '900' },
  memberName: { fontSize: 12, fontWeight: '900' },
  memberMeta: { fontSize: 8, marginTop: 2 },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  roleButton: { minHeight: 34, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  roleText: { fontSize: 7, fontWeight: '900' },
  kick: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#351A24', alignItems: 'center', justifyContent: 'center' },
  noMembers: { textAlign: 'center', paddingVertical: 14, fontSize: 10 },
  managePanel: { borderRadius: 21, borderWidth: 1, padding: 14, gap: 10 },
  manageHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  manageIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  manageTitle: { fontSize: 15, fontWeight: '900' },
  manageText: { fontSize: 9, lineHeight: 13, marginTop: 2 },
  searchBox: { minHeight: 50, borderRadius: 14, borderWidth: 1, paddingLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minHeight: 48, fontSize: 13 },
  searchButton: { alignSelf: 'stretch', paddingHorizontal: 13, borderTopRightRadius: 13, borderBottomRightRadius: 13, alignItems: 'center', justifyContent: 'center' },
  searchText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  searchResult: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 9 },
  inviteButton: { minHeight: 36, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  inviteButtonText: { color: '#fff', fontSize: 7, fontWeight: '900' },
});
