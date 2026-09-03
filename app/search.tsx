import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { getProfileAvatarUrl } from '@/services/player';
import { globalSearch, type GlobalCardResult, type GlobalDeckResult, type GlobalGuildResult, type GlobalPlayerResult, type GlobalSetResult, type GlobalTournamentResult } from '@/services/globalSearch';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

type FunctionResult = {
  label: string;
  description: string;
  route: string;
  keywords: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const FUNCTIONS: FunctionResult[] = [
  {label:'Bag',description:'Sua coleção, filtros e valores',route:'/(tabs)/bag',keywords:'coleção cartas cards inventário',icon:'albums'},
  {label:'Packs',description:'Abrir boosters',route:'/(tabs)/packs',keywords:'booster pacotes abrir',icon:'cube'},
  {label:'Batalhas',description:'Ranqueada, desafios e histórico',route:'/(tabs)/battles',keywords:'batalha luta elo rank game',icon:'game-controller'},
  {label:'Trocas',description:'Negociações entre treinadores',route:'/(tabs)/trade',keywords:'trade troca negociação',icon:'swap-horizontal'},
  {label:'Pokédex',description:'Espécies descobertas',route:'/pokedex',keywords:'pokedex pokemon espécies',icon:'book'},
  {label:'Decks',description:'Montar e editar equipes',route:'/decks',keywords:'deck equipe batalha',icon:'albums-outline'},
  {label:'Mercado de Treinadores',description:'Comprar, vender e fazer ofertas',route:'/marketplace',keywords:'mercado shop vender comprar oferta',icon:'storefront'},
  {label:'Guildas',description:'Equipe, chat e missões coletivas',route:'/guilds',keywords:'guilda equipe grupo chat',icon:'shield'},
  {label:'Guild Wars',description:'Ginásios e guerra de guildas',route:'/guild-wars',keywords:'guerra ginásio guilda',icon:'flash'},
  {label:'Amigos e Chat',description:'Rede de treinadores',route:'/friends',keywords:'amigos social chat pessoas',icon:'people'},
  {label:'Central de Atividades',description:'Pendências, convites e mensagens',route:'/inbox',keywords:'notificação atividade mensagem convite pendente',icon:'notifications'},
  {label:'Passe de Batalha',description:'Níveis e recompensas',route:'/battle-pass',keywords:'passe progresso vip recompensa',icon:'ribbon'},
  {label:'Missões',description:'Objetivos e recompensas',route:'/missions',keywords:'missão objetivo recompensa',icon:'checkbox'},
  {label:'Ranking de Coleções',description:'Posições por coleção',route:'/collection-ranking',keywords:'rank ranking coleção',icon:'podium'},
  {label:'Copa Trainer',description:'Torneios e brackets',route:'/tournaments',keywords:'copa torneio campeonato bracket',icon:'trophy'},
  {label:'Cosméticos',description:'Temas, molduras e fundos',route:'/cosmetics',keywords:'cosmético tema moldura fundo galaxy',icon:'color-wand'},
  {label:'Configurações',description:'Aparência, privacidade e preferências',route:'/settings',keywords:'configuração settings tema som privacidade',icon:'settings'},
];

function normalize(value:string){
  return value.trim().toLocaleLowerCase('pt-BR');
}

export default function GlobalSearchScreen(){
  const router=useRouter();
  const{colors}=useAppTheme();
  const[query,setQuery]=useState('');
  const[cards,setCards]=useState<GlobalCardResult[]>([]);
  const[players,setPlayers]=useState<GlobalPlayerResult[]>([]);
  const[guilds,setGuilds]=useState<GlobalGuildResult[]>([]);
  const[sets,setSets]=useState<GlobalSetResult[]>([]);
  const[decks,setDecks]=useState<GlobalDeckResult[]>([]);
  const[tournaments,setTournaments]=useState<GlobalTournamentResult[]>([]);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);

  const functions=useMemo(()=>{
    const term=normalize(query);
    if(term.length<2)return[];
    return FUNCTIONS.filter(item=>normalize(item.label+' '+item.description+' '+item.keywords).includes(term)).slice(0,8);
  },[query]);

  useEffect(()=>{
    const term=query.trim();
    if(term.length<2){setCards([]);setPlayers([]);setGuilds([]);setSets([]);setDecks([]);setTournaments([]);setLoading(false);return;}
    let active=true;
    const timer=setTimeout(()=>{
      setLoading(true);setError(null);
      void globalSearch(term)
        .then(result=>{if(!active)return;setCards(result.cards);setPlayers(result.players);setGuilds(result.guilds);setSets(result.sets);setDecks(result.decks);setTournaments(result.tournaments);})
        .catch(err=>{if(active)setError(err instanceof Error?err.message:'Não foi possível pesquisar agora.');})
        .finally(()=>{if(active)setLoading(false);});
    },260);
    return()=>{active=false;clearTimeout(timer);};
  },[query]);

  const count=functions.length+cards.length+players.length+guilds.length+sets.length+decks.length+tournaments.length;

  return <Screen title="Busca Global" subtitle="Encontre funções, cartas, treinadores e guildas sem ficar procurando em vários menus.">
    <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:query?colors.accent:colors.border}]}>
      <Ionicons name="search" size={21} color={query?colors.accent:colors.muted}/>
      <TextInput
        autoFocus
        value={query}
        onChangeText={setQuery}
        placeholder="Digite Pokémon, jogador, guilda ou função..."
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input,{color:colors.text}]}
      />
      {loading?<ActivityIndicator size="small" color={colors.yellow}/>:query?<Pressable onPress={()=>setQuery('')}><Ionicons name="close-circle" size={20} color={colors.muted}/></Pressable>:null}
    </View>

    {query.trim().length<2?<View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search-outline" size={38} color={colors.accent}/><Text style={[styles.emptyTitle,{color:colors.text}]}>Uma busca para o app inteiro</Text><Text style={[styles.emptyText,{color:colors.muted}]}>Digite pelo menos 2 caracteres. Você pode buscar “Charizard”, “guilda”, “deck”, o nome de um treinador ou qualquer função.</Text></View>:null}
    {error?<View style={styles.error}><Ionicons name="alert-circle" size={18} color="#FF98A4"/><Text style={styles.errorText}>{error}</Text></View>:null}

    {query.trim().length>=2?<View style={styles.resultSummary}><Text style={[styles.resultCount,{color:colors.text}]}>{count}</Text><Text style={[styles.resultLabel,{color:colors.muted}]}>resultado(s) encontrados</Text></View>:null}

    {functions.length?<SectionTitle icon="grid" title="Funções" count={functions.length}/>:null}
    {functions.length?<View style={styles.list}>{functions.map(item=><Pressable key={item.route} onPress={()=>router.push(item.route as never)} style={[styles.functionRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={[styles.functionIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name={item.icon} size={20} color={colors.accent}/></View><View style={styles.body}><Text style={[styles.title,{color:colors.text}]}>{item.label}</Text><Text style={[styles.meta,{color:colors.muted}]}>{item.description}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}</View>:null}

    {cards.length?<SectionTitle icon="card" title="Cartas" count={cards.length}/>:null}
    {cards.length?<View style={styles.cardGrid}>{cards.map(card=><Pressable key={card.id} onPress={()=>router.push(('/card/'+card.id) as never)} style={[styles.cardResult,{backgroundColor:colors.surface,borderColor:colors.border}]}>{card.imageSmall?<Image source={{uri:card.imageSmall}} style={styles.cardImage} resizeMode="contain"/>:<View style={[styles.cardImage,{backgroundColor:colors.surfaceAlt}]}/>}<View style={styles.body}><Text numberOfLines={1} style={[styles.title,{color:colors.text}]}>{card.name}</Text><Text numberOfLines={1} style={[styles.meta,{color:colors.muted}]}>{card.setName}{card.rarity?' • '+card.rarity:''}</Text><Text style={[styles.price,{color:colors.yellow}]}>{card.marketPriceUsd==null?'US$ —':formatUsd(card.marketPriceUsd)}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>)}</View>:null}

    {sets.length?<SectionTitle icon="layers" title="Sets" count={sets.length}/>:null}
    {sets.length?<View style={styles.list}>{sets.map(set=><Pressable key={set.id} onPress={()=>router.push(('/set/'+set.id) as never)} style={[styles.functionRow,{backgroundColor:colors.surface,borderColor:colors.border}]}>{set.image?<Image source={{uri:set.image}} style={styles.setImage} resizeMode="contain"/>:<View style={[styles.functionIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="layers" size={20} color={colors.accent}/></View>}<View style={styles.body}><Text style={[styles.title,{color:colors.text}]}>{set.name}</Text><Text style={[styles.meta,{color:colors.muted}]}>{set.totalCards} cartas • {set.id}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}</View>:null}

    {decks.length?<SectionTitle icon="albums" title="Seus Decks" count={decks.length}/>:null}
    {decks.length?<View style={styles.list}>{decks.map(deck=><Pressable key={deck.id} onPress={()=>router.push(('/deck/'+deck.id) as never)} style={[styles.functionRow,{backgroundColor:colors.surface,borderColor:deck.isDefault?colors.yellow:colors.border}]}><View style={[styles.functionIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="albums" size={20} color={colors.accent}/></View><View style={styles.body}><Text style={[styles.title,{color:colors.text}]}>{deck.name}{deck.isDefault?' • PRINCIPAL':''}</Text><Text style={[styles.meta,{color:colors.muted}]}>{deck.cardCount} carta(s)</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}</View>:null}

    {tournaments.length?<SectionTitle icon="trophy" title="Torneios" count={tournaments.length}/>:null}
    {tournaments.length?<View style={styles.list}>{tournaments.map(item=><Pressable key={item.id||item.name} onPress={()=>router.push('/tournaments')} style={[styles.functionRow,{backgroundColor:colors.surface,borderColor:item.joined?colors.yellow:colors.border}]}><View style={[styles.functionIcon,{backgroundColor:'#FF735C1C'}]}><Ionicons name="trophy" size={20} color="#FF735C"/></View><View style={styles.body}><Text style={[styles.title,{color:colors.text}]}>{item.name}</Text><Text style={[styles.meta,{color:colors.muted}]}>{String(item.status).toUpperCase()} • {item.entries}/{item.maxPlayers} jogadores • prêmio 🪙 {item.prizePoolCoins.toLocaleString('pt-BR')}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}</View>:null}

    {players.length?<SectionTitle icon="people" title="Treinadores" count={players.length}/>:null}
    {players.length?<View style={styles.list}>{players.map(player=>{const avatar=getProfileAvatarUrl(player.avatarPath,player.avatarUpdatedAt);return <Pressable key={player.id} onPress={()=>router.push(('/player/'+player.id) as never)} style={[styles.personRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><TrainerAvatar icon={player.profileIcon} avatarUrl={avatar} color={colors.accent} backgroundColor={colors.accentSoft} size={44}/><View style={styles.body}><Text style={[styles.title,{color:colors.text}]}>@{player.username}</Text><Text style={[styles.meta,{color:colors.muted}]}>Nível {player.level} • ELO {player.battleRating}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>;})}</View>:null}

    {guilds.length?<SectionTitle icon="shield" title="Guildas" count={guilds.length}/>:null}
    {guilds.length?<View style={styles.list}>{guilds.map(guild=><Pressable key={guild.id} onPress={()=>router.push('/guilds')} style={[styles.guildRow,{backgroundColor:colors.surface,borderColor:guild.color||colors.border}]}><View style={[styles.guildIcon,{backgroundColor:(guild.color||colors.accent)+'22'}]}><Ionicons name="shield" size={21} color={guild.color||colors.accent}/></View><View style={styles.body}><Text style={[styles.title,{color:colors.text}]}>{guild.name}</Text><Text numberOfLines={1} style={[styles.meta,{color:colors.muted}]}>{guild.motto} • {guild.memberCount} membro(s) • rank #{guild.rank}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}</View>:null}

    {!loading&&query.trim().length>=2&&count===0?<View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="help-circle-outline" size={36} color={colors.muted}/><Text style={[styles.emptyTitle,{color:colors.text}]}>Nada encontrado</Text><Text style={[styles.emptyText,{color:colors.muted}]}>Tente um nome mais curto ou procure por outra palavra.</Text></View>:null}
  </Screen>;
}

function SectionTitle({icon,title,count}:{icon:keyof typeof Ionicons.glyphMap;title:string;count:number}){
  const{colors}=useAppTheme();
  return <View style={styles.sectionTitle}><View style={styles.sectionTitleLeft}><Ionicons name={icon} size={17} color={colors.accent}/><Text style={[styles.sectionTitleText,{color:colors.text}]}>{title}</Text></View><Text style={[styles.sectionCount,{color:colors.muted}]}>{count}</Text></View>;
}

const styles=StyleSheet.create({
  searchBox:{minHeight:54,borderRadius:17,borderWidth:1,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},input:{flex:1,minWidth:0,fontSize:13,fontWeight:'800'},
  empty:{borderRadius:20,borderWidth:1,padding:24,alignItems:'center',gap:7},emptyTitle:{fontSize:16,fontWeight:'900'},emptyText:{fontSize:10,lineHeight:15,textAlign:'center',maxWidth:500},
  error:{borderRadius:15,borderWidth:1,borderColor:'#6B303A',backgroundColor:'#351A24',padding:11,flexDirection:'row',alignItems:'center',gap:8},errorText:{color:'#FFD9DE',fontSize:10,fontWeight:'700',flex:1},
  resultSummary:{flexDirection:'row',alignItems:'baseline',gap:6},resultCount:{fontSize:22,fontWeight:'900'},resultLabel:{fontSize:9,fontWeight:'800'},
  sectionTitle:{marginTop:4,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionTitleLeft:{flexDirection:'row',alignItems:'center',gap:6},sectionTitleText:{fontSize:17,fontWeight:'900'},sectionCount:{fontSize:9,fontWeight:'900'},
  list:{gap:7},functionRow:{minHeight:60,borderRadius:16,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:9},functionIcon:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center'},body:{flex:1,minWidth:0},title:{fontSize:11.5,fontWeight:'900'},meta:{fontSize:8.5,lineHeight:12,marginTop:2},price:{fontSize:9,fontWeight:'900',marginTop:3},
  setImage:{width:42,height:42,borderRadius:9},cardGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},cardResult:{flexGrow:1,flexBasis:260,minWidth:0,minHeight:102,borderRadius:16,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:8},cardImage:{width:60,height:82,borderRadius:6},
  personRow:{minHeight:62,borderRadius:16,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:10},
  guildRow:{minHeight:64,borderRadius:16,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:10},guildIcon:{width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center'},
});
