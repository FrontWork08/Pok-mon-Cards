import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getProfileAvatarUrl } from '@/services/player';
import { getHomeContinueItems, getHomeDashboard, getHomeProgressSnapshot, type HomeContinueItem, type HomeProgressSnapshot } from '@/services/home';
import { claimDailyReward } from '@/services/playerActions';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getBattlePass, type BattlePassReward, type BattlePassState } from '@/services/battlePass';
import { GlobalChatHomeCard } from '@/components/GlobalChatHomeCard';
import { UpdateLogHomeCard } from '@/components/UpdateLogHomeCard';
import { getThemeVisual } from '@/theme/themeCatalog';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { getTrainerJourneySummary, type TrainerJourneySummary } from '@/services/career';

export default function HomeScreen() {
  const router = useRouter();
  const { colors, isLight, themeName } = useAppTheme();
  const themeVisual = getThemeVisual(themeName);
  const [profile,setProfile]=useState<any>(null);const[stats,setStats]=useState({totalCards:0,species:0,completedTrades:0});const[battlePass,setBattlePass]=useState<BattlePassState|null>(null);const[continueItems,setContinueItems]=useState<HomeContinueItem[]>([]);const[progressSnapshot,setProgressSnapshot]=useState<HomeProgressSnapshot|null>(null);const[journeySummary,setJourneySummary]=useState<TrainerJourneySummary|null>(null);const[loading,setLoading]=useState(true);const[claiming,setClaiming]=useState(false);const[notice,setNotice]=useState<string|null>(null);const loadedOnce=useRef(false);
  const load=useCallback(async()=>{try{if(!loadedOnce.current)setLoading(true);const[dashboard,pass,continueData,progressData,journeyData]=await Promise.all([getHomeDashboard(),getBattlePass().catch(()=>null),getHomeContinueItems().catch(()=>[]),getHomeProgressSnapshot().catch(()=>null),getTrainerJourneySummary().catch(()=>null)]);setProfile(dashboard.profile);setStats(dashboard.stats);setBattlePass(pass);setContinueItems(continueData);setProgressSnapshot(progressData);setJourneySummary(journeyData);loadedOnce.current=true;}finally{setLoading(false);}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  const avatarUrl=getProfileAvatarUrl(profile?.avatar_path,profile?.avatar_updated_at);
  const canClaimDaily=useMemo(()=>!profile?.last_daily_claim_at||Date.now()-new Date(profile.last_daily_claim_at).getTime()>=24*60*60*1000,[profile?.last_daily_claim_at]);
  const battlePassPreview=useMemo(()=>{
    if(!battlePass)return[];
    const start=Math.max(1,battlePass.progress.level);
    const end=Math.min(battlePass.season.maxLevel,start+3);
    return Array.from({length:end-start+1},(_,index)=>{
      const level=start+index;
      return{
        level,
        free:battlePass.rewards.find((reward)=>reward.level===level&&reward.track==='free')??null,
        vip:battlePass.rewards.find((reward)=>reward.level===level&&reward.track==='vip')??null,
      };
    });
  },[battlePass]);
  async function claimDaily(){if(!canClaimDaily||claiming)return;try{setClaiming(true);const reward=await claimDailyReward();setNotice(`Recompensa recebida: +${reward.rewardCoins} moedas e +${reward.rewardXp} XP.`);await load();}catch(err){setNotice(err instanceof Error?err.message:'Não foi possível receber a recompensa.');}finally{setClaiming(false);}}
  return <Screen title={`Olá, ${profile?.username??'Trainer'}`} subtitle="Seu hub de coleção, packs, batalhas, amigos e progresso.">
    {loading?<ActivityIndicator color={colors.yellow} size="large"/>:null}
    {notice?<View style={[styles.notice,{backgroundColor:isLight?'#FFF7D6':'#2B2818',borderColor:isLight?'#E5C95E':'#5A5125'}]}><Ionicons name="gift" size={20} color={colors.yellow}/><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text><Pressable onPress={()=>setNotice(null)}><Ionicons name="close" size={18} color={colors.text}/></Pressable></View>:null}
    <View style={[styles.hero,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
      <View style={[styles.heroGlow,{backgroundColor:colors.accent}]} />
      <Image source={{uri:themeVisual.image}} resizeMode="contain" style={styles.heroPokemon}/>
      <View style={styles.heroContent}>
        <View style={styles.heroIdentity}>
          <TrainerAvatar
            icon={profile?.profile_icon}
            avatarUrl={avatarUrl}
            color={colors.yellow}
            backgroundColor={colors.surface}
            size={56}
          />
          <View style={styles.heroIdentityCopy}>
            <Text style={[styles.heroIdentityKicker,{color:colors.yellow}]}>TRAINER CARD</Text>
            <Text numberOfLines={1} style={[styles.heroIdentityName,{color:colors.text}]}>@{profile?.username??'Trainer'}</Text>
            <Text style={[styles.heroIdentityMeta,{color:colors.muted}]}>LV {profile?.level??1} • ELO {profile?.battle_rating??1000} • {Number(profile?.diamonds??0).toLocaleString('pt-BR')} 💎</Text>
          </View>
          <Pressable
            accessibilityLabel="Abrir QR de amizade"
            onPress={()=>router.push('/friend-qr')}
            style={[styles.qrButton,{backgroundColor:colors.surface,borderColor:colors.border}]}
          >
            <Ionicons name="qr-code" size={23} color={colors.accent}/>
          </Pressable>
        </View>
        <Text style={[styles.heroEyebrow,{color:colors.yellow}]}>TRAINER COLLECTION • {themeVisual.mascot.toUpperCase()}</Text>
        <Text style={[styles.heroTitle,{color:colors.text}]}>Sua coleção vive aqui.</Text>
        <Text style={[styles.heroText,{color:colors.muted}]}>Abra boosters, complete sets, evolua seu perfil e acompanhe tudo sem sair do seu hub.</Text>
        <View style={styles.heroActions}><Pressable style={[styles.primaryButton,{backgroundColor:colors.yellow}]} onPress={()=>router.push('/(tabs)/packs')}><Ionicons name="cube" color="#07111F" size={19}/><Text style={styles.primaryButtonText}>ABRIR PACKS</Text></Pressable><Pressable style={[styles.dailyButton,{backgroundColor:canClaimDaily?colors.accent:colors.surfaceAlt}]} onPress={claimDaily} disabled={!canClaimDaily||claiming}><Ionicons name="gift-outline" color={canClaimDaily?'#fff':colors.muted} size={18}/><Text style={[styles.dailyText,{color:canClaimDaily?'#fff':colors.muted}]}>{claiming?'RECEBENDO...':canClaimDaily?'RECOMPENSA DIÁRIA':'VOLTE AMANHÃ'}</Text></Pressable></View>
      </View>
    </View>
    {continueItems.length?<View style={[styles.continuePanel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={styles.continueHeader}><View><Text style={[styles.sectionKicker,{color:colors.yellow}]}>CONTINUAR DE ONDE PAROU</Text><Text style={[styles.continueTitle,{color:colors.text}]}>Sua próxima ação</Text></View><Pressable onPress={()=>router.push('/inbox')} style={[styles.activityButton,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="notifications-outline" size={17} color={colors.accent}/><Text style={[styles.activityButtonText,{color:colors.text}]}>ATIVIDADES</Text></Pressable></View>
      <View style={styles.continueList}>{continueItems.map(item=>{
        const accent=item.kind==='battle'?'#FF735C':item.kind==='trade'?'#54C78D':'#9B7BFF';
        const icon = (item.kind==='battle'?'game-controller':item.kind==='trade'?'swap-horizontal':'notifications') as keyof typeof Ionicons.glyphMap;
        return <Pressable key={item.id} onPress={()=>router.push(item.route as never)} style={[styles.continueItem,{backgroundColor:colors.surfaceAlt,borderColor:`${accent}55`}]}><View style={[styles.continueIcon,{backgroundColor:`${accent}1C`}]}><Ionicons name={icon} size={20} color={accent}/></View><View style={styles.continueBody}><Text style={[styles.continueItemTitle,{color:colors.text}]}>{item.title}</Text><Text numberOfLines={2} style={[styles.continueItemText,{color:colors.muted}]}>{item.subtitle}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>;
      })}</View>
    </View>:null}
    {journeySummary&&!journeySummary.allClaimed?<Pressable onPress={()=>router.push('/career')} style={[styles.journeyCard,{backgroundColor:colors.surface,borderColor:journeySummary.claimable?colors.yellow:colors.accent}]}>
      <View style={[styles.journeyIcon,{backgroundColor:journeySummary.claimable?'#F0C74E1C':colors.accentSoft}]}><Ionicons name={journeySummary.claimable?'gift':'compass'} size={24} color={journeySummary.claimable?colors.yellow:colors.accent}/></View>
      <View style={styles.journeyBody}><Text style={[styles.sectionKicker,{color:journeySummary.claimable?colors.yellow:colors.accent}]}>JORNADA DO TREINADOR</Text><Text numberOfLines={1} style={[styles.journeyTitle,{color:colors.text}]}>{journeySummary.claimable?journeySummary.claimable+' recompensa(s) pronta(s)':journeySummary.currentStep?.title??'Continue sua carreira'}</Text><Text numberOfLines={1} style={[styles.journeySub,{color:colors.muted}]}>{journeySummary.currentStep?`${Math.min(journeySummary.currentStep.progress,journeySummary.currentStep.target)}/${journeySummary.currentStep.target} • ${journeySummary.currentStep.description}`:`${journeySummary.completed}/${journeySummary.total} etapas concluídas`}</Text><View style={[styles.journeyTrack,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.journeyFill,{backgroundColor:journeySummary.claimable?colors.yellow:colors.accent,width:`${journeySummary.total?journeySummary.completed/journeySummary.total*100:0}%`}]}/></View></View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted}/>
    </Pressable>:null}
    {progressSnapshot?<View style={[styles.todayPanel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={styles.todayHeader}>
        <View><Text style={[styles.sectionKicker,{color:colors.yellow}]}>HOJE NO TRAINER COLLECTION</Text><Text style={[styles.todayTitle,{color:colors.text}]}>O que merece sua atenção</Text></View>
        <Pressable onPress={()=>router.push('/inbox')} style={[styles.activityButton,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="notifications-outline" size={17} color={colors.accent}/><Text style={[styles.activityButtonText,{color:colors.text}]}>CENTRAL</Text></Pressable>
      </View>
      <View style={styles.todayGrid}>
        <Pressable onPress={()=>router.push((progressSnapshot.claimableMissions > 0 ? '/missions' : (progressSnapshot.mission?.route || '/missions')) as never)} style={[styles.todayCard,{backgroundColor:colors.surfaceAlt,borderColor:progressSnapshot.claimableMissions?colors.yellow:colors.border}]}>
          <View style={[styles.todayIcon,{backgroundColor:'#F0C74E1C'}]}><Ionicons name={progressSnapshot.claimableMissions?'gift':'checkbox'} size={20} color="#F0C74E"/></View>
          <Text style={[styles.todayLabel,{color:colors.muted}]}>MISSÃO</Text>
          <Text numberOfLines={1} style={[styles.todayValue,{color:colors.text}]}>{progressSnapshot.claimableMissions?progressSnapshot.claimableMissions+' recompensa(s) pronta(s)':progressSnapshot.mission?.title??'Tudo concluído'}</Text>
          {progressSnapshot.mission?<View style={[styles.todayTrack,{backgroundColor:colors.border}]}><View style={[styles.todayFill,{backgroundColor:'#F0C74E',width:`${progressSnapshot.mission.percent}%`}]}/></View>:null}
        </Pressable>
        <Pressable onPress={()=>router.push('/collection-ranking')} style={[styles.todayCard,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
          <View style={[styles.todayIcon,{backgroundColor:'#5AA8FF1C'}]}><Ionicons name="podium" size={20} color="#5AA8FF"/></View>
          <Text style={[styles.todayLabel,{color:colors.muted}]}>RANK SEMANAL</Text>
          <Text style={[styles.todayValue,{color:colors.text}]}>{progressSnapshot.weeklyRank.rank?('#'+progressSnapshot.weeklyRank.rank):'Ainda sem posição'}</Text>
          <Text numberOfLines={1} style={[styles.todayMeta,{color:colors.muted}]}>US$ {progressSnapshot.weeklyRank.weeklyValueUsd.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} conquistados</Text>
        </Pressable>
        <Pressable onPress={()=>router.push('/guilds')} style={[styles.todayCard,{backgroundColor:colors.surfaceAlt,borderColor:progressSnapshot.guild.claimableReward?colors.yellow:colors.border}]}>
          <View style={[styles.todayIcon,{backgroundColor:'#9B7BFF1C'}]}><Ionicons name="shield" size={20} color="#9B7BFF"/></View>
          <Text style={[styles.todayLabel,{color:colors.muted}]}>GUILDA</Text>
          <Text numberOfLines={1} style={[styles.todayValue,{color:colors.text}]}>{progressSnapshot.guild.joined?(progressSnapshot.guild.name??'Minha guilda'):'Sem guilda'}</Text>
          <Text numberOfLines={1} style={[styles.todayMeta,{color:progressSnapshot.guild.claimableReward?colors.yellow:colors.muted}]}>{progressSnapshot.guild.claimableReward?'Recompensa semanal disponível':progressSnapshot.guild.joined?`Booster coletivo ${progressSnapshot.guild.boosterProgress}/${progressSnapshot.guild.boosterTarget}`:'Entre em uma guilda para progredir em equipe'}</Text>
        </Pressable>
        <Pressable onPress={()=>router.push('/tournaments')} style={[styles.todayCard,{backgroundColor:colors.surfaceAlt,borderColor:progressSnapshot.tournament?.joined?colors.accent:colors.border}]}>
          <View style={[styles.todayIcon,{backgroundColor:'#FF735C1C'}]}><Ionicons name="trophy" size={20} color="#FF735C"/></View>
          <Text style={[styles.todayLabel,{color:colors.muted}]}>COPA TRAINER</Text>
          <Text numberOfLines={1} style={[styles.todayValue,{color:colors.text}]}>{progressSnapshot.tournament?.joined?'INSCRITO':progressSnapshot.tournament?.status==='registration'?'INSCRIÇÕES ABERTAS':String(progressSnapshot.tournament?.status??'Sem copa').toUpperCase()}</Text>
          <Text numberOfLines={1} style={[styles.todayMeta,{color:colors.muted}]}>{progressSnapshot.tournament?`${progressSnapshot.tournament.entries}/${progressSnapshot.tournament.maxPlayers} jogadores • 🪙 ${progressSnapshot.tournament.prizePoolCoins.toLocaleString('pt-BR')}`:'Nenhum torneio ativo'}</Text>
        </Pressable>
      </View>
    </View>:null}
    <View style={styles.quickGrid}>
      <QuickAction icon="albums" label="Minha Bag" sub="Coleção e valores" onPress={()=>router.push('/(tabs)/bag')}/>
      <QuickAction icon="people" label="Amigos" sub="Perfis e chat" onPress={()=>router.push('/friends')}/>
      <QuickAction icon="qr-code" label="Meu QR" sub="Adicionar amigos" onPress={()=>router.push('/friend-qr')}/>
      <QuickAction icon="shield" label="Guilda" sub="Equipe e chat" onPress={()=>router.push('/guilds')}/>
      <QuickAction icon="podium" label="Ranking" sub="Coleções" onPress={()=>router.push('/collection-ranking')}/>
      <QuickAction icon="checkbox" label="Missões" sub="Ganhe recompensas" onPress={()=>router.push('/missions')}/>
      <QuickAction icon="search" label="Busca Global" sub="Ache qualquer coisa" onPress={()=>router.push('/search')}/>
      <QuickAction icon="compass" label="Minha Carreira" sub="Jornada e histórico" onPress={()=>router.push('/career')}/>
    </View>
    <View style={styles.statsGrid}><Stat icon="albums" label="Cards" value={stats.totalCards.toLocaleString('pt-BR')} onPress={()=>router.push('/(tabs)/bag')}/><Stat icon="paw" label="Pokédex" value={String(stats.species)} onPress={()=>router.push('/pokedex')}/><Stat icon="swap-horizontal" label="Trocas" value={String(stats.completedTrades)} onPress={()=>router.push('/(tabs)/trade')}/><Stat icon="flash" label="XP" value={Number(profile?.xp??0).toLocaleString('pt-BR')}/></View>
    <GlobalChatHomeCard />
    {battlePass?<View style={[styles.passCard,{backgroundColor:colors.surface,borderColor:colors.yellow}]}>
      <Pressable onPress={()=>router.push('/battle-pass')} style={styles.passHeader}>
        <View style={[styles.passIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="ribbon" size={25} color={colors.yellow}/></View>
        <View style={styles.passHeaderText}>
          <Text style={[styles.sectionKicker,{color:colors.yellow}]}>PASSE DE BATALHA</Text>
          <Text style={[styles.passTitle,{color:colors.text}]}>{battlePass.season.name}</Text>
          <Text style={[styles.passSub,{color:colors.muted}]}>Nível {battlePass.progress.level}/{battlePass.season.maxLevel} • veja o que você ganha agora e nos próximos níveis.</Text>
        </View>
        <Ionicons name="chevron-forward" size={21} color={colors.muted}/>
      </Pressable>
      <View style={styles.passProgressRow}><Text style={[styles.passProgressText,{color:colors.text}]}>XP do passe</Text><Text style={[styles.passProgressText,{color:colors.yellow}]}>{battlePass.progress.level>=battlePass.season.maxLevel?'CONCLUÍDO':`${battlePass.progress.xpIntoLevel.toLocaleString('pt-BR')} / ${battlePass.progress.xpForNextLevel.toLocaleString('pt-BR')}`}</Text></View>
      <View style={[styles.passTrack,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.passFill,{backgroundColor:colors.yellow,width:`${battlePass.progress.level>=battlePass.season.maxLevel?100:Math.min(100,battlePass.progress.xpForNextLevel>0?battlePass.progress.xpIntoLevel/battlePass.progress.xpForNextLevel*100:0)}%`}]}/></View>
      <View style={styles.passLegend}><View style={styles.passLegendItem}><Ionicons name="gift" size={14} color={colors.accent}/><Text style={[styles.passLegendText,{color:colors.muted}]}>GRÁTIS</Text></View><View style={styles.passLegendItem}><Ionicons name="diamond" size={14} color={colors.yellow}/><Text style={[styles.passLegendText,{color:colors.muted}]}>VIP {battlePass.progress.vipUnlocked?'ATIVO':`• 💎 ${battlePass.season.vipPriceDiamonds}`}</Text></View></View>
      <View style={styles.passPreviewList}>{battlePassPreview.map((row)=><BattlePassPreviewRow key={row.level} level={row.level} currentLevel={battlePass.progress.level} vipUnlocked={battlePass.progress.vipUnlocked} free={row.free} vip={row.vip}/>)}</View>
      <Pressable onPress={()=>router.push('/battle-pass')} style={[styles.passButton,{backgroundColor:colors.yellow}]}><Ionicons name="eye" size={18} color="#07111F"/><Text style={styles.passButtonText}>VER TODOS OS 50 NÍVEIS E MISSÕES</Text></Pressable>
    </View>:null}
    <View style={styles.sectionHeader}><View><Text style={[styles.sectionKicker,{color:colors.yellow}]}>JORNADA</Text><Text style={[styles.sectionTitle,{color:colors.text}]}>Seu progresso</Text></View></View>
    <View style={[styles.progressCard,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={[styles.progressIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="trophy" size={24} color={colors.yellow}/></View><View style={styles.progressBody}><Text style={[styles.progressTitle,{color:colors.text}]}>Colecionador nível {profile?.level??1}</Text><Text style={[styles.progressText,{color:colors.muted}]}>Packs, missões e batalhas concedem XP para sua conta.</Text><View style={[styles.progressTrack,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.progressFill,{backgroundColor:colors.yellow,width:`${Math.min(100,(Number(profile?.xp??0)%250)/2.5)}%`}]}/></View><Text style={[styles.progressMeta,{color:colors.muted}]}>{Number(profile?.xp??0)%250} / 250 XP para o próximo nível</Text></View></View>
    <UpdateLogHomeCard />
  </Screen>
}
function BattlePassPreviewRow({level,currentLevel,vipUnlocked,free,vip}:{level:number;currentLevel:number;vipUnlocked:boolean;free:BattlePassReward|null;vip:BattlePassReward|null}){const{colors}=useAppTheme();return <View style={[styles.passRewardRow,{backgroundColor:colors.surfaceAlt,borderColor:level<=currentLevel?colors.accent:colors.border}]}><View style={[styles.passLevelBadge,{backgroundColor:level<=currentLevel?colors.accentSoft:colors.surface}]}><Text style={[styles.passLevelText,{color:level<=currentLevel?colors.yellow:colors.muted}]}>NV {level}</Text></View><PassRewardMini reward={free} levelLocked={level>currentLevel} vipLocked={false}/><View style={[styles.passDivider,{backgroundColor:colors.border}]}/><PassRewardMini reward={vip} levelLocked={level>currentLevel} vipLocked={!vipUnlocked}/></View>}
function PassRewardMini({reward,levelLocked,vipLocked}:{reward:BattlePassReward|null;levelLocked:boolean;vipLocked:boolean}){const{colors}=useAppTheme();if(!reward)return <View style={styles.passRewardMini}/>;const locked=levelLocked||vipLocked;return <View style={styles.passRewardMini}><View style={styles.passRewardTop}><Ionicons name={reward.reward.titleId?'ribbon':reward.track==='vip'?'diamond':'gift'} size={13} color={reward.track==='vip'?colors.yellow:colors.accent}/><Text style={[styles.passRewardTrack,{color:reward.track==='vip'?colors.yellow:colors.accent}]}>{reward.track==='vip'?'VIP':'GRÁTIS'}</Text></View><Text numberOfLines={2} style={[styles.passRewardLabel,{color:locked?colors.muted:colors.text}]}>{reward.label}</Text><View style={styles.passRewardStatus}>{reward.claimed?<Ionicons name="checkmark-circle" size={14} color="#65D894"/>:locked?<Ionicons name="lock-closed" size={14} color={colors.muted}/>:<Ionicons name="gift-outline" size={14} color={colors.yellow}/>}<Text style={[styles.passRewardStatusText,{color:reward.claimed?'#65D894':locked?colors.muted:colors.yellow}]}>{reward.claimed?'GANHO':locked?'BLOQUEADO':'DISPONÍVEL'}</Text></View></View>}
function QuickAction({icon,label,sub,onPress}:{icon:keyof typeof Ionicons.glyphMap;label:string;sub:string;onPress:()=>void}){const{colors}=useAppTheme();return <Pressable onPress={onPress} style={({pressed})=>[styles.quickAction,{backgroundColor:colors.surface,borderColor:colors.border},pressed&&styles.quickPressed]}><View style={[styles.quickIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name={icon} size={20} color={colors.accent}/></View><View style={styles.quickText}><Text style={[styles.quickLabel,{color:colors.text}]}>{label}</Text><Text style={[styles.quickSub,{color:colors.muted}]}>{sub}</Text></View><Ionicons name="chevron-forward" size={15} color={colors.muted}/></Pressable>}
function Stat({icon,label,value,onPress}:{icon:keyof typeof Ionicons.glyphMap;label:string;value:string;onPress?:()=>void}){const{colors}=useAppTheme();const content=<><View style={[styles.statIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name={icon} size={19} color={colors.accent}/></View><Text style={[styles.statValue,{color:colors.text}]}>{value}</Text><View style={styles.statBottom}><Text style={[styles.statLabel,{color:colors.muted}]}>{label}</Text>{onPress?<Ionicons name="chevron-forward" size={14} color={colors.muted}/>:null}</View></>;const style=[styles.statCard,{backgroundColor:colors.surface,borderColor:colors.border}] as any;return onPress?<Pressable onPress={onPress} style={style}>{content}</Pressable>:<View style={style}>{content}</View>}
const styles=StyleSheet.create({journeyCard:{borderRadius:19,borderWidth:1,padding:12,flexDirection:'row',alignItems:'center',gap:10},journeyIcon:{width:46,height:46,borderRadius:14,alignItems:'center',justifyContent:'center'},journeyBody:{flex:1,minWidth:0},journeyTitle:{fontSize:12.5,fontWeight:'900',marginTop:2},journeySub:{fontSize:7.8,marginTop:2},journeyTrack:{height:5,borderRadius:999,overflow:'hidden',marginTop:7},journeyFill:{height:'100%',borderRadius:999},todayPanel:{borderRadius:22,borderWidth:1,padding:14,gap:10},todayHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},todayTitle:{fontSize:18,fontWeight:'900',marginTop:2},todayGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},todayCard:{flexGrow:1,flexBasis:220,minWidth:205,borderRadius:16,borderWidth:1,padding:11},todayIcon:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',marginBottom:8},todayLabel:{fontSize:7,fontWeight:'900',letterSpacing:.7},todayValue:{fontSize:12,fontWeight:'900',marginTop:3},todayMeta:{fontSize:7.8,lineHeight:12,marginTop:3,fontWeight:'700'},todayTrack:{height:6,borderRadius:999,overflow:'hidden',marginTop:8},todayFill:{height:'100%',borderRadius:999},continuePanel:{borderRadius:22,borderWidth:1,padding:14,gap:10},continueHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},continueTitle:{fontSize:18,fontWeight:'900',marginTop:2},activityButton:{minHeight:36,borderRadius:12,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},activityButtonText:{fontSize:7.5,fontWeight:'900'},continueList:{gap:7},continueItem:{minHeight:66,borderRadius:16,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:9},continueIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center'},continueBody:{flex:1,minWidth:0},continueItemTitle:{fontSize:11.5,fontWeight:'900'},continueItemText:{fontSize:8.5,lineHeight:13,marginTop:2},passCard:{borderRadius:24,borderWidth:1,padding:15,gap:12},passHeader:{flexDirection:'row',alignItems:'center',gap:11},passIcon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},passHeaderText:{flex:1,minWidth:0},passTitle:{fontSize:18,fontWeight:'900',marginTop:2},passSub:{fontSize:10,lineHeight:15,marginTop:2},passProgressRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},passProgressText:{fontSize:9,fontWeight:'900'},passTrack:{height:8,borderRadius:999,overflow:'hidden'},passFill:{height:'100%',borderRadius:999},passLegend:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},passLegendItem:{flexDirection:'row',alignItems:'center',gap:5},passLegendText:{fontSize:8,fontWeight:'900'},passPreviewList:{gap:8},passRewardRow:{minHeight:92,borderRadius:16,borderWidth:1,padding:8,flexDirection:'row',alignItems:'stretch',gap:7},passLevelBadge:{width:42,borderRadius:12,alignItems:'center',justifyContent:'center'},passLevelText:{fontSize:9,fontWeight:'900'},passRewardMini:{flex:1,minWidth:0,justifyContent:'center',gap:4},passRewardTop:{flexDirection:'row',alignItems:'center',gap:4},passRewardTrack:{fontSize:7,fontWeight:'900'},passRewardLabel:{fontSize:10,lineHeight:14,fontWeight:'900'},passRewardStatus:{flexDirection:'row',alignItems:'center',gap:4},passRewardStatusText:{fontSize:7,fontWeight:'900'},passDivider:{width:1,marginVertical:4},passButton:{minHeight:44,borderRadius:13,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},passButtonText:{color:'#07111F',fontSize:9,fontWeight:'900'},notice:{flexDirection:'row',alignItems:'center',gap:9,borderRadius:15,padding:12,borderWidth:1},noticeText:{flex:1,fontWeight:'700',fontSize:12},hero:{borderRadius:30,padding:20,borderWidth:1,gap:10,overflow:'hidden',position:'relative'},heroGlow:{position:'absolute',right:-90,top:-90,width:270,height:270,borderRadius:999,opacity:.16},heroPokemon:{position:'absolute',right:-20,bottom:-18,width:180,height:190,opacity:.33,transform:[{rotate:'7deg'}]},heroContent:{position:'relative',zIndex:2},heroIdentity:{flexDirection:'row',alignItems:'center',gap:10},heroIdentityCopy:{flex:1,minWidth:0},heroIdentityKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.2},heroIdentityName:{fontSize:18,fontWeight:'900',marginTop:1},heroIdentityMeta:{fontSize:9,fontWeight:'700',marginTop:2},qrButton:{width:48,height:48,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center'},heroEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.25,marginTop:14},heroTitle:{fontSize:29,lineHeight:34,fontWeight:'900',maxWidth:410,letterSpacing:-.6},heroText:{lineHeight:20,fontSize:13,maxWidth:430},heroActions:{marginTop:6,flexDirection:'row',flexWrap:'wrap',gap:9},primaryButton:{flexDirection:'row',gap:8,alignItems:'center',paddingHorizontal:16,paddingVertical:12,borderRadius:14},primaryButtonText:{color:'#07111F',fontWeight:'900',fontSize:12,letterSpacing:.4},dailyButton:{flexDirection:'row',gap:8,alignItems:'center',paddingHorizontal:16,paddingVertical:12,borderRadius:14},dailyText:{fontWeight:'900',fontSize:11},quickGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},quickAction:{width:'48.5%',minHeight:68,borderRadius:18,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:9},quickPressed:{opacity:.72},quickIcon:{width:38,height:38,borderRadius:13,alignItems:'center',justifyContent:'center'},quickText:{flex:1,minWidth:0},quickLabel:{fontSize:11,fontWeight:'900'},quickSub:{fontSize:8,marginTop:2},statsGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},statCard:{width:'48.5%',borderRadius:20,padding:15,borderWidth:1},statIcon:{width:34,height:34,borderRadius:12,alignItems:'center',justifyContent:'center',marginBottom:13},statValue:{fontSize:23,fontWeight:'900'},statBottom:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},statLabel:{fontSize:12,fontWeight:'700',marginTop:2},sectionHeader:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginTop:4},sectionKicker:{fontSize:10,fontWeight:'900',letterSpacing:1.3},sectionTitle:{fontSize:21,fontWeight:'900',marginTop:2},progressCard:{flexDirection:'row',gap:14,padding:16,borderRadius:20,borderWidth:1},progressIcon:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},progressBody:{flex:1},progressTitle:{fontSize:16,fontWeight:'900'},progressText:{fontSize:12,lineHeight:18,marginTop:4},progressTrack:{height:7,borderRadius:999,marginTop:12,overflow:'hidden'},progressFill:{height:'100%',borderRadius:999},progressMeta:{fontSize:9,fontWeight:'800',marginTop:5}});
