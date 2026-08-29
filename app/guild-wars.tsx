import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import { getGuildHub, subscribeToGuilds, type GuildHub, type GuildWar } from '@/services/guilds';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getThemeVisual } from '@/theme/themeCatalog';

export default function GuildWarsScreen() {
  const router = useRouter();
  const { colors, themeName } = useAppTheme();
  const themeVisual = getThemeVisual(themeName);
  const [hub, setHub] = useState<GuildHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      setHub(await getGuildHub());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar Guild Wars.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => subscribeToGuilds(() => { void load(true); }), [load]);

  const active = useMemo(() => hub?.wars.filter((war) => war.status === 'active') ?? [], [hub?.wars]);
  const recent = useMemo(() => hub?.wars.filter((war) => war.status === 'completed') ?? [], [hub?.wars]);

  return (
    <Screen title="Guild Wars Arena" subtitle="Confrontos ranqueados entre guildas, pontuação semanal e contribuição coletiva.">
      <Pressable style={styles.back} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText, { color: colors.muted }]}>Voltar às Guildas</Text>
      </Pressable>

      <View style={[styles.warHero,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
        <View style={[styles.warHeroGlow,{backgroundColor:colors.accent}]} />
        <Image source={{uri:themeVisual.image}} resizeMode="contain" style={styles.warHeroPokemon}/>
        <View style={styles.warHeroCopy}>
          <Text style={[styles.warHeroKicker,{color:colors.yellow}]}>WEEKLY GUILD CONFLICT</Text>
          <Text style={[styles.warHeroTitle,{color:colors.text}]}>Defenda as cores da sua guilda.</Text>
          <Text style={[styles.warHeroText,{color:colors.muted}]}>Cada batalha ranqueada contra a guilda rival contribui para o placar coletivo da semana.</Text>
          <View style={styles.warHeroStats}>
            <View style={[styles.warHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.warHeroValue,{color:colors.text}]}>{active.length}</Text><Text style={[styles.warHeroLabel,{color:colors.muted}]}>ATIVOS</Text></View>
            <View style={[styles.warHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.warHeroValue,{color:colors.text}]}>{recent.length}</Text><Text style={[styles.warHeroLabel,{color:colors.muted}]}>RECENTES</Text></View>
            <View style={[styles.warHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.warHeroValue,{color:colors.yellow}]}>{hub?.myMembership ? 'ATIVA' : '—'}</Text><Text style={[styles.warHeroLabel,{color:colors.muted}]}>SUA GUILDA</Text></View>
          </View>
        </View>
      </View>

      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      <View style={[styles.rule, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="flash" size={23} color={colors.yellow} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.ruleTitle, { color: colors.text }]}>Como pontua</Text>
          <Text style={[styles.ruleText, { color: colors.muted }]}>Vitória ranqueada contra a guilda rival: +3. Participação do derrotado: +1. A guilda vencedora recebe +100 XP ao fim da semana.</Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/battles')} style={[styles.play, { backgroundColor: colors.yellow }]}><Text style={styles.playText}>BATALHAR</Text></Pressable>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Confrontos ativos</Text>
      {active.length ? active.map((war) => <War key={war.id} war={war} myGuildId={hub?.myMembership?.guildId ?? null} />) : <Text style={[styles.empty, { color: colors.muted }]}>Nenhum confronto ativo.</Text>}

      {recent.length ? <>
        <Text style={[styles.section, { color: colors.text }]}>Últimos resultados</Text>
        {recent.slice(0, 4).map((war) => <War key={war.id} war={war} myGuildId={hub?.myMembership?.guildId ?? null} />)}
      </> : null}
    </Screen>
  );
}

