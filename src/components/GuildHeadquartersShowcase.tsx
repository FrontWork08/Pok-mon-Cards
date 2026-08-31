import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuraBanner } from '@/components/AuraBanner';
import { useAppTheme } from '@/theme/ThemeProvider';

type GuildHeadquartersShowcaseProps = {
  guildName: string;
  guildColor: string;
  guildLevel?: number;
  upgrades?: Record<string, number> | null;
  compact?: boolean;
};

const STAGES = [
  { key: 'hq', level: 1, label: 'Centro Pokémon', icon: 'medkit' as const },
  { key: 'hall', level: 1, label: 'Hall da Fama', icon: 'trophy' as const },
  { key: 'monument', level: 1, label: 'Estátua Lendária', icon: 'sparkles' as const },
  { key: 'league', level: 1, label: 'Liga da Guilda', icon: 'shield' as const },
  { key: 'hq', level: 2, label: 'Sede Master', icon: 'business' as const },
];

export function GuildHeadquartersShowcase({
  guildName,
  guildColor,
  guildLevel = 1,
  upgrades,
  compact = false,
}: GuildHeadquartersShowcaseProps) {
  const { colors } = useAppTheme();
  const map = upgrades ?? {};
  const unlocked = STAGES.map((stage) => Number(map[stage.key] ?? 0) >= stage.level);
  const completed = unlocked.filter(Boolean).length;
  const master = Number(map.hq ?? 0) >= 2;
  const league = Number(map.league ?? 0) >= 1;
  const monument = Number(map.monument ?? 0) >= 1;
  const hall = Number(map.hall ?? 0) >= 1;
  const center = Number(map.hq ?? 0) >= 1;

  return (
    <AuraBanner
      eyebrow="GUILD HEADQUARTERS"
      title={guildName}
      subtitle={master
        ? 'Sede Master concluída. A base alcançou sua primeira evolução máxima.'
        : completed
          ? `${completed}/5 evoluções visuais concluídas. Continue financiando os projetos da guilda.`
          : 'A sede começa simples e ganha novas estruturas conforme a guilda conclui projetos.'}
      icon={master ? 'diamond' : 'shield'}
      primaryColor={guildColor}
      secondaryColor={master ? '#FFD447' : colors.yellow}
      intensity={master ? 'master' : completed >= 2 ? 'premium' : 'soft'}
      badge={master ? 'MASTER HQ' : `NÍVEL ${guildLevel}`}
      minHeight={compact ? 230 : 290}
    >
      <View style={[styles.scene, compact && styles.sceneCompact, { borderColor: `${guildColor}55`, backgroundColor: colors.surface + 'D9' }]}>
        <View style={[styles.skyGlow, { backgroundColor: guildColor, opacity: master ? .23 : .12 }]} />
        <View style={[styles.ground, { borderColor: `${guildColor}48` }]} />

        <View style={styles.hqRow}>
          <Structure
            icon="medkit"
            label="CENTRO"
            unlocked={center}
            color={guildColor}
            height={center ? 78 : 56}
            colors={colors}
          />
          <View style={[styles.mainTower, {
            borderColor: master ? '#FFD447' : guildColor,
            backgroundColor: master ? '#201C11' : colors.surfaceAlt,
            minHeight: master ? 125 : league ? 112 : 98,
          }]}>
            <View style={[styles.towerCrown, { backgroundColor: master ? '#FFD447' : guildColor }]}>
              <Ionicons name={master ? 'diamond' : league ? 'shield' : 'business'} size={master ? 26 : 23} color={master ? '#161207' : '#fff'} />
            </View>
            <Text style={[styles.mainTitle, { color: colors.text }]}>{master ? 'SEDE MASTER' : league ? 'LIGA DA GUILDA' : 'SEDE CENTRAL'}</Text>
            <Text style={[styles.mainMeta, { color: colors.muted }]}>{completed}/5 EVOLUÇÕES</Text>
            <View style={styles.windows}>
              {[0,1,2].map((item)=><View key={item} style={[styles.window,{backgroundColor:master?'#FFD447':guildColor,opacity:.45+item*.12}]}/>)}
            </View>
          </View>
          <Structure
            icon="trophy"
            label="HALL"
            unlocked={hall}
            color={guildColor}
            height={hall ? 78 : 56}
            colors={colors}
          />
        </View>

        <View style={styles.landmarkRow}>
          <View style={[styles.landmark, { borderColor: monument ? '#C493FF' : colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="sparkles" size={17} color={monument ? '#C493FF' : colors.muted}/>
            <Text style={[styles.landmarkText,{color:monument?'#D8B8FF':colors.muted}]}>ESTÁTUA {monument?'ATIVA':'BLOQUEADA'}</Text>
          </View>
          <View style={[styles.landmark, { borderColor: league ? guildColor : colors.border, backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="shield" size={17} color={league ? guildColor : colors.muted}/>
            <Text style={[styles.landmarkText,{color:league?guildColor:colors.muted}]}>LIGA {league?'ATIVA':'BLOQUEADA'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.stageRow}>
        {STAGES.map((stage,index)=>(
          <View
            key={`${stage.key}-${stage.level}`}
            style={[
              styles.stage,
              {
                backgroundColor: unlocked[index] ? `${guildColor}20` : colors.surface,
                borderColor: unlocked[index] ? guildColor : colors.border,
              },
            ]}
          >
            <Ionicons name={unlocked[index] ? stage.icon : 'lock-closed'} size={15} color={unlocked[index] ? guildColor : colors.muted}/>
            <Text numberOfLines={1} style={[styles.stageText,{color:unlocked[index]?colors.text:colors.muted}]}>{stage.label}</Text>
          </View>
        ))}
      </View>
    </AuraBanner>
  );
}

function Structure({
  icon,
  label,
  unlocked,
  color,
  height,
  colors,
}: {
  icon:keyof typeof Ionicons.glyphMap;
  label:string;
  unlocked:boolean;
  color:string;
  height:number;
  colors:any;
}) {
  return (
    <View style={[styles.sideStructure, {
      minHeight:height,
      borderColor:unlocked ? color : colors.border,
      backgroundColor:unlocked ? `${color}18` : colors.surfaceAlt,
      opacity:unlocked ? 1 : .55,
    }]}>
      <Ionicons name={unlocked ? icon : 'lock-closed'} size={20} color={unlocked ? color : colors.muted}/>
      <Text style={[styles.sideLabel,{color:unlocked?colors.text:colors.muted}]}>{label}</Text>
    </View>
  );
}

const styles=StyleSheet.create({
  scene:{position:'relative',borderRadius:20,borderWidth:1,minHeight:178,padding:13,overflow:'hidden',justifyContent:'flex-end'},
  sceneCompact:{minHeight:150},
  skyGlow:{position:'absolute',right:-70,top:-95,width:260,height:260,borderRadius:999},
  ground:{position:'absolute',left:-30,right:-30,bottom:-72,height:130,borderTopWidth:1,borderRadius:999},
  hqRow:{flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:8,zIndex:2},
  mainTower:{width:132,borderRadius:20,borderWidth:1.5,padding:10,alignItems:'center',justifyContent:'flex-end'},
  towerCrown:{position:'absolute',top:-19,width:54,height:54,borderRadius:18,alignItems:'center',justifyContent:'center'},
  mainTitle:{fontSize:10,fontWeight:'900',marginTop:31,textAlign:'center'},
  mainMeta:{fontSize:6.5,fontWeight:'900',letterSpacing:.6,marginTop:3},
  windows:{flexDirection:'row',gap:5,marginTop:9},
  window:{width:15,height:8,borderRadius:3},
  sideStructure:{width:76,borderRadius:16,borderWidth:1,padding:8,alignItems:'center',justifyContent:'center',gap:5},
  sideLabel:{fontSize:6.5,fontWeight:'900',letterSpacing:.4},
  landmarkRow:{flexDirection:'row',justifyContent:'center',gap:7,marginTop:10,zIndex:2},
  landmark:{borderRadius:999,borderWidth:1,paddingHorizontal:8,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:4},
  landmarkText:{fontSize:6,fontWeight:'900'},
  stageRow:{flexDirection:'row',flexWrap:'wrap',gap:6},
  stage:{flexGrow:1,minWidth:112,minHeight:38,borderRadius:12,borderWidth:1,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},
  stageText:{fontSize:6.5,fontWeight:'900',flex:1},
});
