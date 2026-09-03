import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/ThemeProvider';

const LOOP=[
  {icon:'cube',title:'1. Colecione',text:'Abra boosters, complete sets e descubra espécies na Pokédex.',route:'/(tabs)/packs',color:'#5AA8FF'},
  {icon:'albums',title:'2. Monte seu time',text:'Use a Bag e os Decks para separar os Pokémon que quer levar para a arena.',route:'/decks',color:'#54C78D'},
  {icon:'game-controller',title:'3. Compita',text:'Escolha golpes no game_v1. Estratégia, tipos e stats importam; preço da carta não aumenta força.',route:'/(tabs)/battles',color:'#FF735C'},
  {icon:'trophy',title:'4. Evolua',text:'Suba na temporada, cumpra missões, desbloqueie títulos e complete a Jornada.',route:'/career',color:'#F0C74E'},
  {icon:'people',title:'5. Socialize',text:'Troque cartas, faça amigos, entre em guilda e dispute objetivos coletivos.',route:'/guilds',color:'#9B7BFF'},
] as const;

const GLOSSARY=[
  {term:'HP',text:'Pontos de vida do Pokémon. Quando chega a zero, ele é nocauteado.'},
  {term:'Attack / Ataque',text:'Atributo usado no cálculo de golpes físicos.'},
  {term:'Defense / Defesa',text:'Reduz o dano recebido de golpes físicos.'},
  {term:'Sp. Atk',text:'Atributo usado no cálculo de golpes especiais.'},
  {term:'Sp. Def',text:'Reduz o dano recebido de golpes especiais.'},
  {term:'Speed',text:'Ajuda a decidir quem age primeiro depois da prioridade do golpe.'},
  {term:'PP',text:'Quantidade de usos disponíveis para cada golpe. PP zero impede escolher aquele golpe.'},
  {term:'STAB',text:'Bônus quando o tipo do golpe combina com um dos tipos do próprio Pokémon.'},
  {term:'Efetividade',text:'A tabela de tipos pode multiplicar o dano, reduzir ou até anular um golpe.'},
  {term:'ELO',text:'Pontuação competitiva da ranqueada. Ela representa desempenho em batalha, não valor da coleção.'},
  {term:'Career Score',text:'Resumo de evolução da conta. Não é moeda e não compra nada.'},
  {term:'Valor de mercado',text:'Estimativa em USD da carta. Serve para coleção e comércio, não para definir quem vence batalha.'},
  {term:'Game Value / Coins',text:'Economia interna do jogo. Coins servem para packs, comércio e outras atividades.'},
  {term:'Diamantes',text:'Moeda premium/colecionável usada apenas em sistemas específicos. Não substitui estratégia em batalha.'},
  {term:'Rank semanal',text:'Ranking temporário da evolução da coleção naquela semana. Cartas repetidas não contam como novas para o ganho único.'},
];

const FIRST_MINUTES=[
  'Abra seu primeiro booster.',
  'Veja as cartas novas na Bag.',
  'Monte um deck com pelo menos 3 cartas.',
  'Entre em uma batalha e escolha seus golpes.',
  'Visite a Carreira para coletar as primeiras recompensas.',
];

