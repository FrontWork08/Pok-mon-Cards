import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ProgressCelebration, type CelebrationPayload } from '@/components/ProgressCelebration';
import { StatusPill } from '@/components/StatusPill';
import {
  careerTier,
  claimAllTrainerJourneyRewards,
  claimTrainerJourneyStep,
  getTrainerCareer,
  type JourneyPhase,
  type TrainerCareer,
  type TrainerJourneyStep,
} from '@/services/career';
import { claimCollectionMilestone } from '@/services/retention';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AreaIdentityStrip } from '@/components/AreaIdentityStrip';

const PHASES:Array<{id:JourneyPhase;title:string;subtitle:string;icon:keyof typeof Ionicons.glyphMap;color:string}>=[
  {id:'inicio',title:'Primeiros Passos',subtitle:'O caminho ideal para aprender o jogo sem tutorial longo.',icon:'footsteps',color:'#5AA8FF'},
  {id:'medio',title:'Metas de Médio Prazo',subtitle:'Objetivos que conectam coleção, batalha e progresso.',icon:'flag',color:'#F0C74E'},
  {id:'longo',title:'Metas de Longo Prazo',subtitle:'Marcos que constroem a história da sua conta.',icon:'trophy',color:'#9B7BFF'},
];

export default function TrainerCareerScreen(){
  const router=useRouter();
  const{colors}=useAppTheme();
  const[career,setCareer]=useState<TrainerCareer|null>(null);
  const[loading,setLoading]=useState(true);
  const[working,setWorking]=useState<string|null>(null);
  const[notice,setNotice]=useState<string|null>(null);
  const[celebration,setCelebration]=useState<CelebrationPayload|null>(null);

  const load=useCallback(async()=>{
    try{
      setLoading(true);
      setNotice(null);
      setCareer(await getTrainerCareer());
    }catch(e){
      setNotice(e instanceof Error?e.message:'Não foi possível carregar sua Carreira do Treinador.');
    }finally{
      setLoading(false);
    }
  },[]);

  useFocusEffect(useCallback(()=>{void load();},[load]));

  const journeyStats=useMemo(()=>{
    const rows=career?.journey??[];
    return{
      total:rows.length,
      completed:rows.filter(step=>step.completed).length,
      claimed:rows.filter(step=>step.claimed).length,
      claimable:rows.filter(step=>step.completed&&!step.claimed).length,
    };
  },[career?.journey]);

  const tier=careerTier(career?.careerScore??0);
  const tierProgress=tier.next==null?100:Math.min(100,Math.max(0,((career?.careerScore??0)-tier.min)/Math.max(1,tier.next-tier.min)*100));
  const winRate=career&&career.player.battleWins+career.player.battleLosses>0
    ? Math.round(career.player.battleWins/(career.player.battleWins+career.player.battleLosses)*100)
    : 0;

  async function claimStep(step:TrainerJourneyStep){
    if(working||step.claimed||!step.completed)return;
    try{
      setWorking(step.id);
      const result=await claimTrainerJourneyStep(step.id);
      setCelebration({
        title:step.title,
        subtitle:'Mais uma etapa registrada na sua história de treinador.',
        coins:Number(result.rewardCoins??0),
        diamonds:Number(result.rewardDiamonds??0),
      });
      await load();
    }catch(e){
      setNotice(e instanceof Error?e.message:'Não foi possível coletar esta etapa.');
    }finally{
      setWorking(null);
    }
  }

  async function claimAll(){
    if(working||journeyStats.claimable<=0)return;
    try{
      setWorking('all');
      const result=await claimAllTrainerJourneyRewards();
      setCelebration({
        title:result.claimedCount>1?result.claimedCount+' etapas concluídas':'Etapa concluída',
        subtitle:'As recompensas retroativas foram validadas e registradas pelo servidor.',
        coins:result.coins,
        diamonds:result.diamonds,
      });
      await load();
    }catch(e){
      setNotice(e instanceof Error?e.message:'Não foi possível coletar as recompensas da Jornada.');
    }finally{
      setWorking(null);
    }
  }

  async function claimRegion(generation:number,name:string){
    if(working)return;
    try{
      setWorking('region-'+generation);
      const reward=await claimCollectionMilestone('pokedex_gen',String(generation));
      setCelebration({
        title:name+' completo',
        subtitle:'Você concluiu a Pokédex regional e garantiu uma recompensa de coleção.',
        coins:Number(reward.coins??0),
        diamonds:Number(reward.diamonds??0),
      });
      await load();
    }catch(e){
      setNotice(e instanceof Error?e.message:'Não foi possível coletar a recompensa regional.');
    }finally{
      setWorking(null);
    }
  }

  return <Screen title="Carreira do Treinador" subtitle="Sua evolução inteira em um só lugar: coleção, batalha, social, Pokédex e temporadas.">
    <AreaIdentityStrip area="progress" />
    {notice?<Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:colors.surface,borderColor:'#D96575'}]}><Ionicons name="alert-circle" size={18} color="#FF9EAA"/><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text><Ionicons name="close" size={16} color={colors.muted}/></Pressable>:null}
    {loading&&!career?<ActivityIndicator size="large" color={colors.yellow}/>:null}

    {career?<>
      <View style={[styles.hero,{backgroundColor:colors.surface,borderColor:colors.yellow}]}>
        <View style={styles.heroTop}>
          <View style={[styles.tierIcon,{backgroundColor:colors.accentSoft,borderColor:colors.yellow}]}><Ionicons name={tier.icon as keyof typeof Ionicons.glyphMap} size={31} color={colors.yellow}/></View>
          <View style={styles.grow}>
            <Text style={[styles.kicker,{color:colors.yellow}]}>CARREIRA • {tier.label.toUpperCase()}</Text>
            <Text style={[styles.heroTitle,{color:colors.text}]}>@{career.player.username}</Text>
            <Text style={[styles.heroSub,{color:colors.muted}]}>{career.player.title?career.player.title.icon+' '+career.player.title.title:'Treinador sem título equipado'} • conta há {career.player.accountAgeDays} dia(s)</Text>
          </View>
          <View style={styles.scoreBox}><Text style={[styles.score,{color:colors.yellow}]}>{career.careerScore.toLocaleString('pt-BR')}</Text><Text style={[styles.scoreLabel,{color:colors.muted}]}>CAREER SCORE</Text></View>
        </View>
        <View style={[styles.track,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.fill,{backgroundColor:colors.yellow,width:`${tierProgress}%`}]}/></View>
        <View style={styles.heroFooter}><Text style={[styles.heroFootText,{color:colors.muted}]}>{tier.next==null?'Patamar máximo da Carreira':`${career.careerScore.toLocaleString('pt-BR')} / ${tier.next.toLocaleString('pt-BR')} para ${careerTier(tier.next).label}`}</Text><Pressable onPress={()=>router.push('/trainer-guide')} style={styles.infoLink}><Ionicons name="information-circle-outline" size={15} color={colors.accent}/><Text style={[styles.infoText,{color:colors.accent}]}>COMO FUNCIONA?</Text></Pressable></View>
        <Text style={[styles.scoreExplain,{color:colors.muted}]}>Career Score não é moeda e não compra nada. Ele resume evolução em coleção, espécies, batalhas, conquistas, trocas e social — valor em US$ não decide sozinho sua carreira.</Text>
      </View>

      <View style={styles.identityGrid}>
        <StatCard icon="albums" label="CARTAS ÚNICAS" value={career.collection.uniqueCards.toLocaleString('pt-BR')} sub={career.collection.totalCopies.toLocaleString('pt-BR')+' cópias'} accent="#5AA8FF"/>
        <StatCard icon="book" label="ESPÉCIES" value={career.collection.species.toLocaleString('pt-BR')} sub={career.collection.completedSets+' set(s) completo(s)'} accent="#54C78D"/>
        <StatCard icon="game-controller" label="BATALHAS" value={career.player.battleWins+'V'} sub={winRate+'% vitórias • ELO '+career.player.battleRating} accent="#FF735C"/>
        <StatCard icon="medal" label="CONQUISTAS" value={career.achievements.unlocked+'/'+career.achievements.total} sub={'melhor streak '+career.player.bestBattleStreak} accent="#F0C74E"/>
        <StatCard icon="swap-horizontal" label="TROCAS" value={career.social.completedTrades.toLocaleString('pt-BR')} sub={career.social.friends+' amigo(s)'} accent="#9B7BFF"/>
        <StatCard icon="cash" label="COLEÇÃO" value={formatUsd(career.collection.valueUsd)} sub="valor de mercado, não força" accent="#65D894"/>
      </View>

      <View style={styles.storyGrid}>
        <View style={[styles.storyCard,{backgroundColor:colors.surface,borderColor:career.social.guild?.color??colors.border}]}>
          <Text style={[styles.sectionKicker,{color:career.social.guild?.color??colors.accent}]}>IDENTIDADE SOCIAL</Text>
          <Text style={[styles.storyTitle,{color:colors.text}]}>{career.social.guild?.name??'Treinador independente'}</Text>
          <Text style={[styles.storyText,{color:colors.muted}]}>{career.social.guild?`${career.social.guild.role.toUpperCase()} • nível ${career.social.guild.level} • ${career.social.guild.xp.toLocaleString('pt-BR')} XP de guilda`:'Entre em uma guilda para construir uma história coletiva.'}</Text>
          <Pressable onPress={()=>router.push('/guilds')} style={[styles.storyAction,{borderColor:colors.border}]}><Ionicons name="shield" size={16} color={colors.accent}/><Text style={[styles.storyActionText,{color:colors.text}]}>ABRIR GUILDA</Text></Pressable>
        </View>
        <Pressable disabled={!career.signatureCard} onPress={()=>career.signatureCard&&router.push(('/card/'+career.signatureCard.id) as never)} style={[styles.signatureCard,{backgroundColor:colors.surface,borderColor:career.signatureCard?colors.yellow:colors.border}]}>
          {career.signatureCard?.imageSmall?<Image source={{uri:career.signatureCard.imageSmall}} style={styles.signatureImage} resizeMode="contain"/>:<View style={[styles.signatureImage,{backgroundColor:colors.surfaceAlt}]}/>}
          <View style={styles.grow}><Text style={[styles.sectionKicker,{color:colors.yellow}]}>CARTA ASSINATURA</Text><Text numberOfLines={1} style={[styles.storyTitle,{color:colors.text}]}>{career.signatureCard?.name??'Nenhuma escolhida'}</Text><Text numberOfLines={2} style={[styles.storyText,{color:colors.muted}]}>{career.signatureCard?`${career.signatureCard.setName} • ${career.signatureCard.rarity??'Sem raridade'}`:'Coloque sua carta principal no slot 1 da Vitrine do Perfil.'}</Text>{career.signatureCard?<Text style={[styles.signatureHint,{color:colors.accent}]}>TOQUE PARA ABRIR</Text>:<Pressable onPress={()=>router.push('/showcase')}><Text style={[styles.signatureHint,{color:colors.accent}]}>ESCOLHER NA VITRINE</Text></Pressable>}</View>
        </Pressable>
      </View>

      <View style={[styles.journeyHero,{backgroundColor:colors.surface,borderColor:journeyStats.claimable?colors.yellow:colors.border}]}>
        <View style={styles.journeyTop}><View><Text style={[styles.sectionKicker,{color:colors.yellow}]}>JORNADA DO TREINADOR</Text><Text style={[styles.sectionTitle,{color:colors.text}]}>{journeyStats.completed}/{journeyStats.total} etapas concluídas</Text><Text style={[styles.storyText,{color:colors.muted}]}>{journeyStats.claimed} recompensas coletadas • {journeyStats.claimable} disponível(is)</Text></View>{journeyStats.claimable>0?<Pressable disabled={Boolean(working)} onPress={()=>void claimAll()} style={[styles.claimAll,{backgroundColor:colors.yellow}]}><Ionicons name="gift" size={17} color="#07111F"/><Text style={styles.claimAllText}>{working==='all'?'COLETANDO…':'COLETAR TODAS'}</Text></Pressable>:<StatusPill tone={journeyStats.completed===journeyStats.total?'success':'waiting'} label={journeyStats.completed===journeyStats.total?'JORNADA COMPLETA':'EM PROGRESSO'}/>}</View>
        <View style={[styles.track,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.fill,{backgroundColor:colors.yellow,width:`${journeyStats.total?journeyStats.completed/journeyStats.total*100:0}%`}]}/></View>
      </View>

      {PHASES.map(phase=>{
        const steps=career.journey.filter(step=>step.phase===phase.id);
        return <View key={phase.id} style={styles.phaseSection}>
          <View style={styles.phaseHeader}><View style={[styles.phaseIcon,{backgroundColor:phase.color+'1C'}]}><Ionicons name={phase.icon} size={20} color={phase.color}/></View><View style={styles.grow}><Text style={[styles.phaseTitle,{color:colors.text}]}>{phase.title}</Text><Text style={[styles.phaseSub,{color:colors.muted}]}>{phase.subtitle}</Text></View><Text style={[styles.phaseCount,{color:phase.color}]}>{steps.filter(step=>step.completed).length}/{steps.length}</Text></View>
          <View style={styles.stepList}>{steps.map(step=><JourneyStepCard key={step.id} step={step} phaseColor={phase.color} working={working===step.id} onClaim={()=>void claimStep(step)} onGo={()=>router.push(step.route as never)}/>)}</View>
        </View>;
      })}

      <View style={styles.sectionHead}><View><Text style={[styles.sectionKicker,{color:'#54C78D'}]}>POKÉDEX COMO META</Text><Text style={[styles.sectionTitle,{color:colors.text}]}>Regiões</Text></View><Pressable onPress={()=>router.push('/pokedex')} style={styles.infoLink}><Text style={[styles.infoText,{color:colors.accent}]}>ABRIR POKÉDEX</Text><Ionicons name="chevron-forward" size={15} color={colors.accent}/></Pressable></View>
      <View style={styles.regionGrid}>{career.regions.map(region=>{
        const pct=Math.min(100,region.target?region.owned/region.target*100:0);
        const claimable=region.completed&&!region.rewardClaimed;
        return <View key={region.generation} style={[styles.regionCard,{backgroundColor:colors.surface,borderColor:claimable?colors.yellow:region.completed?'#4FB77F':colors.border}]}>
          <View style={styles.regionTop}><View><Text style={[styles.regionGen,{color:colors.muted}]}>GERAÇÃO {region.generation}</Text><Text style={[styles.regionName,{color:colors.text}]}>{region.name}</Text></View>{region.completed?<StatusPill tone={claimable?'action':'success'} label={claimable?'RECOMPENSA':'COMPLETA'}/>:<Text style={[styles.regionPct,{color:colors.accent}]}>{Math.round(pct)}%</Text>}</View>
          <Text style={[styles.regionNumbers,{color:colors.text}]}>{region.owned}/{region.target} espécies</Text>
          <View style={[styles.regionTrack,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.fill,{backgroundColor:region.completed?'#65D894':'#54C78D',width:`${pct}%`}]}/></View>
          {claimable?<Pressable disabled={Boolean(working)} onPress={()=>void claimRegion(region.generation,region.name)} style={[styles.regionClaim,{backgroundColor:colors.yellow}]}><Text style={styles.regionClaimText}>{working==='region-'+region.generation?'COLETANDO…':'COLETAR RECOMPENSA'}</Text></Pressable>:null}
        </View>;
      })}</View>

      <View style={styles.sectionHead}><View><Text style={[styles.sectionKicker,{color:'#9B7BFF'}]}>MEMÓRIA DA CONTA</Text><Text style={[styles.sectionTitle,{color:colors.text}]}>Histórico de temporadas</Text></View><Pressable onPress={()=>router.push('/season')} style={styles.infoLink}><Text style={[styles.infoText,{color:colors.accent}]}>TEMPORADA ATUAL</Text><Ionicons name="chevron-forward" size={15} color={colors.accent}/></Pressable></View>
      {career.seasonHistory.length?<View style={styles.seasonList}>{career.seasonHistory.map(season=><View key={season.id} style={[styles.seasonCard,{backgroundColor:colors.surface,borderColor:season.themeColor}]}>
        <View style={[styles.seasonBadge,{backgroundColor:season.themeColor+'22'}]}><Ionicons name="trophy" size={20} color={season.themeColor}/></View>
        <View style={styles.grow}><Text numberOfLines={1} style={[styles.seasonName,{color:colors.text}]}>{season.name}</Text><Text style={[styles.seasonMeta,{color:colors.muted}]}>#{season.rank} • {season.points.toLocaleString('pt-BR')} pts • {season.wins}V/{season.losses}D • streak {season.bestStreak}</Text><Text style={[styles.seasonDate,{color:colors.muted}]}>{new Date(season.startsAt).toLocaleDateString('pt-BR')} — {new Date(season.endsAt).toLocaleDateString('pt-BR')}</Text></View>
      </View>)}</View>:<View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="time-outline" size={30} color={colors.muted}/><Text style={[styles.emptyTitle,{color:colors.text}]}>Sua história competitiva começa aqui</Text><Text style={[styles.emptyText,{color:colors.muted}]}>Participe da temporada para registrar posições, vitórias e melhores sequências.</Text></View>}

      <View style={styles.memoryActions}>
        <Pressable onPress={()=>router.push('/account-museum')} style={[styles.memoryAction,{backgroundColor:colors.surface,borderColor:'#9B7BFF'}]}><Ionicons name="library" size={21} color="#9B7BFF"/><View style={{flex:1}}><Text style={[styles.memoryTitle,{color:colors.text}]}>Museu da Conta</Text><Text style={[styles.memoryText,{color:colors.muted}]}>Reviva primeiras vezes, melhor pull e momentos marcantes.</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>
        <Pressable onPress={()=>router.push('/financial-history')} style={[styles.memoryAction,{backgroundColor:colors.surface,borderColor:'#54C78D'}]}><Ionicons name="receipt" size={21} color="#54C78D"/><View style={{flex:1}}><Text style={[styles.memoryTitle,{color:colors.text}]}>Histórico Financeiro</Text><Text style={[styles.memoryText,{color:colors.muted}]}>Auditoria de Coins e Diamantes da sua conta.</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>
      </View>

      <View style={[styles.philosophy,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
        <Ionicons name="compass" size={27} color={colors.accent}/>
        <View style={styles.grow}><Text style={[styles.philosophyTitle,{color:colors.text}]}>Colecionar → montar → competir → evoluir → socializar → colecionar mais</Text><Text style={[styles.philosophyText,{color:colors.muted}]}>A Carreira existe para conectar os sistemas. Uma carta pode ser importante por Pokédex, set, batalha, conquista, evento ou identidade — não apenas pelo preço.</Text></View>
      </View>
    </>:null}

    <ProgressCelebration payload={celebration} onClose={()=>setCelebration(null)}/>
  </Screen>;
}

function StatCard({icon,label,value,sub,accent}:{icon:keyof typeof Ionicons.glyphMap;label:string;value:string;sub:string;accent:string}){
  const{colors}=useAppTheme();
  return <View style={[styles.statCard,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={[styles.statIcon,{backgroundColor:accent+'1C'}]}><Ionicons name={icon} size={19} color={accent}/></View><Text style={[styles.statLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.statValue,{color:colors.text}]}>{value}</Text><Text numberOfLines={1} style={[styles.statSub,{color:colors.muted}]}>{sub}</Text></View>;
}

function JourneyStepCard({step,phaseColor,working,onClaim,onGo}:{step:TrainerJourneyStep;phaseColor:string;working:boolean;onClaim:()=>void;onGo:()=>void}){
  const{colors}=useAppTheme();
  const pct=Math.min(100,step.target?step.progress/step.target*100:0);
  const claimable=step.completed&&!step.claimed;
  return <View style={[styles.stepCard,{backgroundColor:colors.surface,borderColor:step.claimed?'#4FB77F':claimable?colors.yellow:colors.border}]}>
    <View style={[styles.stepState,{backgroundColor:step.claimed?'#173528':claimable?'#352B11':phaseColor+'18'}]}><Ionicons name={step.claimed?'checkmark-circle':claimable?'gift':'flag'} size={20} color={step.claimed?'#65D894':claimable?colors.yellow:phaseColor}/></View>
    <View style={styles.grow}>
      <View style={styles.stepTitleRow}><Text style={[styles.stepTitle,{color:colors.text}]}>{step.title}</Text>{step.claimed?<StatusPill tone="success" label="COLETADA"/>:claimable?<StatusPill tone="action" label="PRONTA"/>:null}</View>
      <Text style={[styles.stepDescription,{color:colors.muted}]}>{step.description}</Text>
      <View style={styles.stepProgressRow}><Text style={[styles.stepProgress,{color:colors.text}]}>{Math.min(step.progress,step.target).toLocaleString('pt-BR')}/{step.target.toLocaleString('pt-BR')}</Text><Text style={[styles.stepReward,{color:colors.yellow}]}>🪙 {step.rewardCoins.toLocaleString('pt-BR')}{step.rewardDiamonds?' • 💎 '+step.rewardDiamonds:''}</Text></View>
      <View style={[styles.stepTrack,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.fill,{backgroundColor:step.completed?'#65D894':phaseColor,width:`${pct}%`}]}/></View>
    </View>
    {!step.claimed?<Pressable disabled={working} onPress={claimable?onClaim:onGo} style={[styles.stepButton,{backgroundColor:claimable?colors.yellow:colors.surfaceAlt,borderColor:claimable?colors.yellow:colors.border}]}><Ionicons name={claimable?'gift':'arrow-forward'} size={17} color={claimable?'#07111F':colors.accent}/><Text style={[styles.stepButtonText,{color:claimable?'#07111F':colors.text}]}>{working?'...':claimable?'COLETAR':'IR'}</Text></Pressable>:null}
  </View>;
}

const styles=StyleSheet.create({memoryActions:{flexDirection:'row',flexWrap:'wrap',gap:8},memoryAction:{flexGrow:1,flexBasis:250,minWidth:220,borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:9},memoryTitle:{fontSize:10.5,fontWeight:'900'},memoryText:{fontSize:7.5,lineHeight:11,marginTop:2},
  notice:{borderRadius:15,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,fontSize:9.5,fontWeight:'700'},
  hero:{borderRadius:24,borderWidth:1,padding:16,gap:10},heroTop:{flexDirection:'row',alignItems:'center',gap:11},tierIcon:{width:57,height:57,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},grow:{flex:1,minWidth:0},kicker:{fontSize:7.5,fontWeight:'900',letterSpacing:1.15},heroTitle:{fontSize:22,fontWeight:'900',marginTop:2},heroSub:{fontSize:8.5,lineHeight:13,marginTop:3},scoreBox:{alignItems:'flex-end'},score:{fontSize:24,fontWeight:'900'},scoreLabel:{fontSize:6.5,fontWeight:'900'},track:{height:8,borderRadius:999,overflow:'hidden'},fill:{height:'100%',borderRadius:999},heroFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},heroFootText:{fontSize:7.5,fontWeight:'800'},infoLink:{flexDirection:'row',alignItems:'center',gap:4},infoText:{fontSize:7,fontWeight:'900'},scoreExplain:{fontSize:7.6,lineHeight:12},
  identityGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},statCard:{flexGrow:1,flexBasis:150,minWidth:135,borderRadius:16,borderWidth:1,padding:10},statIcon:{width:36,height:36,borderRadius:11,alignItems:'center',justifyContent:'center',marginBottom:7},statLabel:{fontSize:6.5,fontWeight:'900',letterSpacing:.6},statValue:{fontSize:17,fontWeight:'900',marginTop:2},statSub:{fontSize:7,marginTop:2},
  storyGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},storyCard:{flexGrow:1,flexBasis:260,minWidth:240,borderRadius:18,borderWidth:1,padding:13},sectionKicker:{fontSize:7,fontWeight:'900',letterSpacing:.8},storyTitle:{fontSize:16,fontWeight:'900',marginTop:3},storyText:{fontSize:8.5,lineHeight:13,marginTop:3},storyAction:{alignSelf:'flex-start',marginTop:10,minHeight:34,borderRadius:10,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},storyActionText:{fontSize:7,fontWeight:'900'},
  signatureCard:{flexGrow:1,flexBasis:260,minWidth:240,borderRadius:18,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:10},signatureImage:{width:69,height:94,borderRadius:8},signatureHint:{fontSize:6.5,fontWeight:'900',marginTop:5},
  journeyHero:{borderRadius:20,borderWidth:1,padding:14,gap:10},journeyTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},sectionTitle:{fontSize:18,fontWeight:'900',marginTop:2},claimAll:{minHeight:39,borderRadius:12,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:6},claimAllText:{fontSize:7.5,fontWeight:'900',color:'#07111F'},
  phaseSection:{gap:8},phaseHeader:{flexDirection:'row',alignItems:'center',gap:9},phaseIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},phaseTitle:{fontSize:15,fontWeight:'900'},phaseSub:{fontSize:7.5,lineHeight:11,marginTop:2},phaseCount:{fontSize:12,fontWeight:'900'},stepList:{gap:7},
  stepCard:{borderRadius:16,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:9},stepState:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center'},stepTitleRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},stepTitle:{fontSize:11,fontWeight:'900'},stepDescription:{fontSize:7.5,lineHeight:11,marginTop:2},stepProgressRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7,marginTop:5},stepProgress:{fontSize:7.5,fontWeight:'900'},stepReward:{fontSize:7,fontWeight:'900'},stepTrack:{height:5,borderRadius:999,overflow:'hidden',marginTop:5},stepButton:{minWidth:55,minHeight:39,borderRadius:11,borderWidth:1,paddingHorizontal:8,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:4},stepButtonText:{fontSize:7,fontWeight:'900'},
  sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},regionGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},regionCard:{flexGrow:1,flexBasis:210,minWidth:190,borderRadius:16,borderWidth:1,padding:11},regionTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7},regionGen:{fontSize:6.5,fontWeight:'900'},regionName:{fontSize:14,fontWeight:'900',marginTop:1},regionPct:{fontSize:14,fontWeight:'900'},regionNumbers:{fontSize:8,fontWeight:'800',marginTop:7},regionTrack:{height:6,borderRadius:999,overflow:'hidden',marginTop:6},regionClaim:{minHeight:36,borderRadius:10,alignItems:'center',justifyContent:'center',marginTop:9},regionClaimText:{fontSize:7,fontWeight:'900',color:'#07111F'},
  seasonList:{gap:7},seasonCard:{borderRadius:16,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:10},seasonBadge:{width:43,height:43,borderRadius:13,alignItems:'center',justifyContent:'center'},seasonName:{fontSize:12,fontWeight:'900'},seasonMeta:{fontSize:7.5,marginTop:2},seasonDate:{fontSize:6.5,marginTop:3},
  empty:{borderRadius:17,borderWidth:1,padding:22,alignItems:'center',gap:6},emptyTitle:{fontSize:13,fontWeight:'900'},emptyText:{fontSize:8,textAlign:'center',lineHeight:12},
  philosophy:{borderRadius:18,borderWidth:1,padding:13,flexDirection:'row',alignItems:'center',gap:10},philosophyTitle:{fontSize:11,fontWeight:'900'},philosophyText:{fontSize:8,lineHeight:12,marginTop:3},
});
