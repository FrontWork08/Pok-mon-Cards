import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { getLatestUpdateLogs, type AppUpdateLog } from '@/services/updateLog';
import { useAppTheme } from '@/theme/ThemeProvider';

export function UpdateLogHomeCard() {
  const { colors } = useAppTheme();
  const [logs, setLogs] = useState<AppUpdateLog[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed=false;
    getLatestUpdateLogs(3)
      .then((rows)=>{if(!disposed)setLogs(rows);})
      .catch(()=>null)
      .finally(()=>{if(!disposed)setLoading(false);});
    return()=>{disposed=true;};
  },[]);

  const latest=logs[0];
  const nativeVersion=Constants.expoConfig?.version ?? '—';

  return (
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Pressable onPress={()=>setExpanded((value)=>!value)} style={styles.header}>
        <View style={[styles.icon,{backgroundColor:colors.accentSoft}]}>
          <Ionicons name="newspaper" size={20} color={colors.accent}/>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.kicker,{color:colors.yellow}]}>ATUALIZAÇÕES</Text>
          <Text style={[styles.title,{color:colors.text}]}>
            {latest ? latest.version : `Versão nativa ${nativeVersion}`}
          </Text>
          <Text numberOfLines={expanded?3:1} style={[styles.summary,{color:colors.muted}]}>
            {latest?.summary ?? 'Veja aqui o histórico do que mudou no jogo.'}
          </Text>
        </View>
        {loading?<ActivityIndicator size="small" color={colors.accent}/>:<Ionicons name={expanded?'chevron-up':'chevron-down'} size={18} color={colors.muted}/>}
      </Pressable>

      {expanded && latest ? (
        <View style={styles.details}>
          <View style={[styles.versionLine,{backgroundColor:colors.surfaceAlt}]}>
            <Text style={[styles.versionText,{color:colors.text}]}>App nativo: v{nativeVersion}</Text>
            <Text style={[styles.versionDate,{color:colors.muted}]}>{new Date(latest.publishedAt).toLocaleDateString('pt-BR')}</Text>
          </View>
          <Text style={[styles.latestTitle,{color:colors.text}]}>{latest.title}</Text>
          <View style={styles.changeList}>
            {latest.changes.map((change,index)=>(
              <View key={`${latest.id}-${index}`} style={styles.changeRow}>
                <Ionicons name="checkmark-circle" size={14} color="#5BDB9F"/>
                <Text style={[styles.changeText,{color:colors.muted}]}>{change}</Text>
              </View>
            ))}
          </View>
          {logs.slice(1).map((item)=>(
            <View key={item.id} style={[styles.older,{borderTopColor:colors.border}]}>
              <Text style={[styles.olderVersion,{color:colors.text}]}>{item.version} • {item.title}</Text>
              <Text style={[styles.olderSummary,{color:colors.muted}]}>{item.summary}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles=StyleSheet.create({
  card:{borderRadius:18,borderWidth:1,padding:12,gap:9},
  header:{flexDirection:'row',alignItems:'center',gap:10},
  icon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},
  copy:{flex:1,minWidth:0},
  kicker:{fontSize:7,fontWeight:'900',letterSpacing:1},
  title:{fontSize:13,fontWeight:'900',marginTop:2},
  summary:{fontSize:8,lineHeight:12,marginTop:2},
  details:{gap:9},
  versionLine:{borderRadius:11,paddingHorizontal:10,paddingVertical:7,flexDirection:'row',justifyContent:'space-between',gap:8},
  versionText:{fontSize:8,fontWeight:'900'},
  versionDate:{fontSize:8,fontWeight:'700'},
  latestTitle:{fontSize:13,fontWeight:'900'},
  changeList:{gap:6},
  changeRow:{flexDirection:'row',alignItems:'flex-start',gap:7},
  changeText:{flex:1,fontSize:9,lineHeight:13},
  older:{borderTopWidth:1,paddingTop:8},
  olderVersion:{fontSize:9,fontWeight:'900'},
  olderSummary:{fontSize:8,lineHeight:12,marginTop:2},
});
