import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getMyOwnedPokedexNumbers } from '@/services/pokedex';
import { getMyOwnedSetCounts, getSetCatalog } from '@/services/collections';
import {
  claimCollectionMilestone,
  claimDailyLogin,
  getRetentionHub,
  seasonDivision,
  type RetentionHub,
} from '@/services/retention';
import { useAppTheme } from '@/theme/ThemeProvider';

const TOTAL_MILESTONES = [50,151,251,386,493,649,721,809,905,1025];

export default function SeasonScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [hub, setHub] = useState<RetentionHub | null>(null);
  const [ownedNumbers, setOwnedNumbers] = useState<number[]>([]);
  const [completedSets, setCompletedSets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [next, numbers, catalog, counts] = await Promise.all([
        getRetentionHub(),
        getMyOwnedPokedexNumbers(),
        getSetCatalog(),
        getMyOwnedSetCounts(),
      ]);
      setHub(next);
      setOwnedNumbers(numbers);
      setCompletedSets(catalog.filter((set) => (counts.get(set.set_id) ?? 0) >= set.total_cards).map((set) => set.set_id));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const claimed = useMemo(() => new Set((hub?.milestoneClaims ?? []).map((m) => `${m.kind}:${m.key}`)), [hub?.milestoneClaims]);
  const points = Number(hub?.season?.my.points ?? 0);
  const division = seasonDivision(points);
  const nextProgress = division.next ? Math.min(100, Math.max(0, (points - division.min) / (division.next - division.min) * 100)) : 100;
  const timeLeft = hub?.season ? Math.max(0, new Date(hub.season.endsAt).getTime() - Date.now()) : 0;
  const daysLeft = Math.ceil(timeLeft / 86400000);

  async function dailyClaim() {
    if (working) return;
    try {
      setWorking('daily');
      const result = await claimDailyLogin();
      setNotice(result.claimed ? `🔥 Streak ${result.streak}: +🪙 ${result.coins.toLocaleString('pt-BR')}${result.diamonds ? ` +💎 ${result.diamonds}` : ''}` : 'A recompensa de hoje já foi coletada.');
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Não foi possível coletar a recompensa.');
    } finally { setWorking(null); }
  }

  async function claim(kind:'pokedex_total'|'pokedex_gen'|'set_complete', key:string) {
    const token=`${kind}:${key}`;
    if (working) return;
    try {
      setWorking(token);
      const reward=await claimCollectionMilestone(kind,key);
      setNotice(`Recompensa coletada: 🪙 ${reward.coins.toLocaleString('pt-BR')} + 💎 ${reward.diamonds}`);
      await load();
    } catch(e) {
      setNotice(e instanceof Error?e.message:'Não foi possível coletar a recompensa.');
    } finally { setWorking(null); }
  }

  return <Screen title="Temporada & Jornada" subtitle="Ranque, streak, eventos e recompensas de coleção em um só lugar.">
    <Pressable style={styles.back} onPress={()=>router.back()}><Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>
    {notice?<Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text><Ionicons name="close" size={16} color={colors.muted}/></Pressable>:null}
    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}

    {hub?.season?<View style={[styles.hero,{backgroundColor:colors.surface,borderColor:hub.season.themeColor}]}>
      <View style={styles.heroTop}><View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>TEMPORADA ATIVA • {daysLeft} DIA(S)</Text><Text style={[styles.title,{color:colors.text}]}>{hub.season.name}</Text><Text style={[styles.sub,{color:colors.muted}]}>{hub.season.subtitle}</Text></View><View style={[styles.divisionBadge,{borderColor:hub.season.themeColor}]}><Text style={styles.divisionIcon}>{division.icon}</Text><Text style={[styles.divisionName,{color:colors.text}]}>{division.label}</Text></View></View>
      <View style={styles.pointsRow}><Text style={[styles.points,{color:colors.yellow}]}>{points.toLocaleString('pt-BR')} pts</Text><Text style={[styles.sub,{color:colors.muted}]}>{hub.season.my.wins}V • {hub.season.my.losses}D • {hub.season.my.matches} partidas</Text></View>
      <View style={[styles.track,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.fill,{width:`${nextProgress}%`,backgroundColor:hub.season.themeColor}]}/></View>
      <View style={styles.quickLinks}><Pressable onPress={()=>router.push('/(tabs)/battles')} style={[styles.quick,{borderColor:colors.accent}]}><Ionicons name="flash" size={18} color={colors.accent}/><Text style={[styles.quickText,{color:colors.text}]}>BUSCAR PARTIDA</Text></Pressable><Pressable onPress={()=>router.push('/wishlist')} style={[styles.quick,{borderColor:colors.yellow}]}><Ionicons name="star" size={18} color={colors.yellow}/><Text style={[styles.quickText,{color:colors.text}]}>WISHLIST ({hub.wishlistCount})</Text></Pressable></View>
    </View>:null}

    <View style={[styles.panel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={styles.panelHead}><View><Text style={[styles.sectionTitle,{color:colors.text}]}>🔥 Recompensa diária</Text><Text style={[styles.sub,{color:colors.muted}]}>Ciclo de 7 dias com Diamante no sétimo.</Text></View><Text style={[styles.streak,{color:colors.yellow}]}>{hub?.login.currentStreak??0} dias</Text></View>
      <Pressable disabled={working==='daily'||hub?.login.claimedToday} onPress={()=>void dailyClaim()} style={[styles.primary,{backgroundColor:hub?.login.claimedToday?colors.surfaceAlt:colors.yellow}]}><Text style={[styles.primaryText,hub?.login.claimedToday&&{color:colors.muted}]}>{hub?.login.claimedToday?'COLETADO HOJE':'COLETAR RECOMPENSA'}</Text></Pressable>
    </View>

    {(hub?.activeEvents.length??0)>0?<View style={styles.stack}><Text style={[styles.sectionTitle,{color:colors.text}]}>Eventos ao vivo</Text>{hub!.activeEvents.map((event)=><View key={event.id} style={[styles.event,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Ionicons name="sparkles" size={20} color={colors.yellow}/><View style={{flex:1}}><Text style={[styles.eventTitle,{color:colors.text}]}>{event.type.replaceAll('_',' ').toUpperCase()}</Text><Text style={[styles.sub,{color:colors.muted}]}>Até {new Date(event.endsAt).toLocaleString('pt-BR')}</Text></View></View>)}</View>:null}

    <View style={styles.stack}><Text style={[styles.sectionTitle,{color:colors.text}]}>Recompensas da Pokédex</Text>{TOTAL_MILESTONES.map((target)=>{const done=ownedNumbers.length>=target;const got=claimed.has(`pokedex_total:${target}`);return <View key={target} style={[styles.rewardRow,{backgroundColor:colors.surface,borderColor:done?colors.accent:colors.border}]}><View style={{flex:1}}><Text style={[styles.rewardTitle,{color:colors.text}]}>{target} espécies</Text><Text style={[styles.sub,{color:colors.muted}]}>{Math.min(ownedNumbers.length,target)} / {target}</Text></View><Pressable disabled={!done||got||Boolean(working)} onPress={()=>void claim('pokedex_total',String(target))} style={[styles.claim,{backgroundColor:got?colors.surfaceAlt:done?colors.yellow:colors.surfaceAlt}]}><Text style={[styles.claimText,{color:done&&!got?'#07111F':colors.muted}]}>{got?'COLETADO':done?'COLETAR':'BLOQUEADO'}</Text></Pressable></View>;})}</View>

    {completedSets.length?<View style={styles.stack}><Text style={[styles.sectionTitle,{color:colors.text}]}>Sets 100% completos</Text>{completedSets.slice(0,12).map((setId)=>{const got=claimed.has(`set_complete:${setId}`);return <View key={setId} style={[styles.rewardRow,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><View style={{flex:1}}><Text style={[styles.rewardTitle,{color:colors.text}]}>{setId.toUpperCase()}</Text><Text style={[styles.sub,{color:colors.muted}]}>Coleção completa</Text></View><Pressable disabled={got||Boolean(working)} onPress={()=>void claim('set_complete',setId)} style={[styles.claim,{backgroundColor:got?colors.surfaceAlt:colors.yellow}]}><Text style={[styles.claimText,{color:got?colors.muted:'#07111F'}]}>{got?'COLETADO':'COLETAR'}</Text></Pressable></View>;})}</View>:null}

    {hub?.guild?<View style={[styles.panel,{backgroundColor:colors.surface,borderColor:hub.guild.color}]}><Text style={[styles.sectionTitle,{color:colors.text}]}>🛡️ {hub.guild.name} • Nível {hub.guild.level}</Text><Text style={[styles.sub,{color:colors.muted}]}>{hub.guild.xp.toLocaleString('pt-BR')} XP coletiva • packs e batalhas ranqueadas alimentam a guilda.</Text><View style={[styles.track,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.fill,{width:`${Math.min(100,(hub.guild.xp%500)/5)}%`,backgroundColor:hub.guild.color}]}/></View></View>:null}

    {(hub?.season?.top.length??0)>0?<View style={styles.stack}><Text style={[styles.sectionTitle,{color:colors.text}]}>Top da temporada</Text>{hub!.season!.top.slice(0,10).map((row)=><Pressable key={row.playerId} onPress={()=>router.push(`/player/${row.playerId}`)} style={[styles.rankRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.rankNo,{color:row.rank<=3?colors.yellow:colors.muted}]}>#{row.rank}</Text><View style={{flex:1}}><Text style={[styles.rewardTitle,{color:colors.text}]}>@{row.username}</Text><Text style={[styles.sub,{color:colors.muted}]}>{row.wins} vitórias • {row.matches} partidas</Text></View><Text style={[styles.rankPoints,{color:colors.yellow}]}>{row.points}</Text></Pressable>)}</View>:null}
  </Screen>;
}

const styles=StyleSheet.create({
  back:{alignSelf:'flex-start',flexDirection:'row',gap:7,alignItems:'center'},backText:{fontSize:11,fontWeight:'800'},
  notice:{borderRadius:14,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,fontSize:10,fontWeight:'800'},
  hero:{borderRadius:24,borderWidth:1,padding:16,gap:13},heroTop:{flexDirection:'row',gap:12,alignItems:'flex-start'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2},title:{fontSize:27,fontWeight:'900',marginTop:3},sub:{fontSize:9,lineHeight:14},divisionBadge:{width:88,borderRadius:18,borderWidth:1,padding:10,alignItems:'center'},divisionIcon:{fontSize:25},divisionName:{fontSize:10,fontWeight:'900',marginTop:3},pointsRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',gap:10},points:{fontSize:23,fontWeight:'900'},track:{height:8,borderRadius:99,overflow:'hidden'},fill:{height:'100%',borderRadius:99},quickLinks:{flexDirection:'row',flexWrap:'wrap',gap:8},quick:{minHeight:44,borderRadius:13,borderWidth:1,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:7},quickText:{fontSize:9,fontWeight:'900'},
  panel:{borderRadius:20,borderWidth:1,padding:14,gap:11},panelHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},sectionTitle:{fontSize:17,fontWeight:'900'},streak:{fontSize:18,fontWeight:'900'},primary:{minHeight:48,borderRadius:14,alignItems:'center',justifyContent:'center'},primaryText:{color:'#07111F',fontSize:10,fontWeight:'900'},stack:{gap:8},event:{minHeight:62,borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:10},eventTitle:{fontSize:11,fontWeight:'900'},
  rewardRow:{minHeight:66,borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:9},rewardTitle:{fontSize:12,fontWeight:'900'},claim:{minHeight:36,minWidth:90,borderRadius:10,alignItems:'center',justifyContent:'center',paddingHorizontal:9},claimText:{fontSize:8,fontWeight:'900'},
  rankRow:{minHeight:62,borderRadius:15,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:10},rankNo:{width:34,fontSize:13,fontWeight:'900'},rankPoints:{fontSize:15,fontWeight:'900'},
});
