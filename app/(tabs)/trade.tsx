import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { findPlayers } from '@/services/player';
import { createTrade, getMyTrades } from '@/services/trades';

export default function TradeScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const loadTrades = useCallback(async () => {
    try {
      setTrades((await getMyTrades()) ?? []);
    } catch {
      setTrades([]);
    }
  }, []);

  useEffect(() => {
    loadTrades();
  }, [loadTrades]);

  async function searchPlayers() {
    try {
      setLoading(true);
      setPlayers(await findPlayers(search));
    } catch {
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }

  async function startTrade(receiverId: string) {
    try {
      setCreatingId(receiverId);
      const tradeId = await createTrade(receiverId);
      router.push(`/trade/${tradeId}`);
    } catch (error: any) {
      Alert.alert('Não foi possível criar a troca', error?.message ?? 'Tente novamente.');
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <Screen title="Trade" subtitle="Negocie cards com seus amigos.">
      <Text style={styles.sectionTitle}>Encontrar treinador</Text>
      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={searchPlayers}
          placeholder="Buscar por username"
          placeholderTextColor="#7c8497"
          autoCapitalize="none"
          style={styles.search}
        />
        <Pressable style={styles.button} onPress={searchPlayers}>
          <Text style={styles.buttonText}>Buscar</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator /> : null}

      {players.map((player) => (
        <View key={player.id} style={styles.playerRow}>
          <View>
            <Text style={styles.playerName}>@{player.username}</Text>
            <Text style={styles.playerLevel}>Treinador nível {player.level}</Text>
          </View>
          <Pressable style={styles.tradeButton} onPress={() => startTrade(player.id)} disabled={creatingId === player.id}>
            <Text style={styles.tradeButtonText}>{creatingId === player.id ? 'Criando...' : 'Trocar'}</Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Minhas trocas</Text>
        <Pressable onPress={loadTrades}><Text style={styles.refresh}>Atualizar</Text></Pressable>
      </View>

      {trades.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nenhuma troca ainda</Text>
          <Text style={styles.emptyText}>Procure um treinador e toque em Trocar para começar.</Text>
        </View>
      ) : (
        trades.map((trade) => (
          <Pressable key={trade.id} style={styles.tradeRow} onPress={() => router.push(`/trade/${trade.id}`)}>
            <View>
              <Text style={styles.tradeId}>Troca #{trade.id.slice(0, 8)}</Text>
              <Text style={styles.tradeMeta}>{trade.trade_cards?.length ?? 0} itens</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{String(trade.status).toUpperCase()}</Text>
            </View>
          </Pressable>
        ))
      )}

      <Text style={styles.note}>Cada jogador oferece apenas cards que realmente possui. Qualquer edição cancela as confirmações anteriores; a transferência final acontece somente no servidor.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refresh: { color: '#80a9ff', fontWeight: '800' },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: { flex: 1, backgroundColor: '#151c31', color: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  button: { backgroundColor: '#2d6cff', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 16 },
  buttonText: { color: '#fff', fontWeight: '800' },
  playerRow: { backgroundColor: '#111725', padding: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playerName: { color: '#fff', fontWeight: '900', fontSize: 16 },
  playerLevel: { color: '#8f99ad', marginTop: 3, fontSize: 12 },
  tradeButton: { backgroundColor: '#2d6cff', paddingHorizontal: 15, paddingVertical: 9, borderRadius: 10 },
  tradeButtonText: { color: '#fff', fontWeight: '800' },
  empty: { backgroundColor: '#111725', padding: 20, borderRadius: 16 },
  emptyTitle: { color: '#fff', fontWeight: '800' },
  emptyText: { color: '#8f99ad', marginTop: 5 },
  tradeRow: { backgroundColor: '#111725', padding: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tradeId: { color: '#fff', fontWeight: '800' },
  tradeMeta: { color: '#8f99ad', fontSize: 12, marginTop: 3 },
  statusBadge: { backgroundColor: '#1f2a44', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusText: { color: '#80a9ff', fontSize: 10, fontWeight: '900' },
  note: { color: '#727c90', fontSize: 12, lineHeight: 18, marginTop: 8 },
});
