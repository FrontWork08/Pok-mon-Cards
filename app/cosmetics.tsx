import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import { AuraFrame } from '@/components/AuraFrame';
import { equipCosmetic, getCosmeticsHub, type CosmeticsHub, type CosmeticItem } from '@/services/cosmetics';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function CosmeticsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [hub, setHub] = useState<CosmeticsHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setHub(await getCosmeticsHub());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar cosméticos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const frames = useMemo(() => hub?.items.filter((item) => item.kind === 'frame') ?? [], [hub]);
  const backgrounds = useMemo(() => hub?.items.filter((item) => item.kind === 'background') ?? [], [hub]);

  async function equip(item: CosmeticItem) {
    if (!item.unlocked || working) return;
    try {
      setWorking(item.id);
      await equipCosmetic(item.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível equipar.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <Screen title="Cosméticos do Trainer" subtitle="Molduras e backgrounds desbloqueados por progresso real no jogo.">
      <Pressable style={styles.back} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText, { color: colors.muted }]}>Voltar</Text>
      </Pressable>
      {error ? <Pressable style={styles.error} onPress={() => setError(null)}><Text style={styles.errorText}>{error}</Text></Pressable> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
      <Section title="Molduras" items={frames} equipped={hub?.equippedFrameId ?? null} working={working} onEquip={equip} />
      <Section title="Backgrounds" items={backgrounds} equipped={hub?.equippedBackgroundId ?? null} working={working} onEquip={equip} />
    </Screen>
  );
}

function Section({ title, items, equipped, working, onEquip }: {
  title: string;
  items: CosmeticItem[];
  equipped: string | null;
  working: string | null;
  onEquip: (item: CosmeticItem) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <View style={styles.grid}>
        {items.map((item) => {
          const selected = equipped === item.id;
          const galaxy = item.id.includes('galaxy');
          const flow = galaxy || item.unlockType === 'coin_shop' || /^(coin_|lux_)/.test(item.id);
          const card = (
            <Pressable
              disabled={!item.unlocked || working === item.id}
              onPress={() => onEquip(item)}
              style={[styles.item, { backgroundColor: item.secondaryColor, borderColor: selected ? item.primaryColor : colors.border, opacity: item.unlocked ? 1 : .48 }]}
            >
              <View style={[styles.preview, { borderColor: galaxy ? '#55E6FF' : item.primaryColor, backgroundColor: galaxy ? '#17102A' : undefined }]}>
                <Ionicons name={(item.icon || 'sparkles') as keyof typeof Ionicons.glyphMap} size={28} color={galaxy ? '#8B5CFF' : item.primaryColor} />
                {galaxy ? <View style={styles.galaxyDots}><View style={styles.galaxyDotA}/><View style={styles.galaxyDotB}/><View style={styles.galaxyDotC}/></View> : null}
              </View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.desc}>{item.description}</Text>
              {flow ? <View style={[styles.flowBadge,{borderColor:galaxy?'#8B5CFF':item.primaryColor,backgroundColor:galaxy?'#1D1334':'rgba(255,255,255,.04)'}]}><Ionicons name={galaxy?'planet':'flash'} size={11} color={galaxy?'#55E6FF':item.primaryColor}/><Text style={[styles.flowBadgeText,{color:galaxy?'#D8B8FF':item.primaryColor}]}>{galaxy?'GALAXY FLOW':'AURA EM FLUXO'}</Text></View> : null}
              <View style={styles.footer}>
                <Text style={[styles.state, { color: item.unlocked ? (galaxy?'#55E6FF':item.primaryColor) : '#A0A0A0' }]}>
                  {selected ? 'EQUIPADO' : item.unlocked ? 'DESBLOQUEADO' : 'BLOQUEADO'}
                </Text>
                {working === item.id ? <ActivityIndicator size="small" color={galaxy?'#55E6FF':item.primaryColor} /> : null}
              </View>
            </Pressable>
          );
          return flow ? (
            <AuraFrame key={item.id} primaryColor={galaxy?'#8B5CFF':item.primaryColor} secondaryColor={galaxy?'#55E6FF':item.secondaryColor} intensity={galaxy?'master':'premium'} variant={galaxy?'galaxy':'energy'} radius={19}>
              {card}
            </AuraFrame>
          ) : <View key={item.id}>{card}</View>;
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center' },
  backText: { fontSize: 11, fontWeight: '800' },
  error: { borderRadius: 14, padding: 11, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' },
  errorText: { color: '#FFD7DD', fontSize: 10, fontWeight: '800' },
  section: { gap: 9 },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  item: { flexGrow: 1, flexBasis: 180, maxWidth: 260, minHeight: 190, borderRadius: 19, borderWidth: 2, padding: 13 },
  preview: { width: 58, height: 58, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center', position:'relative', overflow:'hidden' },
  galaxyDots:{...StyleSheet.absoluteFillObject},
  galaxyDotA:{position:'absolute',width:5,height:5,borderRadius:999,backgroundColor:'#fff',left:9,top:12},
  galaxyDotB:{position:'absolute',width:3,height:3,borderRadius:999,backgroundColor:'#55E6FF',right:10,top:17},
  galaxyDotC:{position:'absolute',width:4,height:4,borderRadius:999,backgroundColor:'#D8B8FF',right:16,bottom:10},
  flowBadge:{alignSelf:'flex-start',marginTop:8,borderRadius:999,borderWidth:1,paddingHorizontal:7,paddingVertical:4,flexDirection:'row',alignItems:'center',gap:4},
  flowBadgeText:{fontSize:6,fontWeight:'900',letterSpacing:.5},
  name: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 12 },
  desc: { color: '#C4C7CE', fontSize: 8, lineHeight: 12, marginTop: 4, flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  state: { fontSize: 8, fontWeight: '900' },
});
