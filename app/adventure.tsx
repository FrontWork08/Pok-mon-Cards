import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getAdventureHub, startAdventureBattle, type AdventureHub, type AdventureKind } from '@/services/adventure';

type ModeCardProps={icon:keyof typeof Ionicons.glyphMap;title:string;subtitle:string;meta:string;accent:string;disabled?:boolean;onPress:()=>void;button?:string};

export default function AdventureHubScreen(){
  const router=useRouter();
  const{colors}=useAppTheme();
  const[hub,setHub]=useState<AdventureHub|null>(null);
  const[loading,setLoading]=useState(true);
  const[working,setWorking]=useState<string|null>(null);
  const[notice,setNotice]=useState<string|null>(null);

  const load=useCallback(async()=>{try{setLoading(true);setNotice(null);setHub(await getAdventureHub())}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível abrir a Jornada Trainer.')}finally{setLoading(false)}},[]);
  useFocusEffect(useCallback(()=>{void load()},[load]));

  async function launch(kind:AdventureKind,refId?:string|null){if(working)return;try{setWorking(`${kind}:${refId??''}`);setNotice(null);const result=await startAdventureBattle(kind,refId);router.push(result.route as any)}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível iniciar esta batalha.')}finally{setWorking(null)}}

  const kantoPct=hub?.kanto.total?Math.round(hub.kanto.completed/hub.kanto.total*100):0;
  const raidPct=hub?.raid.hasGuild&&hub.raid.maxHp?Math.max(0,Math.min(100,Math.round((1-(Number(hub.raid.currentHp??0)/Math.max(1,Number(hub.raid.maxHp))))*100))):0;
  const nextChallenge=useMemo(()=>hub?.challenges.find(item=>item.wins===0)??hub?.challenges[0]??null,[hub?.challenges]);

  return <Screen title="Trainer Adventure" subtitle="Jornada, Battle Tower, Elite Four, Raids, Roguelike e desafios usando o mesmo motor Game Boy 3×3.">
    {notice?<Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Ionicons name="information-circle" size={18} color={colors.yellow}/><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text><Ionicons name="close" size={17} color={colors.muted}/></Pressable>:null}
    {loading?<View style={styles.loading}><ActivityIndicator size="large" color={colors.accent}/><Text style={{color:colors.muted}}>Carregando sua aventura...</Text></View>:null}
    {hub? <>
      <View style={[styles.hero,{backgroundColor:colors.surface,borderColor:colors.accent}]}>
        <View style={[styles.heroIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="map" size={34} color={colors.yellow}/></View>
        <View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>TRAINER COLLECTION 1.2</Text><Text style={[styles.heroTitle,{color:colors.text}]}>Sua aventura agora tem começo, chefes e endgame.</Text><Text style={[styles.heroText,{color:colors.muted}]}>Cada modo usa HP, PP, tipos, golpes, troca de Pokémon e IA do motor game_v1. O 3D é visual; as regras continuam no servidor.</Text></View>
        <View style={[styles.versionBadge,{borderColor:colors.accent}]}><Text style={[styles.versionText,{color:colors.accent}]}>v{hub.version}</Text></View>
      </View>

      {hub.worldEvent?<View style={[styles.eventCard,{backgroundColor:'#321D25',borderColor:'#C95772'}]}><View style={styles.eventHead}><Ionicons name="alert-circle" size={22} color="#FF8EA6"/><View style={{flex:1}}><Text style={styles.eventKicker}>EVENTO SURPRESA ATIVO</Text><Text style={styles.eventTitle}>{hub.worldEvent.title}</Text><Text style={styles.eventText}>{hub.worldEvent.description} • {String(hub.worldEvent.type??'livre').toUpperCase()}</Text></View></View><Pressable disabled={!!working} onPress={()=>void launch('world_event',hub.worldEvent?.id)} style={styles.eventButton}><Ionicons name="flash" size={17} color="#16070B"/><Text style={styles.eventButtonText}>ENFRENTAR AGORA</Text></Pressable></View>:null}

      <Pressable onPress={()=>router.push('/kanto-adventure')} style={[styles.kantoCard,{backgroundColor:colors.surface,borderColor:colors.yellow}]}>
        <View style={styles.row}><View style={[styles.modeIcon,{backgroundColor:'#302A12'}]}><Ionicons name="map-outline" size={27} color={colors.yellow}/></View><View style={{flex:1}}><Text style={[styles.modeTitle,{color:colors.text}]}>Jornada Kanto</Text><Text style={[styles.modeSub,{color:colors.muted}]}>Rotas → 8 Ginásios → Elite Four → Campeão</Text></View><Ionicons name="chevron-forward" size={21} color={colors.yellow}/></View>
        <View style={styles.progressHead}><Text style={[styles.progressText,{color:colors.text}]}>{hub.kanto.completed}/{hub.kanto.total} etapas • {hub.kanto.stars}/{hub.kanto.maxStars} ★</Text><Text style={[styles.progressText,{color:colors.yellow}]}>{kantoPct}%</Text></View><View style={[styles.track,{backgroundColor:colors.border}]}><View style={[styles.fill,{width:`${kantoPct}%`,backgroundColor:colors.yellow}]}/></View>
      </Pressable>

      <Text style={[styles.sectionTitle,{color:colors.text}]}>ENDGAME</Text>
      <View style={styles.grid}>
        <ModeCard icon="business" title="Battle Tower" subtitle="Suba até onde conseguir. Chefes a cada 5 andares." meta={`Andar ${hub.tower.floor} • recorde ${hub.tower.bestFloor}`} accent="#8DD7FF" onPress={()=>void launch('tower')} button="SUBIR"/>
        <ModeCard icon="shield-checkmark" title="Elite Four semanal" subtitle="Cinco estágios que mudam de dificuldade ao longo da Liga." meta={hub.elite.completed?'CONCLUÍDO ESTA SEMANA':`Estágio ${hub.elite.stage}/5 • ${hub.elite.wins} vitórias`} accent="#D4A6FF" onPress={()=>void launch('elite')} disabled={hub.elite.completed} button={hub.elite.completed?'CONCLUÍDO':'DESAFIAR'}/>
        <ModeCard icon="people" title="Raid de Guilda" subtitle={hub.raid.hasGuild?`${hub.raid.name??'Boss'} • ${String(hub.raid.type??'').toUpperCase()}`:'Entre em uma guilda para liberar o boss coletivo.'} meta={hub.raid.hasGuild?`${raidPct}% derrotado • seu dano ${Number(hub.raid.myDamage??0).toLocaleString('pt-BR')}`:'GUILDA NECESSÁRIA'} accent="#65D894" onPress={()=>void launch('raid')} disabled={!hub.raid.hasGuild||hub.raid.defeated} button={hub.raid.defeated?'DERROTADO':'ATACAR'}/>
        <ModeCard icon="dice" title="Rogue Draft Run" subtitle="Pool limitado da sua coleção, novos Pokémon ao avançar e fim da run ao perder." meta={hub.rogue.active?`Andar ${hub.rogue.floor} • pool ${hub.rogue.cards.length}`:'NOVA RUN'} accent="#FFB16A" onPress={()=>void launch('rogue')} button={hub.rogue.active?'CONTINUAR':'COMEÇAR'}/>
      </View>

      <Text style={[styles.sectionTitle,{color:colors.text}]}>DESAFIOS & LEGADO</Text>
      {nextChallenge?<Pressable onPress={()=>router.push('/adventure-challenges')} style={[styles.wideCard,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={[styles.modeIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="flask" size={25} color={colors.accent}/></View><View style={{flex:1}}><Text style={[styles.modeTitle,{color:colors.text}]}>Desafios especiais</Text><Text style={[styles.modeSub,{color:colors.muted}]}>{nextChallenge.title} • {nextChallenge.requiredType?`somente ${nextChallenge.requiredType.toUpperCase()}`:'equipe livre'} • até 3★</Text></View><Text style={[styles.badgeText,{color:colors.accent}]}>{hub.challenges.filter(c=>c.wins>0).length}/{hub.challenges.length}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>:null}

      <Pressable disabled={!hub.champion||!!working} onPress={()=>void launch('champion',hub.champion?.snapshotId)} style={[styles.wideCard,{backgroundColor:colors.surface,borderColor:'#B99843',opacity:hub.champion?1:.55}]}><View style={[styles.modeIcon,{backgroundColor:'#352D17'}]}><Ionicons name="trophy" size={25} color="#FFD447"/></View><View style={{flex:1}}><Text style={[styles.modeTitle,{color:colors.text}]}>Desafio do Campeão</Text><Text style={[styles.modeSub,{color:colors.muted}]}>{hub.champion?`Enfrente a cópia IA do TOP 1: @${hub.champion.name} • ELO ${hub.champion.rating}`:'Aguardando um campeão elegível.'}</Text></View><Ionicons name="flash" size={18} color="#FFD447"/></Pressable>

      <View style={styles.linkGrid}>
        <QuickLink icon="ribbon" label="Maestria Pokémon" meta={`${hub.mastery.total} dominados • Nv. ${hub.mastery.maxLevel}`} onPress={()=>router.push('/pokemon-mastery')}/>
        <QuickLink icon="stats-chart" label="Recordes pessoais" meta={`${hub.records.items.length} recordes`} onPress={()=>router.push('/battle-records')}/>
        <QuickLink icon="medal" label="Hall da Fama" meta="Campeões e história" onPress={()=>router.push('/hall-of-fame')}/>
        <QuickLink icon="videocam" label="Replays" meta="Reviva grandes batalhas" onPress={()=>router.push('/replay-pro')}/>
        <QuickLink icon="school" label="Carreira Trainer" meta="Progresso geral" onPress={()=>router.push('/career')}/>
        <QuickLink icon="calendar" label="Temporada" meta="Ranking e recompensas" onPress={()=>router.push('/season')}/>
      </View>
    </>:null}
  </Screen>;
}

function ModeCard({icon,title,subtitle,meta,accent,disabled,onPress,button='JOGAR'}:ModeCardProps){return <View style={[styles.modeCard,{borderColor:accent+'77'}]}><View style={[styles.modeIcon,{backgroundColor:accent+'18'}]}><Ionicons name={icon} size={25} color={accent}/></View><Text style={styles.staticTitle}>{title}</Text><Text style={styles.staticSub}>{subtitle}</Text><Text style={[styles.modeMeta,{color:accent}]}>{meta}</Text><Pressable disabled={disabled} onPress={onPress} style={[styles.modeButton,{backgroundColor:disabled?'#34404C':accent}]}><Text style={[styles.modeButtonText,{color:disabled?'#8B98A5':'#07111F'}]}>{button}</Text></Pressable></View>}
function QuickLink({icon,label,meta,onPress}:{icon:keyof typeof Ionicons.glyphMap;label:string;meta:string;onPress:()=>void}){return <Pressable onPress={onPress} style={styles.quick}><Ionicons name={icon} size={20} color="#8DD7FF"/><View style={{flex:1}}><Text style={styles.quickLabel}>{label}</Text><Text style={styles.quickMeta}>{meta}</Text></View><Ionicons name="chevron-forward" size={16} color="#6F8496"/></Pressable>}

const styles=StyleSheet.create({
 notice:{borderWidth:1,borderRadius:12,padding:11,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,fontSize:12,fontWeight:'700'},loading:{alignItems:'center',padding:28,gap:10},
 hero:{borderWidth:1,borderRadius:20,padding:16,flexDirection:'row',alignItems:'center',gap:13},heroIcon:{width:60,height:60,borderRadius:18,alignItems:'center',justifyContent:'center'},kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.1},heroTitle:{fontSize:18,fontWeight:'900',marginTop:3},heroText:{fontSize:11,lineHeight:16,marginTop:4},versionBadge:{borderWidth:1,borderRadius:99,paddingHorizontal:8,paddingVertical:5},versionText:{fontSize:9,fontWeight:'900'},
 eventCard:{borderWidth:1,borderRadius:17,padding:14,gap:11},eventHead:{flexDirection:'row',gap:10},eventKicker:{color:'#FF8EA6',fontSize:9,fontWeight:'900',letterSpacing:1},eventTitle:{color:'#fff',fontSize:16,fontWeight:'900',marginTop:2},eventText:{color:'#D7A9B5',fontSize:11,marginTop:3},eventButton:{backgroundColor:'#FF8EA6',borderRadius:10,padding:11,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:7},eventButtonText:{color:'#16070B',fontWeight:'900',fontSize:11},
 kantoCard:{borderWidth:1,borderRadius:18,padding:15,gap:12},row:{flexDirection:'row',alignItems:'center',gap:10},modeIcon:{width:48,height:48,borderRadius:15,alignItems:'center',justifyContent:'center'},modeTitle:{fontSize:15,fontWeight:'900'},modeSub:{fontSize:10,lineHeight:14,marginTop:2},progressHead:{flexDirection:'row',justifyContent:'space-between'},progressText:{fontSize:10,fontWeight:'800'},track:{height:7,borderRadius:99,overflow:'hidden'},fill:{height:'100%',borderRadius:99},
 sectionTitle:{fontSize:12,fontWeight:'900',letterSpacing:.9,marginTop:3},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},modeCard:{width:'48%',minWidth:150,borderWidth:1,borderRadius:16,padding:13,backgroundColor:'#0D1822',gap:7},staticTitle:{color:'#EEF5FA',fontSize:14,fontWeight:'900'},staticSub:{color:'#8295A4',fontSize:10,lineHeight:14,minHeight:42},modeMeta:{fontSize:10,fontWeight:'800',minHeight:28},modeButton:{borderRadius:9,paddingVertical:9,alignItems:'center'},modeButtonText:{fontWeight:'900',fontSize:10},
 wideCard:{borderWidth:1,borderRadius:15,padding:12,flexDirection:'row',alignItems:'center',gap:10},badgeText:{fontWeight:'900',fontSize:10},linkGrid:{gap:8},quick:{borderWidth:1,borderColor:'#223748',backgroundColor:'#0D1822',borderRadius:13,padding:12,flexDirection:'row',alignItems:'center',gap:9},quickLabel:{color:'#EEF5FA',fontSize:12,fontWeight:'800'},quickMeta:{color:'#718697',fontSize:9,marginTop:2},
});
