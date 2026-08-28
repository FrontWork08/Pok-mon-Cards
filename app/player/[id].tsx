import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { formatUsd } from '@/services/market';
import { getPublicPlayerProfile, type PublicPlayerProfile } from '@/services/publicProfiles';
import { getTrainerRank } from '@/services/ranks';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TrainerAvatar } from '@/components/TrainerAvatar';

export default function PlayerShowcaseScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      setProfile(await getPublicPlayerProfile(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir este perfil.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const player = profile?.player;
  const collection = profile?.collection;
  const rank = player?.battleRating == null ? null : getTrainerRank(player.battleRating);
  const winTotal = Number(player?.battleWins ?? 0) + Number(player?.battleLosses ?? 0);
  const winRate = winTotal ? Math.round(Number(player?.battleWins ?? 0) / winTotal * 100) : 0;
  const frameColor = player?.frame?.primaryColor ?? player?.guild?.color ?? colors.accent;
  const backgroundColor = player?.background?.secondaryColor ?? colors.accentSoft;

  return (
    <Screen title="Perfil de Exibição" subtitle="Cartas mais raras, valor da conta, guilda e desempenho do treinador.">
      <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={18} color={colors.muted} /><Text style={[styles.backText, { color: colors.muted }]}>Voltar ao ranking</Text></Pressable>
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
      {error ? <Pressable style={styles.error} onPress={() => void load()}><Ionicons name="alert-circle" size={19} color="#FF9FAF" /><Text style={styles.errorText}>{error} Toque para tentar novamente.</Text></Pressable> : null}

      {player && collection ? <>
        <View style={[styles.hero, { backgroundColor, borderColor: frameColor, borderWidth: player.frame ? 2 : 1 }]}>
          <TrainerAvatar icon={player.profileIcon} color={frameColor} backgroundColor={player.background?.primaryColor ? player.background.primaryColor + '22' : colors.surfaceAlt} size={66} />
          <View style={styles.heroInfo}>
            <Text style={[styles.kicker, { color: colors.yellow }]}>TRAINER SHOWCASE</Text>
            <Text style={[styles.username, { color: colors.text }]}>@{player.username}</Text>
            {player.equippedTitle ? <Text style={[styles.titleText, { color: colors.yellow }]}>{player.equippedTitle.icon} {player.equippedTitle.title}</Text> : null}
            <Text style={[styles.meta, { color: colors.muted }]}>Nível {player.level} • {rank ? `${rank.symbol} ${rank.displayName}` : 'ELO oculto'}</Text>
            {player.frame || player.background ? <Text style={[styles.cosmeticMeta, { color: frameColor }]}>{player.frame?.name ?? 'Sem moldura'} • {player.background?.name ?? 'Sem background'}</Text> : null}
          </View>
          {player.guild ? <Pressable onPress={() => router.push('/guilds')} style={[styles.guildBadge, { backgroundColor: player.guild.color + '25', borderColor: player.guild.color }]}><Ionicons name="shield" size={16} color={player.guild.color} /><Text style={[styles.guildText, { color: player.guild.color }]}>{player.guild.name} • Nv. {player.guild.level}</Text></Pressable> : null}
        </View>

        <View style={[styles.valuePanel, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
          <View style={{ flex: 1 }}><Text style={[styles.valueKicker, { color: colors.yellow }]}>VALOR TOTAL DA CONTA</Text><Text style={[styles.value, { color: colors.text }]}>{formatUsd(collection.totalValueUsd)}</Text><Text style={[styles.valueHint, { color: colors.muted }]}>Soma do preço TCGplayer de todas as cópias da coleção</Text></View>
          <View style={[styles.valueIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="diamond" size={27} color={colors.yellow} /></View>
        </View>

        <View style={styles.stats}>
          <Metric icon="albums" label="CARTAS" value={collection.totalCopies.toLocaleString('pt-BR')} />
          <Metric icon="grid" label="DIFERENTES" value={collection.uniqueCards.toLocaleString('pt-BR')} />
          <Metric icon="trophy" label="VITÓRIAS" value={player.battleWins.toLocaleString('pt-BR')} />
          <Metric icon="analytics" label="WIN RATE" value={`${winRate}%`} />
        </View>

        {collection.showcase.length ? <>
          <View style={styles.sectionHead}><View><Text style={[styles.sectionTitle, { color: colors.text }]}>Vitrine do treinador</Text><Text style={[styles.sectionHint, { color: colors.muted }]}>As cartas escolhidas para representar esta coleção.</Text></View><Text style={[styles.count, { color: colors.yellow }]}>{collection.showcase.length}/6</Text></View>
          <View style={styles.showcaseGrid}>
            {collection.showcase.map((card) => <View key={`showcase-${card.slot}`} style={[styles.showcaseCard, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
              <Text style={[styles.showcaseSlot, { color: colors.yellow }]}>SLOT {card.slot}</Text>
              {card.imageSmall ? <Image source={{ uri: card.imageSmall }} resizeMode="contain" resizeMethod="resize" fadeDuration={0} style={styles.showcaseImage} /> : <View style={[styles.showcaseImage, { backgroundColor: colors.surfaceAlt }]} />}
              <Text numberOfLines={1} style={[styles.showcaseName, { color: colors.text }]}>{card.name}</Text>
              <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted }]}>{card.rarity ?? 'Sem raridade'}</Text>
              <Text style={[styles.cardValue, { color: colors.yellow }]}>{card.marketPriceUsd == null ? 'US$ —' : formatUsd(card.marketPriceUsd)}</Text>
            </View>)}
          </View>
        </> : null}

        <View style={styles.sectionHead}><View><Text style={[styles.sectionTitle, { color: colors.text }]}>Cartas mais raras</Text><Text style={[styles.sectionHint, { color: colors.muted }]}>Ordenadas por raridade e valor dentro do jogo.</Text></View><Text style={[styles.count, { color: colors.yellow }]}>{collection.rarestCards.length}</Text></View>
        {collection.rarestCards.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="images-outline" size={30} color={colors.muted} /><Text style={[styles.emptyText, { color: colors.muted }]}>Este treinador ainda não possui cartas.</Text></View> : null}
        <View style={styles.cardGrid}>
          {collection.rarestCards.map((card) => <Pressable key={card.id} onPress={() => router.push(`/card/${card.id}`)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.imageWrap, { backgroundColor: colors.surfaceAlt }]}>
              {card.imageSmall ? <Image source={{ uri: card.imageSmall }} resizeMode="contain" resizeMethod="resize" fadeDuration={0} style={styles.image} /> : <Ionicons name="image-outline" size={26} color={colors.muted} />}
              {card.quantity > 1 ? <View style={[styles.qty, { backgroundColor: colors.yellow }]}><Text style={styles.qtyText}>×{card.quantity}</Text></View> : null}
            </View>
            <Text numberOfLines={1} style={[styles.cardName, { color: colors.text }]}>{card.name}</Text>
            <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted }]}>{card.rarity ?? 'Sem raridade'}</Text>
            <Text style={[styles.cardValue, { color: colors.yellow }]}>{card.marketPriceUsd == null ? 'US$ —' : formatUsd(card.marketPriceUsd)}</Text>
          </Pressable>)}
        </View>
      </> : null}
    </Screen>
  );
}