export default function TrainerGuideScreen(){
  const router=useRouter();
  const{colors}=useAppTheme();
  return <Screen title="Guia do Treinador" subtitle="Entenda o jogo sem tutorial longo. Consulte apenas quando precisar.">
    <View style={[styles.hero,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
      <Ionicons name="compass" size={31} color={colors.accent}/>
      <View style={styles.grow}><Text style={[styles.kicker,{color:colors.accent}]}>O CICLO PRINCIPAL</Text><Text style={[styles.heroTitle,{color:colors.text}]}>Colecione → monte → compita → evolua → socialize</Text><Text style={[styles.heroText,{color:colors.muted}]}>Quase toda função do Trainer Collection existe para fortalecer uma dessas etapas.</Text></View>
    </View>

    <Text style={[styles.sectionTitle,{color:colors.text}]}>O que fazer nos primeiros minutos</Text>
    <View style={styles.steps}>{FIRST_MINUTES.map((step,index)=><View key={step} style={[styles.firstStep,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={[styles.number,{backgroundColor:colors.yellow}]}><Text style={styles.numberText}>{index+1}</Text></View><Text style={[styles.firstText,{color:colors.text}]}>{step}</Text></View>)}</View>

    <Text style={[styles.sectionTitle,{color:colors.text}]}>Como as áreas se conectam</Text>
    <View style={styles.loopGrid}>{LOOP.map(item=><Pressable key={item.title} onPress={()=>router.push(item.route as never)} style={[styles.loopCard,{backgroundColor:colors.surface,borderColor:item.color}]}><View style={[styles.loopIcon,{backgroundColor:item.color+'1C'}]}><Ionicons name={item.icon} size={22} color={item.color}/></View><Text style={[styles.loopTitle,{color:colors.text}]}>{item.title}</Text><Text style={[styles.loopText,{color:colors.muted}]}>{item.text}</Text><View style={styles.openRow}><Text style={[styles.openText,{color:item.color}]}>ABRIR</Text><Ionicons name="arrow-forward" size={14} color={item.color}/></View></Pressable>)}</View>

    <View style={[styles.ruleCard,{backgroundColor:colors.surface,borderColor:'#FF735C'}]}>
      <Ionicons name="shield-checkmark" size={24} color="#FF735C"/>
      <View style={styles.grow}><Text style={[styles.ruleTitle,{color:colors.text}]}>Coleção cara não significa batalha ganha</Text><Text style={[styles.ruleText,{color:colors.muted}]}>No game_v1, a luta usa os stats e golpes da espécie/forma. Uma carta valiosa continua especial para coleção e mercado, mas preço e raridade não dão dano extra.</Text></View>
    </View>

    <Text style={[styles.sectionTitle,{color:colors.text}]}>Glossário rápido</Text>
    <View style={styles.glossary}>{GLOSSARY.map(item=><View key={item.term} style={[styles.glossaryRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.term,{color:colors.yellow}]}>{item.term}</Text><Text style={[styles.definition,{color:colors.muted}]}>{item.text}</Text></View>)}</View>

    <View style={[styles.tip,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Ionicons name="information-circle" size={22} color={colors.accent}/>
      <View style={styles.grow}><Text style={[styles.tipTitle,{color:colors.text}]}>Profundo sem ser confuso</Text><Text style={[styles.tipText,{color:colors.muted}]}>Quando algum número parecer estranho, volte aqui. O jogo pode ter estratégia e economia complexas sem exigir que o jogador memorize tudo.</Text></View>
    </View>
  </Screen>;
}

const styles=StyleSheet.create({
  grow:{flex:1,minWidth:0},hero:{borderRadius:22,borderWidth:1,padding:15,flexDirection:'row',alignItems:'center',gap:11},kicker:{fontSize:7,fontWeight:'900',letterSpacing:1},heroTitle:{fontSize:18,fontWeight:'900',marginTop:3},heroText:{fontSize:8.5,lineHeight:13,marginTop:4},
  sectionTitle:{fontSize:18,fontWeight:'900',marginTop:5},steps:{gap:7},firstStep:{minHeight:52,borderRadius:15,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:9},number:{width:32,height:32,borderRadius:10,alignItems:'center',justifyContent:'center'},numberText:{fontSize:12,fontWeight:'900',color:'#07111F'},firstText:{fontSize:10,fontWeight:'800'},
  loopGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},loopCard:{flexGrow:1,flexBasis:220,minWidth:200,borderRadius:18,borderWidth:1,padding:12},loopIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center'},loopTitle:{fontSize:13,fontWeight:'900',marginTop:8},loopText:{fontSize:8.5,lineHeight:13,marginTop:4},openRow:{flexDirection:'row',alignItems:'center',gap:4,marginTop:9},openText:{fontSize:7,fontWeight:'900'},
  ruleCard:{borderRadius:18,borderWidth:1,padding:13,flexDirection:'row',gap:10,alignItems:'center'},ruleTitle:{fontSize:12,fontWeight:'900'},ruleText:{fontSize:8.5,lineHeight:13,marginTop:3},
  glossary:{gap:6},glossaryRow:{borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',gap:10,alignItems:'flex-start'},term:{width:96,fontSize:9,fontWeight:'900'},definition:{flex:1,fontSize:8.5,lineHeight:13},
  tip:{borderRadius:17,borderWidth:1,padding:13,flexDirection:'row',alignItems:'center',gap:9},tipTitle:{fontSize:11,fontWeight:'900'},tipText:{fontSize:8,lineHeight:12,marginTop:2},
});
