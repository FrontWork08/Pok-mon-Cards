import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { getAdminBattleLabCatalog, getAdminBattleLabMatrix, type AdminBattleLabCard } from '@/services/adminLaunchTools';
import { useAppTheme } from '@/theme/ThemeProvider';

const PAGE_SIZE=80;

export default function AdminBattleLabScreen(){
  const{colors}=useAppTheme();
  const[selected,setSelected]=useState<Record<string,AdminBattleLabCard>>({});
  const[picker,setPicker]=useState(false);
  const[result,setResult]=useState<any>(null);
  const[working,setWorking]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[search,setSearch]=useState('');
  const[catalog,setCatalog]=useState<AdminBattleLabCard[]>([]);
  const[catalogTotal,setCatalogTotal]=useState(0);
  const[catalogLoading,setCatalogLoading]=useState(false);
  const[catalogLoadingMore,setCatalogLoadingMore]=useState(false);
  const requestRef=useRef(0);

  const ids=useMemo(()=>Object.keys(selected).slice(0,8),[selected]);
  const selectedCards=useMemo(()=>ids.map(id=>selected[id]).filter(Boolean),[ids,selected]);

  const loadCatalog=useCallback(async(reset:boolean)=>{
    const requestId=++requestRef.current;
    try{
      if(reset)setCatalogLoading(true);else setCatalogLoadingMore(true);
      setError(null);
      const offset=reset?0:catalog.length;
      const page=await getAdminBattleLabCatalog(search,offset,PAGE_SIZE);
      if(requestId!==requestRef.current)return;
      setCatalogTotal(page.total);
      setCatalog(current=>{
        if(reset)return page.items;
        const seen=new Set(current.map(item=>item.id));
        return [...current,...page.items.filter(item=>!seen.has(item.id))];
      });
    }catch(e){
      if(requestId===requestRef.current)setError(e instanceof Error?e.message:'Não foi possível carregar o catálogo do Battle Lab.');
    }finally{
      if(requestId===requestRef.current){setCatalogLoading(false);setCatalogLoadingMore(false);}
    }
  },[catalog.length,search]);

  useEffect(()=>{
    if(!picker)return;
    const timer=setTimeout(()=>void loadCatalog(true),260);
    return()=>clearTimeout(timer);
  },[picker,search]);

  function toggleCard(card:AdminBattleLabCard){
    setSelected(current=>{
      if(current[card.id]){
        const next={...current};delete next[card.id];return next;
      }
      if(Object.keys(current).length>=8)return current;
      return {...current,[card.id]:card};
    });
    setResult(null);
  }

  function clearSelection(){
    setSelected({});
    setResult(null);
    setError(null);
  }

  function removeCard(cardId:string){
    setSelected(current=>{const next={...current};delete next[cardId];return next;});
    setResult(null);
  }

  async function run(){
    if(ids.length<2)return;
    try{setWorking(true);setError(null);setResult(await getAdminBattleLabMatrix(ids,50));}
    catch(e){setError(e instanceof Error?e.message:'Falha na matriz de simulação.');}
    finally{setWorking(false);}
  }

  return <Screen title="Battle Lab • Matriz Admin" subtitle="Cruze qualquer carta do catálogo em massa. O servidor não cria batalhas, não dá ELO e não altera inventário.">
    <View style={[styles.notice,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="grid" size={21} color={colors.accent}/><Text style={[styles.noticeText,{color:colors.muted}]}>Com 8 cartas são 28 pares × 50 projeções. O catálogo Admin usa todas as cartas com perfil de batalha válido, não apenas a sua Bag.</Text></View>

    <View style={styles.selectionHeader}>
      <Pressable onPress={()=>setPicker(true)} style={[styles.select,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="albums" size={21} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.selectTitle,{color:colors.text}]}>{ids.length} carta(s) selecionada(s)</Text><Text style={[styles.small,{color:colors.muted}]}>Escolha entre 2 e 8 cartas do catálogo completo</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>
      {ids.length?<Pressable disabled={working} onPress={clearSelection} style={[styles.clearButton,{backgroundColor:colors.surface,borderColor:'#D96575'}]}><Ionicons name="trash-outline" size={17} color="#FF8290"/><Text style={styles.clearText}>LIMPAR</Text></Pressable>:null}
    </View>

    {selectedCards.length?<View style={styles.selectedGrid}>{selectedCards.map(card=><View key={card.id} style={[styles.selectedChip,{backgroundColor:colors.surface,borderColor:colors.border}]}>{card.image?<Image source={{uri:card.image}} style={styles.selectedImage} resizeMode="contain"/>:null}<View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={[styles.selectedName,{color:colors.text}]}>{card.name}</Text><Text numberOfLines={1} style={[styles.selectedMeta,{color:colors.muted}]}>{card.setName??card.id}</Text></View><Pressable onPress={()=>removeCard(card.id)} hitSlop={8} style={styles.removeSelected}><Ionicons name="close-circle" size={19} color="#FF8290"/></Pressable></View>)}</View>:null}

    <Pressable disabled={ids.length<2||working} onPress={()=>void run()} style={[styles.run,{backgroundColor:colors.yellow},(ids.length<2||working)&&styles.disabled]}><Text style={styles.runText}>{working?'RODANDO MATRIZ…':'RODAR MATRIZ DE 50 PROJEÇÕES'}</Text></Pressable>
    {working?<ActivityIndicator size="large" color={colors.yellow}/>:null}{error?<Text style={styles.error}>{error}</Text>:null}

    {result?<View style={styles.list}>{(result.pairs??[]).map((p:any,index:number)=>{
      const cardA=selected[String(p.cardA)];
      const cardB=selected[String(p.cardB)];
      const nameA=cardA?.name??String(p.cardA);
      const nameB=cardB?.name??String(p.cardB);
      const rateA=Number(p.aWinRate??0);
      const rateB=Number(p.bWinRate??0);
      const winner=rateA===rateB?null:rateA>rateB?nameA:nameB;
      return <View key={p.cardA+'-'+p.cardB+'-'+index} style={[styles.row,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <View style={styles.matchupHead}>
          <View style={{flex:1,minWidth:0}}><Text style={[styles.pair,{color:colors.text}]}>{nameA} × {nameB}</Text><Text style={[styles.cardIds,{color:colors.muted}]}>{p.cardA} × {p.cardB}</Text></View>
          <View style={[styles.winnerBadge,{backgroundColor:winner?colors.accentSoft:colors.surfaceAlt,borderColor:winner?colors.accent:colors.border}]}><Ionicons name={winner?'trophy':'remove'} size={13} color={winner?colors.yellow:colors.muted}/><Text numberOfLines={2} style={[styles.winnerText,{color:winner?colors.text:colors.muted}]}>{winner?`Vencedor: ${winner}`:'Empate projetado'}</Text></View>
        </View>
        <View style={styles.rateRow}>
          <View style={[styles.rateBox,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text numberOfLines={1} style={[styles.rateName,{color:colors.muted}]}>{nameA}</Text><Text style={[styles.rateValue,{color:'#5AA8FF'}]}>{rateA}%</Text></View>
          <View style={[styles.rateBox,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text numberOfLines={1} style={[styles.rateName,{color:colors.muted}]}>{nameB}</Text><Text style={[styles.rateValue,{color:'#FF735C'}]}>{rateB}%</Text></View>
        </View>
        <Text style={[styles.small,{color:colors.muted}]}>Média {p.averageTurns} turnos • empates {p.draws}</Text>
      </View>;
    })}</View>:null}

    <Modal visible={picker} animationType="slide" transparent onRequestClose={()=>setPicker(false)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard,{backgroundColor:colors.bg,borderColor:colors.border}]}>
          <View style={styles.modalHead}><View style={{flex:1}}><Text style={[styles.modalKicker,{color:colors.accent}]}>CATÁLOGO COMPLETO • ADMIN</Text><Text style={[styles.modalTitle,{color:colors.text}]}>Escolher cartas para a matriz</Text><Text style={[styles.modalSub,{color:colors.muted}]}>{ids.length}/8 selecionadas • {catalogTotal.toLocaleString('pt-BR')} cartas encontradas</Text></View><Pressable onPress={()=>setPicker(false)} style={[styles.close,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="close" size={22} color={colors.text}/></Pressable></View>

          <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={18} color={colors.muted}/><TextInput value={search} onChangeText={setSearch} placeholder="Buscar Pokémon, set ou ID..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]}/>{search?<Pressable onPress={()=>setSearch('')} hitSlop={8}><Ionicons name="close-circle" size={17} color={colors.muted}/></Pressable>:null}</View>

          <View style={styles.modalActions}>{ids.length?<Pressable onPress={clearSelection} style={[styles.modalClear,{borderColor:'#D96575'}]}><Ionicons name="trash-outline" size={15} color="#FF8290"/><Text style={styles.modalClearText}>LIMPAR TODAS</Text></Pressable>:<View/>}<Text style={[styles.catalogHint,{color:colors.muted}]}>A lista carrega aos poucos; a busca consulta as 17 mil+ cartas no servidor.</Text></View>

          {catalogLoading?<View style={styles.loadingBox}><ActivityIndicator size="large" color={colors.yellow}/><Text style={[styles.loadingText,{color:colors.muted}]}>Carregando catálogo...</Text></View>:<FlatList
            data={catalog}
            numColumns={2}
            keyExtractor={item=>item.id}
            style={styles.catalogList}
            contentContainerStyle={styles.catalogContent}
            columnWrapperStyle={styles.catalogRow}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={5}
            updateCellsBatchingPeriod={60}
            onEndReachedThreshold={0.6}
            onEndReached={()=>{if(!catalogLoadingMore&&catalog.length<catalogTotal)void loadCatalog(false);}}
            ListEmptyComponent={<View style={styles.empty}><Ionicons name="search" size={30} color={colors.muted}/><Text style={[styles.emptyText,{color:colors.muted}]}>Nenhuma carta encontrada.</Text></View>}
            ListFooterComponent={catalogLoadingMore?<ActivityIndicator style={{marginVertical:16}} color={colors.yellow}/>:null}
            renderItem={({item})=>{
              const active=Boolean(selected[item.id]);
              const blocked=!active&&ids.length>=8;
              return <Pressable disabled={blocked} onPress={()=>toggleCard(item)} style={[styles.catalogCard,{backgroundColor:colors.surface,borderColor:active?colors.yellow:colors.border},blocked&&styles.catalogBlocked]}>
                <View style={styles.catalogImageWrap}>{item.image?<Image source={{uri:item.image}} style={styles.catalogImage} resizeMode="contain" fadeDuration={0}/>:<Ionicons name="image-outline" size={28} color={colors.muted}/>} {active?<View style={[styles.selectedBadge,{backgroundColor:colors.yellow}]}><Ionicons name="checkmark" size={14} color="#07111F"/></View>:null}</View>
                <Text numberOfLines={1} style={[styles.catalogName,{color:colors.text}]}>{item.name}</Text>
                <Text numberOfLines={1} style={[styles.catalogMeta,{color:colors.muted}]}>{item.setName??'Set desconhecido'}</Text>
                <Text numberOfLines={1} style={[styles.catalogMeta,{color:colors.muted}]}>{item.rarity??'Sem raridade'} • {(item.gameTypes??[]).join(' / ').toUpperCase()||'TIPO —'}</Text>
                <Text numberOfLines={1} style={[styles.catalogId,{color:colors.accent}]}>{item.id}</Text>
              </Pressable>;
            }}
          />}

          <Pressable onPress={()=>setPicker(false)} style={[styles.confirm,{backgroundColor:colors.yellow}]}><Text style={styles.confirmText}>USAR {ids.length} CARTA(S) NA MATRIZ</Text></Pressable>
        </View>
      </View>
    </Modal>
  </Screen>;
}

const styles=StyleSheet.create({
  notice:{borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,fontSize:7.8,lineHeight:12},
  selectionHeader:{flexDirection:'row',alignItems:'stretch',gap:7,flexWrap:'wrap'},select:{flexGrow:1,flexBasis:250,borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},selectTitle:{fontSize:11,fontWeight:'900'},small:{fontSize:7.2,lineHeight:11,marginTop:2},
  clearButton:{minHeight:52,borderRadius:13,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},clearText:{fontSize:7,fontWeight:'900',color:'#FF8290'},
  selectedGrid:{flexDirection:'row',flexWrap:'wrap',gap:6},selectedChip:{flexGrow:1,flexBasis:210,minWidth:180,maxWidth:330,borderRadius:12,borderWidth:1,padding:6,flexDirection:'row',alignItems:'center',gap:6},selectedImage:{width:34,height:46},selectedName:{fontSize:8.5,fontWeight:'900'},selectedMeta:{fontSize:6.5,marginTop:2},removeSelected:{padding:2},
  run:{alignSelf:'flex-start',borderRadius:12,minHeight:42,paddingHorizontal:12,justifyContent:'center'},runText:{fontSize:8,fontWeight:'900',color:'#07111F'},disabled:{opacity:.4},error:{color:'#FF9EAA',fontSize:9},
  list:{gap:8},row:{borderRadius:14,borderWidth:1,padding:10,gap:8},matchupHead:{flexDirection:'row',alignItems:'center',gap:8},pair:{fontSize:10.5,fontWeight:'900'},cardIds:{fontSize:6.3,marginTop:2},winnerBadge:{maxWidth:'48%',minHeight:30,borderRadius:10,borderWidth:1,paddingHorizontal:7,flexDirection:'row',alignItems:'center',gap:4},winnerText:{fontSize:6.8,fontWeight:'900',flexShrink:1},rateRow:{flexDirection:'row',gap:7},rateBox:{flex:1,minWidth:0,borderRadius:11,borderWidth:1,padding:8},rateName:{fontSize:6.8,fontWeight:'800'},rateValue:{fontSize:16,fontWeight:'900',marginTop:2},
  modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.72)',padding:12,justifyContent:'center'},modalCard:{height:'92%',borderRadius:22,borderWidth:1,padding:12,gap:9,overflow:'hidden'},modalHead:{flexDirection:'row',alignItems:'flex-start',gap:8},modalKicker:{fontSize:6.5,fontWeight:'900',letterSpacing:.8},modalTitle:{fontSize:17,fontWeight:'900',marginTop:2},modalSub:{fontSize:7.5,marginTop:3},close:{width:40,height:40,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},
  searchBox:{height:46,borderRadius:13,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:7},searchInput:{flex:1,fontSize:10,paddingVertical:0},modalActions:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},modalClear:{minHeight:32,borderRadius:9,borderWidth:1,paddingHorizontal:7,flexDirection:'row',alignItems:'center',gap:4},modalClearText:{fontSize:6.5,fontWeight:'900',color:'#FF8290'},catalogHint:{fontSize:6.3,lineHeight:9.5,flex:1,textAlign:'right'},
  loadingBox:{flex:1,alignItems:'center',justifyContent:'center',gap:8},loadingText:{fontSize:8},catalogList:{flex:1},catalogContent:{paddingBottom:8},catalogRow:{gap:7,marginBottom:7},catalogCard:{flex:1,minWidth:0,borderRadius:13,borderWidth:1,padding:7,gap:3},catalogBlocked:{opacity:.42},catalogImageWrap:{height:120,alignItems:'center',justifyContent:'center',position:'relative'},catalogImage:{width:'100%',height:'100%'},selectedBadge:{position:'absolute',right:2,top:2,width:24,height:24,borderRadius:999,alignItems:'center',justifyContent:'center'},catalogName:{fontSize:8.5,fontWeight:'900'},catalogMeta:{fontSize:6.2},catalogId:{fontSize:5.8,fontWeight:'800',marginTop:1},empty:{paddingVertical:40,alignItems:'center',gap:7},emptyText:{fontSize:8},
  confirm:{minHeight:44,borderRadius:12,alignItems:'center',justifyContent:'center'},confirmText:{fontSize:8,fontWeight:'900',color:'#07111F'}
});