function Metric({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  const { colors } = useAppTheme();
  return <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name={icon} size={19} color={colors.accent} /><Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text><Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { fontSize: 12, fontWeight: '800' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 12, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' },
  errorText: { flex: 1, color: '#FFD7DD', fontWeight: '700', fontSize: 11 },
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 13, padding: 17, borderRadius: 23, borderWidth: 1 },
  avatar: { width: 66, height: 66, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '900' },
  heroInfo: { flex: 1, minWidth: 180 },
  kicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  username: { fontSize: 24, fontWeight: '900', marginTop: 2 },
  titleText: { fontSize: 11, fontWeight: '900', marginTop: 2 },
  meta: { fontSize: 10, marginTop: 4 },
  cosmeticMeta: { fontSize: 8, fontWeight: '900', marginTop: 4, letterSpacing: .4 },
  guildBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  guildText: { fontSize: 9, fontWeight: '900' },
  valuePanel: { borderRadius: 21, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  valueKicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  value: { fontSize: 30, fontWeight: '900', marginTop: 3 },
  valueHint: { fontSize: 9, marginTop: 2 },
  valueIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: 135, minWidth: 125, borderRadius: 17, borderWidth: 1, padding: 13 },
  metricValue: { fontSize: 18, fontWeight: '900', marginTop: 7 },
  metricLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .9, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 21, fontWeight: '900' },
  sectionHint: { fontSize: 10, marginTop: 2 },
  count: { fontSize: 15, fontWeight: '900' },
  showcaseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  showcaseCard: { flexGrow: 1, flexBasis: 140, maxWidth: 190, minWidth: 128, borderRadius: 17, borderWidth: 1, padding: 8 },
  showcaseSlot: { fontSize: 7, fontWeight: '900', letterSpacing: .8 },
  showcaseImage: { width: '100%', height: 175, marginTop: 5 },
  showcaseName: { fontSize: 11, fontWeight: '900', marginTop: 6 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  card: { flexGrow: 1, flexBasis: 145, maxWidth: 210, minWidth: 138, borderRadius: 17, borderWidth: 1, padding: 8 },
  imageWrap: { width: '100%', aspectRatio: .72, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  qty: { position: 'absolute', right: 6, top: 6, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  qtyText: { color: '#07111F', fontSize: 9, fontWeight: '900' },
  cardName: { fontSize: 12, fontWeight: '900', marginTop: 8 },
  cardMeta: { fontSize: 8, marginTop: 2 },
  cardValue: { fontSize: 9, fontWeight: '900', marginTop: 5 },
  empty: { borderRadius: 18, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 11, fontWeight: '700' },
});
