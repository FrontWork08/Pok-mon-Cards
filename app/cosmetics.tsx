import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
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
          return (
            <Pressable
              key={item.id}
              disabled={!item.unlocked || working === item.id}
              onPress={() => onEquip(item)}
              style={[styles.item, { backgroundColor: item.secondaryColor, borderColor: selected ? item.primaryColor : colors.border, opacity: item.unlocked ? 1 : .48 }]}
            >
              <View style={[styles.preview, { borderColor: item.primaryColor }]}>
                <Ionicons name={(item.icon || 'sparkles') as keyof typeof Ionicons.glyphMap} size={28} color={item.primaryColor} />
              </View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.desc}>{item.description}</Text>
              <View style={styles.footer}>
                <Text style={[styles.state, { color: item.unlocked ? item.primaryColor : '#A0A0A0' }]}>
                  {selected ? 'EQUIPADO' : item.unlocked ? 'DESBLOQUEADO' : 'BLOQUEADO'}
                </Text>
                {working === item.id ? <ActivityIndicator size="small" color={item.primaryColor} /> : null}
              </View>
            </Pressable>
          );
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
  preview: { width: 58, height: 58, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 12 },
  desc: { color: '#C4C7CE', fontSize: 8, lineHeight: 12, marginTop: 4, flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  state: { fontSize: 8, fontWeight: '900' },
});
