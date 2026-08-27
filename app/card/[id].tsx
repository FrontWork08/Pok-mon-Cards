import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getOwnedCard, type OwnedCardEntry } from '@/services/player';
import { setCardFavorite } from '@/services/playerActions';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function CardDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const [entry, setEntry] = useState<OwnedCardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      setEntry(await getOwnedCard(String(id)));
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar este card.'); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function toggleFavorite() {
    if (!entry?.cards || saving) return;
    const next = !entry.favorite;
    try { setSaving(true); await setCardFavorite(entry.cards.id, next); setEntry((current) => current ? { ...current, favorite: next } : current); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o favorito.'); }
    finally { setSaving(false); }
  }

  const card = entry?.cards;
  const unitValue = Number(card?.game_value ?? 0);
  const marketPriceUsd = card?.market_price_usd == null ? null : Number(card.market_price_usd);
  const totalMarketValueUsd = marketPriceUsd == null ? null : marketPriceUsd * Number(entry?.quantity ?? 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
          <Text style={[styles.topTitle, { color: colors.muted }]}>DETALHES DO CARD</Text>
          <Pressable style={[styles.iconButton, { backgroundColor: entry?.favorite ? '#B73C59' : colors.surface, borderColor: entry?.favorite ? '#E8657F' : colors.border }]} onPress={toggleFavorite} disabled={!card || saving}><Ionicons name={entry?.favorite ? 'heart' : 'heart-outline'} size={22} color={entry?.favorite ? '#fff' : colors.yellow} /></Pressable>
        </View>
        {loading ? <ActivityIndicator size="large" color={colors.yellow} style={{ marginTop: 80 }} /> : null}
        {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9C9C" /><Text style={styles.errorText}>{error}</Text></View> : null}

        {!loading && card ? <View style={styles.layout}>
          <View style={[styles.imagePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>{card.image_large || card.image_small ? <Image source={{ uri: card.image_large ?? card.image_small ?? '' }} resizeMode="contain" style={styles.image} /> : <View style={[styles.imagePlaceholder, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="image-outline" size={56} color={colors.muted} /></View>}</View>
          <View style={[styles.infoPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.kicker, { color: colors.yellow }]}>#{card.pokedex_numbers?.[0] ?? '---'} • {card.set_id.toUpperCase()}</Text>
            <Text style={[styles.name, { color: colors.text }]}>{card.pokemon_name}</Text>
            <Text style={[styles.rarity, { color: colors.muted }]}>{card.rarity ?? 'Sem raridade informada'}</Text>

            <View style={[styles.valueHero, { backgroundColor: colors.accentSoft, borderColor: colors.yellow }]}><View style={[styles.valueIcon, { backgroundColor: colors.surface }]}><Ionicons name="cash" size={24} color={colors.yellow} /></View><View style={{ flex: 1 }}><Text style={[styles.valueLabel, { color: colors.muted }]}>VALOR FIXO EM USD</Text><Text style={[styles.valueNumber, { color: colors.yellow }]}>{marketPriceUsd == null ? 'US$ —' : formatUsd(marketPriceUsd)}</Text><Text style={[styles.valueHint, { color: colors.muted }]}>{marketPriceUsd == null ? 'Valor fixo indisponível para esta carta.' : 'Tabela fixa do jogo • sem atualização online'}</Text></View></View>

            <View style={styles.badges}>{(card.types ?? []).map((type) => <View key={type} style={[styles.badge, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}><Text style={[styles.badgeText, { color: colors.text }]}>{type}</Text></View>)}</View>
            <View style={styles.statsGrid}><Info label="SET" value={card.set_name} /><Info label="NÚMERO" value={card.card_number ?? '—'} /><Info label="QUANTIDADE" value={`×${entry.quantity}`} /><Info label="VALOR TOTAL EM USD" value={totalMarketValueUsd == null ? '—' : formatUsd(totalMarketValueUsd)} /><Info label="VALOR NO JOGO" value={`🪙 ${unitValue.toLocaleString('pt-BR')}`} /><Info label="OBTIDO" value={new Date(entry.first_obtained_at).toLocaleDateString('pt-BR')} /></View>
            <Pressable style={[styles.favoriteButton, { backgroundColor: entry.favorite ? '#B73C59' : colors.yellow }]} onPress={toggleFavorite} disabled={saving}><Ionicons name={entry.favorite ? 'heart' : 'heart-outline'} size={19} color={entry.favorite ? '#fff' : '#07111F'} /><Text style={[styles.favoriteButtonText, entry.favorite && { color: '#fff' }]}>{saving ? 'SALVANDO...' : entry.favorite ? 'REMOVER DOS FAVORITOS' : 'ADICIONAR AOS FAVORITOS'}</Text></Pressable>
          </View>
        </View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) { const { colors } = useAppTheme(); return <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={2}>{value}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 44, gap: 18 }, topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, topTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }, iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, errorBox: { flexDirection: 'row', gap: 9, alignItems: 'center', borderRadius: 16, padding: 13, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' }, errorText: { color: '#FFD7D7', fontWeight: '700', flex: 1 },
  layout: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', justifyContent: 'center' }, imagePanel: { flexGrow: 1, flexBasis: 330, maxWidth: 480, minHeight: 470, borderRadius: 26, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, image: { width: '100%', height: 570, maxHeight: 570 }, imagePlaceholder: { width: '100%', height: 480, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, infoPanel: { flexGrow: 1, flexBasis: 320, maxWidth: 560, borderRadius: 26, padding: 22, borderWidth: 1 }, kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, name: { fontSize: 34, lineHeight: 40, fontWeight: '900', marginTop: 5 }, rarity: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  valueHero: { marginTop: 16, borderRadius: 18, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, valueIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, valueLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 }, valueNumber: { fontSize: 24, fontWeight: '900', marginTop: 2 }, valueHint: { fontSize: 8, lineHeight: 12, marginTop: 2 }, badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, badge: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1 }, badgeText: { fontSize: 11, fontWeight: '900' }, statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 }, infoCard: { width: '48%', minHeight: 82, borderRadius: 16, padding: 13, borderWidth: 1 }, infoLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1 }, infoValue: { fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 5 }, favoriteButton: { marginTop: 20, minHeight: 52, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, favoriteButtonText: { color: '#07111F', fontSize: 11, fontWeight: '900', letterSpacing: .4 },
});
