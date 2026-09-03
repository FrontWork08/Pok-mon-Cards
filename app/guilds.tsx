import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import { PackOpeningModal } from '@/components/PackOpeningModal';
import { GuildChatPanel } from '@/components/GuildChatPanel';
import { AuraBanner } from '@/components/AuraBanner';
import { GuildHeadquartersShowcase } from '@/components/GuildHeadquartersShowcase';
import type { Pack, OpenedCard } from '@/services/packs';
import {
  getGuildHub,
  getMyGuildStoryFeed,
  claimGuildWeeklyReward,
  claimGuildCollectiveBooster,
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
  type GuildStory,
  type GuildWeeklyReward,
} from '@/services/guilds';
import { findPlayers, getPlayerAvatarMap, getProfileAvatarUrl, type PlayerAvatarMeta } from '@/services/player';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { CompactTrainerBanner } from '@/components/CompactTrainerBanner';
import { formatUsd } from '@/services/market';
import { getEconomySinkHub, type EconomySinkHub } from '@/services/economy';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getThemeVisual } from '@/theme/themeCatalog';
import { AreaIdentityStrip } from '@/components/AreaIdentityStrip';

export default function GuildsScreen() {
  const router = useRouter();
  const { colors, themeName } = useAppTheme();
  const themeVisual = getThemeVisual(themeName);
  const [hub, setHub] = useState<GuildHub | null>(null);
  const [economyHub, setEconomyHub] = useState<EconomySinkHub | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [collectiveOpen, setCollectiveOpen] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, PlayerAvatarMeta>>({});
  const [stories,setStories]=useState<GuildStory[]>([]);
  const loadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent && !loadedOnce.current) setLoading(true);
      setError(null);
      const next = await getGuildHub();
      setHub(next);
      setSelectedId((current) => current ?? next.myMembership?.guildId ?? next.guilds[0]?.id ?? null);
      loadedOnce.current = true;
      if (!silent) setLoading(false);

      const memberIds = next.guilds.flatMap((guild) => guild.members.map((member) => member.id));
      void getPlayerAvatarMap(memberIds).then(setAvatars).catch(() => null);
      void getEconomySinkHub().then(setEconomyHub).catch(() => null);
      if(next.myMembership){
        void getMyGuildStoryFeed(12).then(setStories).catch(()=>setStories([]));
      }else{
        setStories([]);
      }
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

  async function openCollectivePack(): Promise<OpenedCard[]> {
    try {
      const result = await claimGuildCollectiveBooster();
      setNotice('Booster Coletivo coletado! As 5 cartas foram adicionadas à sua Bag.');
      await load(true);
      return result.cards as OpenedCard[];
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível coletar o Booster Coletivo.');
      throw e;
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
    <Screen title="Guild HQ" subtitle="Sua base coletiva para missões, ranking, chat, recompensas e Guild Wars.">
      <AreaIdentityStrip area="social" />
      <View style={styles.topRow}>
        <Pressable style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color={colors.text} /><Text style={[styles.backText, { color: colors.text }]}>Voltar</Text></Pressable>
        <Pressable style={[styles.refresh, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]} onPress={() => void load()}><Ionicons name="refresh" size={17} color={colors.yellow} /><Text style={[styles.refreshText, { color: colors.yellow }]}>ATUALIZAR</Text></Pressable>
      </View>

      <AuraBanner
        eyebrow="TRAINER ALLIANCE NETWORK"
        title={myMembership && selected ? selected.name : 'Escolha sua equipe'}
        subtitle={myMembership && selected ? `Você faz parte desta guilda como ${myMembership.role === 'leader' ? 'Chefe' : myMembership.role === 'officer' ? 'Oficial' : 'Membro'}. Evolua a sede, domine ginásios e construa prestígio coletivo.` : 'Compare as quatro equipes, entre em uma guilda e evolua junto com outros treinadores.'}
        icon="shield"
        primaryColor={selected?.color ?? colors.accent}
        secondaryColor={colors.yellow}
        intensity={(selected?.level??1)>=5?'master':'premium'}
        badge={selected?`RANK #${selected.rank}`:'GUILD HQ'}
        minHeight={205}
      >
        <View style={styles.guildAuraContent}>
          <View style={styles.guildAuraStats}>
            <View style={[styles.guildHeroStat,{backgroundColor:colors.surface+'D8',borderColor:colors.border}]}><Text style={[styles.guildHeroStatValue,{color:colors.text}]}>{hub?.guilds.length ?? 0}</Text><Text style={[styles.guildHeroStatLabel,{color:colors.muted}]}>GUILDAS</Text></View>
            <View style={[styles.guildHeroStat,{backgroundColor:colors.surface+'D8',borderColor:colors.border}]}><Text style={[styles.guildHeroStatValue,{color:colors.text}]}>{selected?.memberCount ?? 0}</Text><Text style={[styles.guildHeroStatLabel,{color:colors.muted}]}>MEMBROS</Text></View>
            <View style={[styles.guildHeroStat,{backgroundColor:colors.surface+'D8',borderColor:colors.border}]}><Text style={[styles.guildHeroStatValue,{color:selected?.color ?? colors.yellow}]}>NV. {selected?.level ?? 1}</Text><Text style={[styles.guildHeroStatLabel,{color:colors.muted}]}>SEDE</Text></View>
          </View>
          <Image source={{uri:themeVisual.image}} resizeMode="contain" style={styles.guildAuraPokemon}/>
        </View>
      </AuraBanner>

      {selected && myMembership?.guildId===selected.id ? (
        <GuildHeadquartersShowcase
          guildName={selected.name}
          guildColor={selected.color}
          guildLevel={selected.level}
          upgrades={economyHub?.guild?.guildId===selected.id ? economyHub.guild.upgrades : {}}
          compact
        />
      ) : null}

      {selected && myMembership?.guildId===selected.id && stories.length ? <View style={[styles.storyPanel,{backgroundColor:colors.surface,borderColor:selected.color}]}>
        <View style={styles.storyHead}><View><Text style={[styles.storyKicker,{color:selected.color}]}>HISTÓRIAS RECENTES</Text><Text style={[styles.storyTitle,{color:colors.text}]}>O que sua guilda viveu</Text><Text style={[styles.storyHint,{color:colors.muted}]}>Vitórias, boosters e novos membros dos últimos dias.</Text></View><Ionicons name="time" size={22} color={selected.color}/></View>
        <View style={styles.storyList}>{stories.slice(0,8).map((story,index)=>{
          const accent=story.type==='battle_win'?'#FF735C':story.type==='pack_open'?'#5AA8FF':selected.color;
          const icon=(story.type==='battle_win'?'trophy':story.type==='pack_open'?'cube':'person-add') as keyof typeof Ionicons.glyphMap;
          const time=story.createdAt?new Date(story.createdAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
          return <View key={story.type+'-'+story.createdAt+'-'+index} style={[styles.storyRow,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
            <View style={[styles.storyIcon,{backgroundColor:accent+'1C'}]}><Ionicons name={icon} size={17} color={accent}/></View>
            <View style={{flex:1,minWidth:0}}><Text style={[styles.storyText,{color:colors.text}]}><Text style={{fontWeight:'900'}}>@{story.actor}</Text> {story.text}</Text><Text style={[styles.storyTime,{color:colors.muted}]}>{time}</Text></View>
          </View>;
        })}</View>
      </View> : null}

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
        avatars={avatars}
      /> : null}

      {selected && myMembership?.guildId === selected.id ? (
        <GuildChatPanel
          guildId={selected.id}
          guildColor={selected.color}
          onOpenPlayer={(playerId) => router.push(`/player/${playerId}`)}
        />
      ) : null}

      {selected && myMembership?.guildId === selected.id ? <View style={[styles.collectivePanel, { backgroundColor: colors.surface, borderColor: hub?.collectiveBooster.status === 'ready' ? colors.yellow : selected.color }]}>
        <View style={styles.collectiveHead}>
          <View style={[styles.collectiveIcon, { backgroundColor: selected.color + '25' }]}><Ionicons name="cube" size={24} color={selected.color} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.collectiveTitle, { color: colors.text }]}>Booster Coletivo</Text>
            <Text style={[styles.collectiveText, { color: colors.muted }]}>Cada booster aberto por um membro soma +1. Ao atingir {hub?.collectiveBooster.target ?? 40}, cada membro pode abrir 1 booster especial com 5 cartas e 1 tier alto garantido.</Text>
          </View>
        </View>
        <View style={styles.collectiveStats}><Text style={[styles.collectiveProgress, { color: colors.yellow }]}>{hub?.collectiveBooster.progress ?? 0} / {hub?.collectiveBooster.target ?? 40}</Text><Text style={[styles.collectiveState, { color: colors.muted }]}>{hub?.collectiveBooster.claimed ? 'COLETADO' : hub?.collectiveBooster.status === 'ready' ? 'PRONTO' : 'CARREGANDO'}</Text></View>
        <View style={[styles.collectiveTrack, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.collectiveFill, { width: `${Math.min(100, ((hub?.collectiveBooster.progress ?? 0) / Math.max(1, hub?.collectiveBooster.target ?? 40)) * 100)}%`, backgroundColor: selected.color }]} /></View>
        <View style={styles.collectiveActions}>
          <Pressable onPress={() => router.push('/guild-wars')} style={[styles.guildWarsButton, { borderColor: selected.color }]}><Ionicons name="flash" size={17} color={selected.color} /><Text style={[styles.guildWarsText, { color: selected.color }]}>GUILD WARS</Text></Pressable>
          <Pressable onPress={() => router.push('/economy')} style={[styles.guildWarsButton, { borderColor: colors.yellow }]}><Ionicons name="cash" size={17} color={colors.yellow} /><Text style={[styles.guildWarsText, { color: colors.yellow }]}>TESOURO & PROJETOS</Text></Pressable>
          <Pressable disabled={!hub?.collectiveBooster.claimable} onPress={() => setCollectiveOpen(true)} style={[styles.collectiveButton, { backgroundColor: hub?.collectiveBooster.claimable ? colors.yellow : colors.surfaceAlt }]}><Ionicons name={hub?.collectiveBooster.claimed ? 'checkmark-circle' : 'gift'} size={18} color={hub?.collectiveBooster.claimable ? '#07111F' : colors.muted} /><Text style={[styles.collectiveButtonText, { color: hub?.collectiveBooster.claimable ? '#07111F' : colors.muted }]}>{hub?.collectiveBooster.claimed ? 'JÁ COLETADO' : hub?.collectiveBooster.claimable ? 'ABRIR BOOSTER' : 'AINDA NÃO PRONTO'}</Text></Pressable>
        </View>
      </View> : null}

      {isLeader ? <View style={[styles.managePanel, { backgroundColor: colors.surface, borderColor: selected?.color ?? colors.border }]}>
        <View style={styles.manageHeader}><View style={[styles.manageIcon, { backgroundColor: selected!.color + '22' }]}><Ionicons name="person-add" size={20} color={selected!.color} /></View><View style={{ flex: 1 }}><Text style={[styles.manageTitle, { color: colors.text }]}>Convidar treinador</Text><Text style={[styles.manageText, { color: colors.muted }]}>Somente você, como chefe, pode convidar e administrar membros.</Text></View></View>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Ionicons name="search" size={18} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} onSubmitEditing={searchPlayers} placeholder="Buscar por nickname..." placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.searchInput, { color: colors.text }]} /><Pressable onPress={() => void searchPlayers()} style={[styles.searchButton, { backgroundColor: selected!.color }]}><Text style={styles.searchText}>{searching ? '...' : 'BUSCAR'}</Text></Pressable></View>
        {results.map((player) => (
          <CompactTrainerBanner
            key={player.id}
            frameId={player.equipped_frame_id}
            backgroundId={player.equipped_background_id}
            fallbackColor={selected!.color}
          >
            <View style={[styles.searchResult, { borderColor: colors.border }]}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/player/${player.id}`)}>
                <Text style={[styles.memberName, { color: colors.text }]}>@{player.username}</Text>
                <Text style={[styles.memberMeta, { color: colors.muted }]}>Nível {player.level}</Text>
              </Pressable>
              <Pressable disabled={working === `invite:${player.id}`} onPress={() => void run(`invite:${player.id}`, () => inviteToGuild(selected!.id, player.id), 'Convite enviado.')} style={[styles.inviteButton, { backgroundColor: selected!.color }]}>
                <Ionicons name="send" size={14} color="#fff" /><Text style={styles.inviteButtonText}>CONVIDAR</Text>
              </Pressable>
            </View>
          </CompactTrainerBanner>
        ))}
      </View> : null}
      <PackOpeningModal
        visible={collectiveOpen}
        pack={collectiveOpen ? ({
          id: 'guild-collective',
          name: 'Guild Collective Booster',
          set_id: 'guild',
          price: 0,
          base_price: 0,
          free_until: null,
          cards_per_pack: 5,
          image_url: null,
          art_url: null,
          booster_art_url: null,
          booster_art_urls: [],
          booster_back_url: null,
          booster_logo_url: null,
          booster_art_source: null,
          release_date: null,
          generation: null,
          rarity_score: 0,
          active: true,
          currency: 'coins',
        } as Pack) : null}
        onClose={() => setCollectiveOpen(false)}
        onPurchase={openCollectivePack}
        onFinished={() => { void load(true); }}
      />
    </Screen>
  );
}

function GuildDetail({
  guild, myGuildId, myRole, working, weeklyReward, onClaimWeeklyReward, onJoin, onLeave, onOpenPlayer, onKick, onSetRole, avatars,
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
  avatars: Record<string, PlayerAvatarMeta>;
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
    <View style={styles.memberList}>
      {guild.members.length === 0 ? <Text style={[styles.noMembers, { color: colors.muted }]}>Nenhum membro ainda. Seja o primeiro a entrar.</Text> : guild.members.map((member) => {
        const identity=avatars[member.id];
        return (
          <CompactTrainerBanner
            key={member.id}
            frameId={identity?.frameId}
            backgroundId={identity?.backgroundId}
            fallbackColor={guild.color}
          >
            <View style={[styles.memberRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Pressable style={styles.memberIdentity} onPress={() => onOpenPlayer(member.id)}>
                <TrainerAvatar icon={identity?.profileIcon} avatarUrl={getProfileAvatarUrl(identity?.avatarPath,identity?.avatarUpdatedAt)} color={guild.color} backgroundColor={guild.color + '25'} size={38}/>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: colors.text }]}>@{member.username}</Text>
                  <Text style={[styles.memberMeta, { color: colors.muted }]}>Nível {member.level} • {member.role === 'leader' ? 'Chefe' : member.role === 'officer' ? 'Oficial' : 'Membro'}</Text>
                </View>
              </Pressable>
              {leader && member.role !== 'leader' ? (
                <View style={styles.memberActions}>
                  <Pressable disabled={working === `role:${member.id}`} onPress={() => onSetRole(member, member.role === 'officer' ? 'member' : 'officer')} style={[styles.roleButton, { borderColor: guild.color }]}><Text style={[styles.roleText, { color: guild.color }]}>{member.role === 'officer' ? 'MEMBRO' : 'OFICIAL'}</Text></Pressable>
                  <Pressable disabled={working === `kick:${member.id}`} onPress={() => onKick(member)} style={styles.kick}><Ionicons name="person-remove" size={16} color="#FF9FAF" /></Pressable>
                </View>
              ) : <Ionicons name="chevron-forward" size={17} color={colors.muted} />}
            </View>
          </CompactTrainerBanner>
        );
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({storyPanel:{borderRadius:20,borderWidth:1,padding:13,gap:9},storyHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},storyKicker:{fontSize:7,fontWeight:'900',letterSpacing:.9},storyTitle:{fontSize:16,fontWeight:'900',marginTop:2},storyHint:{fontSize:7.5,marginTop:2},storyList:{gap:6},storyRow:{borderRadius:13,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:8},storyIcon:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center'},storyText:{fontSize:8.5,lineHeight:12},storyTime:{fontSize:6.5,marginTop:2},
  topRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  guildHero:{minHeight:180,borderRadius:28,borderWidth:1,padding:17,overflow:'hidden',position:'relative'},
  guildAuraContent:{minHeight:90,position:'relative',justifyContent:'center'},
  guildAuraStats:{flexDirection:'row',flexWrap:'wrap',gap:7,paddingRight:115,zIndex:2},
  guildAuraPokemon:{position:'absolute',right:-10,bottom:-25,width:150,height:150,opacity:.34,transform:[{rotate:'6deg'}]},
  guildHeroGlow:{position:'absolute',right:-75,top:-95,width:280,height:280,borderRadius:999,opacity:.14},
  guildHeroPokemon:{position:'absolute',right:-22,bottom:-40,width:205,height:215,opacity:.22,transform:[{rotate:'6deg'}]},
  guildHeroCopy:{maxWidth:650,zIndex:2},
  guildHeroKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.25},
  guildHeroTitle:{fontSize:25,fontWeight:'900',marginTop:3},
  guildHeroText:{fontSize:10,lineHeight:15,marginTop:4,maxWidth:470},
  guildHeroStats:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:14,paddingRight:90},
  guildHeroStat:{minWidth:76,borderRadius:13,borderWidth:1,paddingHorizontal:10,paddingVertical:8},
  guildHeroStatValue:{fontSize:16,fontWeight:'900'},
  guildHeroStatLabel:{fontSize:7,fontWeight:'900',letterSpacing:.65,marginTop:1},
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
  guildCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, borderWidth: 1, padding: 12 },
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
  detail: { borderRadius: 26, borderWidth: 1, padding: 16, gap: 14 },
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
  memberName: { fontSize: 12, fontWeight: '900', textShadowColor:'#000000FF', textShadowOffset:{width:0,height:1}, textShadowRadius:4 },
  memberMeta: { fontSize: 8, marginTop: 2 },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  roleButton: { minHeight: 34, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  roleText: { fontSize: 7, fontWeight: '900' },
  kick: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#351A24', alignItems: 'center', justifyContent: 'center' },
  noMembers: { textAlign: 'center', paddingVertical: 14, fontSize: 10 },
  collectivePanel: { borderRadius: 21, borderWidth: 1, padding: 14, gap: 11 },
  collectiveHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  collectiveIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  collectiveTitle: { fontSize: 16, fontWeight: '900' },
  collectiveText: { fontSize: 8, lineHeight: 13, marginTop: 3 },
  collectiveStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  collectiveProgress: { fontSize: 15, fontWeight: '900' },
  collectiveState: { fontSize: 8, fontWeight: '900' },
  collectiveTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  collectiveFill: { height: '100%', borderRadius: 999 },
  collectiveActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  guildWarsButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  guildWarsText: { fontSize: 8, fontWeight: '900' },
  collectiveButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  collectiveButtonText: { fontSize: 8, fontWeight: '900' },
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