function War({ war, myGuildId }: { war: GuildWar; myGuildId: string | null }) {
  const { colors } = useAppTheme();
  const aWin = war.guildA.score > war.guildB.score;
  const bWin = war.guildB.score > war.guildA.score;
  return (
    <View style={[styles.war, { backgroundColor: colors.surface, borderColor: myGuildId === war.guildA.id ? war.guildA.color : myGuildId === war.guildB.id ? war.guildB.color : colors.border }]}>
      <Text style={[styles.week, { color: colors.muted }]}>SEMANA {new Date(war.weekStart).toLocaleDateString('pt-BR')}</Text>
      <View style={styles.scoreRow}>
        <View style={styles.team}>
          <View style={[styles.dot, { backgroundColor: war.guildA.color }]} />
          <Text style={[styles.teamName, { color: aWin ? war.guildA.color : colors.text }]}>{war.guildA.name}</Text>
          <Text style={[styles.score, { color: war.guildA.color }]}>{war.guildA.score}</Text>
        </View>
        <Text style={[styles.vs, { color: colors.muted }]}>×</Text>
        <View style={[styles.team, { alignItems: 'flex-end' }]}>
          <View style={[styles.dot, { backgroundColor: war.guildB.color }]} />
          <Text style={[styles.teamName, { color: bWin ? war.guildB.color : colors.text }]}>{war.guildB.name}</Text>
          <Text style={[styles.score, { color: war.guildB.color }]}>{war.guildB.score}</Text>
        </View>
      </View>
      {war.contributors.length ? (
        <View style={styles.contributors}>
          <Text style={[styles.conTitle, { color: colors.muted }]}>TOP CONTRIBUIDORES</Text>
          {war.contributors.slice(0, 5).map((contributor, index) => (
            <View key={contributor.playerId} style={styles.conRow}>
              <Text style={[styles.rank, { color: colors.yellow }]}>#{index + 1}</Text>
              <Text style={[styles.conName, { color: colors.text }]}>@{contributor.username}</Text>
              <Text style={[styles.conPts, { color: colors.yellow }]}>{contributor.points} pts</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center' },
  warHero:{minHeight:180,borderRadius:28,borderWidth:1,padding:16,overflow:'hidden',position:'relative'},
  warHeroGlow:{position:'absolute',right:-70,top:-90,width:270,height:270,borderRadius:999,opacity:.14},
  warHeroPokemon:{position:'absolute',right:-20,bottom:-42,width:195,height:210,opacity:.21,transform:[{rotate:'7deg'}]},
  warHeroCopy:{maxWidth:640,zIndex:2},
  warHeroKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2},
  warHeroTitle:{fontSize:22,fontWeight:'900',marginTop:3},
  warHeroText:{fontSize:10,lineHeight:15,marginTop:4,maxWidth:460},
  warHeroStats:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:13,paddingRight:85},
  warHeroStat:{minWidth:75,borderRadius:13,borderWidth:1,paddingHorizontal:10,paddingVertical:8},
  warHeroValue:{fontSize:15,fontWeight:'900'},
  warHeroLabel:{fontSize:7,fontWeight:'900',letterSpacing:.6,marginTop:1},
  backText: { fontSize: 11, fontWeight: '800' },
  error: { borderRadius: 14, padding: 11, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' },
  errorText: { color: '#FFD7DD', fontSize: 10, fontWeight: '800' },
  rule: { borderRadius: 20, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleTitle: { fontSize: 12, fontWeight: '900' },
  ruleText: { fontSize: 8, lineHeight: 12, marginTop: 2 },
  play: { minHeight: 38, borderRadius: 11, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#07111F', fontSize: 8, fontWeight: '900' },
  section: { fontSize: 19, fontWeight: '900' },
  empty: { fontSize: 10 },
  war: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 10 },
  week: { fontSize: 8, fontWeight: '900' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  team: { flex: 1, gap: 3 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  teamName: { fontSize: 11, fontWeight: '900' },
  score: { fontSize: 27, fontWeight: '900' },
  vs: { fontSize: 13, fontWeight: '900' },
  contributors: { borderTopWidth: 1, borderTopColor: '#2B2B2B', paddingTop: 8, gap: 5 },
  conTitle: { fontSize: 7, fontWeight: '900' },
  conRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rank: { width: 25, fontSize: 8, fontWeight: '900' },
  conName: { flex: 1, fontSize: 9, fontWeight: '800' },
  conPts: { fontSize: 9, fontWeight: '900' },
});
